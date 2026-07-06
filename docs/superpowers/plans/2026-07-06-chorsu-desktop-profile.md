# Chorsu Desktop `/u/{id}` Profile — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first screen of BFU's new desktop web app — the public,
login-free `/u/{id}` founder profile — in the approved **Chorsu** ("living
bazaar") design language, backed by two new small FastAPI endpoints and a new
Next.js app deployed as its own Vercel project.

**Architecture:** A **separate** Next.js (App Router, plain JavaScript — no
TypeScript, matching this repo's existing JS-only convention) app lives in a
new `desktop/` folder at the repo root, sibling to the existing `src/` (Vite
Mini App) and `backend/` folders. It calls the **same** FastAPI backend via
two new endpoints (`GET /public/u/{id}/data` for JSON, `GET
/public/og/{id}.png` for the share image) — no backend fork, no new database
tables. The existing HTML-string `/public/u/{id}` route is left untouched
(nothing else in the app depends on removing it). Deployed as an
**independent** Vercel project (Root Directory = `desktop/`), so it never
risks the live Mini App's deploy.

**Tech Stack:** Backend: FastAPI + SQLAlchemy 2 async (existing), Pillow (new
`render_og_png`, reusing `card.py`'s existing font/glow helpers). Frontend:
Next.js 16 (App Router), `lenis` + `lenis/react` (smooth scroll), `motion`
(the current name for Framer Motion) for the scroll-linked pieces, plain CSS
for everything else (springs are hand-rolled with `requestAnimationFrame` to
exactly match the reference file's easing, not re-implemented in a motion
library — see Task 15). Reference visual source: `C:\Users\egamb\Desktop\BFU,
New Design\Chorsu Profile.dc.html` (the approved Claude Design export) and
`docs/superpowers/specs/2026-07-06-chorsu-desktop-design.md` (the design
system brief).

---

## Scope decisions made while grounding this plan (not open questions)

1. **"Looking for" bento cell** has no dedicated backing column. Use the
   existing `open_to_work` / `open_to_volunteering` booleans on `User` as the
   interim signal (Task 5 shows the exact derivation). Revisit with a real
   field later if the founder wants richer "looking for X specifically" text.
2. **OG image typography** reuses the *already-bundled* `Syne-Bold.ttf` /
   `DMSans.ttf` font files in `backend/app/assets/fonts/` (same ones
   `render_card_png` uses) rather than sourcing new Bricolage
   Grotesque/Instrument Serif TTFs for Pillow. Only the **color palette**
   changes to Chorsu's firelit ember tones. Rationale: avoids a new
   font-licensing/bundling step for a small, always-cropped share-preview
   image; the real desktop page (rendered in-browser) is where the true
   Chorsu typefaces matter, loaded live from Google Fonts/Fontshare.
3. **Plain JavaScript, not TypeScript**, in the new Next.js app — matches the
   existing Vite app's `.jsx`-only convention (no `.ts`/`.tsx` anywhere in
   this repo today).
4. **No monorepo/workspaces tooling** (no root `package.json` `workspaces`
   field) for this first pass — the Vercel research confirms two independent
   Projects each pointed at their own Root Directory works with zero shared
   tooling. Adding workspace-based "skip unaffected build" is a pure
   optimization to consider later, not required for a working v1, and
   skipping it means zero risk of touching the existing Vite app's Vercel
   project config.
5. **Mutual connections stay `{count: 0, preview: []}`** on this endpoint —
   the public page has no authenticated viewer (same as the existing HTML
   route). A personalized version (via the desktop Telegram Login Widget) is
   an explicit v2, not built here.

---

## Part A — Backend: two new endpoints (TDD)

### Task 1: `og_sig` scoped signature in `signing.py`

**Files:**
- Modify: `backend/app/services/signing.py`
- Test: `backend/tests/test_signing.py` (new)

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_signing.py`:

```python
"""Signed-URL scope helpers — each scope must produce a distinct, stable,
enumeration-resistant signature."""
from app.services.signing import avatar_sig, card_sig, og_sig


def test_og_sig_is_stable_and_scoped():
    assert og_sig(42) == og_sig(42)
    assert og_sig(42) != og_sig(43)
    # Different scopes must not collide for the same user id.
    assert og_sig(42) != card_sig(42)
    assert og_sig(42) != avatar_sig(42)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_signing.py -v`
Expected: FAIL — `ImportError: cannot import name 'og_sig'`.

- [ ] **Step 3: Add `og_sig`**

In `backend/app/services/signing.py`, add after `avatar_sig`:

```python
def og_sig(user_id: int) -> str:
    return _sig("og", user_id)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_signing.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/signing.py backend/tests/test_signing.py
git commit -m "feat: og_sig — signed-URL scope for the new OG share image"
```

---

### Task 2: `render_og_png` — 1200×630 landscape OG image (TDD)

**Files:**
- Modify: `backend/app/services/card.py`
- Test: `backend/tests/test_card.py` (new)

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_card.py`:

```python
"""render_og_png: a 1200x630 landscape share-image, distinct from the
1080x1920 Story card render_card_png already produces."""
from PIL import Image
import io

from app.services.card import render_og_png


def test_render_og_png_dimensions_and_format():
    png = render_og_png(
        name="Aziz Karimov", currently_building="Solar Farm",
        rating_average=4.8, vouch_count=8, checked=True, photo_bytes=None,
    )
    assert isinstance(png, (bytes, bytearray))
    im = Image.open(io.BytesIO(png))
    assert im.size == (1200, 630)
    assert im.format == "PNG"


def test_render_og_png_handles_no_rating_or_building():
    """A brand-new profile (no rating yet, no currently_building) must still
    render without raising."""
    png = render_og_png(
        name="New Member", currently_building=None,
        rating_average=None, vouch_count=0, checked=False, photo_bytes=None,
    )
    im = Image.open(io.BytesIO(png))
    assert im.size == (1200, 630)


def test_render_og_png_long_name_does_not_raise():
    png = render_og_png(
        name="A Very Long Founder Name That Would Overflow A Fixed Width Card",
        currently_building="An equally verbose project description that keeps going",
        rating_average=5.0, vouch_count=142, checked=True, photo_bytes=None,
    )
    im = Image.open(io.BytesIO(png))
    assert im.size == (1200, 630)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_card.py -v`
Expected: FAIL — `ImportError: cannot import name 'render_og_png'`.

- [ ] **Step 3: Implement `render_og_png`**

In `backend/app/services/card.py`, add these Chorsu-palette constants near the
top (alongside the existing `AVATAR_COLORS` etc. — do not remove or rename
anything existing, `render_card_png` must keep working unchanged):

```python
# Chorsu (firelit) palette — used only by render_og_png, kept separate from
# the violet Mini-App palette above so render_card_png is untouched.
OG_W, OG_H = 1200, 630
OG_BG = (11, 10, 8)          # #0B0A08
OG_SURFACE = (26, 24, 21)    # #1A1815
OG_TEXT = (245, 241, 232)    # #F5F1E8
OG_MUTED = (168, 160, 147)   # #A8A093
OG_AMBER = (232, 161, 92)    # #E8A15C
OG_TERRA = (192, 86, 59)     # #C0563B
OG_EMBER = (255, 106, 61)    # #FF6A3D
```

Then add the function at the end of the file:

```python
def render_og_png(
    name: str, currently_building: str | None,
    rating_average: float | None, vouch_count: int,
    checked: bool, photo_bytes: bytes | None = None,
) -> bytes:
    """1200x630 landscape Open Graph share image for /u/{id}, in the Chorsu
    firelit palette. Bakes in a credibility stat (rating + vouch count) per
    the design brief so a shared link 'pulls people in' before they click."""
    img = Image.new("RGB", (OG_W, OG_H), OG_BG)

    # firelit glow blobs (subtle, static — no need to animate a still image)
    blob = Image.new("RGB", (OG_W, OG_H), OG_BG)
    bd = ImageDraw.Draw(blob)
    bd.ellipse([-200, -180, 480, 420], fill=(120, 60, 30))
    bd.ellipse([760, 260, 1400, 820], fill=(20, 70, 64))
    blob = blob.filter(ImageFilter.GaussianBlur(140))
    img = Image.blend(img, blob, 0.55)
    draw = ImageDraw.Draw(img, "RGBA")

    # avatar (left)
    av_cx, av_cy, av_r = 168, OG_H // 2, 96
    photo = _circular_photo(photo_bytes, av_r * 2) if photo_bytes else None
    img = img.convert("RGBA")
    if photo is not None:
        img.alpha_composite(photo, (av_cx - av_r, av_cy - av_r))
        draw = ImageDraw.Draw(img, "RGBA")
    else:
        col = AVATAR_COLORS[(ord((name or "?")[0]) if name else 0) % len(AVATAR_COLORS)]
        draw.ellipse([av_cx - av_r, av_cy - av_r, av_cx + av_r, av_cy + av_r], fill=col)
        draw.text((av_cx, av_cy - 2), _initials(name), font=_font(_SYNE, 68, 800),
                  fill=(20, 14, 8), anchor="mm")
    if checked:
        bx, by, br = av_cx + av_r - 16, av_cy + av_r - 16, 22
        draw.ellipse([bx - br, by - br, bx + br, by + br], fill=(int(OG_AMBER[0]), int(OG_AMBER[1]), int(OG_AMBER[2])),
                     outline=OG_BG, width=4)
        draw.line([(bx - 10, by + 1), (bx - 2, by + 9), (bx + 11, by - 9)],
                  fill=(20, 14, 8), width=5, joint="curve")

    # text block (right of avatar)
    tx = av_cx + av_r + 60
    disp = (name or "BFU member").strip()
    size = 62
    f_name = _font(_SYNE, size, 800)
    while _text_w(draw, disp, f_name) > (OG_W - tx - 60) and size > 34:
        size -= 4
        f_name = _font(_SYNE, size, 800)
    draw.text((tx, 150), disp, font=f_name, fill=OG_TEXT)

    if currently_building:
        building = currently_building
        f_build = _font(_DM, 30, 500)
        max_w = OG_W - tx - 60
        while _text_w(draw, f"is building {building}", f_build) > max_w and len(building) > 10:
            building = building[: len(building) - 6].rstrip() + "…"
        draw.text((tx, 226), "is building", font=_font(_DM, 30, 500), fill=OG_MUTED)
        lbl_w = _text_w(draw, "is building ", _font(_DM, 30, 500))
        draw.text((tx + lbl_w, 226), building, font=_font(_DM, 30, 700), fill=OG_AMBER)

    # credibility stat pill (the "bake in a stat" requirement)
    if rating_average is not None or vouch_count:
        parts = []
        if rating_average is not None:
            parts.append(f"★ {rating_average:.1f}")
        if vouch_count:
            parts.append(f"{vouch_count} vouch{'es' if vouch_count != 1 else ''}")
        stat = "   ·   ".join(parts)
        f_stat = _font(_DM, 26, 700)
        sw = _text_w(draw, stat, f_stat) + 48
        draw.rounded_rectangle([tx, 300, tx + sw, 300 + 56], radius=28,
                               fill=OG_SURFACE, outline=(*OG_AMBER, 140), width=2)
        draw.text((tx + 24, 328), stat, font=f_stat, fill=OG_AMBER, anchor="lm")

    draw.text((tx, OG_H - 90), "Bright Futures Uzbekistan", font=_font(_DM, 22, 600), fill=OG_MUTED)

    out = io.BytesIO()
    img.convert("RGB").save(out, format="PNG", optimize=True)
    return out.getvalue()
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && python -m pytest tests/test_card.py -v`
Expected: all 3 pass.

- [ ] **Step 5: Confirm the existing Story-card tests still pass (no regression)**

Run: `cd backend && python -m pytest -q`
Expected: previous count + 4 (1 signing + 3 card) all green, no failures.

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/card.py backend/tests/test_card.py
git commit -m "feat: render_og_png — 1200x630 Chorsu-palette OG share image"
```

---

### Task 3: `GET /public/og/{user_id}.png` route

**Files:**
- Modify: `backend/app/routers/public.py`
- Test: `backend/tests/test_public_og.py` (new)

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_public_og.py`:

```python
"""GET /public/og/{user_id}.png — signed, enumeration-resistant OG image."""
import pytest

from app.services.signing import og_sig

pytestmark = pytest.mark.asyncio


async def test_og_image_requires_valid_signature(make_user, client):
    user = await make_user(name="Aziz")
    res = await client.get(f"/public/og/{user.id}.png", params={"sig": "bad"})
    assert res.status_code == 403


async def test_og_image_returns_png_for_valid_signature(make_user, client):
    user = await make_user(name="Aziz")
    res = await client.get(f"/public/og/{user.id}.png", params={"sig": og_sig(user.id)})
    assert res.status_code == 200, res.text
    assert res.headers["content-type"] == "image/png"
    assert res.content[:8] == b"\x89PNG\r\n\x1a\n"


async def test_og_image_404_for_missing_user(client):
    res = await client.get("/public/og/999999.png", params={"sig": og_sig(999999)})
    assert res.status_code == 404
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_public_og.py -v`
Expected: FAIL — 404 "Not Found" on all three (route doesn't exist yet).

- [ ] **Step 3: Implement the route**

In `backend/app/routers/public.py`, add the import at the top (near the
existing `from app.services.signing import avatar_sig, card_sig` line):

```python
from app.services.signing import avatar_sig, card_sig, og_sig
```

Then add the route, placed near the existing `/card.png` route:

```python
@router.get("/og/{user_id}.png")
async def og_image(
    user_id: int,
    sig: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Signed 1200x630 Open Graph share image for /u/{id} (Chorsu palette).
    Public but enumeration-resistant, same pattern as /card.png and /avatar."""
    if not hmac.compare_digest(sig, og_sig(user_id)):
        raise HTTPException(status_code=403, detail="Bad signature")
    user = (await db.execute(
        select(User).options(selectinload(User.analysis))
        .where(User.id == user_id, User.is_deleted == False, User.is_registered == True)
    )).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    extras = await _profile_extras(db, user)
    trust = await _trust_extras(db, user, None)

    photo_bytes = None
    if user.photo_file_id:
        from app.services.telegram_media import download_photo
        photo_bytes = await download_photo(user.photo_file_id)

    from app.services.card import render_og_png
    png = render_og_png(
        name=(user.name or "BFU member").capitalize(),
        currently_building=extras.get("currently_building"),
        rating_average=trust["rating"]["average"],
        vouch_count=trust["vouch_count"],
        checked=bool(user.checked),
        photo_bytes=photo_bytes,
    )
    return Response(content=png, media_type="image/png",
                    headers={"Cache-Control": "public, max-age=600"})
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && python -m pytest tests/test_public_og.py -v`
Expected: all 3 pass.

- [ ] **Step 5: Commit**

```bash
git add backend/app/routers/public.py backend/tests/test_public_og.py
git commit -m "feat: GET /public/og/{id}.png — signed OG share image endpoint"
```

---

### Task 4: Extract `_achievements_extras` (reusable for any user, not just `me`)

**Files:**
- Modify: `backend/app/routers/users.py:555-612` (the existing `/me/achievements` handler)
- Test: `backend/tests/test_achievements.py` (existing file — add to it)

- [ ] **Step 1: Read the existing handler first**

Run: `sed -n '555,615p' backend/app/routers/users.py` to see the full current
`my_achievements` body (milestone/counter helpers + the achievements list) —
the exact keys/booleans in the returned list must be preserved 1:1 by the
refactor below (this task only moves logic into a reusable function, it must
not change the achievement keys, thresholds, or ordering).

- [ ] **Step 2: Write the failing test**

Append to `backend/tests/test_achievements.py` (the file already exists per
this repo's Batch D work — add this test alongside the existing ones):

```python
async def test_achievements_extras_works_for_any_user_not_just_me(make_user, db):
    """_achievements_extras(db, user) must be callable for an arbitrary
    target user (needed by the public profile endpoint), not just
    current_user, and return the exact same shape as /me/achievements."""
    from app.routers.users import _achievements_extras
    from app.models.project import Project

    target = await make_user(name="Target")
    db.add(Project(type="startup", creator_id=target.id, name="P", is_active=True,
                    is_draft=False, is_deleted=False, is_approved=True))
    await db.commit()

    out = await _achievements_extras(db, target)
    assert "achievements" in out
    keys = {a["key"] for a in out["achievements"]}
    assert "first_project" in keys
    first_project = next(a for a in out["achievements"] if a["key"] == "first_project")
    assert first_project["earned"] is True
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd backend && python -m pytest tests/test_achievements.py -k extras_works_for_any_user -v`
Expected: FAIL — `ImportError: cannot import name '_achievements_extras'`.

- [ ] **Step 4: Extract the helper, keeping the route as a thin wrapper**

In `backend/app/routers/users.py`, replace the body of `my_achievements`
(lines ~555-597, the whole function from `uid = current_user.id` through
`return {"achievements": achievements}`) with a new module-level helper placed
just above the route, then have the route call it:

```python
async def _achievements_extras(db: AsyncSession, user: User) -> dict:
    """Derived achievements for `user`: earned state + progress for
    count-based ones. Recomputed on read from existing data (no stored
    table). Extracted from the original /me/achievements body so the public
    profile endpoint can show achievements for ANY user, not just `me`."""
    uid = user.id

    projects_founded = await db.scalar(
        select(func.count(Project.id)).where(
            Project.creator_id == uid,
            Project.is_draft == False, Project.is_deleted == False,
        )
    ) or 0
    applications = await db.scalar(
        select(func.count(ProjectApplication.id)).where(
            ProjectApplication.applicant_id == uid
        )
    ) or 0
    invites = await db.scalar(
        select(func.count(User.id)).where(
            User.referred_by == uid, User.is_registered == True,
            User.is_deleted == False,
        )
    ) or 0
    endorsements = await db.scalar(
        select(func.count(Endorsement.id)).where(Endorsement.target_id == uid)
    ) or 0
    vouches = await db.scalar(
        select(func.count(Vouch.id)).where(Vouch.target_id == uid)
    ) or 0
    is_mentor = bool(getattr(user, "is_mentor", False))

    def milestone(key: str, earned: bool) -> dict:
        return {"key": key, "earned": bool(earned), "progress": None}

    def counter(key: str, current: int, target: int) -> dict:
        current = min(int(current), target)
        return {"key": key, "earned": current >= target,
                "progress": {"current": current, "target": target}}

    achievements = [
        milestone("first_project", projects_founded >= 1),
        milestone("first_application", applications >= 1),
        counter("five_invites", invites, 5),
        milestone("verified", bool(user.checked)),
        milestone("first_endorsement", endorsements >= 1),
        milestone("mentor", is_mentor),
        milestone("first_vouch_received", vouches >= 1),
    ]
    return {"achievements": achievements}


@router.get("/me/achievements", response_model=dict)
async def my_achievements(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Thin wrapper — see _achievements_extras for the actual logic (shared
    with the public profile endpoint)."""
    return await _achievements_extras(db, current_user)
```

- [ ] **Step 5: Run to verify the new test passes AND the existing achievements suite is unchanged**

Run: `cd backend && python -m pytest tests/test_achievements.py -v`
Expected: every existing test in that file still passes (identical behavior,
pure refactor) plus the new `test_achievements_extras_works_for_any_user_not_just_me`.

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/users.py backend/tests/test_achievements.py
git commit -m "refactor: extract _achievements_extras — reusable for any user, not just /me"
```

---

### Task 5: `GET /public/u/{user_id}/data` — the JSON contract for the desktop page

**Files:**
- Modify: `backend/app/routers/public.py`
- Test: `backend/tests/test_public_profile_data.py` (new)

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_public_profile_data.py`:

```python
"""GET /public/u/{id}/data — the JSON contract the Chorsu desktop /u/{id}
page fetches. Grounded 1:1 in _profile_extras/_trust_extras/_connection_extras/
_collaborators/_achievements_extras — no invented fields."""
import pytest

pytestmark = pytest.mark.asyncio


async def _mk_project(db, creator_id, name, *, is_active=True):
    from app.models.project import Project
    p = Project(type="startup", creator_id=creator_id, name=name, about="x",
                is_active=is_active, is_draft=False, is_deleted=False, is_approved=True)
    db.add(p)
    await db.commit()
    await db.refresh(p)
    return p


async def test_profile_data_full_shape(make_user, db, client):
    from app.models.region import Region
    from app.models.user_analysis import UserAnalysis

    region = Region(name_en="Tashkent", name_uz="Toshkent", name_ru="Ташкент")
    db.add(region)
    await db.commit()
    await db.refresh(region)

    user = await make_user(
        name="Aziz", surname="Karimov", checked=True, region_id=region.id,
        birth_year=2003, open_to_work=True, open_to_volunteering=False,
    )
    db.add(UserAnalysis(user_id=user.id, skills=["React", "Python"], knowledges=[],
                        interests=[], preparations=[], goals=[]))
    await db.commit()
    await _mk_project(db, user.id, "Solar Farm")

    res = await client.get(f"/public/u/{user.id}/data")
    assert res.status_code == 200, res.text
    body = res.json()

    assert body["id"] == user.id
    assert body["checked"] is True
    assert body["region"] == {"id": region.id, "name_en": "Tashkent", "name_uz": "Toshkent", "name_ru": "Ташкент"}
    assert body["age"] == 2026 - 2003
    assert body["skills"] == ["React", "Python"]
    assert body["stats"]["projects_founded"] == 1
    assert body["looking_for"] == "work"          # open_to_work=True, open_to_volunteering=False
    assert body["rating"] == {"average": None, "count": 0}
    assert body["mutual_connections"] == {"count": 0, "preview": []}
    assert "achievements" in body
    assert body["og_image_url"].startswith("/public/og/") or "/public/og/" in body["og_image_url"]
    assert body["telegram_open_url"].endswith(f"startapp=user_{user.id}")


async def test_profile_data_looking_for_volunteering(make_user, client):
    user = await make_user(name="Vol", open_to_work=False, open_to_volunteering=True)
    res = await client.get(f"/public/u/{user.id}/data")
    assert res.json()["looking_for"] == "volunteering"


async def test_profile_data_looking_for_both(make_user, client):
    user = await make_user(name="Both", open_to_work=True, open_to_volunteering=True)
    res = await client.get(f"/public/u/{user.id}/data")
    assert res.json()["looking_for"] == "both"


async def test_profile_data_looking_for_neither(make_user, client):
    user = await make_user(name="Neither", open_to_work=False, open_to_volunteering=False)
    res = await client.get(f"/public/u/{user.id}/data")
    assert res.json()["looking_for"] is None


async def test_profile_data_no_region_is_null(make_user, client):
    user = await make_user(name="NoRegion", region_id=None)
    res = await client.get(f"/public/u/{user.id}/data")
    assert res.json()["region"] is None


async def test_profile_data_404_for_missing_deleted_or_unregistered(make_user, client):
    assert (await client.get("/public/u/999999/data")).status_code == 404

    deleted = await make_user(name="Deleted", is_deleted=True)
    assert (await client.get(f"/public/u/{deleted.id}/data")).status_code == 404

    unregistered = await make_user(name="Pending", is_registered=False)
    assert (await client.get(f"/public/u/{unregistered.id}/data")).status_code == 404


async def test_profile_data_no_pii_leak(make_user, client):
    """Same privacy bar as the existing HTML route: no phone, telegram_id,
    lat/long, or email in the public JSON."""
    user = await make_user(name="Private", phone_number="+998901234567")
    res = await client.get(f"/public/u/{user.id}/data")
    body = res.json()
    dumped = str(body)
    assert "998901234567" not in dumped
    assert "telegram_id" not in dumped
    assert "phone_number" not in dumped
    assert "latitude" not in dumped and "longitude" not in dumped
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_public_profile_data.py -v`
Expected: FAIL — every test 404s (route doesn't exist yet).

- [ ] **Step 3: Implement the route**

In `backend/app/routers/public.py`, add these imports near the top (alongside
the existing `from app.routers.users import _profile_extras, _trust_extras`):

```python
from app.routers.users import (
    _achievements_extras, _collaborators, _connection_extras,
    _profile_extras, _trust_extras,
)
```

Then add the route (place it near the existing `/u/{user_id}` HTML route —
this is the JSON sibling, same auth-free/404 semantics, does NOT replace it):

```python
@router.get("/u/{user_id}/data")
async def public_profile_data(user_id: int, db: AsyncSession = Depends(get_db)):
    """JSON contract for the Chorsu desktop /u/{id} page. Same anonymous-
    viewer semantics as the existing HTML /public/u/{id} route (viewer=None
    throughout — no personalization, no auth). Reuses every existing
    extras helper so this can never drift from what /users/{id} shows to a
    logged-in viewer."""
    user = (await db.execute(
        select(User).options(selectinload(User.analysis))
        .where(User.id == user_id, User.is_deleted == False, User.is_registered == True)
    )).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    extras = await _profile_extras(db, user)
    trust = await _trust_extras(db, user, None)
    conn = await _connection_extras(db, user, None)
    collab = await _collaborators(db, user)
    ach = await _achievements_extras(db, user)

    region = None
    if user.region_id:
        r = await db.get(Region, user.region_id)
        if r:
            region = {"id": r.id, "name_en": r.name_en, "name_uz": r.name_uz, "name_ru": r.name_ru}

    age = (datetime.utcnow().year - user.birth_year) if user.birth_year else None
    name = ((user.name or "").capitalize() + ((" " + user.surname.capitalize()) if user.surname else "")).strip()
    name = name or user.display_name

    # Interim "looking for" signal (see plan's scope-decision #1) — derived
    # from the existing open_to_work/open_to_volunteering booleans, not a
    # new column.
    looking_for = None
    if user.open_to_work and user.open_to_volunteering:
        looking_for = "both"
    elif user.open_to_work:
        looking_for = "work"
    elif user.open_to_volunteering:
        looking_for = "volunteering"

    base = (settings.WEBAPP_URL or "").rstrip("/")
    api_base = (settings.api_base_url or "").rstrip("/")
    bot = settings.BOT_USERNAME

    return {
        "id": user.id,
        "name": name,
        "display_name": user.display_name,
        "checked": bool(user.checked),
        "badges": user.badges,
        "photo_url": user.photo_url,
        "age": age,
        "gender": user.gender,
        "region": region,
        "about": user.about,
        "currently_building": extras["currently_building"],
        "currently_building_source": extras["currently_building_source"],
        "open_to_work": bool(user.open_to_work),
        "open_to_volunteering": bool(user.open_to_volunteering),
        "looking_for": looking_for,
        "skills": (user.analysis.skills if user.analysis else None) or [],
        "portfolio_links": extras["portfolio_links"],
        "founded_projects": extras["founded_projects"],
        "member_projects": extras["member_projects"],
        "stats": extras["stats"],
        "endorsements": trust["endorsements"],
        "vouches": trust["vouches"],
        "vouch_count": trust["vouch_count"],
        "rating": trust["rating"],
        "mutual_connections": trust["mutual_connections"],
        "collaborators": collab,
        "follower_count": conn["follower_count"],
        "following_count": conn["following_count"],
        "mentor": conn["mentor"],
        "achievements": ach["achievements"],
        "og_image_url": f"{api_base}/public/og/{user.id}.png?sig={og_sig(user.id)}",
        "telegram_open_url": f"https://t.me/{bot}?startapp=user_{user.id}",
        "canonical_url": f"{base}/u/{user.id}" if base else f"/u/{user.id}",
    }
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && python -m pytest tests/test_public_profile_data.py -v`
Expected: all 7 tests pass.

- [ ] **Step 5: Run the full backend suite (no regressions)**

Run: `cd backend && python -m pytest -q`
Expected: previous total + 11 new tests (1 signing + 3 card + 3 og + 1
achievements-extras + 7 profile-data... — count exactly what your test run
reports; the point is zero failures, not an exact number).

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/public.py
git commit -m "feat: GET /public/u/{id}/data — JSON contract for the Chorsu desktop profile"
```

---

## Part B — Frontend: scaffold the new Next.js app

### Task 6: Scaffold `desktop/` (Next.js App Router, plain JS)

**Files:**
- Create: `desktop/package.json`
- Create: `desktop/next.config.js`
- Create: `desktop/jsconfig.json`
- Create: `desktop/app/layout.js`
- Create: `desktop/app/page.js`
- Create: `desktop/.gitignore`
- Create: `desktop/.env.local.example`

- [ ] **Step 1: Create the folder and package.json**

```bash
mkdir -p desktop/app
```

Create `desktop/package.json`:

```json
{
  "name": "bfu-desktop",
  "private": true,
  "version": "0.0.0",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "next": "^16.0.0",
    "react": "^19.2.4",
    "react-dom": "^19.2.4",
    "lenis": "^1.1.16",
    "motion": "^12.0.0"
  }
}
```

- [ ] **Step 2: Create `next.config.js`**

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {};

module.exports = nextConfig;
```

- [ ] **Step 3: Create `jsconfig.json`** (path alias, no TypeScript)

```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./*"]
    }
  }
}
```

- [ ] **Step 4: Create the root layout**

Create `desktop/app/layout.js`:

```jsx
export const metadata = {
  title: "Bright Futures Uzbekistan",
  description: "A city of builders, lit up at dusk.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 5: Create a placeholder home page**

Create `desktop/app/page.js`:

```jsx
export default function Home() {
  return (
    <main style={{ minHeight: "100vh", background: "#0B0A08", color: "#F5F1E8",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "sans-serif" }}>
      <p>Bright Futures Uzbekistan — desktop. Visit <code>/u/[id]</code>.</p>
    </main>
  );
}
```

- [ ] **Step 6: Create `.gitignore` and env example**

Create `desktop/.gitignore`:

```
node_modules/
.next/
.env.local
```

Create `desktop/.env.local.example`:

```
# Base URL of the FastAPI backend (Railway). No trailing slash.
BFU_API_URL=https://bfu-backend-production.up.railway.app
```

- [ ] **Step 7: Install dependencies and verify the dev server boots**

```bash
cd desktop && npm install
```

Run: `cd desktop && npm run build`
Expected: builds successfully (Next.js compiles `app/page.js` + `app/layout.js`
with no errors). This confirms the scaffold itself is sound before any real
feature code is added.

- [ ] **Step 8: Commit**

```bash
git add desktop/package.json desktop/next.config.js desktop/jsconfig.json desktop/app/layout.js desktop/app/page.js desktop/.gitignore desktop/.env.local.example
git commit -m "feat: scaffold desktop/ — new Next.js app for the Chorsu desktop experience"
```

> Note: `desktop/package-lock.json` and `desktop/node_modules/` are created by
> `npm install` in Step 7 — commit the lockfile (`git add
> desktop/package-lock.json`) alongside this commit; `node_modules/` is
> excluded by the `.gitignore` from Step 6.

---

### Task 7: Chorsu design tokens + fonts

**Files:**
- Create: `desktop/app/globals.css`
- Modify: `desktop/app/layout.js`

- [ ] **Step 1: Create the tokens + global styles**

Create `desktop/app/globals.css` — every value below is copied verbatim from
`docs/superpowers/specs/2026-07-06-chorsu-desktop-design.md` §1-§3 and cross-
checked against the approved `Chorsu Profile.dc.html` export (same hex codes):

```css
:root {
  --bg: #0B0A08;
  --surface: #1A1815;
  --surface-2: #232019;
  --hair: #332E26;
  --text: #F5F1E8;
  --muted: #A8A093;
  --ember: #FF6A3D;
  --amber: #E8A15C;
  --terra: #C0563B;
  --teal: #12564F;
  --green: #7FB069;

  --font-display: 'Bricolage Grotesque', sans-serif;
  --font-accent: 'Instrument Serif', serif;
  --font-mono: 'Space Mono', monospace;
  --font-body: 'Satoshi', 'Bricolage Grotesque', sans-serif;

  --radius: 20px;
  --radius-sm: 11px;
  --radius-pill: 99px;
}

* { box-sizing: border-box; }

html, body {
  margin: 0;
  padding: 0;
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-body);
  -webkit-font-smoothing: antialiased;
}

::selection {
  background: rgba(232, 161, 92, 0.28);
  color: var(--text);
}

/* film grain — the cheapest "physical, warm" cue in the whole system */
.ch-grain {
  position: fixed;
  inset: 0;
  z-index: 60;
  pointer-events: none;
  opacity: 0.045;
  mix-blend-mode: overlay;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  background-size: 220px 220px;
}

/* firelit glow layers — static/slow, never distracting from content */
.ch-glow-a, .ch-glow-b {
  position: fixed;
  border-radius: 50%;
  pointer-events: none;
  z-index: 0;
  filter: blur(32px);
}
.ch-glow-a {
  top: -24%; left: -14%; width: 70vw; height: 70vw;
  background: radial-gradient(circle, rgba(255,106,61,0.20) 0%, rgba(232,161,92,0.10) 34%, transparent 66%);
  animation: ch-drift-a 26s ease-in-out infinite;
}
.ch-glow-b {
  bottom: -30%; right: -18%; width: 66vw; height: 66vw;
  background: radial-gradient(circle, rgba(18,86,79,0.30) 0%, rgba(18,86,79,0.12) 40%, transparent 68%);
  animation: ch-drift-b 32s ease-in-out infinite;
}

@keyframes ch-drift-a { 0%, 100% { transform: translate(0,0); } 50% { transform: translate(4%, 3%); } }
@keyframes ch-drift-b { 0%, 100% { transform: translate(0,0); } 50% { transform: translate(-3%, -4%); } }

@keyframes ch-pulse {
  0% { transform: scale(1); opacity: 1; }
  70% { transform: scale(2.6); opacity: 0; }
  100% { transform: scale(2.6); opacity: 0; }
}

.ch-online-ping {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: var(--ember);
  animation: ch-pulse 2.4s ease-out infinite;
}

@media (prefers-reduced-motion: reduce) {
  .ch-glow-a, .ch-glow-b, .ch-online-ping {
    animation: none !important;
  }
}
```

- [ ] **Step 2: Load fonts + the tokens stylesheet in the root layout**

Replace `desktop/app/layout.js` with:

```jsx
import "./globals.css";

export const metadata = {
  title: "Bright Futures Uzbekistan",
  description: "A city of builders, lit up at dusk.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=Instrument+Serif:ital@0;1&family=Space+Mono:wght@400;700&display=swap"
          rel="stylesheet"
        />
        <link href="https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700,900&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 3: Verify the build still succeeds**

Run: `cd desktop && npm run build`
Expected: success, no CSS/import errors.

- [ ] **Step 4: Commit**

```bash
git add desktop/app/globals.css desktop/app/layout.js
git commit -m "feat: Chorsu design tokens + font loading in the desktop app"
```

---

### Task 8: `lib/bfu-api.js` — typed fetch wrapper

**Files:**
- Create: `desktop/lib/bfu-api.js`

- [ ] **Step 1: Write the fetch wrapper**

Create `desktop/lib/bfu-api.js`:

```javascript
import { cache } from "react";
import "server-only";

const API_BASE = process.env.BFU_API_URL;

if (!API_BASE) {
  // Fail loudly at build/boot time rather than silently fetching from
  // "undefined/public/..." in production.
  throw new Error("BFU_API_URL environment variable is not set");
}

/**
 * Fetches a public BFU profile by id. Wrapped in React's cache() so
 * generateMetadata() and the page component share one network call per
 * request instead of fetching twice.
 * Returns null on 404 (profile not found / deleted / unregistered).
 */
export const getPublicProfile = cache(async (id) => {
  const res = await fetch(`${API_BASE}/public/u/${id}/data`, {
    next: { revalidate: 120, tags: [`profile:${id}`] },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`BFU API error ${res.status} fetching profile ${id}`);
  return res.json();
});
```

- [ ] **Step 2: Verify the build still succeeds**

Run: `cd desktop && npm run build`
Expected: success (this file isn't imported by any page yet, so this just
confirms no syntax errors).

- [ ] **Step 3: Commit**

```bash
git add desktop/lib/bfu-api.js
git commit -m "feat: bfu-api.js — cached fetch wrapper for the FastAPI backend"
```

---

## Part C — Page components (porting the approved Chorsu Profile.dc.html)

### Task 9: The `/u/[id]` page skeleton + `generateMetadata`

**Files:**
- Create: `desktop/app/u/[id]/page.js`
- Create: `desktop/app/u/[id]/not-found.js`

- [ ] **Step 1: Write the not-found page**

Create `desktop/app/u/[id]/not-found.js`:

```jsx
export default function ProfileNotFound() {
  return (
    <main style={{ minHeight: "100vh", background: "#0B0A08", color: "#F5F1E8",
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", gap: 12, fontFamily: "sans-serif" }}>
      <h1 style={{ fontFamily: "'Bricolage Grotesque', sans-serif" }}>Profile not found</h1>
      <p style={{ color: "#A8A093" }}>This BFU builder doesn't exist (yet).</p>
    </main>
  );
}
```

- [ ] **Step 2: Write the page with `generateMetadata` and data fetching**

Create `desktop/app/u/[id]/page.js`:

```jsx
import { notFound } from "next/navigation";
import { getPublicProfile } from "@/lib/bfu-api";

export async function generateMetadata({ params }) {
  const { id } = await params;
  const profile = await getPublicProfile(id);
  if (!profile) return { title: "Profile not found — BFU" };

  const description = profile.currently_building
    ? `Building: ${profile.currently_building}`
    : (profile.about || "Bright Futures Uzbekistan builder").slice(0, 160);

  return {
    title: `${profile.name} — Bright Futures Uzbekistan`,
    description,
    openGraph: {
      title: `${profile.name} — Bright Futures Uzbekistan`,
      description,
      url: profile.canonical_url,
      images: [{ url: profile.og_image_url, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      images: [profile.og_image_url],
    },
  };
}

export default async function ProfilePage({ params }) {
  const { id } = await params;
  const profile = await getPublicProfile(id);
  if (!profile) notFound();

  return (
    <main style={{ position: "relative", minHeight: "100vh" }}>
      <div className="ch-glow-a" />
      <div className="ch-glow-b" />
      <div className="ch-grain" />
      <div style={{ position: "relative", zIndex: 2, maxWidth: 1200, margin: "0 auto",
        padding: "26px 40px 96px" }}>
        <h1 style={{ fontFamily: "var(--font-display)" }}>{profile.name}</h1>
        <p style={{ color: "var(--muted)" }}>
          Full bento layout arrives in Tasks 10-19 — this proves data fetching + metadata work end to end.
        </p>
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Verify against the real backend**

Run:
```bash
cd desktop && BFU_API_URL=https://bfu-backend-production.up.railway.app npm run build
```
Expected: success. This confirms `generateMetadata`/the page compile; actual
per-profile data fetching is exercised once deployed (Task 22) or via `npm run dev`
pointed at a real user id you know exists in production.

- [ ] **Step 4: Commit**

```bash
git add desktop/app/u/
git commit -m "feat: /u/[id] page skeleton — generateMetadata + OG wiring + not-found"
```

---

### Task 10: `TopBar` + `AmbientTicker`

**Files:**
- Create: `desktop/components/TopBar.js`
- Create: `desktop/components/AmbientTicker.js`

- [ ] **Step 1: `TopBar` (server component — no interactivity needed)**

Create `desktop/components/TopBar.js`:

```jsx
export default function TopBar() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
      gap: 24, padding: "12px 0 8px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <img src="/bfu-mark.png" alt="BFU" style={{ height: 38, width: "auto", display: "block",
          filter: "drop-shadow(0 2px 10px rgba(232,161,92,0.25))" }} />
        <div style={{ width: 1, height: 26, background: "var(--hair)" }} />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.16em",
          textTransform: "uppercase", color: "var(--muted)" }}>Bright Futures Uzbekistan</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button className="ch-btn-ghost">
          <span style={{ fontSize: 15, color: "var(--amber)" }}>✦</span> Save to your list
        </button>
        <a href="#" className="ch-btn-primary">
          Open in Telegram <span style={{ fontSize: 14 }}>↗</span>
        </a>
      </div>
    </div>
  );
}
```

Add the two button classes to `desktop/app/globals.css` (append at the end):

```css
.ch-btn-ghost, .ch-btn-primary {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  border-radius: var(--radius-pill);
  font-family: var(--font-body);
  font-size: 14px;
  cursor: pointer;
  text-decoration: none;
  transition: all 0.18s ease;
}
.ch-btn-ghost {
  padding: 11px 18px;
  border: 1px solid var(--hair);
  background: rgba(35,32,25,0.6);
  color: var(--text);
  font-weight: 500;
}
.ch-btn-ghost:hover {
  border-color: var(--amber);
  background: rgba(35,32,25,0.9);
}
.ch-btn-primary {
  padding: 11px 20px;
  border: none;
  background: linear-gradient(135deg, var(--amber), var(--terra));
  color: #160E08;
  font-weight: 700;
  box-shadow: 0 8px 26px rgba(232,161,92,0.28);
  transition: transform 0.18s cubic-bezier(0.2,1.3,0.4,1);
}
.ch-btn-primary:hover { transform: translateY(-2px); }
```

- [ ] **Step 2: `AmbientTicker` (client component — cycles messages every 3s)**

Create `desktop/components/AmbientTicker.js`:

```jsx
"use client";

import { useEffect, useRef, useState } from "react";

const DEFAULT_LINES = [
  "Aziza just added a project in Tashkent",
  "34 builders online tonight",
  "Rustam is looking for a co-founder right now",
];

export default function AmbientTicker({ lines = DEFAULT_LINES }) {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);
  const timerRef = useRef(null);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || lines.length <= 1) return undefined;

    timerRef.current = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIndex((i) => (i + 1) % lines.length);
        setVisible(true);
      }, 400);
    }, 3000);

    return () => clearInterval(timerRef.current);
  }, [lines]);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 14,
      padding: "12px 20px", borderRadius: "var(--radius-pill)", border: "1px solid var(--hair)",
      background: "linear-gradient(90deg, rgba(26,24,21,0.7), rgba(26,24,21,0.3))",
      backdropFilter: "blur(6px)", overflow: "hidden" }}>
      <span style={{ position: "relative", display: "inline-flex", flex: "0 0 auto", width: 8, height: 8 }}>
        <span className="ch-online-ping" />
        <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "var(--ember)" }} />
      </span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.16em",
        textTransform: "uppercase", color: "var(--ember)", flex: "0 0 auto" }}>Live</span>
      <div style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "var(--muted)",
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        opacity: visible ? 1 : 0, transition: "opacity 0.4s ease" }}>
        {lines[index]}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify the build succeeds**

Run: `cd desktop && npm run build`
Expected: success. (Not wired into the page yet — that's Task 19.)

- [ ] **Step 4: Commit**

```bash
git add desktop/components/TopBar.js desktop/components/AmbientTicker.js desktop/app/globals.css
git commit -m "feat: TopBar + AmbientTicker components"
```

---

### Task 11: `IdentityStrip`

**Files:**
- Create: `desktop/components/IdentityStrip.js`

- [ ] **Step 1: Write the component**

Create `desktop/components/IdentityStrip.js`:

```jsx
function initials(name) {
  const parts = (name || "?").split(" ").filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export default function IdentityStrip({ profile }) {
  const roleParts = [
    profile.region?.name_en,
    profile.stats?.projects_founded > 0 ? "Founder" : null,
  ].filter(Boolean);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 30, marginTop: 44 }}>
      <div style={{ position: "relative", flex: "0 0 auto" }}>
        <div style={{ width: 128, height: 128, borderRadius: "50%",
          background: "linear-gradient(140deg,#E8A15C,#C0563B)", display: "flex",
          alignItems: "center", justifyContent: "center", fontFamily: "var(--font-display)",
          fontWeight: 700, fontSize: 46, color: "#160E08",
          boxShadow: "0 0 0 1px rgba(255,106,61,0.3), 0 20px 50px rgba(255,106,61,0.22)" }}>
          {profile.photo_url ? (
            <img src={profile.photo_url} alt={profile.name} style={{ width: "100%", height: "100%",
              borderRadius: "50%", objectFit: "cover" }} />
          ) : initials(profile.name)}
        </div>
        <span style={{ position: "absolute", bottom: 8, right: 8, display: "inline-flex",
          width: 20, height: 20 }}>
          <span className="ch-online-ping" />
          <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "var(--ember)",
            border: "3px solid var(--bg)" }} />
        </span>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <h1 style={{ margin: 0, fontFamily: "var(--font-display)", fontWeight: 700,
            fontSize: 60, lineHeight: 0.98, letterSpacing: "-0.02em", color: "var(--text)" }}>
            {profile.name}
          </h1>
          {profile.checked && (
            <span title="Verified" style={{ display: "inline-flex", alignItems: "center",
              justifyContent: "center", width: 30, height: 30, borderRadius: "50%",
              background: "rgba(127,176,105,0.16)", color: "var(--green)", fontSize: 16, marginTop: 6 }}>✓</span>
          )}
        </div>
        {profile.currently_building && (
          <div style={{ marginTop: 8, fontSize: 40, lineHeight: 1.05, color: "var(--text)" }}>
            <span style={{ fontFamily: "var(--font-accent)", fontStyle: "italic", color: "var(--muted)" }}>
              is building
            </span>{" "}
            <span style={{ fontFamily: "var(--font-accent)", fontStyle: "italic", color: "var(--amber)" }}>
              {profile.currently_building}
            </span>
          </div>
        )}
        <div style={{ marginTop: 16, fontFamily: "var(--font-mono)", fontSize: 12, letterSpacing: "0.16em",
          textTransform: "uppercase", color: "var(--muted)", display: "flex", alignItems: "center",
          gap: 10, flexWrap: "wrap" }}>
          {roleParts.map((part, i) => (
            <span key={part} style={{ display: "contents" }}>
              {i > 0 && <span style={{ color: "var(--hair)" }}>/</span>}
              <span>{part}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify the build succeeds**

Run: `cd desktop && npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add desktop/components/IdentityStrip.js
git commit -m "feat: IdentityStrip component"
```

---

### Task 12: `useCountUp` hook

**Files:**
- Create: `desktop/lib/useCountUp.js`

- [ ] **Step 1: Write the hook**

Create `desktop/lib/useCountUp.js`:

```javascript
"use client";

import { useEffect, useRef, useState } from "react";

/** Cubic ease-out count-up from 0 to `target`, matching the approved
 * Chorsu Profile.dc.html reference's timing (1100-1500ms, randomized). */
export function useCountUp(target) {
  const [value, setValue] = useState(0);
  const frameRef = useRef(null);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { setValue(target); return undefined; }
    if (!target) { setValue(0); return undefined; }

    const duration = 1100 + Math.random() * 400;
    const start = performance.now();

    const tick = (now) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(target * eased));
      if (p < 1) frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frameRef.current);
  }, [target]);

  return value;
}
```

- [ ] **Step 2: Verify the build succeeds**

Run: `cd desktop && npm run build`
Expected: success (unused until Task 13).

- [ ] **Step 3: Commit**

```bash
git add desktop/lib/useCountUp.js
git commit -m "feat: useCountUp hook — shared count-up animation logic"
```

---

### Task 13: `HeroBuildingCell`

**Files:**
- Create: `desktop/components/HeroBuildingCell.js`

- [ ] **Step 1: Write the component**

Create `desktop/components/HeroBuildingCell.js`:

```jsx
"use client";

import { useCountUp } from "@/lib/useCountUp";

export default function HeroBuildingCell({ profile }) {
  const project = profile.founded_projects?.[0];
  const openRoles = useCountUp(3); // placeholder count until Batch D's open-roles-per-project count is wired through this endpoint
  const coFounders = useCountUp(profile.collaborators?.count || 0);

  return (
    <div className="ch-cell" style={{ gridColumn: "span 2", gridRow: "span 2",
      display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div className="ch-cell-label">Currently building</div>
      <div style={{ position: "relative", marginTop: 16, height: 190, borderRadius: 14,
        overflow: "hidden", background: "linear-gradient(160deg,#12564F 0%,#1A1815 42%,#C0563B 130%)",
        border: "1px solid var(--hair)" }}>
        <div style={{ position: "absolute", top: 22, right: 26, width: 56, height: 56,
          borderRadius: "50%", background: "radial-gradient(circle at 40% 40%, #F0B429, #FF6A3D 70%)",
          boxShadow: "0 0 44px rgba(255,106,61,0.6)" }} />
      </div>
      <h2 style={{ margin: "20px 0 0", fontFamily: "var(--font-display)", fontWeight: 700,
        fontSize: 34, letterSpacing: "-0.02em", color: "var(--text)" }}>
        {project?.name || profile.currently_building || "No project yet"}
      </h2>
      {profile.about && (
        <p style={{ margin: "10px 0 0", fontSize: 15, lineHeight: 1.55, color: "var(--muted)" }}>
          {profile.about}
        </p>
      )}
      <div style={{ marginTop: "auto", paddingTop: 22, display: "flex", gap: 26 }}>
        <div>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 30, color: "var(--amber)" }}>
            {openRoles}
          </div>
          <div className="ch-metric-label">Open roles</div>
        </div>
        <div style={{ width: 1, background: "var(--hair)" }} />
        <div>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 30, color: "var(--text)" }}>
            {coFounders}
          </div>
          <div className="ch-metric-label">Collaborators</div>
        </div>
      </div>
    </div>
  );
}
```

Append shared cell styles to `desktop/app/globals.css`:

```css
.ch-cell {
  border-radius: var(--radius);
  border: 1px solid var(--hair);
  background: var(--surface);
  padding: 28px;
  transition: box-shadow 0.3s ease, transform 0.3s ease, border-color 0.3s ease;
}
.ch-cell:hover {
  box-shadow: 0 24px 60px rgba(0,0,0,0.5), 0 0 40px rgba(255,106,61,0.12);
}
.ch-cell-label {
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--muted);
}
.ch-metric-label {
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted);
  margin-top: 2px;
}
```

> Note the `openRoles` placeholder comment above: the backend contract
> (Task 5) does not currently expose a per-project open-roles count on
> `founded_projects` — flag this to the founder as a follow-up backend task
> (`GET /public/u/{id}/data` could join Batch D's open-roles data), don't
> block this page on it; the cell renders correctly today, just with a
> fixed placeholder count.

- [ ] **Step 2: Verify the build succeeds**

Run: `cd desktop && npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add desktop/components/HeroBuildingCell.js desktop/app/globals.css
git commit -m "feat: HeroBuildingCell — bento hero cell with count-up metrics"
```

---

### Task 14: `ReputationCell` — spring-filling ring

**Files:**
- Create: `desktop/components/ReputationCell.js`

This is the most visually distinctive mechanic in the reference file — it
uses a **hand-rolled elastic-overshoot easing function** (not a generic
Framer Motion spring preset), because the reference's exact feel depends on
this specific formula. Port it exactly rather than substituting a library
spring.

- [ ] **Step 1: Write the component**

Create `desktop/components/ReputationCell.js`:

```jsx
"use client";

import { useEffect, useRef } from "react";

const CIRCUMFERENCE = 2 * Math.PI * 52; // r=52, matches the SVG below

function elasticEaseOut(t) {
  if (t === 0) return 0;
  if (t === 1) return 1;
  const c4 = (2 * Math.PI) / 3;
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
}

export default function ReputationCell({ rating }) {
  const ringRef = useRef(null);

  useEffect(() => {
    const ring = ringRef.current;
    if (!ring) return undefined;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fraction = rating.average != null ? rating.average / 5 : 0;
    const target = CIRCUMFERENCE * (1 - fraction);

    if (reduce) {
      ring.setAttribute("stroke-dashoffset", String(target));
      return undefined;
    }

    let frame;
    const start = performance.now();
    const duration = 1300;
    const delayTimer = setTimeout(() => {
      const tick = (now) => {
        const p = Math.min(1, (now - start) / duration);
        const eased = elasticEaseOut(p);
        ring.setAttribute("stroke-dashoffset", String(CIRCUMFERENCE + (target - CIRCUMFERENCE) * eased));
        if (p < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    }, 250);

    return () => { clearTimeout(delayTimer); if (frame) cancelAnimationFrame(frame); };
  }, [rating.average]);

  return (
    <div className="ch-cell" style={{ gridColumn: "span 2", display: "flex", alignItems: "center", gap: 26 }}>
      <div style={{ position: "relative", flex: "0 0 auto", width: 128, height: 128 }}>
        <svg width="128" height="128" viewBox="0 0 128 128" style={{ transform: "rotate(-90deg)" }}>
          <circle cx="64" cy="64" r="52" fill="none" stroke="var(--surface-2)" strokeWidth="10" />
          <circle
            ref={ringRef}
            cx="64" cy="64" r="52" fill="none" stroke="url(#ch-rep-grad)"
            strokeWidth="10" strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE} strokeDashoffset={CIRCUMFERENCE}
          />
          <defs>
            <linearGradient id="ch-rep-grad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#F0B429" />
              <stop offset="1" stopColor="#FF6A3D" />
            </linearGradient>
          </defs>
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center" }}>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 38, lineHeight: 1,
            color: "var(--text)" }}>
            {rating.average != null ? rating.average.toFixed(1) : "—"}
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em",
            color: "var(--muted)", marginTop: 3 }}>/ 5.0</div>
        </div>
      </div>
      <div>
        <div className="ch-cell-label">Reputation</div>
        <div style={{ marginTop: 10, fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 22,
          color: "var(--text)", lineHeight: 1.15 }}>
          {rating.count > 0 ? <>Trusted across<br />the community</> : "New to the bazaar"}
        </div>
        <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8, fontSize: 13,
          color: "var(--muted)" }}>
          <span style={{ fontFamily: "var(--font-mono)", color: "var(--amber)" }}>{rating.count}</span> ratings
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify the build succeeds**

Run: `cd desktop && npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add desktop/components/ReputationCell.js
git commit -m "feat: ReputationCell — spring-filling ring with elastic easing"
```

---

### Task 15: `LookingForCell` + `AchievementsCell`

**Files:**
- Create: `desktop/components/LookingForCell.js`
- Create: `desktop/components/AchievementsCell.js`

- [ ] **Step 1: `LookingForCell`**

Create `desktop/components/LookingForCell.js`:

```jsx
const LABELS = {
  work: "Open to co-founder / team opportunities",
  volunteering: "Open to volunteering",
  both: "Open to co-founder opportunities and volunteering",
};

export default function LookingForCell({ lookingFor }) {
  if (!lookingFor) return null;

  return (
    <div className="ch-cell" style={{ gridColumn: "span 2",
      borderColor: "rgba(127,176,105,0.3)",
      background: "linear-gradient(150deg, rgba(127,176,105,0.10), var(--surface) 60%)",
      display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--green)",
          boxShadow: "0 0 12px rgba(127,176,105,0.8)" }} />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.16em",
          textTransform: "uppercase", color: "var(--green)" }}>Looking for</span>
      </div>
      <p style={{ margin: "16px 0 0", fontSize: 20, lineHeight: 1.4, color: "var(--text)",
        fontFamily: "var(--font-display)", fontWeight: 500 }}>
        {LABELS[lookingFor]}
      </p>
    </div>
  );
}
```

- [ ] **Step 2: `AchievementsCell`**

Create `desktop/components/AchievementsCell.js`:

```jsx
const ACHIEVEMENT_META = {
  first_project: { label: "First project", icon: "◆", color: "amber" },
  first_application: { label: "First application", icon: "✓", color: "green" },
  five_invites: { label: "5 invites", icon: "✶", color: "ember" },
  verified: { label: "Verified", icon: "✓", color: "green" },
  first_endorsement: { label: "First endorsement", icon: "◆", color: "amber" },
  mentor: { label: "Mentor", icon: "✶", color: "ember" },
  first_vouch_received: { label: "First vouch", icon: "✓", color: "green" },
};

const COLOR_STYLES = {
  amber: { bg: "rgba(232,161,92,0.12)", border: "rgba(232,161,92,0.35)", text: "var(--amber)" },
  green: { bg: "rgba(127,176,105,0.12)", border: "rgba(127,176,105,0.35)", text: "var(--green)" },
  ember: { bg: "rgba(255,106,61,0.10)", border: "rgba(255,106,61,0.3)", text: "var(--ember)" },
};

export default function AchievementsCell({ achievements }) {
  return (
    <div className="ch-cell" style={{ gridColumn: "span 2" }}>
      <div className="ch-cell-label">Achievements</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 18 }}>
        {achievements.map((a) => {
          const meta = ACHIEVEMENT_META[a.key] || { label: a.key, icon: "◆", color: "amber" };
          if (!a.earned) {
            return (
              <div key={a.key} style={{ display: "inline-flex", alignItems: "center", gap: 8,
                padding: "9px 14px", borderRadius: "var(--radius-pill)", background: "var(--surface-2)",
                border: "1px dashed var(--hair)", color: "#6b665c", fontSize: 13, fontWeight: 500 }}>
                <span>🔒</span> {meta.label}
              </div>
            );
          }
          const style = COLOR_STYLES[meta.color];
          return (
            <div key={a.key} style={{ display: "inline-flex", alignItems: "center", gap: 8,
              padding: "9px 14px", borderRadius: "var(--radius-pill)", background: style.bg,
              border: `1px solid ${style.border}`, color: style.text, fontSize: 13, fontWeight: 600 }}>
              <span>{meta.icon}</span> {meta.label}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify the build succeeds**

Run: `cd desktop && npm run build`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add desktop/components/LookingForCell.js desktop/components/AchievementsCell.js
git commit -m "feat: LookingForCell + AchievementsCell"
```

---

### Task 16: `VouchesCell` + `ConnectionsCell`

**Files:**
- Create: `desktop/components/VouchesCell.js`
- Create: `desktop/components/ConnectionsCell.js`

- [ ] **Step 1: `VouchesCell`**

Create `desktop/components/VouchesCell.js`:

```jsx
function initials(name) {
  const parts = (name || "?").split(" ").filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export default function VouchesCell({ vouches, vouchCount }) {
  const top = vouches?.[0];

  return (
    <div className="ch-cell" style={{ gridColumn: "span 2", display: "flex", flexDirection: "column" }}>
      <div className="ch-cell-label">Vouches ({vouchCount})</div>
      {top ? (
        <>
          <p style={{ margin: "16px 0 0", fontFamily: "var(--font-accent)", fontStyle: "italic",
            fontSize: 23, lineHeight: 1.4, color: "var(--text)" }}>
            &ldquo;{top.text}&rdquo;
          </p>
          <div style={{ marginTop: "auto", paddingTop: 18, display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: "50%",
              background: "linear-gradient(140deg,#7FB069,#12564F)", display: "flex", alignItems: "center",
              justifyContent: "center", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15,
              color: "#0B0A08" }}>
              {top.author ? initials(top.author.display_name) : "?"}
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>
                {top.author?.display_name || "A BFU builder"}
              </div>
            </div>
          </div>
        </>
      ) : (
        <p style={{ marginTop: 16, color: "var(--muted)" }}>No vouches yet.</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: `ConnectionsCell`**

Create `desktop/components/ConnectionsCell.js`:

```jsx
const STACK_GRADIENTS = [
  "linear-gradient(140deg,#E8A15C,#C0563B)",
  "linear-gradient(140deg,#F0B429,#C0563B)",
  "linear-gradient(140deg,#5EC5B6,#12564F)",
  "linear-gradient(140deg,#7FB069,#12564F)",
];

function initials(name) {
  const parts = (name || "?").split(" ").filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export default function ConnectionsCell({ collaborators, followerCount, region }) {
  const preview = collaborators?.preview || [];
  const extra = Math.max(0, (collaborators?.count || 0) - preview.length);

  return (
    <div className="ch-cell" style={{ gridColumn: "span 4", display: "flex", alignItems: "center",
      justifyContent: "space-between", gap: 24, padding: "26px 28px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <div style={{ display: "flex" }}>
          {preview.map((p, i) => (
            <div key={p.id} style={{ width: 44, height: 44, borderRadius: "50%",
              background: STACK_GRADIENTS[i % STACK_GRADIENTS.length], border: "2px solid var(--surface)",
              marginLeft: i === 0 ? 0 : -14, display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15, color: "#160E08" }}>
              {initials(p.display_name)}
            </div>
          ))}
          {extra > 0 && (
            <div style={{ width: 44, height: 44, borderRadius: "50%", background: "var(--surface-2)",
              border: "2px solid var(--surface)", marginLeft: -14, display: "flex", alignItems: "center",
              justifyContent: "center", fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 13,
              color: "var(--muted)" }}>
              +{extra}
            </div>
          )}
        </div>
        <div>
          <div style={{ fontSize: 15, color: "var(--text)" }}>
            <span style={{ fontFamily: "var(--font-mono)", color: "var(--amber)" }}>
              {followerCount}
            </span>{" "}
            connections
          </div>
          {region && (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.1em",
              color: "var(--muted)", marginTop: 4 }}>
              {region.name_en}
            </div>
          )}
        </div>
      </div>
      <button className="ch-btn-ghost">See all →</button>
    </div>
  );
}
```

- [ ] **Step 3: Verify the build succeeds**

Run: `cd desktop && npm run build`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add desktop/components/VouchesCell.js desktop/components/ConnectionsCell.js
git commit -m "feat: VouchesCell + ConnectionsCell"
```

---

### Task 17: Assemble the Bento grid on the page

**Files:**
- Modify: `desktop/app/u/[id]/page.js`

- [ ] **Step 1: Replace the placeholder page body with the full assembly**

Replace `desktop/app/u/[id]/page.js`'s `ProfilePage` function body (keep
`generateMetadata` from Task 9 unchanged) with:

```jsx
import { notFound } from "next/navigation";
import { getPublicProfile } from "@/lib/bfu-api";
import TopBar from "@/components/TopBar";
import AmbientTicker from "@/components/AmbientTicker";
import IdentityStrip from "@/components/IdentityStrip";
import HeroBuildingCell from "@/components/HeroBuildingCell";
import ReputationCell from "@/components/ReputationCell";
import LookingForCell from "@/components/LookingForCell";
import AchievementsCell from "@/components/AchievementsCell";
import VouchesCell from "@/components/VouchesCell";
import ConnectionsCell from "@/components/ConnectionsCell";

export async function generateMetadata({ params }) {
  const { id } = await params;
  const profile = await getPublicProfile(id);
  if (!profile) return { title: "Profile not found — BFU" };

  const description = profile.currently_building
    ? `Building: ${profile.currently_building}`
    : (profile.about || "Bright Futures Uzbekistan builder").slice(0, 160);

  return {
    title: `${profile.name} — Bright Futures Uzbekistan`,
    description,
    openGraph: {
      title: `${profile.name} — Bright Futures Uzbekistan`,
      description,
      url: profile.canonical_url,
      images: [{ url: profile.og_image_url, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      images: [profile.og_image_url],
    },
  };
}

export default async function ProfilePage({ params }) {
  const { id } = await params;
  const profile = await getPublicProfile(id);
  if (!profile) notFound();

  return (
    <main style={{ position: "relative", minHeight: "100vh" }}>
      <div className="ch-glow-a" />
      <div className="ch-glow-b" />
      <div className="ch-grain" />
      <div style={{ position: "relative", zIndex: 2, maxWidth: 1200, margin: "0 auto",
        padding: "26px 40px 96px" }}>
        <TopBar />
        <AmbientTicker />
        <IdentityStrip profile={profile} />

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20,
          marginTop: 40, alignItems: "stretch" }}>
          <HeroBuildingCell profile={profile} />
          <ReputationCell rating={profile.rating} />
          <LookingForCell lookingFor={profile.looking_for} />
          <AchievementsCell achievements={profile.achievements} />
          <VouchesCell vouches={profile.vouches} vouchCount={profile.vouch_count} />
          <ConnectionsCell
            collaborators={profile.collaborators}
            followerCount={profile.follower_count}
            region={profile.region}
          />
        </div>

        <div style={{ marginTop: 60, paddingTop: 26, borderTop: "1px solid var(--hair)",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.16em",
            textTransform: "uppercase", color: "var(--muted)" }}>
            {profile.canonical_url?.replace(/^https?:\/\//, "")}
          </div>
          <div style={{ fontFamily: "var(--font-accent)", fontStyle: "italic", fontSize: 18,
            color: "var(--muted)" }}>
            Someone is always building right now.
          </div>
        </div>
      </div>
    </main>
  );
}
```

> `ThreadsFromHere` (the "3 builders solving the same problem" rail) needs a
> backend endpoint that doesn't exist yet (a similarity/recommendation query)
> — deliberately left out of this first build per the plan's scope. Flag to
> the founder as the natural next slice once this page ships; the design
> brief §4 already describes the mechanic in detail for that follow-up.

- [ ] **Step 2: Verify the build succeeds**

Run: `cd desktop && BFU_API_URL=https://bfu-backend-production.up.railway.app npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add desktop/app/u/[id]/page.js
git commit -m "feat: assemble the full Chorsu bento grid on /u/[id]"
```

---

### Task 18: Lenis smooth-scroll

**Files:**
- Create: `desktop/components/SmoothScrollProvider.js`
- Modify: `desktop/app/layout.js`

- [ ] **Step 1: Write the provider**

Create `desktop/components/SmoothScrollProvider.js`:

```jsx
"use client";

import { useEffect, useState } from "react";
import { ReactLenis } from "lenis/react";

export default function SmoothScrollProvider({ children }) {
  // Default to smooth-scroll enabled until mounted (SSR-safe), then re-check the
  // user's prefers-reduced-motion setting on the client and disable Lenis when
  // reduce is set. Lenis has no internal reduced-motion handling of its own, so
  // this gate is required by the design spec (springs collapse, ticker holds,
  // glow static — smooth-scroll hijacking must not run for reduce users).
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduce(mql.matches);
    const onChange = (e) => setReduce(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  if (reduce) {
    return children;
  }

  return (
    <ReactLenis root options={{ lerp: 0.1, duration: 1.1 }}>
      {children}
    </ReactLenis>
  );
}
```

- [ ] **Step 2: Wrap the app in it**

In `desktop/app/layout.js`, import and wrap `children`:

```jsx
import "./globals.css";
import SmoothScrollProvider from "@/components/SmoothScrollProvider";

export const metadata = {
  title: "Bright Futures Uzbekistan",
  description: "A city of builders, lit up at dusk.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=Instrument+Serif:ital@0;1&family=Space+Mono:wght@400;700&display=swap"
          rel="stylesheet"
        />
        <link href="https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700,900&display=swap" rel="stylesheet" />
      </head>
      <body>
        <SmoothScrollProvider>{children}</SmoothScrollProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Verify the build succeeds**

Run: `cd desktop && npm run build`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add desktop/components/SmoothScrollProvider.js desktop/app/layout.js
git commit -m "feat: Lenis smooth-scroll provider"
```

---

### Task 19: `prefers-reduced-motion` audit + full local verification

**Files:** none new — this is a verification pass over Tasks 10-18.

- [ ] **Step 1: Grep every animation site and confirm each respects reduced-motion**

Run:
```bash
cd desktop && grep -rn "requestAnimationFrame\|setInterval\|animation:" components/ app/globals.css
```

Confirm each hit either:
- Checks `window.matchMedia("(prefers-reduced-motion: reduce)").matches` before
  animating (already true in `AmbientTicker.js`, `useCountUp.js`,
  `ReputationCell.js`), or
- Is a pure CSS `@keyframes` already covered by the `@media
  (prefers-reduced-motion: reduce)` block in `globals.css` (the glow drift +
  online-ping pulse).

If any animation site is missing this check, add it following the exact
pattern already used in `useCountUp.js` (check the media query at the top of
the effect, skip the RAF loop, set the final value directly).

**Also explicitly verify `SmoothScrollProvider.js` (Task 18).** The grep above
will NOT surface it — Lenis's RAF-driven smooth scroll runs inside
`node_modules/lenis` (not scanned), and the provider itself contains none of
the `requestAnimationFrame` / `setInterval` / `animation:` tokens. Lenis has no
internal reduced-motion handling, so smooth-scroll hijacking would otherwise run
for every user. Confirm the provider reads
`window.matchMedia("(prefers-reduced-motion: reduce)")` in a client effect
(SSR-safe: enabled until mounted, then re-checked) and renders `{children}`
without `<ReactLenis>` when reduce is set.

- [ ] **Step 2: Full production build**

Run: `cd desktop && BFU_API_URL=https://bfu-backend-production.up.railway.app npm run build`
Expected: success, zero errors/warnings about missing env vars or broken imports.

- [ ] **Step 3: Manual smoke test against a real profile**

Run: `cd desktop && BFU_API_URL=https://bfu-backend-production.up.railway.app npm run dev`

Open `http://localhost:3000/u/{a-real-registered-user-id-from-production}` and
verify: identity strip renders with real name/avatar, reputation ring
spring-fills, achievements show earned vs. locked correctly, ambient ticker
cycles, OG meta tags are present (view page source, confirm
`<meta property="og:image">` points at a working `/public/og/{id}.png` URL).

- [ ] **Step 4: Commit** (only if Step 1 required fixes; otherwise skip — this
  task is a verification pass)

```bash
git add desktop/
git commit -m "fix: ensure every Chorsu animation respects prefers-reduced-motion"
```

---

## Part D — Deploy

### Task 20: New Vercel project + env vars + first deploy

**Files:** none (infrastructure/dashboard steps) — this is a manual task for
whoever has Vercel access (per this project's established pattern, the
founder or whoever holds Vercel credentials).

- [ ] **Step 1: Push the branch**

```bash
git push
```

- [ ] **Step 2: Create the second Vercel project (Dashboard)**

Per the Vercel research grounding this plan: Add New → Project → Import the
*same* `bfu-app` GitHub repo again → before deploying, set **Root Directory**
to `desktop` → confirm Next.js framework preset auto-detected → Deploy.

- [ ] **Step 3: Set the environment variable**

In the new project's Settings → Environment Variables, add:
```
BFU_API_URL = https://bfu-backend-production.up.railway.app
```
scoped to Production, Preview, and Development.

- [ ] **Step 4: Verify the auto-issued domain**

Settings → Domains on the new project shows an auto-provisioned
`bfu-desktop-*.vercel.app`-style URL the moment the first deploy succeeds —
no custom domain configuration needed for this first build. Visit
`https://<that-domain>/u/{a-real-user-id}` and confirm it matches the local
verification from Task 19.

- [ ] **Step 5: Confirm the EXISTING Mini App Vercel project is untouched**

Check the original `bfu-app` Vercel project's Settings → Git → Root
Directory is still whatever it was before this plan (almost certainly the
repo root) — this plan never modifies that project's settings, only adds a
new one.

---

## Self-review notes

- **Spec coverage:** every §5.1 bento cell from
  `docs/superpowers/specs/2026-07-06-chorsu-desktop-design.md` is built
  (Hero/Reputation/LookingFor/Achievements/Vouches/Connections) except
  "Threads from here," explicitly deferred (Task 17's note) because it needs
  a not-yet-built recommendation backend endpoint — flagged, not silently
  dropped. Palette/type/motion/mechanics (§1-§4) are all present:
  film grain, firelit glow, 4 type voices, ambient ticker, presence pulse,
  spring-filling ring, count-ups, `prefers-reduced-motion` handling.
- **No placeholders:** every task has complete, runnable code. The one
  intentional interim value (`openRoles` fixed count in `HeroBuildingCell`,
  Task 13) is explicitly flagged as a follow-up backend gap in its own
  callout, not a silently fake number pretending to be real.
- **Type consistency checked:** `profile.rating` ({average, count}),
  `profile.looking_for` (string|null), `profile.collaborators`
  ({count, preview}), `profile.achievements` (list of {key, earned,
  progress}) are used identically in every component that consumes them,
  matching the exact shape Task 5's backend endpoint returns.
- **Scope check:** this plan covers exactly the first screen (`/u/{id}`).
  The City/Discovery view (design brief §5.2) is explicitly out of scope —
  a separate future plan, per the brief's own "build order."
