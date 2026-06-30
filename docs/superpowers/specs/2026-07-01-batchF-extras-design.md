# Batch F — Extras: Design

**Status:** Specced 2026-07-01. Part of the Mini App professionalization program
(see `docs/superpowers/PROGRAM.md`, batch **F — Extras**).

**Goal.** Three independent "extras" that make a BFU profile/project *portable
beyond the Mini App*:

1. **Resume / CV export (FULL).** A clean, one-page PDF built from a member's
   profile data, fetched from `GET /users/me/resume`, with a **Download CV**
   button on the own-profile surface (Settings).
2. **Bot inline mode (FULL).** Typing `@BrightFuturesUzbekistan_bot <query>` in
   any Telegram chat returns shareable result cards for matching projects (and
   the typist's own profile link), each deep-linking into the Mini App.
3. **Sticker pack (wiring only).** A `/stickers` bot command + a "Get our
   stickers" deep link to a published pack. The sticker **image assets are a
   founder-provided input** — the batch ships the wiring, not the art.

Each is git-revertable on its own. Backend is TDD (pytest); the one piece that
is awkward to drive through the live aiogram polling loop (the inline handler)
is written as a **plain async function** that the test calls directly with a
fake `InlineQuery`, so it is still real-tested.

---

## Decisions (locked)

### D1 — Resume format: **PDF via `fpdf2`** (not Pillow, not reportlab)

The task said "PDF preferred; if no PDF lib, generate a print-ready PNG via the
Pillow `card.py` pattern." `backend/requirements.txt` has **no** PDF lib today
(only Pillow + alembic). We add one.

- **Chosen: `fpdf2==2.8.1`** (the maintained `fpdf` successor, import name
  `fpdf`). Rationale:
  - **Pure-Python, zero system deps.** Unlike reportlab (which pulls optional C
    extensions and is heavier), `fpdf2` is a single pure-Python wheel — it
    installs cleanly on Railway's slim image with no apt packages.
  - **Real, selectable-text PDF.** An employer gets an actual A4 PDF (vector
    text, copy-paste-able, ATS-parseable) — strictly better than a rasterized
    PNG of a page. A PNG "CV" is a screenshot; a PDF is a document.
  - **Ships core fonts (Helvetica family).** A one-page CV needs no bundled
    `.ttf` — `fpdf2` has the 14 PDF core fonts built in, so the resume renders
    identically everywhere with no font-file plumbing. (We *can* register the
    brand `Syne-Bold.ttf` / `DMSans.ttf` from `app/assets/fonts` for the header
    if we want brand polish — the plan does this optionally and falls back to
    Helvetica, so a missing/locked font never breaks the endpoint.)
  - **Tiny API surface.** `FDPF().add_page(); .set_font(); .cell()/.multi_cell()`
    — a self-contained `render_resume_pdf(...)` mirrors the shape of
    `card.py::render_card_png` (pure function, bytes in → bytes out), so it slots
    into the existing service/router pattern with no new abstractions.

  Rejected:
  - **reportlab** — works, but heavier install and a more verbose canvas API for
    no benefit at this size.
  - **Pillow-PNG (the `card.py` fallback)** — only if a PDF lib genuinely could
    not be added. It can. A PNG is not a CV.
  - **WeasyPrint / wkhtmltopdf** — both need system libraries (Pango/Cairo or a
    Qt binary). Overkill and a deployment liability for one page.

### D2 — Resume delivery: **stream the bytes directly** (not a signed URL)

The Story **card** is served via a *signed, unauthenticated* `/public/card.png`
URL because **Telegram's servers** must fetch it (shareToStory needs a public
https media URL). The resume has **no such requirement** — the only consumer is
the logged-in member tapping "Download CV" in the Mini App. So:

- `GET /users/me/resume` is an **authenticated** endpoint (`get_current_user`)
  that returns the PDF bytes inline as `application/pdf` with a
  `Content-Disposition: attachment; filename="<Name>-BFU-CV.pdf"` header.
- No new signing scope, no `/public/` exposure of private profile aggregates,
  no URL to enumerate. The member's own JWT already authorizes the read.
- The frontend fetches it as a blob (the api client already attaches the bearer
  token) and triggers a browser download / opens it.

This is the right trust boundary: a resume bundles the member's *full* profile
(founded/joined projects, ratings, endorsements, vouches) — that aggregate
should not sit behind a guessable public URL the way a deliberately-shareable
Story card does.

### D3 — Resume content = exactly the existing profile builders

`render_resume_pdf` is fed **only** from `_profile_extras(db, user)` (Batch A)
and `_trust_extras(db, user, None)` (Batch B) plus the `User` row + analysis —
**no new queries, no new aggregates.** This guarantees the CV can never drift
from what the profile/public-page already show. Sections, in order:

1. **Header:** display name (Name + Surname, capitalized; falls back to
   `display_name`), region · age · "Verified" meta line, and the public profile
   URL (`{webapp}/u/{id}`) as a footer link.
2. **Currently building:** `extras["currently_building"]` (one line) if present.
3. **About:** `user.about`, wrapped, if present.
4. **Skills:** `user.analysis.skills`, with endorsement counts appended where
   `_trust_extras` reports them (e.g. `React (3)`).
5. **Other tags:** interests / knowledges / preparations / goals (compact).
6. **Projects founded:** name + Active/Closed, from `extras["founded_projects"]`.
7. **Projects joined:** name + Active/Closed, from `extras["member_projects"]`.
8. **Rating:** `★ avg (n)` from `trust["rating"]` if any.
9. **Endorsements / Vouches:** vouch count + up to 3 short vouch quotes.
10. **Portfolio links:** label → url, from `extras["portfolio_links"]`.

All text is latin-1-safe-encoded before it hits `fpdf2`'s core fonts (the
helper transliterates/strips characters the core font can't draw, so a Cyrillic
or emoji name never raises — see Edge cases).

### D4 — Inline mode: query **approved, non-draft, non-deleted** projects only

The inline handler (`@dp.inline_query()` in `backend/bot.py`) runs **without a
DB session of its own from a request** — it opens `AsyncSessionLocal()` exactly
like the existing `location_handler` does. It:

- Reads `inline_query.query` (the text after `@bot `), trims it, lowercases.
- If non-empty: `ILIKE %query%` on `Project.name` **and** on `Project.about`,
  filtered to `is_approved == True, is_draft == False, is_deleted == False`,
  newest first, **limit 12** (Telegram caps inline results at 50; 12 is plenty
  and fast).
- If empty: returns a small default set — the **typist's own profile link**
  first (resolved by `from_user.id → users.telegram_id`), then the most recent
  approved projects.
- Each project → an `InlineQueryResultArticle` whose tap **sends a message**
  (`InputTextMessageContent`) containing the project name + a one-line teaser +
  the deep link `https://t.me/{BOT_USERNAME}?startapp=project_{id}` (the
  Mini-App already parses `project_<id>` — see `src/App.jsx`'s `_parseDeepLink`).
  `url` + `description` are set so the result card looks rich in the picker.
- `cache_time=15` (short, so newly-approved projects appear quickly) and
  `is_personal=True` (results include the typist's own profile, so they must not
  be cached across users).

**Why deep links, not group creation.** Per PROGRAM.md, the bot cannot create
group chats; "share a project into a chat" is exactly an inline-result deep
link, which is what this implements.

### D5 — Inline handler is a directly-callable function (testable)

`@dp.inline_query()` decorates a thin wrapper, but the logic lives in
`async def build_inline_results(query: str, tg_user_id: int, db) -> list`
returning plain aiogram `InlineQueryResultArticle` objects. The test calls
`build_inline_results(...)` with a seeded approved project and asserts a result
links to `startapp=project_<id>`. No polling loop, no Telegram network, no
mocking of `bot.answer_inline_query` needed for the core assertion. (We also add
a trivial wrapper test that the decorated handler calls `query.answer(...)` with
the built results, using a fake query object.)

### D6 — Sticker pack: **command + deep link only; art is a founder input**

We ship:

- A `STICKER_PACK_URL` setting (default empty) — the published pack's
  `https://t.me/addstickers/<name>` URL.
- A `/stickers` bot command + a "Get our stickers" inline button that opens that
  URL when set; when unset it replies "coming soon" (so the command never errors
  pre-launch).
- A short **founder runbook** in this spec + the plan describing how to create
  the pack with @Stickers and where to drop the N source images.

We do **not** auto-generate sticker artwork (brand-quality images can't be
machine-produced to spec), and we do **not** call Telegram's
`createNewStickerSet` API at runtime (that needs the founder's user context and
finished images). The asset dependency is the single explicitly-flagged
placeholder in the whole batch.

---

## Manual founder steps (the only two non-code actions in Batch F)

> These are flagged here and repeated at the relevant plan tasks. The code is
> complete and tested without them; they switch features *on* in production.

- **FOUNDER STEP 1 — Enable inline mode in BotFather.** Inline results won't
  appear until inline mode is turned on for the bot:
  1. Open **@BotFather** → `/mybots` → select **@BrightFuturesUzbekistan_bot**.
  2. **Bot Settings → Inline Mode → Turn on.**
  3. (Optional) **Inline Mode → Edit inline placeholder** → set e.g.
     `Search BFU projects…`.
  Without this, the `@bot ` typing UI never opens, regardless of code. The
  handler code is already correct and tested; this is a one-time toggle.

- **FOUNDER STEP 2 — Create the sticker pack + supply art.** The wiring expects
  a published pack URL:
  1. Prepare **N sticker images** (PNG/WEBP, 512×512, transparent, ≤512 KB
     each) — *brand art, supplied by the founder/designer.* Drop the source
     files in `backend/app/assets/stickers/` for archival (git-ignored binaries
     are fine; they are not used at runtime).
  2. In Telegram, message **@Stickers** → `/newpack` → name the pack →
     upload each image with its emoji → `/publish` → choose a short name.
  3. Copy the resulting `https://t.me/addstickers/<short_name>` URL and set it
     as the **`STICKER_PACK_URL`** env var on Railway (and locally in `.env`).
  Until `STICKER_PACK_URL` is set, `/stickers` cleanly replies "coming soon".

---

## API surface (new)

| Method & path | Auth | Returns | Notes |
|---|---|---|---|
| `GET /users/me/resume` | member JWT | `application/pdf` (bytes, attachment) | One-page CV from `_profile_extras` + `_trust_extras`. 200 with non-empty body for any registered user. |

No new public endpoints. No new tables, no new columns, no migrations. The bot
inline handler and `/stickers` command are message-loop handlers, not HTTP
routes.

---

## Files touched

**Backend**
- `backend/requirements.txt` — add `fpdf2==2.8.1`.
- `backend/app/services/resume.py` — **new**: `render_resume_pdf(...)` (pure
  function, profile dict → PDF bytes), mirroring `card.py`'s shape.
- `backend/app/routers/users.py` — **new** `GET /me/resume` endpoint.
- `backend/app/config.py` — add `STICKER_PACK_URL: str = ""`.
- `backend/bot.py` — `build_inline_results(...)` + `@dp.inline_query()` handler;
  `/stickers` command handler.
- `backend/tests/test_resume.py` — **new**.
- `backend/tests/test_bot_inline.py` — **new** (tests `build_inline_results`).

**Frontend**
- `src/api.js` — `users.resume()` blob fetch + `downloadResume()` helper.
- `src/screens/SettingsScreen.jsx` — "Download CV" button beside "Share public
  profile".
- `src/i18n.jsx` — `resume.*` keys (en/uz/ru).

---

## Edge cases & guarantees

- **Non-latin names / emoji in profile text.** `fpdf2` core fonts are latin-1.
  `render_resume_pdf` passes every string through a `_pdf_safe(s)` helper that
  (a) tries to keep the text, (b) falls back to an ASCII transliteration, (c)
  drops un-encodable codepoints — so a Cyrillic-only `about` renders as a
  best-effort transliteration and **never raises**. The endpoint therefore
  returns a valid PDF for *every* registered user. (If we register the bundled
  TTFs with `uni=True`, full Unicode works; the helper is still the safety net.)
- **Empty profile.** A brand-new user with no projects/skills still gets a valid
  one-page PDF: header + "No projects yet." placeholders. Body is non-empty
  (test asserts `len(pdf) > 1000` and the `%PDF` magic header).
- **Resume of unregistered/other users.** Endpoint is `me`-only — there is no
  `/users/{id}/resume`; a member can only export their own CV. (Employers view
  others via the public `/u/{id}` page from Batch B.)
- **Inline query with no matches.** Returns an empty result list (Telegram shows
  "no results") — never an error. Empty *query* returns the default set (own
  profile + recent projects), so the picker is never blank on first open.
- **Inline typist not a registered BFU user.** `from_user.id` may not map to a
  `users` row; the "your profile" result is simply omitted (guarded), projects
  still returned.
- **Project name/about with `%` or odd chars in ILIKE.** Bound parameters only
  (SQLAlchemy `Project.name.ilike(f"%{q}%")` with `q` as a value) — no SQL
  injection surface; a literal `%` in the query just widens the match harmlessly.
- **`STICKER_PACK_URL` unset.** `/stickers` replies a localized "coming soon"
  rather than erroring — safe to ship before art exists.
- **`fpdf2` import cost.** Imported lazily inside the endpoint (like
  `render_card_png` is imported inside `card.png`), so app boot and unrelated
  routes don't pay for it.

---

## Out of scope (explicit)

- Resume **theming/templates** (multiple CV layouts) — one clean layout.
- Resume for **arbitrary users** — own-CV only.
- **Runtime** sticker-set creation via Bot API — founder uses @Stickers.
- Inline results for **users/events** beyond the typist's own profile link —
  projects are the shareable unit; "my profile" is the one personal extra.
- Caching the resume PDF — it's cheap and personal; generated per request.

---

## Self-review (spec ↔ scope)

- **Resume/CV (FULL)** ✓ `fpdf2` PDF (D1), authenticated stream (D2), fed by the
  existing Batch-A/B builders (D3), Download CV button + i18n.
- **Bot inline mode (FULL)** ✓ `@dp.inline_query()` querying approved/non-draft
  projects (D4), deep-linking `startapp=project_<id>` into the Mini App, own
  profile link in the default set, testable via `build_inline_results` (D5).
  BotFather `/setinline` flagged as **FOUNDER STEP 1**.
- **Sticker pack (wiring only)** ✓ `/stickers` command + deep link +
  `STICKER_PACK_URL` (D6); art is **FOUNDER STEP 2**, the single flagged asset
  dependency; batch is not blocked on it.
- **No new tables/columns/migrations**; resume needs only the new dep. Inline +
  stickers are pure bot-loop handlers.
- **Two manual steps**, both clearly marked and both non-blocking for code/tests.
