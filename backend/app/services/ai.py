"""AI analyzer — ported from bot/services/ai_analyzer.py.

Extracts structured tags from multilingual (uz/ru/en) self-description text
using Claude. Falls back to keyword heuristics when no API key is set or the
call fails. Persists results to the user_analyses table.
"""
from __future__ import annotations

import json
import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.user_analysis import UserAnalysis

logger = logging.getLogger(__name__)

# Hard limits so a degraded Anthropic incident can never hang a request for
# the SDK default of 600s (which would pin profile-save / finalize on the
# single worker). 15s + one retry, then the keyword/None fallback kicks in.
_client = None


def _get_client():
    global _client
    if _client is None:
        import anthropic
        _client = anthropic.AsyncAnthropic(
            api_key=settings.ANTHROPIC_API_KEY, timeout=15.0, max_retries=1
        )
    return _client

_SYSTEM_PROMPT = (
    "You analyze a short self-description written by a young student in "
    "Uzbek, Russian, or English. Extract structured tags. Respond with a "
    "single JSON object and nothing else, using exactly these keys: "
    '"skills" (hands-on abilities), "knowledges" (subjects/theory the '
    'person knows), "interests" (things they enjoy), "preparations" '
    "(exams, contests, programs they are preparing for), \"goals\" (future "
    "career/life aspirations). Each value must be a list of short English "
    "lowercase tags (<=3 words). Do not invent facts. If a category is not "
    "mentioned, return an empty list."
)

_KEYS = ("skills", "knowledges", "interests", "preparations", "goals")


def _empty() -> dict[str, list[str]]:
    return {k: [] for k in _KEYS}


def _keyword_fallback(text: str) -> dict[str, list[str]]:
    t = (text or "").lower()
    SKILL_KW = [
        "python", "java", "javascript", "c++", "html", "css", "react", "node",
        "django", "flask", "sql", "git", "docker", "linux", "photoshop",
        "figma", "design", "marketing", "seo", "smm", "excel",
        "communication", "leadership", "teamwork", "management", "teaching",
        "writing", "translation", "english", "russian", "programming",
        "coding", "dasturlash", "ingliz tili",
    ]
    INTEREST_KW = [
        "startup", "business", "technology", "science", "art", "music",
        "sport", "football", "chess", "reading", "travel", "volunteering",
        "robotics", "ai", "machine learning", "data science", "medicine",
        "law", "economics", "architecture", "journalism",
    ]
    PREP_KW = [
        "ielts", "toefl", "sat", "dtm", "olympiad", "olimpiada", "grant",
        "scholarship", "university", "universitet",
    ]
    GOAL_KW = [
        "doctor", "engineer", "teacher", "programmer", "designer",
        "entrepreneur", "scientist", "lawyer", "journalist", "architect",
        "pilot", "abroad", "career",
    ]
    skills = sorted({k for k in SKILL_KW if k in t})
    return {
        "skills": skills,
        "knowledges": skills,
        "interests": sorted({k for k in INTEREST_KW if k in t}),
        "preparations": sorted({k for k in PREP_KW if k in t}),
        "goals": sorted({k for k in GOAL_KW if k in t}),
    }


def _normalize(data: Any) -> dict[str, list[str]]:
    out = _empty()
    if not isinstance(data, dict):
        return out
    for key in _KEYS:
        val = data.get(key, [])
        if isinstance(val, list):
            seen: set[str] = set()
            clean: list[str] = []
            for item in val:
                if isinstance(item, str) and item.strip():
                    tag = item.strip().lower()[:64]
                    if tag not in seen:
                        seen.add(tag)
                        clean.append(tag)
            out[key] = clean
    return out


async def analyze_about_async(text: str) -> dict[str, list[str]]:
    if not text or not text.strip():
        return _empty()
    if not settings.ANTHROPIC_API_KEY:
        return _keyword_fallback(text)

    try:
        import anthropic
    except ImportError:
        logger.warning("anthropic SDK not installed; using keyword fallback")
        return _keyword_fallback(text)

    try:
        client = _get_client()
        resp = await client.messages.create(
            model=settings.AI_MODEL,
            max_tokens=512,
            system=_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": text[:4000]}],
        )
        raw = "".join(
            b.text for b in resp.content if getattr(b, "type", None) == "text"
        ).strip()
        if raw.startswith("```"):
            raw = raw.strip("`")
            if raw.lower().startswith("json"):
                raw = raw[4:]
            raw = raw.strip()
        return _normalize(json.loads(raw))
    except Exception as exc:
        logger.warning("AI analysis failed, using fallback: %s", exc)
        return _keyword_fallback(text)


async def translate_bio_async(text: str, target_lang: str) -> str | None:
    """Translate a short bio into `target_lang` (en/uz/ru) via Claude.
    Returns None on failure (caller should fall back to source text)."""
    if not text or not text.strip() or not settings.ANTHROPIC_API_KEY:
        return None
    name = {"en": "English", "uz": "Uzbek (Latin script)", "ru": "Russian"}.get(target_lang)
    if not name:
        return None
    try:
        client = _get_client()
        resp = await client.messages.create(
            model=settings.AI_MODEL,
            max_tokens=400,
            system=(
                f"Translate the user's short self-description into {name}. "
                f"Keep tone and meaning. Reply with only the translation, no quotes, no commentary."
            ),
            messages=[{"role": "user", "content": text[:1500]}],
        )
        out = "".join(b.text for b in resp.content if getattr(b, "type", None) == "text").strip()
        return out or None
    except Exception as exc:
        logger.warning("translate failed: %s", exc)
        return None


_ICEBREAKER_LANG = {"en": "English", "uz": "Uzbek (Latin script)", "ru": "Russian"}


async def generate_icebreakers(
    my_tags: list[str], their_tags: list[str], their_name: str, lang: str = "en"
) -> list[str]:
    """2–3 short opener messages grounded in shared/related interests, written
    in `lang` from the viewer's POV. Returns [] on any failure (caller hides
    the feature). Kills the blank-message freeze that stalls intros."""
    target = _ICEBREAKER_LANG.get(lang, "English")
    if not settings.ANTHROPIC_API_KEY:
        return []
    shared = sorted(set(t.lower() for t in my_tags) & set(t.lower() for t in their_tags))
    context = (
        f"You are: {', '.join(my_tags[:15]) or 'a BFU member'}.\n"
        f"They ({their_name}) are: {', '.join(their_tags[:15]) or 'a BFU member'}.\n"
        f"Shared: {', '.join(shared) or 'none obvious'}."
    )
    try:
        client = _get_client()
        resp = await client.messages.create(
            model=settings.AI_MODEL,
            max_tokens=300,
            system=(
                f"Write 2-3 short, warm, specific opening messages in {target} that "
                f"a young person could send to start a conversation, grounded in the "
                f"shared/related interests below. Each under 18 words, friendly, no "
                f"emojis-only lines. Reply as a JSON array of strings, nothing else."
            ),
            messages=[{"role": "user", "content": context}],
        )
        raw = "".join(b.text for b in resp.content if getattr(b, "type", None) == "text").strip()
        if raw.startswith("```"):
            raw = raw.strip("`")
            if raw.lower().startswith("json"):
                raw = raw[4:]
            raw = raw.strip()
        data = json.loads(raw)
        return [str(x).strip() for x in data if str(x).strip()][:3] if isinstance(data, list) else []
    except Exception as exc:
        logger.warning("icebreakers failed: %s", exc)
        return []


async def analyze_and_save(db: AsyncSession, user_id: int, text: str) -> dict[str, list[str]]:
    """Run analysis and upsert into user_analyses. Returns the tag dict."""
    data = await analyze_about_async(text)

    result = await db.execute(select(UserAnalysis).where(UserAnalysis.user_id == user_id))
    analysis = result.scalar_one_or_none()

    if analysis is None:
        analysis = UserAnalysis(user_id=user_id, **data)
        db.add(analysis)
    else:
        for key, val in data.items():
            setattr(analysis, key, val)

    await db.commit()
    return data
