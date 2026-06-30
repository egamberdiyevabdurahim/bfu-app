# Trust Layer (Batch B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a BFU profile *corroborated by peers* — mutual connections, skill endorsements, written vouches, post-project ratings (both sides after a project closes), and a crawlable public web profile at `/u/{id}`. **Reputation score is DEFERRED**: build the rest and leave one marked seam.

**Architecture:** Three new tables (`endorsements`, `vouches`, `project_ratings`); mutual connections are derived live from the existing `Interest` + `ProjectMember` data (no new table). A single server helper `_trust_extras(db, user, viewer)` computes the trust payload and is attached — exactly like Batch A's `_profile_extras` — to `GET /users/{id}` and `GET /users/me`. New write endpoints handle endorse (toggle), vouch (upsert/delete), and project rating (upsert, gated on a closed project). Closing a project enqueues `rate_prompt` inbox items to the cohort. The public profile is server-rendered HTML at `GET /public/u/{id}` (no React, crawlable, reuses `_profile_extras` + `_trust_extras`), exposed at `/u/:id` via a Vercel rewrite. Frontend adds trust UI to `UserProfileModal` + a rate sheet + a public-profile share button.

**Tech Stack:** FastAPI + SQLAlchemy 2 async + Postgres (backend), React 19 + Vite (frontend), pytest (tests). Migrations are idempotent `CREATE INDEX ... IF NOT EXISTS` / `ALTER TABLE ... IF NOT EXISTS` run in `app/main.py` lifespan (no Alembic); tables themselves are created by `Base.metadata.create_all`.

**Spec:** `docs/superpowers/specs/2026-07-01-batchB-trust-design.md`

**Depends on:** Batch A (`_profile_extras`, `_sanitize_portfolio` in `app/routers/users.py`; `ProfileProject`/`ProfileStats` in `app/schemas/user.py`; the Batch-A profile fields on `UserPublic`/`UserResponse`). The Batch-A router helpers + endpoint wiring (Tasks 4–7 of the Batch A plan) must be in place before Task 5 here. If they are not yet committed, implement them first.

---

## File structure

- `backend/app/models/trust.py` — new: `Endorsement`, `Vouch`, `ProjectRating` models
- `backend/app/models/__init__.py` — import the new models so `Base.metadata` sees them
- `backend/app/main.py` — idempotent index migrations for the 3 tables
- `backend/app/schemas/user.py` — `EndorsementOut`, `VouchOut`, `RatingOut`, `MutualConnections`, `UserMini`; new fields on `UserPublic` + `UserResponse`
- `backend/app/schemas/trust.py` — new: request bodies (`EndorseIn`, `VouchIn`, `RatingIn`)
- `backend/app/routers/users.py` — `_trust_extras()`; wire into `get_user_profile` + `get_me`; endorse / vouch endpoints
- `backend/app/routers/projects.py` — rating endpoints + `rate_prompt` trigger on close
- `backend/tests/test_trust.py` — new test file
- `backend/app/routers/public.py` — `GET /public/u/{user_id}` SSR HTML page
- `backend/tests/test_public_profile.py` — new test file
- `vercel.json` — rewrite `/u/:id` → backend public page
- `src/api.js` — `endorse`, `vouch`, `deleteVouch`, `rateMember`, `rateable` clients
- `src/components/ProfileExtras.jsx` — render endorsement counts + mutual connections + rating (extends Batch A component)
- `src/components/UserProfileModal.jsx` — endorse toggle + vouch composer + rating badge
- `src/components/RateSheet.jsx` — new rate-the-cohort sheet
- `src/screens/SettingsScreen.jsx` — "Share public profile" button
- `src/i18n.jsx` — new keys (en/uz/ru)

---

## Task 1: Trust models

**Files:**
- Create: `backend/app/models/trust.py`
- Modify: `backend/app/models/__init__.py`

- [ ] **Step 1: Create the models**

Create `backend/app/models/trust.py`:

```python
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Endorsement(Base):
    """One member endorses one skill on another member's profile. The skill
    must be present in the target's user_analysis.skills at write time."""
    __tablename__ = "endorsements"
    __table_args__ = (
        UniqueConstraint("endorser_id", "target_id", "skill",
                         name="uq_endorsement_endorser_target_skill"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    endorser_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    target_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    skill: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Vouch(Base):
    """A short written testimonial one member leaves on another's profile.
    One author may have a single (updatable) vouch per target."""
    __tablename__ = "vouches"
    __table_args__ = (
        UniqueConstraint("author_id", "target_id", name="uq_vouch_author_target"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    author_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    target_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    text: Mapped[str] = mapped_column(String(280))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class ProjectRating(Base):
    """A 1..5 star rating one cohort member gives another after a project
    closes. One rating per (project, rater, ratee); re-submitting updates it."""
    __tablename__ = "project_ratings"
    __table_args__ = (
        UniqueConstraint("project_id", "rater_id", "ratee_id",
                         name="uq_rating_project_rater_ratee"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    rater_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    ratee_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    stars: Mapped[int] = mapped_column(Integer)
    note: Mapped[str | None] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
```

- [ ] **Step 2: Register the models on Base.metadata**

In `backend/app/models/__init__.py`, ensure the new module is imported so `create_all` builds the tables. Add (matching the existing import style in that file):

```python
from app.models.trust import Endorsement, Vouch, ProjectRating  # noqa: F401
```

- [ ] **Step 3: Verify it imports**

Run: `cd backend && python -c "import app.models; from app.models.trust import Endorsement, Vouch, ProjectRating; print('ok')"`
Expected: `ok`.

- [ ] **Step 4: Commit**

```bash
git add backend/app/models/trust.py backend/app/models/__init__.py
git commit -m "model: trust tables (endorsements, vouches, project_ratings)"
```

---

## Task 2: Idempotent index migrations

**Files:**
- Modify: `backend/app/main.py` (the `migrations` list)

The unique constraints + per-column indexes are declared on the models and created by `create_all` on a fresh DB. For an already-live Postgres DB the tables are new (so `create_all` creates them with their constraints too). We add explicit `CREATE INDEX IF NOT EXISTS` for the hot lookup columns to be safe and self-documenting; all are idempotent.

- [ ] **Step 1: Add migration statements**

In `backend/app/main.py`, inside the `migrations = [...]` list, after the `portfolio_links` line (~line 71), add:

```python
        # --- Batch B: trust layer indexes (tables created by create_all) ---
        "CREATE INDEX IF NOT EXISTS ix_endorsements_target ON endorsements (target_id);",
        "CREATE INDEX IF NOT EXISTS ix_endorsements_endorser ON endorsements (endorser_id);",
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_endorsement_endorser_target_skill "
        "ON endorsements (endorser_id, target_id, skill);",
        "CREATE INDEX IF NOT EXISTS ix_vouches_target ON vouches (target_id);",
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_vouch_author_target "
        "ON vouches (author_id, target_id);",
        "CREATE INDEX IF NOT EXISTS ix_ratings_ratee ON project_ratings (ratee_id);",
        "CREATE INDEX IF NOT EXISTS ix_ratings_project ON project_ratings (project_id);",
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_rating_project_rater_ratee "
        "ON project_ratings (project_id, rater_id, ratee_id);",
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/main.py
git commit -m "migrate: trust table indexes (endorsements/vouches/ratings)"
```

---

## Task 3: Schemas — trust output + request bodies + profile fields

**Files:**
- Modify: `backend/app/schemas/user.py`
- Create: `backend/app/schemas/trust.py`

- [ ] **Step 1: Add output schema classes to `user.py`**

In `backend/app/schemas/user.py`, after the existing `PortfolioLink` class (~line 35), add:

```python
class UserMini(BaseModel):
    """Lightweight person preview embedded in trust payloads."""
    id: int
    display_name: str
    photo_url: str | None = None

    model_config = {"from_attributes": True}


class EndorsementOut(BaseModel):
    skill: str
    count: int = 0
    endorsed_by_me: bool = False


class VouchOut(BaseModel):
    id: int
    text: str
    author: UserMini | None = None
    created_at: datetime | None = None


class RatingOut(BaseModel):
    average: float | None = None
    count: int = 0


class MutualConnections(BaseModel):
    count: int = 0
    preview: list[UserMini] = []
```

- [ ] **Step 2: Add the new fields to `UserPublic` and `UserResponse`**

Add these fields to **both** `UserPublic` and `UserResponse` (alongside the Batch-A extras, before `model_config`):

```python
    endorsements: list[EndorsementOut] = []
    vouches: list[VouchOut] = []
    vouch_count: int = 0
    rating: RatingOut = RatingOut()
    mutual_connections: MutualConnections = MutualConnections()
```

- [ ] **Step 3: Create the request-body schema file**

Create `backend/app/schemas/trust.py`:

```python
from pydantic import BaseModel


class EndorseIn(BaseModel):
    skill: str


class VouchIn(BaseModel):
    text: str


class RatingIn(BaseModel):
    ratee_id: int
    stars: int
    note: str | None = None
```

- [ ] **Step 4: Verify imports compile**

Run: `cd backend && python -c "import app.schemas.user, app.schemas.trust; print('ok')"`
Expected: `ok`.

- [ ] **Step 5: Commit**

```bash
git add backend/app/schemas/user.py backend/app/schemas/trust.py
git commit -m "schema: trust outputs (endorse/vouch/rating/mutual) + request bodies"
```

---

## Task 4: `_trust_extras` builder (TDD)

**Files:**
- Modify: `backend/app/routers/users.py` (add helper near `_profile_extras`)
- Test: `backend/tests/test_trust.py` (new)

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_trust.py`:

```python
"""Batch B trust layer: endorsements, vouches, ratings, mutual connections."""
import pytest

pytestmark = pytest.mark.asyncio


async def _mk_project(db, creator_id, name, *, is_active=True, is_draft=False, is_deleted=False):
    from app.models.project import Project
    p = Project(type="startup", creator_id=creator_id, name=name, is_active=is_active,
                is_draft=is_draft, is_deleted=is_deleted, is_approved=True)
    db.add(p)
    await db.commit()
    await db.refresh(p)
    return p


async def _set_skills(db, user_id, skills):
    from app.models.user_analysis import UserAnalysis
    db.add(UserAnalysis(user_id=user_id, skills=skills, knowledges=[],
                        interests=[], preparations=[], goals=[]))
    await db.commit()


async def test_trust_extras_endorsements_and_viewer_flag(make_user, db):
    from app.routers.users import _trust_extras
    from app.models.trust import Endorsement

    target = await make_user(name="Target")
    e1 = await make_user(name="E1")
    e2 = await make_user(name="E2")
    await _set_skills(db, target.id, ["React", "Python"])
    db.add(Endorsement(endorser_id=e1.id, target_id=target.id, skill="React"))
    db.add(Endorsement(endorser_id=e2.id, target_id=target.id, skill="React"))
    db.add(Endorsement(endorser_id=e1.id, target_id=target.id, skill="Python"))
    await db.commit()

    # Viewed by e1 → React endorsed_by_me True; viewed by stranger → False.
    seen_e1 = {e["skill"]: e for e in (await _trust_extras(db, target, e1))["endorsements"]}
    assert seen_e1["React"]["count"] == 2
    assert seen_e1["React"]["endorsed_by_me"] is True
    assert seen_e1["Python"]["count"] == 1

    stranger = await make_user(name="S")
    seen_s = {e["skill"]: e for e in (await _trust_extras(db, target, stranger))["endorsements"]}
    assert seen_s["React"]["endorsed_by_me"] is False


async def test_trust_extras_vouches_and_rating(make_user, db):
    from app.routers.users import _trust_extras
    from app.models.trust import Vouch, ProjectRating

    target = await make_user(name="Target")
    a1 = await make_user(name="A1")
    db.add(Vouch(author_id=a1.id, target_id=target.id, text="Great teammate."))
    # ratings: 5 and 4 → avg 4.5, count 2
    p = await _mk_project(db, a1.id, "Closed", is_active=False)
    db.add(ProjectRating(project_id=p.id, rater_id=a1.id, ratee_id=target.id, stars=5))
    r2 = await make_user(name="R2")
    db.add(ProjectRating(project_id=p.id, rater_id=r2.id, ratee_id=target.id, stars=4))
    await db.commit()

    extras = await _trust_extras(db, target, a1)
    assert extras["vouch_count"] == 1
    assert extras["vouches"][0]["text"] == "Great teammate."
    assert extras["vouches"][0]["author"]["id"] == a1.id
    assert extras["rating"]["count"] == 2
    assert extras["rating"]["average"] == 4.5


async def test_trust_extras_rating_empty_is_null(make_user, db):
    from app.routers.users import _trust_extras
    target = await make_user(name="T")
    viewer = await make_user(name="V")
    extras = await _trust_extras(db, target, viewer)
    assert extras["rating"] == {"average": None, "count": 0}
    assert extras["endorsements"] == []
    assert extras["vouches"] == []


async def test_trust_extras_mutual_connections(make_user, db):
    from app.routers.users import _trust_extras
    from app.models.user import Interest
    from app.models.project import ProjectMember

    viewer = await make_user(name="Viewer")
    target = await make_user(name="Target")
    shared = await make_user(name="Shared")     # mutual-interest with BOTH
    co = await make_user(name="Co")             # shares a project with BOTH

    # viewer <-> shared mutual interest
    db.add(Interest(from_user_id=viewer.id, to_user_id=shared.id))
    db.add(Interest(from_user_id=shared.id, to_user_id=viewer.id))
    # target <-> shared mutual interest
    db.add(Interest(from_user_id=target.id, to_user_id=shared.id))
    db.add(Interest(from_user_id=shared.id, to_user_id=target.id))

    # A project that viewer, target, and `co` are all members of.
    owner = await make_user(name="Owner")
    p = await _mk_project(db, owner.id, "Joint")
    for u in (viewer, target, co):
        db.add(ProjectMember(project_id=p.id, user_id=u.id))
    await db.commit()

    mc = (await _trust_extras(db, target, viewer))["mutual_connections"]
    ids = {m["id"] for m in mc["preview"]}
    assert shared.id in ids   # via mutual interest
    assert co.id in ids       # via shared project
    assert target.id not in ids and viewer.id not in ids
    assert mc["count"] == len(ids)


async def test_trust_extras_self_view_no_mutuals(make_user, db):
    from app.routers.users import _trust_extras
    me = await make_user(name="Me")
    mc = (await _trust_extras(db, me, me))["mutual_connections"]
    assert mc == {"count": 0, "preview": []}
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && python -m pytest tests/test_trust.py -k trust_extras -v`
Expected: FAIL — `cannot import name '_trust_extras'`.

- [ ] **Step 3: Implement the helper**

In `backend/app/routers/users.py`, add the trust-model import near the existing imports (after the `from app.models.project import ...` line; if that import doesn't exist yet from Batch A, add it too):

```python
from app.models.project import Project, ProjectMember, ProjectApplication
from app.models.trust import Endorsement, Vouch, ProjectRating
```

Then add this helper right after `_profile_extras` (Batch A):

```python
async def _connection_ids(db: AsyncSession, uid: int) -> set[int]:
    """The set of member ids `uid` is connected to: mutual-interest peers
    UNION people who share a (non-draft/non-deleted) project with `uid`."""
    i_like = set((await db.execute(
        select(Interest.to_user_id).where(Interest.from_user_id == uid)
    )).scalars().all())
    like_me = set((await db.execute(
        select(Interest.from_user_id).where(Interest.to_user_id == uid)
    )).scalars().all())
    mutual = i_like & like_me

    # Projects uid belongs to (as member OR founder), excluding draft/deleted.
    my_proj = set((await db.execute(
        select(ProjectMember.project_id)
        .join(Project, Project.id == ProjectMember.project_id)
        .where(ProjectMember.user_id == uid,
               Project.is_draft == False, Project.is_deleted == False)
    )).scalars().all())
    my_proj |= set((await db.execute(
        select(Project.id).where(Project.creator_id == uid,
                                 Project.is_draft == False, Project.is_deleted == False)
    )).scalars().all())

    co_ids: set[int] = set()
    if my_proj:
        # Co-members of those projects.
        co_ids |= set((await db.execute(
            select(ProjectMember.user_id).where(ProjectMember.project_id.in_(my_proj))
        )).scalars().all())
        # Founders of those projects.
        co_ids |= set((await db.execute(
            select(Project.creator_id).where(Project.id.in_(my_proj))
        )).scalars().all())

    out = mutual | co_ids
    out.discard(uid)
    return out


async def _trust_extras(db: AsyncSession, user: User, viewer: User | None) -> dict:
    """Derive the peer-trust payload for `user`, relative to `viewer` (for the
    viewer-specific `endorsed_by_me` + mutual-connection overlap)."""
    viewer_id = viewer.id if viewer else None

    # ── Endorsements: count per skill + whether the viewer endorsed it. ──
    rows = (await db.execute(
        select(Endorsement.skill, Endorsement.endorser_id)
        .where(Endorsement.target_id == user.id)
    )).all()
    counts: dict[str, int] = {}
    mine: set[str] = set()
    for skill, endorser_id in rows:
        counts[skill] = counts.get(skill, 0) + 1
        if viewer_id is not None and endorser_id == viewer_id:
            mine.add(skill)
    endorsements = [
        {"skill": s, "count": c, "endorsed_by_me": s in mine}
        for s, c in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0].lower()))
    ]

    # ── Vouches (newest first, cap 20) with author preview. ──
    vrows = (await db.execute(
        select(Vouch).where(Vouch.target_id == user.id)
        .order_by(Vouch.created_at.desc()).limit(20)
    )).scalars().all()
    vouch_count = await db.scalar(
        select(func.count(Vouch.id)).where(Vouch.target_id == user.id)
    ) or 0
    author_ids = {v.author_id for v in vrows}
    authors: dict[int, dict] = {}
    if author_ids:
        for u in (await db.execute(select(User).where(User.id.in_(author_ids)))).scalars().all():
            authors[u.id] = {"id": u.id, "display_name": u.display_name, "photo_url": u.photo_url}
    vouches = [
        {"id": v.id, "text": v.text, "author": authors.get(v.author_id),
         "created_at": v.created_at}
        for v in vrows
    ]

    # ── Rating aggregate over all ratings where this user is the ratee. ──
    avg = await db.scalar(
        select(func.avg(ProjectRating.stars)).where(ProjectRating.ratee_id == user.id)
    )
    rcount = await db.scalar(
        select(func.count(ProjectRating.id)).where(ProjectRating.ratee_id == user.id)
    ) or 0
    rating = {"average": round(float(avg), 1) if avg is not None else None, "count": int(rcount)}

    # ── Mutual connections: overlap of viewer's + target's connection sets. ──
    mutual = {"count": 0, "preview": []}
    if viewer_id is not None and viewer_id != user.id:
        v_conn = await _connection_ids(db, viewer_id)
        t_conn = await _connection_ids(db, user.id)
        overlap = (v_conn & t_conn) - {viewer_id, user.id}
        if overlap:
            preview_ids = sorted(overlap)[:8]
            people = (await db.execute(
                select(User).where(User.id.in_(preview_ids),
                                   User.is_deleted == False, User.is_registered == True)
            )).scalars().all()
            mutual = {
                "count": len(overlap),
                "preview": [
                    {"id": u.id, "display_name": u.display_name, "photo_url": u.photo_url}
                    for u in people
                ],
            }

    # REPUTATION SEAM: when the reputation model is decided, compute it here as a
    # pure function of (endorsements, vouch_count, rating, mutual) and add it to
    # the returned dict (+ a `reputation` field on the schema). Deferred for now.
    return {
        "endorsements": endorsements,
        "vouches": vouches,
        "vouch_count": int(vouch_count),
        "rating": rating,
        "mutual_connections": mutual,
    }
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && python -m pytest tests/test_trust.py -k trust_extras -v`
Expected: all passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/routers/users.py backend/tests/test_trust.py
git commit -m "feat: _trust_extras builder (endorsements/vouches/rating/mutuals)"
```

---

## Task 5: Attach `_trust_extras` to the profile endpoints (TDD)

**Files:**
- Modify: `backend/app/routers/users.py` (`get_user_profile`, `get_me`)
- Test: `backend/tests/test_trust.py`

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_trust.py`:

```python
async def test_get_user_profile_includes_trust(make_user, as_user, db):
    from app.models.trust import Vouch
    target = await make_user(name="Target")
    viewer = await make_user(name="Viewer")
    db.add(Vouch(author_id=viewer.id, target_id=target.id, text="Solid."))
    await db.commit()

    c = as_user(viewer)
    res = await c.get(f"/users/{target.id}")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["vouch_count"] == 1
    assert body["vouches"][0]["text"] == "Solid."
    assert body["rating"] == {"average": None, "count": 0}
    assert "mutual_connections" in body and "endorsements" in body


async def test_get_me_includes_trust(make_user, as_user, db):
    me = await make_user(name="Me")
    c = as_user(me)
    res = await c.get("/users/me")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["rating"] == {"average": None, "count": 0}
    assert body["mutual_connections"] == {"count": 0, "preview": []}
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && python -m pytest tests/test_trust.py -k "includes_trust" -v`
Expected: FAIL — `vouch_count`/`rating` absent (default empty) until wired.

- [ ] **Step 3: Wire into `get_user_profile`**

In `get_user_profile` (the `@router.get("/{user_id}")` handler), after the Batch-A `extras` block and the connector-badge block, before `return out`, add:

```python
    trust = await _trust_extras(db, user, current_user)
    for k, v in trust.items():
        setattr(out, k, v)
```

(If Batch A's `extras` wiring is present it already does `out = UserPublic.model_validate(user)` and a `setattr` loop — place this immediately after that loop.)

- [ ] **Step 4: Wire into `get_me`**

In `get_me`, it currently ends with `return current_user`. Replace that final `return current_user` with:

```python
    out = UserResponse.model_validate(current_user)
    extras = await _profile_extras(db, current_user)
    for k, v in extras.items():
        setattr(out, k, v)
    trust = await _trust_extras(db, current_user, current_user)
    for k, v in trust.items():
        setattr(out, k, v)
    return out
```

(If Batch A already changed `get_me` to validate + attach `_profile_extras`, just add the two `trust` lines before its `return out`.)

- [ ] **Step 5: Run to verify it passes**

Run: `cd backend && python -m pytest tests/test_trust.py -v`
Expected: all passed.

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/users.py backend/tests/test_trust.py
git commit -m "feat: attach trust extras to GET /users/{id} and /users/me"
```

---

## Task 6: Endorse endpoint (toggle) (TDD)

**Files:**
- Modify: `backend/app/routers/users.py`
- Test: `backend/tests/test_trust.py`

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_trust.py`:

```python
async def test_endorse_toggle_and_validation(make_user, as_user, db):
    from app.models.user_analysis import UserAnalysis
    target = await make_user(name="Target")
    me = await make_user(name="Me")
    db.add(UserAnalysis(user_id=target.id, skills=["React"], knowledges=[],
                        interests=[], preparations=[], goals=[]))
    await db.commit()

    c = as_user(me)
    # First tap → endorsed.
    r1 = await c.post(f"/users/{target.id}/endorse", json={"skill": "React"})
    assert r1.status_code == 200, r1.text
    assert r1.json() == {"ok": True, "endorsed": True, "count": 1}
    # Second tap → un-endorsed (toggle off).
    r2 = await c.post(f"/users/{target.id}/endorse", json={"skill": "React"})
    assert r2.json() == {"ok": True, "endorsed": False, "count": 0}
    # Skill not in target's analysis → 422.
    r3 = await c.post(f"/users/{target.id}/endorse", json={"skill": "Welding"})
    assert r3.status_code == 422


async def test_endorse_self_rejected(make_user, as_user, db):
    from app.models.user_analysis import UserAnalysis
    me = await make_user(name="Me")
    db.add(UserAnalysis(user_id=me.id, skills=["React"], knowledges=[],
                        interests=[], preparations=[], goals=[]))
    await db.commit()
    c = as_user(me)
    r = await c.post(f"/users/{me.id}/endorse", json={"skill": "React"})
    assert r.status_code == 400
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && python -m pytest tests/test_trust.py -k endorse -v`
Expected: FAIL — 404 (route missing).

- [ ] **Step 3: Implement the endpoint**

Add the import for the request bodies near the top of `backend/app/routers/users.py`:

```python
from app.schemas.trust import EndorseIn, VouchIn
```

Add the endpoint (place it near the other `/{user_id}/...` POST handlers, e.g. after `soft_interest`):

```python
@router.post("/{user_id}/endorse", response_model=dict)
async def endorse_skill(
    user_id: int,
    body: EndorseIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Toggle an endorsement of `skill` on user `user_id`. The skill must be in
    the target's analysis.skills. Returns the new state + count for that skill."""
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot endorse yourself")
    skill = (body.skill or "").strip()
    if not skill:
        raise HTTPException(status_code=400, detail="skill required")
    target = (await db.execute(
        select(User).options(selectinload(User.analysis))
        .where(User.id == user_id, User.is_deleted == False, User.is_registered == True)
    )).scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    valid = {s.lower() for s in ((target.analysis.skills if target.analysis else None) or [])}
    if skill.lower() not in valid:
        raise HTTPException(status_code=422, detail="Skill not on this profile")

    existing = (await db.execute(
        select(Endorsement).where(
            Endorsement.endorser_id == current_user.id,
            Endorsement.target_id == user_id,
            Endorsement.skill == skill,
        )
    )).scalar_one_or_none()
    if existing:
        await db.delete(existing)
        endorsed = False
    else:
        db.add(Endorsement(endorser_id=current_user.id, target_id=user_id, skill=skill))
        endorsed = True
    await db.commit()

    count = await db.scalar(
        select(func.count(Endorsement.id)).where(
            Endorsement.target_id == user_id, Endorsement.skill == skill
        )
    ) or 0
    return {"ok": True, "endorsed": endorsed, "count": int(count)}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && python -m pytest tests/test_trust.py -k endorse -v`
Expected: all passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/routers/users.py backend/tests/test_trust.py
git commit -m "feat: POST /users/{id}/endorse (toggle, skill-validated)"
```

---

## Task 7: Vouch endpoints (upsert + delete) (TDD)

**Files:**
- Modify: `backend/app/routers/users.py`
- Test: `backend/tests/test_trust.py`

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_trust.py`:

```python
async def test_vouch_create_update_delete(make_user, as_user, db):
    from app.models.trust import Vouch
    target = await make_user(name="Target")
    me = await make_user(name="Me")
    c = as_user(me)

    # Create.
    r1 = await c.post(f"/users/{target.id}/vouch", json={"text": "  Reliable builder.  "})
    assert r1.status_code == 200, r1.text
    assert r1.json()["ok"] is True
    rows = (await db.execute(
        Vouch.__table__.select().where(Vouch.target_id == target.id)
    )).all()
    assert len(rows) == 1

    # Update (same author → one row, new text).
    r2 = await c.post(f"/users/{target.id}/vouch", json={"text": "Ships fast."})
    assert r2.status_code == 200
    fresh = (await db.execute(
        Vouch.__table__.select().where(Vouch.target_id == target.id)
    )).all()
    assert len(fresh) == 1
    assert fresh[0].text == "Ships fast."

    # Delete.
    r3 = await c.delete(f"/users/{target.id}/vouch")
    assert r3.status_code == 204
    gone = (await db.execute(
        Vouch.__table__.select().where(Vouch.target_id == target.id)
    )).all()
    assert gone == []


async def test_vouch_self_and_empty_rejected(make_user, as_user, db):
    me = await make_user(name="Me")
    other = await make_user(name="Other")
    c = as_user(me)
    assert (await c.post(f"/users/{me.id}/vouch", json={"text": "x"})).status_code == 400
    assert (await c.post(f"/users/{other.id}/vouch", json={"text": "   "})).status_code == 400


async def test_vouch_delete_missing_404(make_user, as_user, db):
    me = await make_user(name="Me")
    other = await make_user(name="Other")
    c = as_user(me)
    assert (await c.delete(f"/users/{other.id}/vouch")).status_code == 404
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && python -m pytest tests/test_trust.py -k vouch -v`
Expected: FAIL — routes missing (404/405).

- [ ] **Step 3: Implement the endpoints**

Add to `backend/app/routers/users.py` (near the endorse endpoint). `VouchIn` is already imported in Task 6; add `status` to the FastAPI import line at the top if not present (`from fastapi import APIRouter, Depends, HTTPException, Request, status`):

```python
@router.post("/{user_id}/vouch", response_model=dict)
async def vouch_for(
    user_id: int,
    body: VouchIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create or update the caller's short testimonial for user `user_id`."""
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot vouch for yourself")
    text = (body.text or "").strip()[:280]
    if not text:
        raise HTTPException(status_code=400, detail="text required")
    target = await db.get(User, user_id)
    if not target or target.is_deleted or not target.is_registered:
        raise HTTPException(status_code=404, detail="User not found")

    existing = (await db.execute(
        select(Vouch).where(Vouch.author_id == current_user.id, Vouch.target_id == user_id)
    )).scalar_one_or_none()
    if existing:
        existing.text = text
        existing.updated_at = datetime.utcnow()
        vid = existing.id
    else:
        v = Vouch(author_id=current_user.id, target_id=user_id, text=text)
        db.add(v)
        await db.flush()
        vid = v.id
    await db.commit()
    return {"ok": True, "id": vid}


@router.delete("/{user_id}/vouch", status_code=status.HTTP_204_NO_CONTENT)
async def delete_vouch(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove the caller's vouch for user `user_id`."""
    existing = (await db.execute(
        select(Vouch).where(Vouch.author_id == current_user.id, Vouch.target_id == user_id)
    )).scalar_one_or_none()
    if not existing:
        raise HTTPException(status_code=404, detail="No vouch to delete")
    await db.delete(existing)
    await db.commit()
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && python -m pytest tests/test_trust.py -k vouch -v`
Expected: all passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/routers/users.py backend/tests/test_trust.py
git commit -m "feat: POST/DELETE /users/{id}/vouch (upsert + delete)"
```

---

## Task 8: Rating endpoints + close-project trigger (TDD)

**Files:**
- Modify: `backend/app/routers/projects.py`
- Test: `backend/tests/test_trust.py`

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_trust.py`:

```python
async def _cohort_project(db, founder_id, member_ids, *, is_active):
    from app.models.project import Project, ProjectMember
    p = Project(type="startup", creator_id=founder_id, name="Coh", is_active=is_active,
                is_draft=False, is_deleted=False, is_approved=True)
    db.add(p)
    await db.commit()
    await db.refresh(p)
    for mid in member_ids:
        db.add(ProjectMember(project_id=p.id, user_id=mid))
    await db.commit()
    return p


async def test_rating_requires_closed_and_cohort(make_user, as_user, db):
    founder = await make_user(name="Founder")
    m1 = await make_user(name="M1")
    outsider = await make_user(name="Out")

    active = await _cohort_project(db, founder.id, [m1.id], is_active=True)
    c = as_user(founder)
    # Active project → 409.
    r = await c.post(f"/projects/{active.id}/ratings", json={"ratee_id": m1.id, "stars": 5})
    assert r.status_code == 409, r.text

    closed = await _cohort_project(db, founder.id, [m1.id], is_active=False)
    c = as_user(founder)
    # Founder rates member → ok.
    r2 = await c.post(f"/projects/{closed.id}/ratings", json={"ratee_id": m1.id, "stars": 5, "note": "Great"})
    assert r2.status_code == 200, r2.text
    # Rate an outsider → 403.
    r3 = await c.post(f"/projects/{closed.id}/ratings", json={"ratee_id": outsider.id, "stars": 5})
    assert r3.status_code == 403
    # Self → 400.
    r4 = await c.post(f"/projects/{closed.id}/ratings", json={"ratee_id": founder.id, "stars": 5})
    assert r4.status_code == 400
    # Out of range → 422.
    r5 = await c.post(f"/projects/{closed.id}/ratings", json={"ratee_id": m1.id, "stars": 9})
    assert r5.status_code == 422


async def test_rating_upsert_one_row(make_user, as_user, db):
    from app.models.trust import ProjectRating
    founder = await make_user(name="Founder")
    m1 = await make_user(name="M1")
    closed = await _cohort_project(db, founder.id, [m1.id], is_active=False)
    c = as_user(founder)
    await c.post(f"/projects/{closed.id}/ratings", json={"ratee_id": m1.id, "stars": 3})
    await c.post(f"/projects/{closed.id}/ratings", json={"ratee_id": m1.id, "stars": 5})
    rows = (await db.execute(
        ProjectRating.__table__.select().where(ProjectRating.project_id == closed.id)
    )).all()
    assert len(rows) == 1
    assert rows[0].stars == 5


async def test_rateable_cohort_and_flags(make_user, as_user, db):
    founder = await make_user(name="Founder")
    m1 = await make_user(name="M1")
    m2 = await make_user(name="M2")
    closed = await _cohort_project(db, founder.id, [m1.id, m2.id], is_active=False)
    c = as_user(m1)
    await c.post(f"/projects/{closed.id}/ratings", json={"ratee_id": m2.id, "stars": 4})
    res = await c.get(f"/projects/{closed.id}/rateable")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["closed"] is True
    ids = {row["id"]: row for row in body["cohort"]}
    # m1 (caller) excluded from their own rateable list.
    assert m1.id not in ids
    assert ids[m2.id]["rated_by_me"] is True
    assert ids[founder.id]["rated_by_me"] is False


async def test_close_project_enqueues_rate_prompt(make_user, as_user, db):
    from app.models.user import Notification
    founder = await make_user(name="Founder")
    m1 = await make_user(name="M1")
    active = await _cohort_project(db, founder.id, [m1.id], is_active=True)
    c = as_user(founder)
    # Close it via the normal update path.
    r = await c.patch(f"/projects/{active.id}", json={"is_active": False})
    assert r.status_code == 200, r.text
    notes = (await db.execute(
        Notification.__table__.select().where(Notification.type == "rate_prompt")
    )).all()
    recipients = {n.user_id for n in notes}
    # Both founder and member get prompted.
    assert founder.id in recipients and m1.id in recipients
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && python -m pytest tests/test_trust.py -k "rating or rateable or rate_prompt" -v`
Expected: FAIL — routes missing / no trigger.

- [ ] **Step 3: Implement the rating endpoints + cohort helper**

In `backend/app/routers/projects.py`, add imports near the top (match the existing import block):

```python
from app.models.trust import ProjectRating
from app.models.user import Notification
from app.schemas.trust import RatingIn
```

Add a cohort helper + the two endpoints (place them after the application endpoints, before the stats endpoint):

```python
async def _project_cohort(db: AsyncSession, project) -> set[int]:
    """Founder + all accepted members of a project."""
    member_ids = set((await db.execute(
        select(ProjectMember.user_id).where(ProjectMember.project_id == project.id)
    )).scalars().all())
    member_ids.add(project.creator_id)
    return member_ids


@router.post("/{project_id}/ratings", response_model=dict)
async def rate_member(
    project_id: int,
    body: RatingIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Rate another cohort member 1..5 stars after the project has closed.
    Upserts the caller's rating of `ratee_id` for this project."""
    if not (1 <= int(body.stars) <= 5):
        raise HTTPException(status_code=422, detail="stars must be 1..5")
    if body.ratee_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot rate yourself")
    project = (await db.execute(
        select(Project).where(Project.id == project_id, Project.is_deleted == False,
                              Project.is_draft == False)
    )).scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.is_active:
        raise HTTPException(status_code=409, detail="Project is still active")
    cohort = await _project_cohort(db, project)
    if current_user.id not in cohort or body.ratee_id not in cohort:
        raise HTTPException(status_code=403, detail="Both rater and ratee must be in the project")

    note = (body.note or "").strip()[:200] or None
    existing = (await db.execute(
        select(ProjectRating).where(
            ProjectRating.project_id == project_id,
            ProjectRating.rater_id == current_user.id,
            ProjectRating.ratee_id == body.ratee_id,
        )
    )).scalar_one_or_none()
    if existing:
        existing.stars = int(body.stars)
        existing.note = note
        existing.updated_at = dt.datetime.utcnow()
        rid = existing.id
    else:
        r = ProjectRating(project_id=project_id, rater_id=current_user.id,
                          ratee_id=body.ratee_id, stars=int(body.stars), note=note)
        db.add(r)
        await db.flush()
        rid = r.id
    await db.commit()
    return {"ok": True, "id": rid}


@router.get("/{project_id}/rateable", response_model=dict)
async def rateable(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """The cohort the caller may rate for this project (others only), with a
    `rated_by_me` flag per person. Only cohort members may call."""
    project = (await db.execute(
        select(Project).where(Project.id == project_id, Project.is_deleted == False,
                              Project.is_draft == False)
    )).scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    cohort = await _project_cohort(db, project)
    if current_user.id not in cohort:
        raise HTTPException(status_code=403, detail="Not part of this project")

    rated = set((await db.execute(
        select(ProjectRating.ratee_id).where(
            ProjectRating.project_id == project_id,
            ProjectRating.rater_id == current_user.id,
        )
    )).scalars().all())
    others = [uid for uid in cohort if uid != current_user.id]
    people = {}
    if others:
        for u in (await db.execute(select(User).where(User.id.in_(others)))).scalars().all():
            people[u.id] = u
    return {
        "closed": not project.is_active,
        "cohort": [
            {"id": uid, "display_name": people[uid].display_name if uid in people else f"#{uid}",
             "photo_url": people[uid].photo_url if uid in people else None,
             "rated_by_me": uid in rated}
            for uid in others if uid in people
        ],
    }
```

Note: `projects.py` already imports `datetime as dt`, `Project`, `ProjectMember`, `User`, `select`, `HTTPException` — confirm (`grep -n "import datetime as dt" backend/app/routers/projects.py`); the application-review handler uses `dt.datetime.utcnow()`, so `dt` is present.

- [ ] **Step 4: Add the close-project `rate_prompt` trigger**

In `update_project` (the `PATCH /{project_id}` handler), capture the active state **before** applying the update, and enqueue prompts on a true→false transition. Replace the body from `data = body.model_dump(exclude_none=True)` down to `await db.commit()` with:

```python
    was_active = project.is_active

    data = body.model_dump(exclude_none=True)
    req_region_ids = data.pop("req_region_ids", None)
    req_skills = data.pop("req_skills", None)
    req_knowledges = data.pop("req_knowledges", None)

    for field, value in data.items():
        setattr(project, field, value)

    if req_region_ids is not None or req_skills is not None or req_knowledges is not None:
        await _set_requirements(
            db, project,
            req_region_ids or [],
            req_skills or [],
            req_knowledges or [],
        )

    # Project just closed (active → inactive): prompt the whole cohort to rate
    # each other. One inbox item per cohort member (incl. founder).
    if was_active and project.is_active is False:
        from app.services.notifications import add_notification
        cohort = await _project_cohort(db, project)
        for uid in cohort:
            add_notification(db, uid, "rate_prompt", actor_id=current_user.id,
                             project_id=project.id)

    await db.commit()
```

(The rest of `update_project` — `_reload_project` + `_project_response` — is unchanged.)

- [ ] **Step 5: Run to verify it passes**

Run: `cd backend && python -m pytest tests/test_trust.py -k "rating or rateable or rate_prompt" -v`
Expected: all passed.

- [ ] **Step 6: Run the full trust suite + full backend suite**

Run: `cd backend && python -m pytest tests/test_trust.py -q && python -m pytest -q`
Expected: all pass (existing suite + new file).

- [ ] **Step 7: Commit**

```bash
git add backend/app/routers/projects.py backend/tests/test_trust.py
git commit -m "feat: project ratings (upsert + rateable) + rate_prompt on close"
```

---

## Task 9: Public web profile `GET /public/u/{id}` (TDD)

**Files:**
- Modify: `backend/app/routers/public.py`
- Test: `backend/tests/test_public_profile.py` (new)

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_public_profile.py`:

```python
"""Public, crawlable profile page at /public/u/{id} (Batch B)."""
import pytest

pytestmark = pytest.mark.asyncio


async def _mk_project(db, creator_id, name, *, is_active=True):
    from app.models.project import Project
    p = Project(type="startup", creator_id=creator_id, name=name, is_active=is_active,
                is_draft=False, is_deleted=False, is_approved=True)
    db.add(p)
    await db.commit()
    await db.refresh(p)
    return p


async def test_public_profile_renders_html(make_user, client, db):
    user = await make_user(name="Aziz", surname="Karimov")
    await _mk_project(db, user.id, "Solar Farm", is_active=True)

    # No auth needed — it's a public endpoint.
    res = await client.get(f"/public/u/{user.id}")
    assert res.status_code == 200, res.text
    assert res.headers["content-type"].startswith("text/html")
    html = res.text
    assert "Solar Farm" in html
    assert "Aziz" in html
    # Open Graph + canonical for crawlers / unfurlers.
    assert 'property="og:title"' in html
    assert "<title>" in html


async def test_public_profile_404_for_unknown(client):
    res = await client.get("/public/u/999999")
    assert res.status_code == 404


async def test_public_profile_404_for_unregistered(make_user, client):
    u = await make_user(name="Ghost", is_registered=False)
    res = await client.get(f"/public/u/{u.id}")
    assert res.status_code == 404
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && python -m pytest tests/test_public_profile.py -v`
Expected: FAIL — 404 (route missing) on the render test.

- [ ] **Step 3: Implement the SSR endpoint**

In `backend/app/routers/public.py`, add imports near the top (after the existing imports):

```python
from fastapi.responses import HTMLResponse
from app.routers.users import _profile_extras, _trust_extras
```

Add a small HTML-escape helper + the endpoint at the end of the file:

```python
def _esc(s) -> str:
    """Minimal HTML escaping for text interpolated into the public page."""
    return (str(s or "")
            .replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            .replace('"', "&quot;"))


@router.get("/u/{user_id}", response_class=HTMLResponse)
async def public_profile(user_id: int, db: AsyncSession = Depends(get_db)):
    """Crawlable, login-free profile page for sharing with employers. Reuses the
    Batch-A `_profile_extras` + Batch-B `_trust_extras` builders. No JS."""
    user = (await db.execute(
        select(User).options(selectinload(User.analysis))
        .where(User.id == user_id, User.is_deleted == False, User.is_registered == True)
    )).scalar_one_or_none()
    if not user:
        return HTMLResponse(
            content="<!doctype html><html><head><meta charset='utf-8'>"
                    "<title>Profile not found — BFU</title></head>"
                    "<body style='font-family:system-ui;background:#0A0A0F;color:#F0F0FF;"
                    "display:flex;min-height:100vh;align-items:center;justify-content:center'>"
                    "<div style='text-align:center'><h1>404</h1>"
                    "<p>This BFU profile doesn't exist.</p></div></body></html>",
            status_code=404,
        )

    extras = await _profile_extras(db, user)
    trust = await _trust_extras(db, user, None)

    region_name = None
    if user.region_id:
        r = await db.get(Region, user.region_id)
        region_name = (r.name_uz if r else None)
    age = (datetime.utcnow().year - user.birth_year) if user.birth_year else None
    name = _esc((user.name or "").capitalize() + ((" " + user.surname.capitalize()) if user.surname else ""))
    name = name.strip() or _esc(user.display_name)
    cb = extras.get("currently_building")
    skills = (user.analysis.skills if user.analysis else None) or []
    endo = {e["skill"]: e["count"] for e in trust["endorsements"]}
    rating = trust["rating"]
    stats = extras["stats"]
    bot = settings.BOT_USERNAME
    base = (settings.WEBAPP_URL or "").rstrip("/")
    open_url = f"https://t.me/{bot}?startapp=user_{user.id}" if bot else "#"
    desc = _esc((cb or user.about or "BFU member")[:160])

    def chip(label, count):
        badge = f" <b>{count}</b>" if count else ""
        return (f"<span style='display:inline-block;background:rgba(123,111,255,0.15);"
                f"color:#7B6FFF;border-radius:99px;padding:4px 10px;margin:0 6px 6px 0;"
                f"font-size:13px'>{_esc(label)}{badge}</span>")

    skills_html = "".join(chip(s, endo.get(s, 0)) for s in skills) or "<span style='color:#9090A8'>—</span>"

    def proj_li(p):
        status = "Active" if p["is_active"] else "Closed"
        return (f"<li style='margin-bottom:6px'>{_esc(p['name'])} "
                f"<span style='color:#9090A8;font-size:12px'>· {status}</span></li>")

    founded_html = "".join(proj_li(p) for p in extras["founded_projects"]) or "<li style='color:#9090A8'>—</li>"
    member_html = "".join(proj_li(p) for p in extras["member_projects"]) or "<li style='color:#9090A8'>—</li>"

    vouches_html = "".join(
        f"<blockquote style='margin:0 0 10px;padding:10px 14px;background:#16161F;"
        f"border-left:3px solid #7B6FFF;border-radius:8px'>“{_esc(v['text'])}” "
        f"<span style='color:#9090A8;font-size:12px'>— {_esc((v.get('author') or {}).get('display_name',''))}</span>"
        f"</blockquote>"
        for v in trust["vouches"]
    ) or "<p style='color:#9090A8'>No vouches yet.</p>"

    links_html = "".join(
        f"<a href='{_esc(l['url'])}' rel='nofollow noopener' style='color:#7B6FFF;margin-right:12px'>{_esc(l['label'])}</a>"
        for l in extras["portfolio_links"]
    )

    rating_html = (f"★ {rating['average']} <span style='color:#9090A8'>({rating['count']})</span>"
                   if rating["average"] is not None else "<span style='color:#9090A8'>No ratings yet</span>")

    meta = []
    if age:
        meta.append(f"{age} y/o")
    if region_name:
        meta.append(_esc(region_name))
    if user.checked:
        meta.append("✓ Verified")
    meta_html = " · ".join(meta)

    canonical = f"{base}/u/{user.id}" if base else f"/u/{user.id}"
    jsonld = (
        '{"@context":"https://schema.org","@type":"Person",'
        f'"name":"{name}","description":"{desc}","url":"{_esc(canonical)}"}}'
    )

    html = f"""<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{name} — BFU</title>
<meta name="description" content="{desc}">
<link rel="canonical" href="{_esc(canonical)}">
<meta property="og:type" content="profile">
<meta property="og:title" content="{name} — BFU">
<meta property="og:description" content="{desc}">
<meta property="og:url" content="{_esc(canonical)}">
<meta name="robots" content="index, follow">
<script type="application/ld+json">{jsonld}</script>
</head>
<body style="margin:0;font-family:system-ui,-apple-system,sans-serif;background:#0A0A0F;color:#F0F0FF">
<div style="max-width:640px;margin:0 auto;padding:32px 20px">
  <header style="display:flex;gap:16px;align-items:center;margin-bottom:8px">
    <div>
      <h1 style="margin:0;font-size:26px">{name}</h1>
      <div style="color:#9090A8;font-size:14px;margin-top:4px">{meta_html}</div>
    </div>
  </header>
  {"<p style='font-size:16px;color:#C8C8E0'>🔨 " + _esc(cb) + "</p>" if cb else ""}
  <div style="margin:16px 0;font-size:18px">{rating_html}</div>
  <div style="display:flex;gap:10px;margin:16px 0">
    <div style="flex:1;text-align:center;background:#16161F;border-radius:10px;padding:12px">
      <div style="font-size:22px;font-weight:800">{stats['projects_founded']}</div>
      <div style="font-size:11px;color:#9090A8;text-transform:uppercase">Founded</div></div>
    <div style="flex:1;text-align:center;background:#16161F;border-radius:10px;padding:12px">
      <div style="font-size:22px;font-weight:800">{stats['projects_joined']}</div>
      <div style="font-size:11px;color:#9090A8;text-transform:uppercase">Joined</div></div>
    <div style="flex:1;text-align:center;background:#16161F;border-radius:10px;padding:12px">
      <div style="font-size:22px;font-weight:800">{stats['applications_accepted']}</div>
      <div style="font-size:11px;color:#9090A8;text-transform:uppercase">Accepted</div></div>
  </div>
  <section style="margin:24px 0"><h2 style="font-size:14px;text-transform:uppercase;color:#9090A8">Skills</h2>{skills_html}</section>
  <section style="margin:24px 0"><h2 style="font-size:14px;text-transform:uppercase;color:#9090A8">Founded</h2><ul style="padding-left:18px">{founded_html}</ul></section>
  <section style="margin:24px 0"><h2 style="font-size:14px;text-transform:uppercase;color:#9090A8">Member of</h2><ul style="padding-left:18px">{member_html}</ul></section>
  <section style="margin:24px 0"><h2 style="font-size:14px;text-transform:uppercase;color:#9090A8">Vouches</h2>{vouches_html}</section>
  {"<section style='margin:24px 0'><h2 style='font-size:14px;text-transform:uppercase;color:#9090A8'>Links</h2>" + links_html + "</section>" if links_html else ""}
  <a href="{_esc(open_url)}" style="display:inline-block;margin-top:16px;background:#7B6FFF;color:#fff;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:700">Open in Telegram</a>
  <footer style="margin-top:40px;color:#9090A8;font-size:12px">Bright Futures Uzbekistan</footer>
</div>
</body></html>"""
    return HTMLResponse(content=html, status_code=200,
                        headers={"Cache-Control": "public, max-age=300"})
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && python -m pytest tests/test_public_profile.py -v`
Expected: all passed.

- [ ] **Step 5: Run the full backend suite (no regressions)**

Run: `cd backend && python -m pytest -q`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/public.py backend/tests/test_public_profile.py
git commit -m "feat: SSR public profile page GET /public/u/{id} (crawlable)"
```

---

## Task 10: Vercel rewrite for `/u/:id`

**Files:**
- Modify: `vercel.json`

The current `vercel.json` rewrites everything except `/landing` to the SPA. We must route `/u/:id` to the backend's public page (same-origin proxy) AND keep it out of the SPA catch-all. The backend host is the production API base; the rewrite mirrors how `/public/*` already reaches the API in production.

- [ ] **Step 1: Update the rewrites**

Replace the contents of `vercel.json` with:

```json
{
  "rewrites": [
    { "source": "/u/:id", "destination": "https://bfu-app-production.up.railway.app/public/u/:id" },
    { "source": "/((?!landing|u/).*)", "destination": "/index.html" }
  ]
}
```

The first rule proxies `/u/<id>` to the backend SSR page; the catch-all now also excludes `u/` so a browser hitting `/u/12` is never handed the SPA shell.

NOTE: confirm the backend production URL. Run `git grep -n "railway.app\|api_base_url\|VITE_API_URL" -- vercel.json backend/app/config.py src` and use the same host the rest of the app proxies to. If the repo proxies the API via a different rewrite/host, match that host here instead of the placeholder above.

- [ ] **Step 2: Commit**

```bash
git add vercel.json
git commit -m "infra: rewrite /u/:id to backend public profile page"
```

---

## Task 11: API client methods

**Files:**
- Modify: `src/api.js`

- [ ] **Step 1: Add the trust client methods**

In `src/api.js`, inside the `users` object (after `getProfile`), add:

```javascript
  endorse:         (id, skill) => req(`/users/${id}/endorse`, { method: "POST", body: JSON.stringify({ skill }) }),
  vouch:           (id, text)  => req(`/users/${id}/vouch`,   { method: "POST", body: JSON.stringify({ text }) }),
  deleteVouch:     (id)        => req(`/users/${id}/vouch`,   { method: "DELETE" }),
  publicUrl:       (id)        => `${window.location.origin}/u/${id}`,
```

In the `projects` object (after `stats`), add:

```javascript
  rateable:          (id)            => req(`/projects/${id}/rateable`),
  rateMember:        (id, ratee_id, stars, note) =>
    req(`/projects/${id}/ratings`, { method: "POST", body: JSON.stringify({ ratee_id, stars, note }) }),
```

- [ ] **Step 2: Commit**

```bash
git add src/api.js
git commit -m "api: endorse/vouch/rate client methods + publicUrl"
```

---

## Task 12: i18n keys (en/uz/ru)

**Files:**
- Modify: `src/i18n.jsx`

The file uses the per-key nested shape `"key": { en, uz, ru }`. Add these entries inside the `STRINGS` object (anywhere among the existing entries — e.g. after the profile keys).

- [ ] **Step 1: Add keys**

```javascript
  "trust.mutual": { en: "{n} mutual connections", uz: "{n} umumiy aloqa", ru: "{n} общих связей" },
  "trust.mutualOne": { en: "1 mutual connection", uz: "1 umumiy aloqa", ru: "1 общая связь" },
  "trust.rating": { en: "Rating", uz: "Reyting", ru: "Рейтинг" },
  "trust.noRating": { en: "No ratings yet", uz: "Hali reyting yo‘q", ru: "Пока нет оценок" },
  "trust.endorse": { en: "Endorse", uz: "Tasdiqlash", ru: "Подтвердить" },
  "trust.endorsed": { en: "Endorsed", uz: "Tasdiqlandi", ru: "Подтверждено" },
  "trust.vouches": { en: "Vouches", uz: "Tavsiyalar", ru: "Отзывы" },
  "trust.vouchBtn": { en: "Write a vouch", uz: "Tavsiya yozish", ru: "Оставить отзыв" },
  "trust.vouchPh": { en: "I worked with this person on…", uz: "Men bu inson bilan … ustida ishlaganman", ru: "Я работал(а) с этим человеком над…" },
  "trust.vouchPost": { en: "Post", uz: "Joylash", ru: "Опубликовать" },
  "trust.vouchDelete": { en: "Remove my vouch", uz: "Tavsiyamni o‘chirish", ru: "Удалить мой отзыв" },
  "trust.noVouches": { en: "No vouches yet", uz: "Hali tavsiya yo‘q", ru: "Пока нет отзывов" },
  "trust.sharePublic": { en: "Share public profile", uz: "Ommaviy profilni ulashish", ru: "Поделиться профилем" },
  "trust.copied": { en: "Link copied", uz: "Havola nusxalandi", ru: "Ссылка скопирована" },
  "rate.title": { en: "Rate your teammates", uz: "Jamoadoshlaringizni baholang", ru: "Оцените команду" },
  "rate.note": { en: "Note (optional)", uz: "Izoh (ixtiyoriy)", ru: "Заметка (необязательно)" },
  "rate.submit": { en: "Submit rating", uz: "Bahoni yuborish", ru: "Отправить оценку" },
  "rate.done": { en: "Rating saved", uz: "Baho saqlandi", ru: "Оценка сохранена" },
  "rate.prompt": { en: "A project closed — rate your teammates", uz: "Loyiha yopildi — jamoadoshlaringizni baholang", ru: "Проект закрыт — оцените команду" },
```

- [ ] **Step 2: Commit**

```bash
git add src/i18n.jsx
git commit -m "i18n: trust layer keys (en/uz/ru)"
```

---

## Task 13: Extend `ProfileExtras` with mutual connections + rating + endorsement counts

**Files:**
- Modify: `src/components/ProfileExtras.jsx`

This component already renders the Batch-A blocks. We add a mutual-connections strip and a rating badge, and pass endorsement data down (the per-skill endorse toggle itself lives in `UserProfileModal`, since it needs an action handler; here we render read-only counts when `ProfileExtras` is used on the own/Settings surface).

- [ ] **Step 1: Add the new blocks**

In `src/components/ProfileExtras.jsx`, inside the returned `<div>` (after the "Currently building" block, before "Stats"), add a rating + mutual block. Add near the top of the `ProfileExtras` component body, after the existing destructuring (`const links = ...`):

```jsx
  const rating = user.rating || { average: null, count: 0 };
  const mutual = user.mutual_connections || { count: 0, preview: [] };
```

Then insert this JSX right after the `{user.currently_building && (...)}` block:

```jsx
      {/* Rating */}
      {rating.average != null && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 700, color: "var(--text)" }}>
          <span style={{ color: "#FFB347" }}>★ {rating.average}</span>
          <span style={{ color: "var(--text-3)", fontSize: 13, fontWeight: 500 }}>({rating.count})</span>
        </div>
      )}

      {/* Mutual connections */}
      {mutual.count > 0 && (
        <div>
          <div className="section-label">
            {mutual.count === 1 ? t("trust.mutualOne") : t("trust.mutual", { n: mutual.count })}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {mutual.preview.map(m => (
              <button key={m.id} onClick={() => onOpenProfile?.(m.id)} style={{
                display: "flex", alignItems: "center", gap: 6, background: "var(--surface-2)",
                border: "1px solid var(--border)", borderRadius: 99, padding: "4px 10px 4px 4px",
                cursor: "pointer", color: "var(--text)", fontSize: 12, fontWeight: 600,
              }}>
                <span style={{ width: 22, height: 22, borderRadius: "50%", background: "var(--accent-dim)",
                  color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 10, fontWeight: 800 }}>
                  {(m.display_name || "?").slice(0, 1).toUpperCase()}
                </span>
                {m.display_name}
              </button>
            ))}
          </div>
        </div>
      )}
```

- [ ] **Step 2: Accept the new `onOpenProfile` prop**

Update the component signature from `export const ProfileExtras = ({ user, onOpenProject }) => {` to:

```jsx
export const ProfileExtras = ({ user, onOpenProject, onOpenProfile }) => {
```

- [ ] **Step 3: Build to verify**

Run: `npm run build`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add src/components/ProfileExtras.jsx
git commit -m "feat: rating badge + mutual connections in ProfileExtras"
```

---

## Task 14: Endorse toggle + vouch composer + rating badge in UserProfileModal

**Files:**
- Modify: `src/components/UserProfileModal.jsx`

- [ ] **Step 1: Import + local state**

At the top of `src/components/UserProfileModal.jsx`, the file already imports `users` from `../api`, `useState`/`useEffect` from react, and `tgAlert`/`tgConfirm` from `../tg`. Add `ProfileExtras` import:

```jsx
import { ProfileExtras } from "./ProfileExtras";
```

Inside `UserProfileModal`, after the existing `useState` hooks, add:

```jsx
  const [vouchOpen, setVouchOpen] = useState(false);
  const [vouchText, setVouchText] = useState("");
  const [vouchBusy, setVouchBusy] = useState(false);
```

- [ ] **Step 2: Add the endorse + vouch handlers**

Add these handlers inside the component (near the other `do*` handlers):

```jsx
  const doEndorse = async (skill) => {
    if (!user) return;
    try {
      const r = await users.endorse(user.id, skill);
      // Optimistically update the endorsements array on the loaded user.
      setUser(prev => {
        if (!prev) return prev;
        const list = (prev.endorsements || []).filter(e => e.skill !== skill);
        if (r.count > 0) list.push({ skill, count: r.count, endorsed_by_me: r.endorsed });
        return { ...prev, endorsements: list };
      });
    } catch (e) { tgAlert(e.message); }
  };

  const submitVouch = async () => {
    if (!user || vouchBusy || !vouchText.trim()) return;
    setVouchBusy(true);
    try {
      await users.vouch(user.id, vouchText.trim());
      const fresh = await users.getProfile(user.id);
      setUser(fresh);
      setVouchOpen(false);
      setVouchText("");
      tgAlert(t("trust.vouchPost"));
    } catch (e) { tgAlert(e.message); }
    setVouchBusy(false);
  };
```

- [ ] **Step 3: Render endorse buttons on skill tags**

The Analysis Tags block renders categories via `TagChip`. For the `skills` category specifically, render an endorse affordance. Locate the `{hasAnyTags && (...)}` block. Replace the inner `.map` for tags with a skills-aware version. Change:

```jsx
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {tags.map(tag => <TagChip key={tag} label={tag} category={key} />)}
                      </div>
```

to:

```jsx
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {tags.map(tag => {
                          if (key !== "skills") return <TagChip key={tag} label={tag} category={key} />;
                          const e = (user.endorsements || []).find(x => x.skill === tag);
                          const count = e?.count || 0;
                          const mine = !!e?.endorsed_by_me;
                          return (
                            <button key={tag} onClick={() => doEndorse(tag)} style={{
                              display: "inline-flex", alignItems: "center", gap: 6,
                              background: mine ? "rgba(123,111,255,0.25)" : "rgba(123,111,255,0.12)",
                              color: "#7B6FFF", border: mine ? "1px solid #7B6FFF" : "1px solid transparent",
                              borderRadius: 99, padding: "4px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer",
                            }}>
                              {tag}{count > 0 && <span style={{ fontWeight: 800 }}>👍 {count}</span>}
                            </button>
                          );
                        })}
                      </div>
```

- [ ] **Step 4: Render `ProfileExtras` + vouches + vouch composer**

After the Analysis Tags block and before the empty-state block, insert:

```jsx
            <div style={{ marginTop: 18 }}>
              <ProfileExtras user={user} />
            </div>

            {/* Vouches */}
            <div style={{ marginTop: 20 }}>
              <div className="section-label">{t("trust.vouches")}</div>
              {(user.vouches || []).length === 0 ? (
                <div style={{ fontSize: 12, color: "var(--text-3)" }}>{t("trust.noVouches")}</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {user.vouches.map(v => (
                    <div key={v.id} style={{ background: "var(--surface-2)", border: "1px solid var(--border)",
                      borderLeft: "3px solid var(--accent)", borderRadius: "var(--radius-sm)", padding: "10px 12px" }}>
                      <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.6 }}>“{v.text}”</div>
                      <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>
                        — {v.author?.display_name || ""}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {!vouchOpen ? (
                <button onClick={() => setVouchOpen(true)} style={{
                  marginTop: 8, background: "var(--surface-2)", border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)", color: "var(--accent)", padding: "8px 12px",
                  fontSize: 13, fontWeight: 600, cursor: "pointer" }}>{t("trust.vouchBtn")}</button>
              ) : (
                <div style={{ marginTop: 8 }}>
                  <textarea value={vouchText} maxLength={280}
                    onChange={e => setVouchText(e.target.value)} placeholder={t("trust.vouchPh")}
                    rows={3} style={{ width: "100%", boxSizing: "border-box", background: "var(--surface-2)",
                      border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", color: "var(--text)",
                      padding: "10px 12px", fontSize: 13, resize: "vertical" }} />
                  <button onClick={submitVouch} disabled={vouchBusy || !vouchText.trim()} style={{
                    marginTop: 6, background: "var(--accent)", border: "none", borderRadius: "var(--radius-sm)",
                    color: "#fff", padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                    {t("trust.vouchPost")}
                  </button>
                </div>
              )}
            </div>
```

Also update the empty-state condition so it doesn't show when there are projects, endorsements, or vouches. Change:

```jsx
            {!user?.about && !hasAnyTags && (
```
to:
```jsx
            {!user?.about && !hasAnyTags && !(user?.founded_projects?.length || user?.member_projects?.length) && !(user?.vouches?.length) && (
```

- [ ] **Step 5: Build to verify**

Run: `npm run build`
Expected: success.

- [ ] **Step 6: Commit**

```bash
git add src/components/UserProfileModal.jsx
git commit -m "feat: skill endorse toggle + vouches + composer in profile modal"
```

---

## Task 15: RateSheet component

**Files:**
- Create: `src/components/RateSheet.jsx`

- [ ] **Step 1: Create the component**

Create `src/components/RateSheet.jsx`:

```jsx
import { useState, useEffect } from "react";
import { projects } from "../api";
import { useT } from "../i18n";
import { tgAlert } from "../tg";

const Stars = ({ value, onChange }) => (
  <div style={{ display: "flex", gap: 4 }}>
    {[1, 2, 3, 4, 5].map(n => (
      <button key={n} onClick={() => onChange(n)} style={{
        background: "none", border: "none", cursor: "pointer", padding: 0,
        fontSize: 22, color: n <= value ? "#FFB347" : "var(--surface-3)",
      }}>★</button>
    ))}
  </div>
);

export const RateSheet = ({ projectId, onClose }) => {
  const { t } = useT();
  const [cohort, setCohort] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState({}); // userId -> { stars, note }

  useEffect(() => {
    projects.rateable(projectId)
      .then(r => setCohort(r.cohort || []))
      .catch(e => tgAlert(e.message))
      .finally(() => setLoading(false));
  }, [projectId]);

  const setStars = (uid, stars) => setDraft(d => ({ ...d, [uid]: { ...d[uid], stars } }));
  const setNote = (uid, note) => setDraft(d => ({ ...d, [uid]: { ...d[uid], note } }));

  const submit = async (uid) => {
    const d = draft[uid];
    if (!d?.stars) return;
    try {
      await projects.rateMember(projectId, uid, d.stars, d.note || null);
      setCohort(c => c.map(p => p.id === uid ? { ...p, rated_by_me: true } : p));
      tgAlert(t("rate.done"));
    } catch (e) { tgAlert(e.message); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 320, display: "flex", flexDirection: "column" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }} />
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, maxWidth: 430, margin: "0 auto",
        background: "var(--surface)", borderRadius: "24px 24px 0 0", maxHeight: "88dvh",
        display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--border)" }}>
          <h2 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 800 }}>{t("rate.title")}</h2>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px 40px" }}>
          {loading ? (
            <div style={{ color: "var(--text-3)", fontSize: 13, textAlign: "center", padding: 20 }}>{t("common.loading")}</div>
          ) : cohort.length === 0 ? (
            <div style={{ color: "var(--text-3)", fontSize: 13, textAlign: "center", padding: 20 }}>—</div>
          ) : cohort.map(p => (
            <div key={p.id} style={{ background: "var(--surface-2)", border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)", padding: "12px 14px", marginBottom: 10, opacity: p.rated_by_me ? 0.6 : 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontWeight: 600, color: "var(--text)" }}>{p.display_name}</span>
                <Stars value={draft[p.id]?.stars || 0} onChange={s => setStars(p.id, s)} />
              </div>
              {!p.rated_by_me && (
                <>
                  <input value={draft[p.id]?.note || ""} onChange={e => setNote(p.id, e.target.value)}
                    placeholder={t("rate.note")} maxLength={200} style={{ width: "100%", boxSizing: "border-box",
                      background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
                      color: "var(--text)", padding: "8px 10px", fontSize: 13, marginBottom: 8 }} />
                  <button onClick={() => submit(p.id)} disabled={!draft[p.id]?.stars} style={{
                    background: "var(--accent)", border: "none", borderRadius: "var(--radius-sm)", color: "#fff",
                    padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>{t("rate.submit")}</button>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Build to verify**

Run: `npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/components/RateSheet.jsx
git commit -m "feat: RateSheet — rate cohort members after a project closes"
```

---

## Task 16: "Share public profile" button on own profile (Settings)

**Files:**
- Modify: `src/screens/SettingsScreen.jsx`

- [ ] **Step 1: Read the file to find the profile-card area**

Run: `sed -n '154,230p' src/screens/SettingsScreen.jsx`
The `SettingsScreen` component holds the `/users/me` response in a state variable named **`user`** (`const [user, setUser] = useState(null)`), renders the profile card with `user.display_name` etc., and already imports `users, storage` from `../api`, `useT` from `../i18n`, and `tgAlert` from `../tg`. No new imports are needed.

- [ ] **Step 2: Add the share handler + button**

In the profile card area (e.g. after the name/avatar block, near the `CompletenessMeter` / edit-profile affordance), add:

```jsx
        <button onClick={async () => {
          const url = users.publicUrl(user.id);
          try { await navigator.clipboard?.writeText(url); tgAlert(t("trust.copied")); }
          catch { tgAlert(url); }
        }} style={{
          marginTop: 10, width: "100%", background: "var(--surface-2)", border: "1px solid var(--border)",
          borderRadius: "var(--radius-sm)", color: "var(--accent)", padding: "10px 12px",
          fontSize: 13, fontWeight: 600, cursor: "pointer",
        }}>🔗 {t("trust.sharePublic")}</button>
```

(`user` is the `/users/me` response object already in scope on this screen.)

- [ ] **Step 3: Build to verify**

Run: `npm run build`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add src/screens/SettingsScreen.jsx
git commit -m "feat: share public profile (/u/{id}) from own profile"
```

---

## Task 17: Wire the rate_prompt notification to open the RateSheet

**Files:**
- Modify: `src/App.jsx` (or wherever notifications are rendered/handled)

- [ ] **Step 1: Find the notifications rendering**

Run: `git grep -n "notifications\|notification\|n.type\|n.project" src/App.jsx src/screens src/components | head -30`
Locate where inbox items render (the `type` switch that produces localized text and handles taps). Notification items now include `type: "rate_prompt"` with a `project` object.

- [ ] **Step 2: Render + handle the new type**

Wherever notification rows are rendered, add a `rate_prompt` branch:
- **Label:** use `t("rate.prompt")` (optionally append the project name from `n.project?.name`).
- **Tap:** open the RateSheet for `n.project.id`.

Add `RateSheet` state to the component that owns the notification list (e.g. in `App.jsx`'s `MiniApp` or the notifications screen):

```jsx
  const [rateProjectId, setRateProjectId] = useState(null);
```

In the notification tap handler, add:

```jsx
    if (n.type === "rate_prompt" && n.project?.id) {
      setRateProjectId(n.project.id);
      return;
    }
```

And render the sheet near the other modals:

```jsx
      {rateProjectId && (
        <RateSheet projectId={rateProjectId} onClose={() => setRateProjectId(null)} />
      )}
```

Import it at the top of that file:

```jsx
import { RateSheet } from "./components/RateSheet";
```

(If `App.jsx` imports from `./components/...`, match that relative path. Adjust the label-rendering switch to whatever helper the file uses to localize notification text — add a `case "rate_prompt": return t("rate.prompt");` alongside the existing `interest`/`mutual`/`accepted` cases.)

- [ ] **Step 3: Build to verify**

Run: `npm run build`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "feat: rate_prompt notification opens the RateSheet"
```

---

## Task 18: Full verification + push

- [ ] **Step 1: Full backend suite**

Run: `cd backend && python -m pytest -q`
Expected: all pass (existing + `test_trust.py` + `test_public_profile.py`).

- [ ] **Step 2: Frontend build**

Run: `npm run build`
Expected: success (landing prebuild + vite build).

- [ ] **Step 3: Push**

```bash
git push
```

- [ ] **Step 4: Verify on the deployed app**
  - Open another member's profile: endorse a skill (count appears, toggles off), write a vouch (appears), see mutual connections + rating badge if any.
  - Open `https://<host>/u/<your-id>` in a normal browser (not Telegram): confirm the page renders name, currently_building, stats, skills, projects, vouches, "Open in Telegram", and that link unfurls in a Telegram chat.
  - As a founder, close a project (toggle active off): confirm cohort members get a `rate_prompt` inbox item that opens the RateSheet; submit a rating and confirm it shows on the ratee's profile aggregate.

---

## Self-review notes

- **Spec coverage:**
  - Mutual connections ✓ T4 (`_connection_ids`, overlap, cap 8, self-empty) + T13 UI.
  - Skill endorsement (counts + toggle, skill-validated) ✓ T4 (counts/`endorsed_by_me`) + T6 (endpoint) + T14 (UI).
  - Vouching (upsert/delete, ≤280, self/empty reject) ✓ T4 (output) + T7 (endpoints) + T14 (UI).
  - Post-project rating (closed-only, cohort both-sides, upsert, aggregate, close trigger) ✓ T4 (aggregate) + T8 (endpoints + `rate_prompt` trigger) + T15 RateSheet + T17 wiring.
  - Public web profile `/u/{id}` (SSR, crawlable, OG/canonical/JSON-LD, reuses `_profile_extras`+`_trust_extras`) ✓ T9 + Vercel rewrite T10 + share button T16.
  - i18n en/uz/ru ✓ T12.
- **Reputation correctly DEFERRED:** no score computed/stored/shown; single `# REPUTATION SEAM:` marker in `_trust_extras` (T4). No reputation schema field, no column, no UI.
- **Reuses Batch A pattern:** `_trust_extras` mirrors `_profile_extras` (plain dict attached via `setattr` loop on the validated schema, both on `GET /users/{id}` and `/users/me`) — T5. The public page reuses both builders — T9.
- **Type/name consistency:**
  - `_trust_extras` returns keys exactly matching the schema fields set in T5: `endorsements`, `vouches`, `vouch_count`, `rating`, `mutual_connections`.
  - `EndorsementOut{skill,count,endorsed_by_me}` ↔ builder dict ↔ frontend `e.skill/e.count/e.endorsed_by_me` (T14).
  - `RatingOut{average,count}` ↔ builder `{"average","count"}` ↔ `ProfileExtras`/public page.
  - `MutualConnections{count,preview:[UserMini]}` ↔ builder ↔ `ProfileExtras` (`m.id/m.display_name`).
  - `UserMini{id,display_name,photo_url}` used for vouch authors + mutual previews; populated from `u.display_name`/`u.photo_url` (User properties confirmed to exist).
  - Request bodies `EndorseIn{skill}`, `VouchIn{text}`, `RatingIn{ratee_id,stars,note}` ↔ api.js call payloads (T11) ↔ endpoint signatures (T6/T7/T8).
  - `rate_prompt` notification type produced in T8, consumed in T17; `Notification` already carries `type`+`project_id`+`actor_id` (no model change).
- **Idempotency/migrations:** tables via `create_all`; all index migrations are `IF NOT EXISTS` (T2). No new columns on existing tables.
- **Auth/abuse:** all write endpoints are auth'd (`get_current_user`); endorse/vouch/rating reject self; endorse is skill-validated against live analysis; vouch + rating are upserts guarded by unique constraints (no row blow-up under double-tap). The public page is unauthenticated by design (read-only, public data only — same as existing `/public/*`).
- **No placeholders:** every step contains complete code. The one externally-variable value is the backend host in the Vercel rewrite (T10), with an explicit instruction to confirm it from the repo's existing API host — flagged, not left as a silent TODO.
