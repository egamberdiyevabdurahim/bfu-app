# Batch F — Extras Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three portable "extras" for BFU: (1) a one-page **PDF resume** from a
member's profile (`GET /users/me/resume` + a Download CV button), (2) Telegram
**inline mode** so `@BrightFuturesUzbekistan_bot <query>` shares matching
projects into any chat as deep-link cards, and (3) the **wiring** for a sticker
pack (a `/stickers` command + deep link; the art is a founder input).

**Architecture:** The resume reuses the existing profile builders verbatim —
`_profile_extras` (Batch A) + `_trust_extras` (Batch B) — fed into a new pure
function `render_resume_pdf(...)` (shaped like `card.py::render_card_png`), and
streamed from an **authenticated** `me`-only endpoint as `application/pdf` (no
signed URL — only the logged-in member reads their own CV). PDF generation uses
**`fpdf2`** (pure-Python, ships core fonts, real selectable-text PDF). Inline
mode adds a directly-testable `build_inline_results(query, tg_user_id, db)`
helper plus an `@dp.inline_query()` handler in `backend/bot.py`, querying
approved/non-draft projects and emitting `startapp=project_<id>` deep links the
Mini App already parses. The sticker pack is a `/stickers` handler + a
`STICKER_PACK_URL` setting; the images themselves are supplied by the founder.

**Tech Stack:** FastAPI + SQLAlchemy 2 async + Postgres, aiogram 3 (bot), React
19 + Vite (frontend), pytest (tests), `fpdf2` (new dep). No new tables, no
columns, no DB migrations.

**Spec:** `docs/superpowers/specs/2026-07-01-batchF-extras-design.md`

**Depends on:** Batch A (`_profile_extras` in `app/routers/users.py`) and Batch B
(`_trust_extras` in `app/routers/users.py`). Both are already on `main`
(confirmed: `_profile_extras` ~L116, `_trust_extras` ~L223). The public
`/u/{id}` page (Batch B) provides the URL the resume footer links to.

---

## TWO MANUAL FOUNDER STEPS (flagged; code/tests do NOT depend on them)

- **FOUNDER STEP 1 — BotFather `/setinline`** (enables inline mode in prod).
  @BotFather → `/mybots` → @BrightFuturesUzbekistan_bot → **Bot Settings →
  Inline Mode → Turn on** (optionally set placeholder `Search BFU projects…`).
  Surfaced again at **Task 7**.
- **FOUNDER STEP 2 — Sticker art + pack** (supplies the pack URL).
  Founder creates N 512×512 stickers via **@Stickers** (`/newpack` → upload →
  `/publish`), then sets **`STICKER_PACK_URL`** env to the resulting
  `https://t.me/addstickers/<name>`. Source images go in
  `backend/app/assets/stickers/`. Surfaced again at **Task 9**.

---

## File structure

- `backend/requirements.txt` — add `fpdf2==2.8.1`
- `backend/app/services/resume.py` — new: `render_resume_pdf(...)` (pure fn)
- `backend/app/routers/users.py` — new `GET /me/resume` endpoint
- `backend/app/config.py` — add `STICKER_PACK_URL`
- `backend/bot.py` — `build_inline_results(...)`, `@dp.inline_query()`, `/stickers`
- `backend/tests/test_resume.py` — new
- `backend/tests/test_bot_inline.py` — new
- `src/api.js` — `users.resume()` + `downloadResume()`
- `src/screens/SettingsScreen.jsx` — Download CV button
- `src/i18n.jsx` — `resume.*` keys (en/uz/ru)

---

## Task 1: Add the `fpdf2` dependency

**Files:**
- Modify: `backend/requirements.txt`

- [ ] **Step 1: Add the dep**

In `backend/requirements.txt`, after the `Pillow==11.1.0` line, add:

```
fpdf2==2.8.1
```

- [ ] **Step 2: Install + verify it imports**

Run:
```bash
cd backend && pip install fpdf2==2.8.1 && python -c "from fpdf import FPDF; print('fpdf2 ok')"
```
Expected: `fpdf2 ok`. (Import name is `fpdf`, package is `fpdf2`.)

- [ ] **Step 3: Commit**

```bash
git add backend/requirements.txt
git commit -m "deps: add fpdf2 for resume/CV PDF export"
```

---

## Task 2: `render_resume_pdf` service (TDD)

**Files:**
- Create: `backend/app/services/resume.py`
- Test: `backend/tests/test_resume.py` (new)

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_resume.py`:

```python
"""Batch F: one-page PDF resume generation + the /users/me/resume endpoint."""
import pytest

pytestmark = pytest.mark.asyncio


def _sample_extras():
    return {
        "currently_building": "Solar microgrid for rural schools",
        "currently_building_source": "manual",
        "portfolio_links": [
            {"label": "GitHub", "url": "https://github.com/aziz"},
            {"label": "Site", "url": "https://aziz.dev"},
        ],
        "founded_projects": [
            {"id": 1, "name": "Solar Farm", "type": "startup", "is_active": True, "date": None},
            {"id": 2, "name": "Old Co", "type": "startup", "is_active": False, "date": None},
        ],
        "member_projects": [
            {"id": 3, "name": "EcoTeam", "type": "volunteering", "is_active": True, "date": None},
        ],
        "stats": {"projects_founded": 2, "projects_joined": 1, "applications_accepted": 1},
    }


def _sample_trust():
    return {
        "endorsements": [{"skill": "React", "count": 3, "endorsed_by_me": False},
                         {"skill": "Python", "count": 1, "endorsed_by_me": False}],
        "vouches": [{"id": 1, "text": "Ships fast and reliable.",
                     "author": {"id": 9, "display_name": "Dilnoza"}, "created_at": None}],
        "vouch_count": 1,
        "rating": {"average": 4.5, "count": 2},
        "mutual_connections": {"count": 0, "preview": []},
    }


def test_render_resume_pdf_basic():
    from app.services.resume import render_resume_pdf
    pdf = render_resume_pdf(
        name="Aziz Karimov", meta="Tashkent · 22 y/o · Verified",
        public_url="https://app.bfu.uz/u/7", about="Builder of useful things.",
        skills=["React", "Python", "Figma"], other_tags=["Climate", "Hardware"],
        extras=_sample_extras(), trust=_sample_trust(),
    )
    assert isinstance(pdf, (bytes, bytearray))
    assert pdf[:5] == b"%PDF-"          # valid PDF magic
    assert len(pdf) > 1000              # non-trivial, real content


def test_render_resume_pdf_empty_profile():
    """A brand-new member with nothing filled still yields a valid one-pager."""
    from app.services.resume import render_resume_pdf
    empty_extras = {
        "currently_building": None, "currently_building_source": None,
        "portfolio_links": [], "founded_projects": [], "member_projects": [],
        "stats": {"projects_founded": 0, "projects_joined": 0, "applications_accepted": 0},
    }
    empty_trust = {"endorsements": [], "vouches": [], "vouch_count": 0,
                   "rating": {"average": None, "count": 0},
                   "mutual_connections": {"count": 0, "preview": []}}
    pdf = render_resume_pdf(
        name="New Member", meta="", public_url="https://app.bfu.uz/u/1",
        about=None, skills=[], other_tags=[], extras=empty_extras, trust=empty_trust,
    )
    assert pdf[:5] == b"%PDF-"
    assert len(pdf) > 800


def test_render_resume_pdf_non_latin_does_not_raise():
    """Cyrillic / emoji must not crash the core-font PDF — best-effort encode."""
    from app.services.resume import render_resume_pdf
    pdf = render_resume_pdf(
        name="Азиз Каримов 🚀", meta="Тошкент", public_url="https://app.bfu.uz/u/7",
        about="Строю полезные вещи. 🔧", skills=["React"], other_tags=[],
        extras=_sample_extras(), trust=_sample_trust(),
    )
    assert pdf[:5] == b"%PDF-"
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && python -m pytest tests/test_resume.py -k render_resume -v`
Expected: FAIL — `No module named 'app.services.resume'`.

- [ ] **Step 3: Implement the service**

Create `backend/app/services/resume.py`:

```python
"""Renders a one-page A4 PDF resume/CV from a member's BFU profile.

Pure function, mirroring app/services/card.py: it takes already-computed profile
data (the same dicts `_profile_extras` + `_trust_extras` return) and returns PDF
bytes. Uses fpdf2 with the built-in Helvetica core fonts (no font files needed),
so it renders identically everywhere. Every string is passed through `_safe`
before drawing, so non-latin-1 input (Cyrillic, emoji) degrades gracefully
instead of raising.
"""
from __future__ import annotations

import unicodedata

from fpdf import FPDF

# Brand-ish palette (RGB). fpdf2 wants ints.
ACCENT = (123, 111, 255)
INK = (24, 24, 32)
MUTED = (120, 120, 140)
LINE = (220, 220, 230)


def _safe(s) -> str:
    """Make a string drawable by the latin-1 core fonts. Keep what we can,
    transliterate the rest, drop anything still un-encodable (e.g. emoji)."""
    s = str(s or "")
    try:
        s.encode("latin-1")
        return s
    except UnicodeEncodeError:
        pass
    # Best-effort: decompose accents / transliterate to ASCII, drop residue.
    norm = unicodedata.normalize("NFKD", s)
    out = norm.encode("latin-1", "ignore").decode("latin-1")
    return out.strip() or s.encode("ascii", "ignore").decode("ascii")


def render_resume_pdf(
    *, name: str, meta: str, public_url: str, about: str | None,
    skills: list[str], other_tags: list[str], extras: dict, trust: dict,
) -> bytes:
    pdf = FPDF(orientation="P", unit="mm", format="A4")
    pdf.set_auto_page_break(auto=True, margin=16)
    pdf.add_page()
    pdf.set_margins(left=18, top=16, right=18)
    epw = pdf.w - 36  # effective page width

    def h1(text: str):
        pdf.set_font("Helvetica", "B", 22)
        pdf.set_text_color(*INK)
        pdf.multi_cell(epw, 9, _safe(text))

    def small(text: str, color=MUTED):
        pdf.set_font("Helvetica", "", 10)
        pdf.set_text_color(*color)
        pdf.multi_cell(epw, 5, _safe(text))

    def section(title: str):
        pdf.ln(3)
        pdf.set_font("Helvetica", "B", 11)
        pdf.set_text_color(*ACCENT)
        pdf.cell(0, 6, _safe(title.upper()), new_x="LMARGIN", new_y="NEXT")
        pdf.set_draw_color(*LINE)
        y = pdf.get_y()
        pdf.line(18, y, 18 + epw, y)
        pdf.ln(2)

    def body(text: str, size=10):
        pdf.set_font("Helvetica", "", size)
        pdf.set_text_color(*INK)
        pdf.multi_cell(epw, 5, _safe(text))

    # ── Header ──
    h1(name or "BFU member")
    if meta:
        small(meta)
    if public_url:
        pdf.set_font("Helvetica", "", 9)
        pdf.set_text_color(*ACCENT)
        pdf.cell(0, 5, _safe(public_url), new_x="LMARGIN", new_y="NEXT",
                 link=public_url)

    cb = extras.get("currently_building")
    if cb:
        pdf.ln(1)
        pdf.set_font("Helvetica", "B", 11)
        pdf.set_text_color(*INK)
        pdf.multi_cell(epw, 6, _safe("Currently building: " + cb))

    # ── About ──
    if about and about.strip():
        section("About")
        body(about.strip())

    # ── Skills (with endorsement counts) ──
    endo = {e["skill"]: e.get("count", 0) for e in (trust.get("endorsements") or [])}
    if skills:
        section("Skills")
        line = "  ".join(
            f"{s} ({endo[s]})" if endo.get(s) else s for s in skills
        )
        body(line)
    if other_tags:
        section("Interests & strengths")
        body("  ".join(other_tags))

    # ── Projects founded ──
    founded = extras.get("founded_projects") or []
    section("Projects founded")
    if founded:
        for p in founded:
            status = "Active" if p.get("is_active") else "Closed"
            body(f"- {p.get('name', '')}  ({status})")
    else:
        small("No projects yet.")

    # ── Projects joined ──
    joined = extras.get("member_projects") or []
    section("Projects joined")
    if joined:
        for p in joined:
            status = "Active" if p.get("is_active") else "Closed"
            body(f"- {p.get('name', '')}  ({status})")
    else:
        small("None yet.")

    # ── Reputation: rating + vouches ──
    rating = trust.get("rating") or {}
    vouches = trust.get("vouches") or []
    if rating.get("average") is not None or vouches:
        section("Reputation")
        if rating.get("average") is not None:
            body(f"Rating: {rating['average']} / 5  ({rating.get('count', 0)} ratings)")
        for v in vouches[:3]:
            author = (v.get("author") or {}).get("display_name", "")
            body(f'"{v.get("text", "")}"  - {author}', size=9)

    # ── Portfolio links ──
    links = extras.get("portfolio_links") or []
    if links:
        section("Links")
        for l in links:
            label = l.get("label") or l.get("url", "")
            url = l.get("url", "")
            pdf.set_font("Helvetica", "", 10)
            pdf.set_text_color(*ACCENT)
            pdf.cell(0, 5, _safe(f"{label}: {url}"), new_x="LMARGIN",
                     new_y="NEXT", link=url)

    # ── Footer credit ──
    pdf.ln(4)
    pdf.set_font("Helvetica", "I", 8)
    pdf.set_text_color(*MUTED)
    pdf.cell(0, 4, _safe("Generated by Bright Futures Uzbekistan"),
             new_x="LMARGIN", new_y="NEXT")

    out = pdf.output()  # fpdf2 2.8 returns a bytearray
    return bytes(out)
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && python -m pytest tests/test_resume.py -k render_resume -v`
Expected: all passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/resume.py backend/tests/test_resume.py
git commit -m "feat: render_resume_pdf — one-page CV from profile data"
```

---

## Task 3: `GET /users/me/resume` endpoint (TDD)

**Files:**
- Modify: `backend/app/routers/users.py`
- Test: `backend/tests/test_resume.py`

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_resume.py`:

```python
async def _mk_project(db, creator_id, name, *, is_active=True):
    from app.models.project import Project
    p = Project(type="startup", creator_id=creator_id, name=name, about="A useful thing.",
                is_active=is_active, is_draft=False, is_deleted=False, is_approved=True)
    db.add(p)
    await db.commit()
    await db.refresh(p)
    return p


async def test_me_resume_returns_pdf(make_user, as_user, db):
    from app.models.user_analysis import UserAnalysis
    me = await make_user(name="Aziz", surname="Karimov")
    db.add(UserAnalysis(user_id=me.id, skills=["React", "Python"], knowledges=[],
                        interests=["Climate"], preparations=[], goals=[]))
    await db.commit()
    await _mk_project(db, me.id, "Solar Farm", is_active=True)

    c = as_user(me)
    res = await c.get("/users/me/resume")
    assert res.status_code == 200, res.text
    assert res.headers["content-type"] == "application/pdf"
    assert "attachment" in res.headers.get("content-disposition", "")
    assert res.content[:5] == b"%PDF-"
    assert len(res.content) > 1000


async def test_me_resume_empty_profile_still_pdf(make_user, as_user, db):
    me = await make_user(name="New", surname="Member")
    c = as_user(me)
    res = await c.get("/users/me/resume")
    assert res.status_code == 200, res.text
    assert res.content[:5] == b"%PDF-"


async def test_me_resume_requires_auth(client):
    # No as_user override → unauthenticated → 401/403.
    res = await client.get("/users/me/resume")
    assert res.status_code in (401, 403)
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && python -m pytest tests/test_resume.py -k me_resume -v`
Expected: FAIL — 404 (route missing) on the authed tests.

- [ ] **Step 3: Implement the endpoint**

In `backend/app/routers/users.py`, add the resume endpoint immediately after the
`my_card` handler (`@router.get("/me/card")`, ~L851). It reuses
`_profile_extras` + `_trust_extras` (defined earlier in this same module) and the
`Region` lookup pattern already used by `my_card`/the public page. The `Region`
model is imported in this module already (used elsewhere); if a `NameError` on
`Region` appears, add `from app.models.region import Region` near the top imports.

```python
@router.get("/me/resume")
async def my_resume(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate and stream the caller's one-page PDF CV (attachment).

    Authenticated + me-only: a member can export only their own resume. The PDF
    is built from the same `_profile_extras` (Batch A) + `_trust_extras` (Batch B)
    data the profile/public page show, so it can never drift from them."""
    from fastapi import Response
    from app.services.resume import render_resume_pdf

    # Ensure analysis is loaded for skills/tags (selectinload like other handlers).
    user = (await db.execute(
        select(User).options(selectinload(User.analysis))
        .where(User.id == current_user.id)
    )).scalar_one()

    extras = await _profile_extras(db, user)
    trust = await _trust_extras(db, user, None)

    # Display name: "Name Surname" capitalized, else display_name.
    full = ((user.name or "").capitalize()
            + ((" " + user.surname.capitalize()) if user.surname else "")).strip()
    name = full or (user.display_name or "BFU member")

    # Meta line: region · age · verified.
    region_name = None
    if user.region_id:
        from app.models.region import Region
        r = await db.get(Region, user.region_id)
        region_name = (r.name_uz if r else None)
    age = (datetime.utcnow().year - user.birth_year) if user.birth_year else None
    meta_parts = []
    if region_name:
        meta_parts.append(region_name)
    if age:
        meta_parts.append(f"{age} y/o")
    if user.checked:
        meta_parts.append("Verified")
    meta = " · ".join(meta_parts)

    base = (settings.WEBAPP_URL or "").rstrip("/")
    public_url = f"{base}/u/{user.id}" if base else f"/u/{user.id}"

    skills = (user.analysis.skills if user.analysis else None) or []
    other_tags: list[str] = []
    seen = set(s.lower() for s in skills)
    if user.analysis:
        for cat in ("interests", "knowledges", "preparations", "goals"):
            for tg in (getattr(user.analysis, cat, None) or []):
                if tg.lower() not in seen:
                    seen.add(tg.lower())
                    other_tags.append(tg)

    pdf = render_resume_pdf(
        name=name, meta=meta, public_url=public_url, about=user.about,
        skills=skills, other_tags=other_tags[:12], extras=extras, trust=trust,
    )

    fname = (full or "BFU").replace(" ", "-").encode("ascii", "ignore").decode() or "BFU"
    return Response(
        content=pdf, media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{fname}-BFU-CV.pdf"'},
    )
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && python -m pytest tests/test_resume.py -v`
Expected: all passed.

- [ ] **Step 5: Run the full backend suite (no regressions)**

Run: `cd backend && python -m pytest -q`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/users.py backend/tests/test_resume.py
git commit -m "feat: GET /users/me/resume — authenticated PDF CV download"
```

---

## Task 4: `STICKER_PACK_URL` setting

**Files:**
- Modify: `backend/app/config.py`

- [ ] **Step 1: Add the setting**

In `backend/app/config.py`, inside `class Settings`, after the `BOT_USERNAME`
line (~L27), add:

```python
    # Published BFU sticker pack URL (https://t.me/addstickers/<name>). Set once
    # the founder creates the pack via @Stickers (FOUNDER STEP 2). Empty until
    # then → /stickers replies "coming soon".
    STICKER_PACK_URL: str = ""
```

- [ ] **Step 2: Verify it loads**

Run: `cd backend && python -c "from app.config import settings; print(repr(settings.STICKER_PACK_URL))"`
Expected: `''`.

- [ ] **Step 3: Commit**

```bash
git add backend/app/config.py
git commit -m "config: STICKER_PACK_URL (empty until founder publishes pack)"
```

---

## Task 5: `build_inline_results` helper (TDD)

**Files:**
- Modify: `backend/bot.py`
- Test: `backend/tests/test_bot_inline.py` (new)

The inline logic is a standalone async function so it can be tested without the
polling loop or Telegram network. It returns a list of aiogram
`InlineQueryResultArticle` objects.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_bot_inline.py`:

```python
"""Batch F: Telegram inline mode — build_inline_results (no polling loop)."""
import pytest

pytestmark = pytest.mark.asyncio


async def _mk_project(db, creator_id, name, *, about="", is_approved=True,
                      is_draft=False, is_deleted=False):
    from app.models.project import Project
    p = Project(type="startup", creator_id=creator_id, name=name, about=about,
                is_active=True, is_approved=is_approved, is_draft=is_draft,
                is_deleted=is_deleted)
    db.add(p)
    await db.commit()
    await db.refresh(p)
    return p


async def test_inline_results_match_approved_project(make_user, db):
    from bot import build_inline_results
    owner = await make_user(name="Owner")
    p = await _mk_project(db, owner.id, "Solar Farm", about="Clean energy for schools")

    results = await build_inline_results("solar", tg_user_id=owner.telegram_id, db=db)
    assert len(results) >= 1
    # The matching project must produce a deep link to startapp=project_<id>.
    blob = " ".join(
        (r.input_message_content.message_text or "") + " " + (r.url or "")
        for r in results
    )
    assert f"project_{p.id}" in blob
    titles = [r.title for r in results]
    assert any("Solar Farm" in (tt or "") for tt in titles)


async def test_inline_results_excludes_draft_and_unapproved(make_user, db):
    from bot import build_inline_results
    owner = await make_user(name="Owner")
    await _mk_project(db, owner.id, "Hidden Draft", is_draft=True)
    await _mk_project(db, owner.id, "Pending Co", is_approved=False)

    results = await build_inline_results("Hidden", tg_user_id=owner.telegram_id, db=db)
    assert all("Hidden Draft" not in (r.title or "") for r in results)
    results2 = await build_inline_results("Pending", tg_user_id=owner.telegram_id, db=db)
    assert all("Pending Co" not in (r.title or "") for r in results2)


async def test_inline_results_no_match_is_empty(make_user, db):
    from bot import build_inline_results
    owner = await make_user(name="Owner")
    await _mk_project(db, owner.id, "Solar Farm")
    results = await build_inline_results("zzzznotathing", tg_user_id=owner.telegram_id, db=db)
    assert results == []


async def test_inline_empty_query_includes_own_profile_link(make_user, db):
    from bot import build_inline_results
    me = await make_user(name="Aziz")
    await _mk_project(db, me.id, "Recent Co")
    results = await build_inline_results("", tg_user_id=me.telegram_id, db=db)
    blob = " ".join(
        (r.input_message_content.message_text or "") + " " + (r.url or "")
        for r in results
    )
    # Default set leads with the typist's own profile deep link.
    assert f"user_{me.id}" in blob
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && python -m pytest tests/test_bot_inline.py -v`
Expected: FAIL — `cannot import name 'build_inline_results' from 'bot'`.

> Note on import path: tests run with CWD `backend/` (that's where `pytest` is
> invoked throughout this repo), and `bot.py` sits at `backend/bot.py`, so
> `from bot import build_inline_results` resolves. This matches how `bot.py`
> itself does `from app.config import settings`.

- [ ] **Step 3: Implement the helper + register the handler**

In `backend/bot.py`, extend the imports at the top. Change:

```python
from aiogram import Bot, Dispatcher, F, types
from aiogram.filters import Command, CommandStart
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo
from sqlalchemy import select
```

to:

```python
from aiogram import Bot, Dispatcher, F, types
from aiogram.filters import Command, CommandStart
from aiogram.types import (
    InlineKeyboardButton, InlineKeyboardMarkup, InlineQuery,
    InlineQueryResultArticle, InputTextMessageContent, WebAppInfo,
)
from sqlalchemy import or_, select

from app.models.project import Project
```

Then add the helper + handler after `command_me_handler` (before the `_LOC`
block). `_deep` builds the same `startapp=` deep links the Mini App parses
(`project_<id>`, `user_<id>` — confirmed in `src/App.jsx`'s `_parseDeepLink`):

```python
def _deep(param: str) -> str:
    """Telegram deep link into the Mini App with a start parameter."""
    return f"https://t.me/{settings.BOT_USERNAME}?startapp={param}"


async def build_inline_results(query: str, tg_user_id: int, db) -> list:
    """Inline-mode results for `query`. Returns InlineQueryResultArticle objects.

    Pulled out of the handler so it is unit-testable without the polling loop.
    - Non-empty query: ILIKE on approved/non-draft/non-deleted project name+about.
    - Empty query: the typist's own profile link (if they're a BFU user) + recent
      approved projects.
    """
    q = (query or "").strip()
    results: list = []

    # On an empty query, lead with the typist's own shareable profile link.
    if not q:
        me = (await db.execute(
            select(User).where(User.telegram_id == tg_user_id,
                               User.is_deleted == False, User.is_registered == True)
        )).scalar_one_or_none()
        if me is not None:
            link = _deep(f"user_{me.id}")
            results.append(InlineQueryResultArticle(
                id=f"me_{me.id}",
                title="📇 Share my BFU profile",
                description="Send a link to your Bright Futures profile",
                url=link,
                input_message_content=InputTextMessageContent(
                    message_text=f"My Bright Futures Uzbekistan profile 👉 {link}",
                    disable_web_page_preview=False,
                ),
            ))

    stmt = (
        select(Project)
        .where(Project.is_approved == True, Project.is_draft == False,
               Project.is_deleted == False)
        .order_by(Project.created_at.desc())
        .limit(12)
    )
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(Project.name.ilike(like), Project.about.ilike(like)))

    projects = (await db.execute(stmt)).scalars().all()
    for p in projects:
        link = _deep(f"project_{p.id}")
        teaser = (p.about or "").strip().replace("\n", " ")
        if len(teaser) > 120:
            teaser = teaser[:117] + "…"
        kind = "Startup" if p.type == "startup" else "Volunteering"
        results.append(InlineQueryResultArticle(
            id=f"proj_{p.id}",
            title=p.name,
            description=(teaser or kind),
            url=link,
            input_message_content=InputTextMessageContent(
                message_text=(f"🚀 {p.name}\n{teaser}\n\nOpen on BFU 👉 {link}"
                              if teaser else f"🚀 {p.name}\n\nOpen on BFU 👉 {link}"),
                disable_web_page_preview=False,
            ),
        ))
    return results


@dp.inline_query()
async def inline_query_handler(query: InlineQuery) -> None:
    """`@BrightFuturesUzbekistan_bot <text>` in any chat → shareable project /
    profile cards that deep-link into the Mini App.

    Requires inline mode enabled in BotFather (FOUNDER STEP 1)."""
    async with AsyncSessionLocal() as session:
        results = await build_inline_results(query.query, query.from_user.id, session)
    # is_personal: results include the typist's own profile → never cross-cache.
    await query.answer(results, cache_time=15, is_personal=True)
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && python -m pytest tests/test_bot_inline.py -k "build_inline or inline_results or inline_empty" -v`
Expected: all passed.

- [ ] **Step 5: Commit**

```bash
git add backend/bot.py backend/tests/test_bot_inline.py
git commit -m "feat: bot inline mode — share projects/profile into any chat"
```

---

## Task 6: Inline handler wrapper test (fake query)

**Files:**
- Test: `backend/tests/test_bot_inline.py`

Prove the decorated `inline_query_handler` calls `query.answer(...)` with the
built results, using a fake query object (no Telegram network, no DB override —
it uses `AsyncSessionLocal` like the real handler, which the test conftest points
at the test DB engine via the same `DATABASE_URL`/in-memory setup the rest of the
suite uses).

- [ ] **Step 1: Write the test**

Append to `backend/tests/test_bot_inline.py`:

```python
async def test_inline_handler_calls_answer(make_user, db, monkeypatch):
    """The @dp.inline_query handler answers with the built results."""
    import bot as botmod

    owner = await make_user(name="Owner")
    await _mk_project(db, owner.id, "Solar Farm", about="Clean energy")

    # Point the handler's session factory at the test session so it reads our row.
    class _CtxFactory:
        def __call__(self):
            outer = self
            class _Ctx:
                async def __aenter__(self_inner):
                    return db
                async def __aexit__(self_inner, *a):
                    return False
            return _Ctx()
    monkeypatch.setattr(botmod, "AsyncSessionLocal", _CtxFactory())

    captured = {}

    class _FakeUser:
        id = owner.telegram_id

    class _FakeQuery:
        query = "solar"
        from_user = _FakeUser()
        async def answer(self, results, **kwargs):
            captured["results"] = results
            captured["kwargs"] = kwargs

    await botmod.inline_query_handler(_FakeQuery())
    assert "results" in captured
    assert len(captured["results"]) >= 1
    assert captured["kwargs"].get("is_personal") is True
```

- [ ] **Step 2: Run to verify it passes**

Run: `cd backend && python -m pytest tests/test_bot_inline.py -v`
Expected: all passed (this test + Task 5's).

> If `AsyncSessionLocal` monkeypatching proves brittle in this environment, this
> wrapper test may be skipped with `@pytest.mark.skip(reason="needs live session
> factory")` WITHOUT removing it — the core logic is already proven by Task 5's
> direct `build_inline_results` tests, which are the load-bearing coverage.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/test_bot_inline.py
git commit -m "test: inline_query_handler answers with built results"
```

---

## Task 7: FOUNDER STEP 1 — enable inline mode (BotFather)

> **MANUAL, one-time, founder-only. No code. Do NOT block the batch on it — the
> handler is already implemented + tested.**

- [ ] **Step 1: Toggle inline mode**

In Telegram:
1. Open **@BotFather** → `/mybots` → **@BrightFuturesUzbekistan_bot**.
2. **Bot Settings → Inline Mode → Turn on.**
3. Optionally **Inline Mode → Edit inline placeholder** → `Search BFU projects…`.

- [ ] **Step 2: Smoke-test in any chat**

Type `@BrightFuturesUzbekistan_bot solar` in a DM with yourself: a results card
for matching approved projects should appear; tapping it sends a message with the
`?startapp=project_<id>` deep link that opens the Mini App on that project.

*(No commit — this is an external Telegram setting.)*

---

## Task 8: `/stickers` command (TDD where feasible) + handler

**Files:**
- Modify: `backend/bot.py`

The `/stickers` command links to the published pack when `STICKER_PACK_URL` is
set, else replies a localized "coming soon". The localized copy is a module-level
dict (testable directly).

- [ ] **Step 1: Add the copy + handler**

In `backend/bot.py`, add after the inline handler (before `_LOC`, or alongside
it — placement doesn't matter functionally):

```python
_STICKERS = {
    "en": {
        "btn": "🎨 Get our stickers",
        "soon": "Our sticker pack is coming soon! 🎨",
    },
    "uz": {
        "btn": "🎨 Stikerlarni olish",
        "soon": "Stiker to‘plamimiz tez orada! 🎨",
    },
    "ru": {
        "btn": "🎨 Получить стикеры",
        "soon": "Наш стикерпак скоро появится! 🎨",
    },
}


@dp.message(Command("stickers"))
async def command_stickers_handler(message: types.Message) -> None:
    """`/stickers` — link to the BFU sticker pack (FOUNDER STEP 2 supplies it).
    Until STICKER_PACK_URL is set, reply a friendly 'coming soon'."""
    lang = _lang_of(message)
    tr = _STICKERS.get(lang, _STICKERS["en"])
    url = (settings.STICKER_PACK_URL or "").strip()
    if not url:
        await message.answer(tr["soon"])
        return
    markup = InlineKeyboardMarkup(
        inline_keyboard=[[InlineKeyboardButton(text=tr["btn"], url=url)]]
    )
    await message.answer(tr["btn"], reply_markup=markup)
```

- [ ] **Step 2: Add a tiny unit test for the copy + URL gating**

Append to `backend/tests/test_bot_inline.py` (same file — it's the bot test file):

```python
def test_stickers_copy_has_all_langs():
    import bot as botmod
    for lang in ("en", "uz", "ru"):
        assert lang in botmod._STICKERS
        assert botmod._STICKERS[lang]["btn"]
        assert botmod._STICKERS[lang]["soon"]
```

- [ ] **Step 3: Run to verify it passes + bot module imports cleanly**

Run:
```bash
cd backend && python -c "import bot; print('bot imports ok')" && python -m pytest tests/test_bot_inline.py -v
```
Expected: `bot imports ok` then all passed.

- [ ] **Step 4: Commit**

```bash
git add backend/bot.py backend/tests/test_bot_inline.py
git commit -m "feat: /stickers command (links to pack, 'coming soon' until set)"
```

---

## Task 9: FOUNDER STEP 2 — sticker art + publish pack

> **MANUAL, founder/designer. The single explicitly-flagged ASSET DEPENDENCY of
> Batch F. Do NOT block the batch — `/stickers` works ('coming soon') without it.**

- [ ] **Step 1: Prepare art** — N sticker images, **512×512 px, transparent
  PNG/WEBP, ≤512 KB each**, brand-styled. Place the source files in
  `backend/app/assets/stickers/` for archival (not used at runtime).

- [ ] **Step 2: Publish via @Stickers** — message **@Stickers** in Telegram →
  `/newpack` → name it (e.g. "Bright Futures Uzbekistan") → upload each image
  with an emoji → `/publish` → choose a short pack name.

- [ ] **Step 3: Wire the URL** — copy the resulting
  `https://t.me/addstickers/<short_name>` and set the **`STICKER_PACK_URL`** env
  var on Railway (and in local `.env`). Redeploy. `/stickers` now shows the
  button.

*(No code commit — the wiring already merged in Task 8; this is content + env.)*

---

## Task 10: Frontend — `users.resume()` + download helper

**Files:**
- Modify: `src/api.js`

The shared `req(...)` returns parsed JSON; the resume is a binary blob, so it
needs a dedicated fetch that reuses the same base URL + bearer token. Read the
top of `src/api.js` first to grab the exact token-storage + base-URL accessors.

- [ ] **Step 1: Inspect the existing fetch wiring**

Run: `sed -n '1,60p' src/api.js`
Note how `req` reads the API base and the access token (the helper below must use
the same source — typically a `BASE`/`API_URL` const and `storage.get("token")`
or an in-module `accessToken`). Match whatever names exist.

- [ ] **Step 2: Add the resume client + download helper**

In `src/api.js`, inside the `users` object (after `card:`), add:

```javascript
  resume:          ()       => downloadResume(),
```

And add this exported helper near the other top-level helpers (after the `req`
definition). **Adjust `API_BASE` and the auth header to match the names this file
already uses for `req` — do not invent new ones:**

```javascript
// Binary download — the resume is a PDF blob, not JSON, so it bypasses req().
export async function downloadResume() {
  // Reuse the SAME base + token source as req() above.
  const res = await fetch(`${API_BASE}/users/me/resume`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error("resume_failed");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "BFU-CV.pdf";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return true;
}
```

> `API_BASE` and `getToken()` are placeholders for **whatever `req()` already
> uses** — Step 1 tells you the real names. If `req` builds the URL as
> `` `${BASE}${path}` `` and reads `storage.get("access_token")`, use exactly
> those. The Mini App opens in Telegram's in-app browser, which supports
> `URL.createObjectURL` + a programmatic `<a download>` click; if a target
> environment blocks the download, the catch in the caller (Task 11) falls back
> to opening the blob URL in a new tab.

- [ ] **Step 3: Build to verify**

Run: `npm run build`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add src/api.js
git commit -m "api: users.resume() PDF blob download helper"
```

---

## Task 11: Frontend — "Download CV" button on own profile (Settings)

**Files:**
- Modify: `src/screens/SettingsScreen.jsx`

The "Share public profile" button already lives in the profile card (around
L259–L267, where `user` = the `/users/me` response is in scope, `users` + `t` +
`tgAlert` are imported). The Download CV button slots in right beside it.

- [ ] **Step 1: Add the button**

In `src/screens/SettingsScreen.jsx`, immediately **after** the existing
"Share public profile" `<button>` (the one ending `🔗 {t("trust.sharePublic")}</button>`,
~L267), add:

```jsx
          <button onClick={async () => {
            try { await users.resume(); }
            catch { tgAlert(t("resume.failed")); }
          }} style={{
            marginTop: 8, width: "100%", background: "var(--surface-2)", border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)", color: "var(--accent)", padding: "10px 12px",
            fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}>📄 {t("resume.download")}</button>
```

- [ ] **Step 2: Build to verify**

Run: `npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/screens/SettingsScreen.jsx
git commit -m "feat: Download CV button on own profile (Settings)"
```

---

## Task 12: i18n keys (en/uz/ru)

**Files:**
- Modify: `src/i18n.jsx`

The file uses the per-key nested shape `"key": { en, uz, ru }`. Add these inside
the `STRINGS` object (e.g. near the existing `trust.*` keys).

- [ ] **Step 1: Add keys**

```javascript
  "resume.download": { en: "Download CV", uz: "CV’ni yuklash", ru: "Скачать резюме" },
  "resume.failed": { en: "Couldn’t generate CV", uz: "CV yaratib bo‘lmadi", ru: "Не удалось создать резюме" },
```

- [ ] **Step 2: Build to verify**

Run: `npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/i18n.jsx
git commit -m "i18n: resume.download / resume.failed (en/uz/ru)"
```

---

## Task 13: Full verification + push

- [ ] **Step 1: Full backend suite**

Run: `cd backend && python -m pytest -q`
Expected: all pass (existing + `test_resume.py` + `test_bot_inline.py`).

- [ ] **Step 2: Bot module imports**

Run: `cd backend && python -c "import bot; print('ok')"`
Expected: `ok` (confirms the new inline imports + handlers parse).

- [ ] **Step 3: Frontend build**

Run: `npm run build`
Expected: success.

- [ ] **Step 4: Push**

```bash
git push
```

- [ ] **Step 5: Verify on the deployed app + bot**
  - In Settings, tap **Download CV** → a `*-BFU-CV.pdf` downloads/opens; confirm
    it shows name, currently_building, skills (with endorsement counts), founded
    + joined projects, rating + a vouch quote, and links.
  - **After FOUNDER STEP 1:** type `@BrightFuturesUzbekistan_bot <project word>`
    in any chat → result card appears → tapping it sends a message whose link
    opens the Mini App on that project.
  - `/stickers` in the bot → "coming soon" before FOUNDER STEP 2, the pack button
    after `STICKER_PACK_URL` is set.

---

## Self-review notes

- **Spec coverage:**
  - **Resume/CV (FULL)** ✓ `fpdf2` dep (T1), `render_resume_pdf` pure fn fed by
    `_profile_extras`+`_trust_extras` (T2), authenticated me-only `GET
    /users/me/resume` streaming `application/pdf` attachment (T3), Download CV
    button (T11) + api blob helper (T10) + i18n (T12).
  - **Bot inline mode (FULL)** ✓ `build_inline_results` querying
    approved/non-draft/non-deleted projects + own-profile default, deep-linking
    `startapp=project_<id>` / `user_<id>` (T5, directly tested), `@dp.inline_query()`
    wrapper (T5) + wrapper test (T6). BotFather `/setinline` = **FOUNDER STEP 1**
    (T7), flagged + non-blocking.
  - **Sticker pack (wiring only)** ✓ `STICKER_PACK_URL` (T4) + `/stickers`
    command with "coming soon" gating (T8). Art + publish = **FOUNDER STEP 2**
    (T9) — the single flagged asset dependency; `/stickers` works without it.
- **PDF-vs-Pillow decision:** PDF via **`fpdf2`** (real selectable-text A4 PDF,
  pure-Python, core fonts, no system libs) — a PNG would be a screenshot, not a
  CV. Justified in spec D1.
- **Delivery decision:** resume is **authenticated + streamed**, not a signed
  public URL — only the member reads their own CV; the full-profile aggregate
  must not sit behind a guessable URL (spec D2). Contrast: the Story card is
  public-signed because *Telegram* fetches it.
- **No drift:** resume content is exactly the existing builders' output (spec D3,
  T2/T3) — the CV can't diverge from the profile/public page.
- **No new tables/columns/migrations.** Only a new pip dep (`fpdf2`) + one config
  string. Inline + stickers are bot-loop handlers, not HTTP routes.
- **Testability:** the inline logic is a plain async fn tested directly against a
  seeded approved project (T5) — no Telegram network, no polling loop; a wrapper
  test (T6) proves `query.answer` is called, with a documented skip-not-delete
  fallback if session-factory monkeypatching is brittle.
- **Robustness:** `_safe()` guarantees the PDF never raises on Cyrillic/emoji
  (T2 test); empty profiles still produce a valid one-pager; inline no-match
  returns `[]` (not an error); `/stickers` never errors pre-art; `fpdf` imported
  lazily in the endpoint (no boot cost).
- **Type/name consistency:** `render_resume_pdf(extras, trust)` consumes the
  exact dict shapes `_profile_extras` returns (`currently_building`,
  `portfolio_links{label,url}`, `founded_projects/member_projects{name,is_active}`,
  `stats`) and `_trust_extras` returns (`endorsements{skill,count}`,
  `vouches{text,author.display_name}`, `rating{average,count}`) — verified
  against the live helpers in `users.py`. Deep-link params `project_<id>` /
  `user_<id>` match `src/App.jsx`'s `_parseDeepLink` regexes.
- **Two manual steps**, both flagged inline (T7, T9) and in the header, neither
  blocking code or tests.
- **No placeholders** except the explicitly-flagged sticker ART (T9) and the
  `API_BASE`/`getToken()` names in T10 — which are not invented values but a
  documented instruction to reuse `req()`'s existing base+token (Step 1 reads the
  real names before editing).
