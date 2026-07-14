"""AI summary report for an event's registration-form responses.

An admin runs an event with a registration FORM (``Event.form_schema`` — a JSON
list of questions). Members answer them and the answers land in
``EventRsvp.answers``. For a learning-center owner, the raw table of answers is
noise; what they want is a decision-useful DIGEST: what pains recur, which
competitors/tutors/apps get named, how much money families already spend, the
spread of target scores/universities, and what would make people enrol.

``generate_event_report(event_id)`` produces exactly that with ONE Claude call
(reusing the client + concurrency cap + timeout from ``app.services.ai``). The
students answer in Uzbek, so the digest is written in Uzbek.

Design guarantees (matching the shared contract):
  * Opens its OWN AsyncSessionLocal — safe to call fire-and-forget or from a
    router that already holds a request session.
  * 0 responses  -> a friendly "no responses yet" message, NO AI call.
  * No API key   -> a plain, self-computed aggregate (counts + per-question value
    distribution) with a note that AI is not configured. It degrades, never errors.
  * Token safety -> if the combined answers exceed ~150k chars it samples the
    first N responses that fit and notes "N of M".
  * NEVER raises -> any unexpected failure returns ``{error, response_count}``.

Returns ``{summary: str, response_count: int, generated_at: iso, sampled?: bool}``.
"""
from __future__ import annotations

import logging
from collections import Counter
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select

from app.config import settings
from app.database import AsyncSessionLocal
from app.models.event import Event
from app.models.event_rsvp import EventRsvp
from app.services import ai
from app.services.event_forms import (
    MULTI_CHOICE_TYPES,
    NUMBER_TYPES,
    SINGLE_CHOICE_TYPES,
    answer_to_text,
)

logger = logging.getLogger(__name__)

# Distribution is meaningful for closed-ended questions; free text just gets an
# answered-count in the plain fallback.
_DISTRIBUTION_TYPES = SINGLE_CHOICE_TYPES + MULTI_CHOICE_TYPES + NUMBER_TYPES

# Hard ceiling on the characters of answer text we hand to Claude, so a viral
# event with thousands of long answers can never blow the model's context window
# (or run up an unbounded bill). ~150k chars ≈ well within a Haiku context; past
# it we sample the first responses that fit and say so.
MAX_INPUT_CHARS = 150_000

# Output budget: ~600 words of Uzbek ≈ 1.3–1.8k tokens once headings are added.
_MAX_OUTPUT_TOKENS = 2000

_SYSTEM_PROMPT = (
    "Siz O'zbekistondagi bir o'quv markazi tashkil qilgan tadbir uchun "
    "ro'yxatdan o'tish anketasi javoblarini tahlil qilyapsiz. Javob berganlar — "
    "asosan o'quvchilar va ota-onalar, ular o'zbek tilida yozishgan. "
    "MARKAZ EGASI uchun qisqa, qaror qabul qilishga yordam beradigan xulosa "
    "yozing — O'ZBEK TILIDA. Qisqa sarlavhalardan foydalaning va quyidagilarni "
    "yoriting:\n"
    "• Eng ko'p uchraydigan og'riqli nuqtalar (muammolar).\n"
    "• Eng ko'p tilga olingan raqobatchilar / ilovalar / repetitorlar.\n"
    "• Tayyorgarlikka allaqachon sarflangan pul (o'rtacha va oralig'i).\n"
    "• Maqsadli ballar (o'rtacha va tarqalishi) va maqsadli universitetlar.\n"
    "• \"Ertaga yozilish uchun nima kerak?\" degan savolga eng ko'p javoblar.\n"
    "Faqat berilgan ma'lumotga tayaning — hech narsa to'qib chiqarmang. "
    "Agar biror ma'lumot yetishmasa, buni qisqa qayd eting. Umumiy hajm ~600 "
    "so'zdan oshmasin. Faqat xulosaning o'zini qaytaring, muqaddima yozmang."
)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _is_blank(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, str):
        return not value.strip()
    if isinstance(value, (list, tuple)):
        return not [x for x in value if not (isinstance(x, str) and not x.strip())]
    return False


def _schema_list(event: Event) -> list[dict]:
    schema = event.form_schema
    return [q for q in schema if isinstance(q, dict)] if isinstance(schema, list) else []


def _labels_and_order(schema: list[dict]) -> tuple[dict[str, str], list[str]]:
    labels: dict[str, str] = {}
    order: list[str] = []
    for q in schema:
        key = q.get("key")
        if isinstance(key, str) and key and key not in labels:
            labels[key] = (q.get("label") or key) if isinstance(q.get("label"), str) else key
            order.append(key)
    return labels, order


def _render_questions(schema: list[dict]) -> str:
    lines: list[str] = []
    for i, q in enumerate(schema, 1):
        label = q.get("label") or q.get("key") or f"savol {i}"
        qtype = q.get("type") or "text"
        opts = q.get("options")
        line = f"{i}. [{qtype}] {label}"
        if isinstance(opts, list) and opts:
            line += f" (variantlar: {', '.join(str(o) for o in opts)})"
        lines.append(line)
    return "\n".join(lines)


def _render_response(idx: int, rsvp: EventRsvp, labels: dict[str, str], order: list[str]) -> str:
    parts = [f"— Javob #{idx} (holat: {rsvp.status})"]
    answers = rsvp.answers if isinstance(rsvp.answers, dict) else {}
    keys = order + [k for k in answers if k not in order]
    for k in keys:
        if k not in answers:
            continue
        text = answer_to_text(answers[k]).strip()
        if not text:
            continue
        parts.append(f"  {labels.get(k, k)}: {text}")
    return "\n".join(parts)


def _plain_aggregate(
    event: Event,
    schema: list[dict],
    responses: list[EventRsvp],
    *,
    reason: str,
) -> str:
    """No-AI fallback: a self-computed, readable aggregate (counts + per-question
    value distribution). ``reason`` explains WHY AI wasn't used, in Uzbek."""
    total = len(responses)
    going = sum(1 for r in responses if r.status == "going")
    interested = total - going

    lines = [
        reason,
        "",
        f"Tadbir: {event.title}",
        f"Jami to'ldirilgan anketalar: {total}",
        f"  • Boraman (going): {going}",
        f"  • Qiziqaman (interested): {interested}",
        "",
    ]

    labels, order = _labels_and_order(schema)
    for q in schema:
        key = q.get("key")
        if not isinstance(key, str) or not key:
            continue
        qtype = q.get("type") or "text"
        label = labels.get(key, key)
        answered = [
            r.answers.get(key)
            for r in responses
            if isinstance(r.answers, dict) and not _is_blank(r.answers.get(key))
        ]
        lines.append(label)
        if qtype in _DISTRIBUTION_TYPES:
            counter: Counter[str] = Counter()
            for v in answered:
                if isinstance(v, (list, tuple)):
                    for item in v:
                        counter[str(item).strip()] += 1
                else:
                    counter[str(v).strip()] += 1
            if counter:
                for val, count in counter.most_common(25):
                    lines.append(f"  - {val}: {count}")
            else:
                lines.append("  (javob yo'q)")
        else:
            lines.append(f"  {len(answered)} ta javob berildi")
        lines.append("")

    return "\n".join(lines).rstrip()


def _build_prompt(
    event: Event,
    schema: list[dict],
    responses: list[EventRsvp],
) -> tuple[str, int, bool]:
    """Build the user-content string for the AI call, respecting MAX_INPUT_CHARS.

    Returns ``(content, included_count, sampled)``."""
    labels, order = _labels_and_order(schema)
    questions_text = _render_questions(schema) or "(anketa savollari topilmadi)"

    total = len(responses)
    going = sum(1 for r in responses if r.status == "going")
    interested = total - going

    blocks: list[str] = []
    used = 0
    included = 0
    sampled = False
    for i, rsvp in enumerate(responses, 1):
        block = _render_response(i, rsvp, labels, order)
        if len(block) > MAX_INPUT_CHARS:
            block = block[:MAX_INPUT_CHARS]  # a single monster answer set
        if included > 0 and used + len(block) > MAX_INPUT_CHARS:
            sampled = True
            break
        blocks.append(block)
        used += len(block) + 2
        included += 1

    note = ""
    if sampled:
        note = (
            f"\n\nESLATMA: {total} ta javobdan faqat dastlabki {included} tasi "
            f"quyida berilgan (namuna).\n"
        )

    content = (
        f"Tadbir nomi: {event.title}\n"
        f"Jami anketalar: {total} (boraman: {going}, qiziqaman: {interested})"
        f"{note}\n\n"
        f"ANKETA SAVOLLARI:\n{questions_text}\n\n"
        f"JAVOBLAR ({included} ta ko'rsatilgan, jami {total}):\n\n"
        + "\n\n".join(blocks)
    )
    return content, included, sampled


async def generate_event_report(event_id: int) -> dict:
    """Produce an AI digest of an event's form responses. Never raises.

    See the module docstring for the full contract. Returns a dict with
    ``summary``, ``response_count``, ``generated_at`` (and ``sampled`` when the
    input was truncated); on unexpected failure returns ``{error, response_count}``.
    """
    response_count = 0
    try:
        async with AsyncSessionLocal() as db:
            event = (
                await db.execute(select(Event).where(Event.id == event_id))
            ).scalar_one_or_none()
            if event is None:
                return {
                    "summary": "Tadbir topilmadi.",
                    "response_count": 0,
                    "generated_at": _now_iso(),
                }

            rsvps = (
                await db.execute(
                    select(EventRsvp).where(EventRsvp.event_id == event_id)
                )
            ).scalars().all()

            # A "response" = an RSVP that actually filled in the form.
            responses = [
                r for r in rsvps if isinstance(r.answers, dict) and len(r.answers) > 0
            ]
            response_count = len(responses)
            schema = _schema_list(event)

            # ── 0 responses: friendly message, no AI call ──────────────────────
            if response_count == 0:
                return {
                    "summary": (
                        "Hozircha bu tadbir uchun to'ldirilgan anketa javoblari yo'q. "
                        "Odamlar ro'yxatdan o'tib, anketani to'ldirgach, bu yerda "
                        "AI xulosasi paydo bo'ladi."
                    ),
                    "response_count": 0,
                    "generated_at": _now_iso(),
                }

            # ── No API key: plain self-computed aggregate ──────────────────────
            if not settings.ANTHROPIC_API_KEY:
                summary = _plain_aggregate(
                    event,
                    schema,
                    responses,
                    reason=(
                        "⚠️ AI sozlanmagan — quyida oddiy statistik hisobot "
                        "(sun'iy intellekt tahlili emas)."
                    ),
                )
                return {
                    "summary": summary,
                    "response_count": response_count,
                    "generated_at": _now_iso(),
                }

            content, included, sampled = _build_prompt(event, schema, responses)

        # ── ONE Claude call (outside the DB session — no lock held) ─────────────
        try:
            resp = await ai._create_message(
                model=settings.AI_MODEL,
                max_tokens=_MAX_OUTPUT_TOKENS,
                system=_SYSTEM_PROMPT,
                messages=[{"role": "user", "content": content}],
            )
            summary = "".join(
                b.text for b in resp.content if getattr(b, "type", None) == "text"
            ).strip()
        except Exception as exc:  # AI failed → degrade to the plain aggregate
            logger.warning("event AI report failed (event %s), aggregating: %s", event_id, exc)
            summary = _plain_aggregate(
                event,
                schema,
                responses,
                reason=(
                    "⚠️ AI xizmati hozircha ishlamadi — quyida oddiy statistik "
                    "hisobot (sun'iy intellekt tahlili emas)."
                ),
            )
            return {
                "summary": summary,
                "response_count": response_count,
                "generated_at": _now_iso(),
            }

        if not summary:
            summary = _plain_aggregate(
                event,
                schema,
                responses,
                reason="⚠️ AI bo'sh javob qaytardi — quyida oddiy statistik hisobot.",
            )

        if sampled:
            summary = (
                f"(Eslatma: {included}/{response_count} ta javob namunasi asosida.)\n\n"
                + summary
            )

        result: dict[str, Any] = {
            "summary": summary,
            "response_count": response_count,
            "generated_at": _now_iso(),
        }
        if sampled:
            result["sampled"] = True
        return result

    except Exception as exc:  # last-resort guard: never raise to the caller
        logger.exception("generate_event_report crashed for event %s: %s", event_id, exc)
        return {"error": "report_failed", "response_count": response_count}
