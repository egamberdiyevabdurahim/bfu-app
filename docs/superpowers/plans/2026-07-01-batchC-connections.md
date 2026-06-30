# Connection Features (Batch C) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add ongoing-relationship features on top of A (profile) + B (trust):
follow users & projects, a founder-posted project updates feed, an optional role
on applications, and a FULL in-app mentor-mode + slot-booking flow.

**Architecture:** Four new tables — `follows` (polymorphic user|project),
`project_updates`, `mentor_slots`, `bookings` — plus three nullable mentor columns
on `users` and one nullable `role` column on `project_applications`. Follower
counts + `is_following` + the mentor sub-object are derived live by a single
`_connection_extras(db, user, viewer)` helper, attached to `GET /users/{id}` and
`/users/me` exactly like Batch A's `_profile_extras` / Batch B's `_trust_extras`.
A new `app/routers/mentors.py` owns the mentor/slot/booking endpoints; follow +
project-updates live in `users.py` / `projects.py`. All notifications reuse the
existing `Notification` table via `add_notification`, and the frontend
`InboxModal` learns five new types.

**Tech Stack:** FastAPI + SQLAlchemy 2 async + Postgres (backend), React 19 + Vite
(frontend), pytest (tests). Migrations are idempotent `CREATE INDEX ... IF NOT
EXISTS` / `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` run in `app/main.py` lifespan
(no Alembic); tables themselves are created by `Base.metadata.create_all`.

**Spec:** `docs/superpowers/specs/2026-07-01-batchC-connections-design.md`

**Depends on:** Batch A (`_profile_extras`, `_sanitize_portfolio`,
`_validate_from_user`, `_PROFILE_EXTRAS_FIELDS` in `app/routers/users.py`) and
Batch B (the trust models + `_trust_extras` wiring on the profile endpoints). The
chosen mentor-availability model is **an explicit list of open slots** (concrete
`mentor_slots.start_at` rows), not recurring rules — simpler and more robust (no
recurrence expansion, no DST math, every slot is a real bookable row).

---

## File structure

- `backend/app/models/connection.py` — new: `Follow`, `ProjectUpdate`, `MentorSlot`, `Booking`
- `backend/app/models/user.py` — add `is_mentor`, `mentor_bio`, `mentor_topics` columns
- `backend/app/models/project.py` — add `role` column to `ProjectApplication`
- `backend/app/models/__init__.py` — import the new models
- `backend/app/main.py` — idempotent column + index migrations
- `backend/app/schemas/connection.py` — new: request bodies + outputs
- `backend/app/schemas/user.py` — `MentorOut` + new fields on `UserPublic`/`UserResponse`; `is_mentor/mentor_bio/mentor_topics` on `UserUpdate`
- `backend/app/schemas/project.py` — `follower_count`/`is_following` on `ProjectResponse`; `role` on `ApplicationOut` + applicant rows; `updates` outputs
- `backend/app/routers/users.py` — `_connection_extras`, follow endpoints, `/me/following`, mentor-profile write via `PATCH /me`
- `backend/app/routers/projects.py` — project-follow counts, role on apply, project-updates endpoints
- `backend/app/routers/mentors.py` — new router: mentors list, slots, bookings
- `backend/app/main.py` — include the mentors router
- `backend/tests/test_follow.py` — new
- `backend/tests/test_project_updates.py` — new
- `backend/tests/test_role_apply.py` — new
- `backend/tests/test_mentors.py` — new
- `src/api.js` — follow / updates / mentor / booking client methods
- `src/i18n.jsx` — new keys (en/uz/ru)
- `src/components/FollowButton.jsx` — new shared follow toggle
- `src/components/UserProfileModal.jsx` — follow toggle + mentor card + book button
- `src/components/ProjectDetail.jsx` — follow toggle + Updates section + role-on-apply
- `src/components/MentorSheets.jsx` — new: `BookSlotSheet`, `MentorSlotsSheet`, `BookingsSheet`
- `src/screens/MentorsScreen.jsx` — new mentors browse screen
- `src/screens/SettingsScreen.jsx` — mentor toggle entry + My slots / My bookings entries
- `src/screens/EditProfileScreen.jsx` — mentor bio + topics fields
- `src/components/InboxModal.jsx` — render the five new notification types

---

## Task 1: Connection models + user/application columns

**Files:**
- Create: `backend/app/models/connection.py`
- Modify: `backend/app/models/user.py`, `backend/app/models/project.py`, `backend/app/models/__init__.py`

- [ ] **Step 1: Create the connection models**

Create `backend/app/models/connection.py`:

```python
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Follow(Base):
    """One member follows a user OR a project (polymorphic). One-directional;
    no reciprocation needed (unlike Interest)."""
    __tablename__ = "follows"
    __table_args__ = (
        UniqueConstraint("follower_id", "target_type", "target_id",
                         name="uq_follow_follower_target"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    follower_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    target_type: Mapped[str] = mapped_column(String(16))   # "user" | "project"
    target_id: Mapped[int] = mapped_column(BigInteger)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class ProjectUpdate(Base):
    """A short founder-posted update on a project. Fans out to followers+members."""
    __tablename__ = "project_updates"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    author_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"))
    text: Mapped[str] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class MentorSlot(Base):
    """A concrete bookable 15-minute slot a mentor publishes. Explicit rows
    (not recurring rules) — every slot is directly bookable."""
    __tablename__ = "mentor_slots"
    __table_args__ = (
        UniqueConstraint("mentor_id", "start_at", name="uq_slot_mentor_start"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    mentor_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    start_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    duration_min: Mapped[int] = mapped_column(Integer, default=15)
    status: Mapped[str] = mapped_column(String(12), default="open")  # open | booked | cancelled
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Booking(Base):
    """A mentee's booking of a mentor slot. Lifecycle: requested → confirmed |
    declined | cancelled. Declining/cancelling frees the slot back to open."""
    __tablename__ = "bookings"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    slot_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("mentor_slots.id", ondelete="CASCADE"), index=True)
    mentor_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    mentee_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    status: Mapped[str] = mapped_column(String(12), default="requested")  # requested|confirmed|declined|cancelled
    note: Mapped[str | None] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
```

- [ ] **Step 2: Add the mentor columns to `User`**

In `backend/app/models/user.py`, after the `portfolio_links` column (~line 46),
add:

```python
    # Batch C — mentor mode. is_mentor gates the mentor surfaces; topics is a
    # JSON array of short strings (sanitized on write, like portfolio_links).
    is_mentor: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    mentor_bio: Mapped[str | None] = mapped_column(Text, nullable=True)
    mentor_topics: Mapped[str | None] = mapped_column(Text, nullable=True)
```

(`Boolean` and `Text` are already imported in `user.py`.)

- [ ] **Step 3: Add `role` to `ProjectApplication`**

In `backend/app/models/project.py`, in the `ProjectApplication` class, after the
`status` column (~line 92), add:

```python
    role: Mapped[str | None] = mapped_column(String(80), nullable=True)
```

(`String` is already imported in `project.py`.)

- [ ] **Step 4: Register the new models on Base.metadata**

In `backend/app/models/__init__.py`, add the import (after the project import
line) and extend `__all__`:

```python
from app.models.connection import Follow, ProjectUpdate, MentorSlot, Booking
```

Add to `__all__`: `"Follow", "ProjectUpdate", "MentorSlot", "Booking",`.

- [ ] **Step 5: Verify it imports**

Run: `cd backend && python -c "import app.models; from app.models.connection import Follow, ProjectUpdate, MentorSlot, Booking; from app.models.user import User; from app.models.project import ProjectApplication; assert hasattr(User,'is_mentor') and hasattr(ProjectApplication,'role'); print('ok')"`
Expected: `ok`.

- [ ] **Step 6: Commit**

```bash
git add backend/app/models/connection.py backend/app/models/user.py backend/app/models/project.py backend/app/models/__init__.py
git commit -m "model: connection tables (follows, project_updates, mentor_slots, bookings) + mentor/role columns"
```

---

## Task 2: Idempotent column + index migrations

**Files:**
- Modify: `backend/app/main.py` (the `migrations` list)

The four new tables are created by `create_all`. The three `users` columns and the
`project_applications.role` column must be added on the already-live Postgres DB
via idempotent `ADD COLUMN IF NOT EXISTS`. We also add `CREATE INDEX IF NOT
EXISTS` for hot lookups; all are idempotent.

- [ ] **Step 1: Add migration statements**

In `backend/app/main.py`, inside the `migrations = [...]` list, after the Batch-B
trust-index block (the line ending `...ON project_ratings (project_id, rater_id,
ratee_id);`), add:

```python
        # --- Batch C: connection columns + indexes (tables via create_all) ---
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_mentor BOOLEAN DEFAULT false;",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS mentor_bio TEXT;",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS mentor_topics TEXT;",
        "ALTER TABLE project_applications ADD COLUMN IF NOT EXISTS role VARCHAR(80);",
        "CREATE INDEX IF NOT EXISTS ix_follows_follower ON follows (follower_id);",
        "CREATE INDEX IF NOT EXISTS ix_follows_target ON follows (target_type, target_id);",
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_follow_follower_target "
        "ON follows (follower_id, target_type, target_id);",
        "CREATE INDEX IF NOT EXISTS ix_project_updates_project ON project_updates (project_id);",
        "CREATE INDEX IF NOT EXISTS ix_mentor_slots_mentor ON mentor_slots (mentor_id);",
        "CREATE INDEX IF NOT EXISTS ix_mentor_slots_start ON mentor_slots (start_at);",
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_slot_mentor_start "
        "ON mentor_slots (mentor_id, start_at);",
        "CREATE INDEX IF NOT EXISTS ix_bookings_mentor ON bookings (mentor_id);",
        "CREATE INDEX IF NOT EXISTS ix_bookings_mentee ON bookings (mentee_id);",
        "CREATE INDEX IF NOT EXISTS ix_bookings_slot ON bookings (slot_id);",
        "CREATE INDEX IF NOT EXISTS ix_users_is_mentor ON users (is_mentor);",
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/main.py
git commit -m "migrate: Batch C connection columns + indexes"
```

---

## Task 3: Schemas — connection request bodies + outputs + profile/project fields

**Files:**
- Create: `backend/app/schemas/connection.py`
- Modify: `backend/app/schemas/user.py`, `backend/app/schemas/project.py`

- [ ] **Step 1: Create the request/output schema file**

Create `backend/app/schemas/connection.py`:

```python
from datetime import datetime

from pydantic import BaseModel

from app.schemas.user import UserMini


class FollowIn(BaseModel):
    target_type: str   # "user" | "project"
    target_id: int


class ProjectUpdateIn(BaseModel):
    text: str


class ProjectUpdateOut(BaseModel):
    id: int
    text: str
    author: UserMini | None = None
    created_at: datetime | None = None


class SlotIn(BaseModel):
    start_at: datetime


class SlotOut(BaseModel):
    id: int
    start_at: datetime
    status: str
    duration_min: int = 15


class BookingIn(BaseModel):
    slot_id: int
    note: str | None = None


class BookingActionIn(BaseModel):
    action: str   # confirm | decline | cancel


class BookingOut(BaseModel):
    id: int
    slot_id: int
    status: str
    note: str | None = None
    start_at: datetime | None = None
    other: UserMini | None = None       # the other party (mentor for mentee view, vice-versa)
    created_at: datetime | None = None


class MentorCard(BaseModel):
    id: int
    display_name: str
    photo_url: str | None = None
    bio: str | None = None
    topics: list[str] = []
    open_slots: int = 0
```

(`UserMini` already exists in `app/schemas/user.py` from Batch B.)

- [ ] **Step 2: Add `MentorOut` + new fields to `user.py`**

In `backend/app/schemas/user.py`, after the `MutualConnections` class (Batch B,
~line 68), add:

```python
class MentorOut(BaseModel):
    is_mentor: bool = False
    bio: str | None = None
    topics: list[str] = []
```

Add these fields to **both** `UserPublic` and `UserResponse` (after the Batch-B
trust fields, before `model_config`):

```python
    follower_count: int = 0
    following_count: int = 0
    is_following: bool = False
    mentor: MentorOut = MentorOut()
```

And add the mentor write fields to `UserUpdate` (after `portfolio_links`):

```python
    is_mentor: bool | None = None
    mentor_bio: str | None = None
    mentor_topics: list[str] | None = None
```

- [ ] **Step 3: Register the new extras fields with `_validate_from_user`**

The profile endpoints validate the ORM `User` then overwrite extras. `mentor` is
computed by `_connection_extras` (not a raw ORM attr of the right shape), and
`mentor_topics` is TEXT on the ORM but a list in the schema's write model only —
the read schema has no `mentor_topics`, so only `mentor` needs guarding. The
follower counts default to 0 and are overwritten. We add `mentor` to the
extras-skip set in Task 5 (Step 3) where `_PROFILE_EXTRAS_FIELDS` lives; no schema
change needed here.

- [ ] **Step 4: Add `role` + follower fields + updates to `project.py`**

In `backend/app/schemas/project.py`:

Add to `ApplicantPublic` (after `open_to_volunteering`) — note this model is also
used elsewhere, so the field is optional:

(no change to `ApplicantPublic`; role lives on the application, see below.)

Add to `ApplicationOut` (after `status`):

```python
    role: str | None = None
```

Add to `ProjectResponse` (after `member_count`, before `created_at`):

```python
    follower_count: int = 0
    is_following: bool = False
```

- [ ] **Step 5: Verify imports compile**

Run: `cd backend && python -c "import app.schemas.user, app.schemas.project, app.schemas.connection; print('ok')"`
Expected: `ok`.

- [ ] **Step 6: Commit**

```bash
git add backend/app/schemas/connection.py backend/app/schemas/user.py backend/app/schemas/project.py
git commit -m "schema: connection outputs (follow/mentor/booking/update) + profile/project fields"
```

---

## Task 4: `_connection_extras` builder (TDD)

**Files:**
- Modify: `backend/app/routers/users.py`
- Test: `backend/tests/test_follow.py` (new)

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_follow.py`:

```python
"""Batch C follow: follows table, counts, is_following, mentor sub-object."""
import pytest

pytestmark = pytest.mark.asyncio


async def _set_mentor(db, user, *, bio="Bio", topics=None):
    import json
    user.is_mentor = True
    user.mentor_bio = bio
    user.mentor_topics = json.dumps(topics if topics is not None else ["Startups"])
    await db.commit()


async def test_connection_extras_counts_and_following(make_user, db):
    from app.routers.users import _connection_extras
    from app.models.connection import Follow

    target = await make_user(name="Target")
    f1 = await make_user(name="F1")
    f2 = await make_user(name="F2")
    db.add(Follow(follower_id=f1.id, target_type="user", target_id=target.id))
    db.add(Follow(follower_id=f2.id, target_type="user", target_id=target.id))
    # target follows one project + one user.
    db.add(Follow(follower_id=target.id, target_type="project", target_id=999))
    db.add(Follow(follower_id=target.id, target_type="user", target_id=f1.id))
    await db.commit()

    # Viewed by f1 → is_following True (f1 follows target).
    seen = await _connection_extras(db, target, f1)
    assert seen["follower_count"] == 2
    assert seen["following_count"] == 2
    assert seen["is_following"] is True

    stranger = await make_user(name="S")
    seen_s = await _connection_extras(db, target, stranger)
    assert seen_s["is_following"] is False


async def test_connection_extras_self_not_following(make_user, db):
    from app.routers.users import _connection_extras
    me = await make_user(name="Me")
    extras = await _connection_extras(db, me, me)
    assert extras["is_following"] is False
    assert extras["follower_count"] == 0


async def test_connection_extras_mentor_object(make_user, db):
    from app.routers.users import _connection_extras
    m = await make_user(name="Mentor")
    await _set_mentor(db, m, bio="10 yrs fintech", topics=["Startups", "Fundraising"])
    extras = await _connection_extras(db, m, None)
    assert extras["mentor"]["is_mentor"] is True
    assert extras["mentor"]["bio"] == "10 yrs fintech"
    assert extras["mentor"]["topics"] == ["Startups", "Fundraising"]


async def test_connection_extras_non_mentor_default(make_user, db):
    from app.routers.users import _connection_extras
    u = await make_user(name="U")
    extras = await _connection_extras(db, u, None)
    assert extras["mentor"] == {"is_mentor": False, "bio": None, "topics": []}
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && python -m pytest tests/test_follow.py -k connection_extras -v`
Expected: FAIL — `cannot import name '_connection_extras'`.

- [ ] **Step 3: Implement the helper**

In `backend/app/routers/users.py`, add the connection-model import near the other
model imports (after `from app.models.project import ...`):

```python
from app.models.connection import Follow
```

Add this helper right after `_profile_extras`:

```python
def _mentor_dict(user: User) -> dict:
    """The mentor sub-object derived from the user's columns."""
    topics = []
    if user.mentor_topics:
        try:
            topics = [str(t).strip() for t in json.loads(user.mentor_topics) if str(t).strip()]
        except Exception:
            topics = []
    return {
        "is_mentor": bool(user.is_mentor),
        "bio": (user.mentor_bio or None) if user.is_mentor else None,
        "topics": topics if user.is_mentor else [],
    }


async def _connection_extras(db: AsyncSession, user: User, viewer: User | None) -> dict:
    """Follow counts + viewer's is_following + the mentor sub-object for `user`."""
    follower_count = await db.scalar(
        select(func.count(Follow.id)).where(
            Follow.target_type == "user", Follow.target_id == user.id
        )
    ) or 0
    following_count = await db.scalar(
        select(func.count(Follow.id)).where(Follow.follower_id == user.id)
    ) or 0
    is_following = False
    if viewer is not None and viewer.id != user.id:
        is_following = bool(await db.scalar(
            select(func.count(Follow.id)).where(
                Follow.follower_id == viewer.id,
                Follow.target_type == "user",
                Follow.target_id == user.id,
            )
        ))
    return {
        "follower_count": int(follower_count),
        "following_count": int(following_count),
        "is_following": is_following,
        "mentor": _mentor_dict(user),
    }
```

`json` is already imported at the top of `users.py`. `func`, `select`,
`AsyncSession`, `User` are already imported.

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && python -m pytest tests/test_follow.py -k connection_extras -v`
Expected: all passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/routers/users.py backend/tests/test_follow.py
git commit -m "feat: _connection_extras builder (follow counts + is_following + mentor)"
```

---

## Task 5: Attach `_connection_extras` to the profile endpoints (TDD)

**Files:**
- Modify: `backend/app/routers/users.py` (`_PROFILE_EXTRAS_FIELDS`, `get_user_profile`, `get_me`)
- Test: `backend/tests/test_follow.py`

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_follow.py`:

```python
async def test_get_user_profile_includes_connection(make_user, as_user, db):
    from app.models.connection import Follow
    target = await make_user(name="Target")
    viewer = await make_user(name="Viewer")
    db.add(Follow(follower_id=viewer.id, target_type="user", target_id=target.id))
    await db.commit()

    c = as_user(viewer)
    res = await c.get(f"/users/{target.id}")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["follower_count"] == 1
    assert body["is_following"] is True
    assert body["mentor"] == {"is_mentor": False, "bio": None, "topics": []}


async def test_get_me_includes_connection(make_user, as_user, db):
    me = await make_user(name="Me")
    c = as_user(me)
    res = await c.get("/users/me")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["follower_count"] == 0
    assert body["is_following"] is False
    assert "mentor" in body
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && python -m pytest tests/test_follow.py -k "includes_connection" -v`
Expected: FAIL — fields are schema defaults (follower_count 0 but mentor default
already matches; the `is_following True` assertion fails until wired).

- [ ] **Step 3: Guard `mentor` against from_attributes**

In `backend/app/routers/users.py`, add `"mentor"` to the `_PROFILE_EXTRAS_FIELDS`
set so the base `model_validate` doesn't try to read a `mentor` attr off the ORM
`User`:

```python
_PROFILE_EXTRAS_FIELDS = {
    "currently_building", "currently_building_source", "portfolio_links",
    "founded_projects", "member_projects", "stats",
    "mentor",
}
```

(The Batch-B trust fields like `endorsements`/`rating`/`mutual_connections` are
plain schema defaults — they don't share a name with a mismatched ORM attr, so
they don't need to be in this set; `mentor` does, because `User.mentor` would be
an attribute-miss otherwise. `follower_count`/`following_count`/`is_following` are
ints/bools with safe defaults and no ORM attr, so they're fine.)

- [ ] **Step 4: Wire into `get_user_profile`**

In `get_user_profile`, after the existing Batch-A/B extras loop and before
`return out`, add (right after the `_trust_extras` block if present, else after
the `_profile_extras` loop):

```python
    conn = await _connection_extras(db, user, current_user)
    for k, v in conn.items():
        setattr(out, k, v)
```

- [ ] **Step 5: Wire into `get_me`**

In `get_me`, after the existing extras loop(s) and before `return out`, add:

```python
    conn = await _connection_extras(db, current_user, current_user)
    for k, v in conn.items():
        setattr(out, k, v)
```

- [ ] **Step 6: Run to verify it passes**

Run: `cd backend && python -m pytest tests/test_follow.py -v`
Expected: all passed.

- [ ] **Step 7: Commit**

```bash
git add backend/app/routers/users.py backend/tests/test_follow.py
git commit -m "feat: attach connection extras to GET /users/{id} and /users/me"
```

---

## Task 6: Follow / unfollow endpoints + `/me/following` (TDD)

**Files:**
- Modify: `backend/app/routers/users.py`
- Test: `backend/tests/test_follow.py`

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_follow.py`:

```python
async def _mk_project(db, creator_id, name, *, is_active=True, is_draft=False, is_deleted=False):
    from app.models.project import Project
    p = Project(type="startup", creator_id=creator_id, name=name, is_active=is_active,
                is_draft=is_draft, is_deleted=is_deleted, is_approved=True)
    db.add(p)
    await db.commit()
    await db.refresh(p)
    return p


async def test_follow_user_toggle_and_notify(make_user, as_user, db):
    from app.models.user import Notification
    from app.models.connection import Follow
    target = await make_user(name="Target")
    me = await make_user(name="Me")
    c = as_user(me)

    r1 = await c.post("/follow", json={"target_type": "user", "target_id": target.id})
    assert r1.status_code == 200, r1.text
    assert r1.json() == {"ok": True, "following": True, "follower_count": 1}
    # Re-follow is idempotent (one row).
    r2 = await c.post("/follow", json={"target_type": "user", "target_id": target.id})
    assert r2.json()["following"] is True
    rows = (await db.execute(
        Follow.__table__.select().where(Follow.target_id == target.id)
    )).all()
    assert len(rows) == 1
    # Target got exactly one new_follower notification.
    notes = (await db.execute(
        Notification.__table__.select().where(Notification.type == "new_follower")
    )).all()
    assert len([n for n in notes if n.user_id == target.id]) == 1
    # Unfollow.
    r3 = await c.delete("/follow", json={"target_type": "user", "target_id": target.id})
    assert r3.status_code == 204
    gone = (await db.execute(
        Follow.__table__.select().where(Follow.target_id == target.id)
    )).all()
    assert gone == []


async def test_follow_project_no_notify(make_user, as_user, db):
    from app.models.user import Notification
    founder = await make_user(name="Founder")
    me = await make_user(name="Me")
    p = await _mk_project(db, founder.id, "Proj")
    c = as_user(me)
    r = await c.post("/follow", json={"target_type": "project", "target_id": p.id})
    assert r.status_code == 200, r.text
    assert r.json()["following"] is True
    notes = (await db.execute(
        Notification.__table__.select().where(Notification.type == "new_follower")
    )).all()
    assert notes == []   # project-follow never notifies


async def test_follow_self_and_missing(make_user, as_user, db):
    me = await make_user(name="Me")
    c = as_user(me)
    assert (await c.post("/follow", json={"target_type": "user", "target_id": me.id})).status_code == 400
    assert (await c.post("/follow", json={"target_type": "user", "target_id": 999999})).status_code == 404
    assert (await c.post("/follow", json={"target_type": "project", "target_id": 999999})).status_code == 404
    assert (await c.post("/follow", json={"target_type": "x", "target_id": 1})).status_code == 422


async def test_unfollow_idempotent(make_user, as_user, db):
    me = await make_user(name="Me")
    other = await make_user(name="Other")
    c = as_user(me)
    # Deleting a non-existent follow is a no-op 204.
    assert (await c.delete("/follow", json={"target_type": "user", "target_id": other.id})).status_code == 204


async def test_my_following_lists_both(make_user, as_user, db):
    founder = await make_user(name="Founder")
    u = await make_user(name="U")
    me = await make_user(name="Me")
    p = await _mk_project(db, founder.id, "Proj")
    c = as_user(me)
    await c.post("/follow", json={"target_type": "user", "target_id": u.id})
    await c.post("/follow", json={"target_type": "project", "target_id": p.id})
    res = await c.get("/users/me/following")
    assert res.status_code == 200, res.text
    body = res.json()
    assert {x["id"] for x in body["users"]} == {u.id}
    assert {x["id"] for x in body["projects"]} == {p.id}
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && python -m pytest tests/test_follow.py -k "follow or following" -v`
Expected: FAIL — routes missing (404/405).

- [ ] **Step 3: Implement the endpoints**

The follow endpoints are not under the `/users` prefix, so add a small router-less
set on the same `users` router using an absolute path is not possible (the router
has `prefix="/users"`). Instead, register them in `app/main.py` via a dedicated
include, OR mount them on the existing router with the prefix. To keep it simple
and consistent with `/projects/...`, put `/follow` + `/me/following` handlers in
`users.py` but expose `/follow` at the app root by adding a **second** small
router. Add at the top of `backend/app/routers/users.py`, after the existing
`router = APIRouter(prefix="/users", tags=["users"])` line (find it; it's the
module router), add a second router:

```python
follow_router = APIRouter(tags=["follow"])
```

Add the import for the request body near the top:

```python
from app.schemas.connection import FollowIn
```

Add the handlers (place them after `soft_interest`):

```python
@follow_router.post("/follow", response_model=dict)
async def follow(
    body: FollowIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Follow a user or a project (idempotent). Following a user notifies them;
    following a project does not (would spam the founder)."""
    if body.target_type not in ("user", "project"):
        raise HTTPException(status_code=422, detail="target_type must be 'user' or 'project'")

    if body.target_type == "user":
        if body.target_id == current_user.id:
            raise HTTPException(status_code=400, detail="Cannot follow yourself")
        target = await db.get(User, body.target_id)
        if not target or target.is_deleted or not target.is_registered:
            raise HTTPException(status_code=404, detail="User not found")
    else:
        from app.models.project import Project
        proj = await db.get(Project, body.target_id)
        if not proj or proj.is_deleted or proj.is_draft:
            raise HTTPException(status_code=404, detail="Project not found")

    existing = (await db.execute(
        select(Follow).where(
            Follow.follower_id == current_user.id,
            Follow.target_type == body.target_type,
            Follow.target_id == body.target_id,
        )
    )).scalar_one_or_none()
    if not existing:
        db.add(Follow(follower_id=current_user.id, target_type=body.target_type,
                      target_id=body.target_id))
        if body.target_type == "user":
            add_notification(db, body.target_id, "new_follower", actor_id=current_user.id)
        try:
            await db.commit()
        except Exception:
            # Concurrent double-follow raced past the check; unique index caught
            # it. Same idempotent outcome.
            await db.rollback()

    count = await db.scalar(
        select(func.count(Follow.id)).where(
            Follow.target_type == body.target_type, Follow.target_id == body.target_id
        )
    ) or 0
    return {"ok": True, "following": True, "follower_count": int(count)}


@follow_router.delete("/follow", status_code=204)
async def unfollow(
    body: FollowIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove a follow (idempotent — 204 even if not following)."""
    from sqlalchemy import delete as _delete
    await db.execute(
        _delete(Follow).where(
            Follow.follower_id == current_user.id,
            Follow.target_type == body.target_type,
            Follow.target_id == body.target_id,
        )
    )
    await db.commit()
```

Add `/users/me/following` on the existing `users` router (place near
`my_connections`):

```python
@router.get("/me/following", response_model=dict)
async def my_following(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Who/what the caller follows: user previews + project previews."""
    rows = (await db.execute(
        select(Follow).where(Follow.follower_id == current_user.id)
    )).scalars().all()
    user_ids = [r.target_id for r in rows if r.target_type == "user"]
    proj_ids = [r.target_id for r in rows if r.target_type == "project"]

    users_out = []
    if user_ids:
        people = (await db.execute(
            select(User).where(User.id.in_(user_ids),
                               User.is_deleted == False, User.is_registered == True)
        )).scalars().all()
        users_out = [{"id": u.id, "display_name": u.display_name, "photo_url": u.photo_url}
                     for u in people]
    projects_out = []
    if proj_ids:
        from app.models.project import Project
        projs = (await db.execute(
            select(Project).where(Project.id.in_(proj_ids), Project.is_deleted == False)
        )).scalars().all()
        projects_out = [{"id": p.id, "name": p.name, "type": p.type} for p in projs]
    return {"users": users_out, "projects": projects_out}
```

- [ ] **Step 4: Register `follow_router` in `main.py`**

In `backend/app/main.py`, where the routers are included, after
`app.include_router(users.router)`, add:

```python
app.include_router(users.follow_router)
```

- [ ] **Step 5: Run to verify it passes**

Run: `cd backend && python -m pytest tests/test_follow.py -v`
Expected: all passed.

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/users.py backend/app/main.py backend/tests/test_follow.py
git commit -m "feat: POST/DELETE /follow (user|project) + GET /users/me/following"
```

---

## Task 7: Project follower count + is_following on `GET /projects/{id}` (TDD)

**Files:**
- Modify: `backend/app/routers/projects.py`
- Test: `backend/tests/test_follow.py`

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_follow.py`:

```python
async def test_project_response_follow_fields(make_user, as_user, db):
    founder = await make_user(name="Founder")
    me = await make_user(name="Me")
    p = await _mk_project(db, founder.id, "Proj")
    c = as_user(me)
    await c.post("/follow", json={"target_type": "project", "target_id": p.id})
    res = await c.get(f"/projects/{p.id}")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["follower_count"] == 1
    assert body["is_following"] is True
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && python -m pytest tests/test_follow.py -k project_response_follow -v`
Expected: FAIL — both fields are schema defaults (0 / false).

- [ ] **Step 3: Compute the fields in `get_project`**

In `backend/app/routers/projects.py`, add the import near the top (after the
`from app.models.user import ...` line):

```python
from app.models.connection import Follow
```

In `get_project` (the `@router.get("/{project_id}")` handler), after the `fav_set`
is built and before `return _project_response(...)`, compute the follow data and
set it on the response:

```python
    follower_count = await db.scalar(
        select(func.count(Follow.id)).where(
            Follow.target_type == "project", Follow.target_id == project.id
        )
    ) or 0
    is_following = bool(await db.scalar(
        select(func.count(Follow.id)).where(
            Follow.follower_id == current_user.id,
            Follow.target_type == "project",
            Follow.target_id == project.id,
        )
    ))
    resp = _project_response(project, current_user, fav_set)
    resp.follower_count = int(follower_count)
    resp.is_following = is_following
    return resp
```

(Replace the existing `return _project_response(project, current_user, fav_set)`
line with the block above. List endpoints keep the schema defaults — follow
data is a detail-view concern.)

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && python -m pytest tests/test_follow.py -k project_response_follow -v`
Expected: passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/routers/projects.py backend/tests/test_follow.py
git commit -m "feat: follower_count + is_following on GET /projects/{id}"
```

---

## Task 8: Project updates feed (TDD)

**Files:**
- Modify: `backend/app/routers/projects.py`
- Test: `backend/tests/test_project_updates.py` (new)

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_project_updates.py`:

```python
"""Batch C project updates feed: founder posts, fan-out, read, delete."""
import pytest

pytestmark = pytest.mark.asyncio


async def _mk_project(db, creator_id, name):
    from app.models.project import Project, ProjectMember
    p = Project(type="startup", creator_id=creator_id, name=name, is_active=True,
                is_draft=False, is_deleted=False, is_approved=True)
    db.add(p)
    await db.commit()
    await db.refresh(p)
    db.add(ProjectMember(project_id=p.id, user_id=creator_id))
    await db.commit()
    return p


async def test_post_update_fans_out(make_user, as_user, db):
    from app.models.user import Notification
    from app.models.connection import Follow
    from app.models.project import ProjectMember

    founder = await make_user(name="Founder")
    member = await make_user(name="Member")
    follower = await make_user(name="Follower")
    p = await _mk_project(db, founder.id, "Proj")
    db.add(ProjectMember(project_id=p.id, user_id=member.id))
    db.add(Follow(follower_id=follower.id, target_type="project", target_id=p.id))
    await db.commit()

    c = as_user(founder)
    r = await c.post(f"/projects/{p.id}/updates", json={"text": "  We shipped v1!  "})
    assert r.status_code == 200, r.text
    notes = (await db.execute(
        Notification.__table__.select().where(Notification.type == "project_update")
    )).all()
    recipients = {n.user_id for n in notes}
    # member + follower get it; founder (author) does not.
    assert member.id in recipients and follower.id in recipients
    assert founder.id not in recipients


async def test_post_update_founder_only(make_user, as_user, db):
    founder = await make_user(name="Founder")
    other = await make_user(name="Other")
    p = await _mk_project(db, founder.id, "Proj")
    c = as_user(other)
    assert (await c.post(f"/projects/{p.id}/updates", json={"text": "hi"})).status_code == 403


async def test_post_update_empty_rejected(make_user, as_user, db):
    founder = await make_user(name="Founder")
    p = await _mk_project(db, founder.id, "Proj")
    c = as_user(founder)
    assert (await c.post(f"/projects/{p.id}/updates", json={"text": "   "})).status_code == 400


async def test_get_and_delete_updates(make_user, as_user, db):
    founder = await make_user(name="Founder")
    reader = await make_user(name="Reader")
    p = await _mk_project(db, founder.id, "Proj")
    cf = as_user(founder)
    await cf.post(f"/projects/{p.id}/updates", json={"text": "first"})
    r = await cf.post(f"/projects/{p.id}/updates", json={"text": "second"})
    uid = r.json()["id"]

    cr = as_user(reader)
    res = await cr.get(f"/projects/{p.id}/updates")
    assert res.status_code == 200, res.text
    ups = res.json()["updates"]
    assert [u["text"] for u in ups] == ["second", "first"]   # newest first
    assert ups[0]["author"]["id"] == founder.id

    # Non-author can't delete.
    assert (await cr.delete(f"/projects/{p.id}/updates/{uid}")).status_code == 403
    # Author can.
    assert (await cf.delete(f"/projects/{p.id}/updates/{uid}")).status_code == 204
    # Deleting again → 404.
    assert (await cf.delete(f"/projects/{p.id}/updates/{uid}")).status_code == 404
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && python -m pytest tests/test_project_updates.py -v`
Expected: FAIL — routes missing.

- [ ] **Step 3: Implement the endpoints**

In `backend/app/routers/projects.py`, add imports near the top:

```python
from app.models.connection import ProjectUpdate
from app.models.user import Notification
from app.schemas.connection import ProjectUpdateIn
```

(`Follow` is already imported from Task 7; `add_notification` is imported lazily in
this file via `from app.services.notifications import add_notification` inside
handlers — keep that style.)

Add the three endpoints (place after the `project_stats` endpoint, at the end of
the file):

```python
@router.post("/{project_id}/updates", response_model=dict)
async def post_update(
    project_id: int,
    body: ProjectUpdateIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Founder posts a short update; fans out one inbox item to each follower ∪
    member (minus the author)."""
    text = (body.text or "").strip()[:500]
    if not text:
        raise HTTPException(status_code=400, detail="text required")
    project = (await db.execute(
        select(Project).where(Project.id == project_id, Project.is_deleted == False,
                              Project.is_draft == False)
    )).scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the founder can post updates")

    upd = ProjectUpdate(project_id=project_id, author_id=current_user.id, text=text)
    db.add(upd)
    await db.flush()
    uid = upd.id

    # Fan-out recipients: members ∪ project-followers, minus the author.
    member_ids = set((await db.execute(
        select(ProjectMember.user_id).where(ProjectMember.project_id == project_id)
    )).scalars().all())
    follower_ids = set((await db.execute(
        select(Follow.follower_id).where(
            Follow.target_type == "project", Follow.target_id == project_id
        )
    )).scalars().all())
    recipients = (member_ids | follower_ids) - {current_user.id}

    from app.services.notifications import add_notification
    for rid in recipients:
        add_notification(db, rid, "project_update", actor_id=current_user.id,
                         project_id=project_id)
    await db.commit()
    return {"ok": True, "id": uid}


@router.get("/{project_id}/updates", response_model=dict)
async def list_updates(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Recent updates (cap 50, newest first) with author preview."""
    project = (await db.execute(
        select(Project).where(Project.id == project_id, Project.is_deleted == False)
    )).scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    rows = (await db.execute(
        select(ProjectUpdate).where(ProjectUpdate.project_id == project_id)
        .order_by(ProjectUpdate.id.desc()).limit(50)
    )).scalars().all()
    author_ids = {r.author_id for r in rows}
    authors = {}
    if author_ids:
        for u in (await db.execute(select(User).where(User.id.in_(author_ids)))).scalars().all():
            authors[u.id] = {"id": u.id, "display_name": u.display_name, "photo_url": u.photo_url}
    return {
        "updates": [
            {"id": r.id, "text": r.text, "author": authors.get(r.author_id),
             "created_at": r.created_at.isoformat() if r.created_at else None}
            for r in rows
        ],
    }


@router.delete("/{project_id}/updates/{update_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_update(
    project_id: int,
    update_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Author (founder) deletes their own update."""
    upd = (await db.execute(
        select(ProjectUpdate).where(ProjectUpdate.id == update_id,
                                    ProjectUpdate.project_id == project_id)
    )).scalar_one_or_none()
    if not upd:
        raise HTTPException(status_code=404, detail="Update not found")
    if upd.author_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your update")
    await db.delete(upd)
    await db.commit()
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && python -m pytest tests/test_project_updates.py -v`
Expected: all passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/routers/projects.py backend/tests/test_project_updates.py
git commit -m "feat: project updates feed (post/list/delete) + fan-out notifications"
```

---

## Task 9: Role-specific apply (TDD)

**Files:**
- Modify: `backend/app/routers/projects.py`
- Test: `backend/tests/test_role_apply.py` (new)

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_role_apply.py`:

```python
"""Batch C role-specific apply: optional role on applications, surfaced to founder."""
import pytest

pytestmark = pytest.mark.asyncio


async def _mk_project(db, creator_id, name):
    from app.models.project import Project
    p = Project(type="startup", creator_id=creator_id, name=name, is_active=True,
                is_hiring=True, is_draft=False, is_deleted=False, is_approved=True)
    db.add(p)
    await db.commit()
    await db.refresh(p)
    return p


async def test_apply_with_role(make_user, as_user, db):
    from app.models.project import ProjectApplication
    founder = await make_user(name="Founder")
    me = await make_user(name="Me")
    p = await _mk_project(db, founder.id, "Proj")
    c = as_user(me)
    r = await c.post(f"/projects/{p.id}/apply", json={"role": "  Backend dev  "})
    assert r.status_code == 201, r.text
    assert r.json()["role"] == "Backend dev"
    app = (await db.execute(
        ProjectApplication.__table__.select().where(ProjectApplication.applicant_id == me.id)
    )).first()
    assert app.role == "Backend dev"


async def test_apply_without_body_backward_compatible(make_user, as_user, db):
    founder = await make_user(name="Founder")
    me = await make_user(name="Me")
    p = await _mk_project(db, founder.id, "Proj")
    c = as_user(me)
    # No body at all — must still work (legacy path).
    r = await c.post(f"/projects/{p.id}/apply")
    assert r.status_code == 201, r.text
    assert r.json().get("role") is None


async def test_role_surfaces_in_my_requests(make_user, as_user, db):
    founder = await make_user(name="Founder")
    applicant = await make_user(name="App")
    p = await _mk_project(db, founder.id, "Proj")
    ca = as_user(applicant)
    await ca.post(f"/projects/{p.id}/apply", json={"role": "Designer"})
    cf = as_user(founder)
    res = await cf.get("/projects/my-requests")
    assert res.status_code == 200, res.text
    rows = res.json()
    assert any(row["role"] == "Designer" for row in rows)
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && python -m pytest tests/test_role_apply.py -v`
Expected: FAIL — apply takes no body / `role` absent.

- [ ] **Step 3: Add an optional body to `apply_to_project`**

In `backend/app/routers/projects.py`, add an inline body model near the existing
`_ReviewBody` (~line 37):

```python
class _ApplyBody(_BM):
    role: str | None = None
```

Change the `apply_to_project` signature to accept an optional body. Replace:

```python
@router.post("/{project_id}/apply", status_code=status.HTTP_201_CREATED)
async def apply_to_project(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
```

with:

```python
@router.post("/{project_id}/apply", status_code=status.HTTP_201_CREATED)
async def apply_to_project(
    project_id: int,
    body: _ApplyBody | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
```

In the same handler, where the application row is created, set `role`. Replace:

```python
    app = ProjectApplication(project_id=project_id, applicant_id=current_user.id, status="pending")
```

with:

```python
    role = ((body.role if body else None) or "").strip()[:80] or None
    app = ProjectApplication(project_id=project_id, applicant_id=current_user.id,
                             status="pending", role=role)
```

And change the return value at the end of the handler. Replace:

```python
    return {"id": app.id, "status": "pending"}
```

with:

```python
    return {"id": app.id, "status": "pending", "role": role}
```

- [ ] **Step 4: Surface `role` in `my-requests`**

In `my_requests`, the `ApplicationOut(...)` construction adds `role`. Replace the
`ApplicationOut(` block with one that passes `role=a.role`:

```python
        ApplicationOut(
            id=a.id,
            project_id=a.project_id,
            project_name=proj_map[a.project_id].name,
            project_type=proj_map[a.project_id].type,
            status=a.status,
            role=a.role,
            created_at=a.created_at,
            applicant=ApplicantPublic.model_validate(a.applicant),
        )
```

- [ ] **Step 5: Run to verify it passes**

Run: `cd backend && python -m pytest tests/test_role_apply.py -v`
Expected: all passed.

- [ ] **Step 6: Run the affected existing suite (no regressions)**

Run: `cd backend && python -m pytest tests/ -k "project" -q`
Expected: existing project tests still pass (apply with no body still 201).

- [ ] **Step 7: Commit**

```bash
git add backend/app/routers/projects.py backend/tests/test_role_apply.py
git commit -m "feat: optional role on project applications, surfaced to founder"
```

---

## Task 10: Mentor router — list, slots, bookings (TDD)

**Files:**
- Create: `backend/app/routers/mentors.py`
- Modify: `backend/app/main.py` (include the router), `backend/app/routers/users.py` (mentor-profile write in PATCH /me)
- Test: `backend/tests/test_mentors.py` (new)

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_mentors.py`:

```python
"""Batch C mentor mode + booking: profile toggle, slots, bookings, notifications."""
import datetime as dt

import pytest

pytestmark = pytest.mark.asyncio


def _future(hours=24):
    return (dt.datetime.utcnow() + dt.timedelta(hours=hours)).isoformat()


async def _make_mentor(make_user, db, **kw):
    import json
    m = await make_user(**kw)
    m.is_mentor = True
    m.mentor_bio = "Bio"
    m.mentor_topics = json.dumps(["Startups"])
    await db.commit()
    return m


# ── Mentor profile via PATCH /me ──────────────────────────────────────────────
async def test_patch_me_sets_mentor(make_user, as_user, db):
    me = await make_user(name="Me")
    c = as_user(me)
    r = await c.patch("/users/me", json={
        "is_mentor": True, "mentor_bio": "10 yrs", "mentor_topics": ["A", "  ", "B"],
    })
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["mentor"]["is_mentor"] is True
    assert body["mentor"]["bio"] == "10 yrs"
    assert body["mentor"]["topics"] == ["A", "B"]   # blanks dropped


# ── Slots ─────────────────────────────────────────────────────────────────────
async def test_create_and_list_slots(make_user, as_user, db):
    m = await _make_mentor(make_user, db, name="M")
    c = as_user(m)
    r = await c.post("/mentors/me/slots", json={"start_at": _future(24)})
    assert r.status_code == 200, r.text
    # Past slot → 422.
    r2 = await c.post("/mentors/me/slots", json={"start_at": _future(-5)})
    assert r2.status_code == 422
    # Duplicate (mentor, start) → 409.
    same = _future(48)
    assert (await c.post("/mentors/me/slots", json={"start_at": same})).status_code == 200
    assert (await c.post("/mentors/me/slots", json={"start_at": same})).status_code == 409
    # Listing my own slots.
    res = await c.get(f"/mentors/{m.id}/slots")
    assert res.status_code == 200
    assert len(res.json()["slots"]) == 2


async def test_delete_open_slot_only(make_user, as_user, db):
    from app.models.connection import MentorSlot
    m = await _make_mentor(make_user, db, name="M")
    mentee = await make_user(name="Mentee")
    c = as_user(m)
    r = await c.post("/mentors/me/slots", json={"start_at": _future(24)})
    slot_id = r.json()["id"]
    # Book it (mentee) so it's no longer open.
    cm = as_user(mentee)
    await cm.post("/bookings", json={"slot_id": slot_id})
    # Mentor cannot delete a booked slot.
    assert (await c.delete(f"/mentors/me/slots/{slot_id}")).status_code == 409
    # A different open slot can be deleted.
    r2 = await c.post("/mentors/me/slots", json={"start_at": _future(48)})
    assert (await c.delete(f"/mentors/me/slots/{r2.json()['id']}")).status_code == 204


async def test_mentors_list(make_user, as_user, db):
    m = await _make_mentor(make_user, db, name="M")
    viewer = await make_user(name="V")
    cm = as_user(m)
    await cm.post("/mentors/me/slots", json={"start_at": _future(24)})
    c = as_user(viewer)
    res = await c.get("/mentors")
    assert res.status_code == 200, res.text
    rows = {r["id"]: r for r in res.json()}
    assert m.id in rows
    assert rows[m.id]["open_slots"] == 1
    assert rows[m.id]["topics"] == ["Startups"]


# ── Bookings ──────────────────────────────────────────────────────────────────
async def test_book_confirm_flow(make_user, as_user, db):
    from app.models.user import Notification
    from app.models.connection import MentorSlot, Booking
    m = await _make_mentor(make_user, db, name="M")
    mentee = await make_user(name="Mentee")
    cm = as_user(m)
    slot_id = (await cm.post("/mentors/me/slots", json={"start_at": _future(24)})).json()["id"]

    cme = as_user(mentee)
    r = await cme.post("/bookings", json={"slot_id": slot_id, "note": "  want help  "})
    assert r.status_code == 200, r.text
    bid = r.json()["id"]
    assert r.json()["status"] == "requested"
    # Slot now booked.
    slot = (await db.execute(MentorSlot.__table__.select().where(MentorSlot.id == slot_id))).first()
    assert slot.status == "booked"
    # Mentor got a booking_request.
    notes = (await db.execute(Notification.__table__.select().where(Notification.type == "booking_request"))).all()
    assert any(n.user_id == m.id for n in notes)
    # Double-book → 409.
    other = await make_user(name="Other")
    assert (await as_user(other).post("/bookings", json={"slot_id": slot_id})).status_code == 409
    # Mentor confirms.
    rc = await cm.patch(f"/bookings/{bid}", json={"action": "confirm"})
    assert rc.status_code == 200
    assert rc.json()["status"] == "confirmed"
    conf = (await db.execute(Notification.__table__.select().where(Notification.type == "booking_confirmed"))).all()
    assert any(n.user_id == mentee.id for n in conf)


async def test_decline_frees_slot(make_user, as_user, db):
    from app.models.user import Notification
    from app.models.connection import MentorSlot
    m = await _make_mentor(make_user, db, name="M")
    mentee = await make_user(name="Mentee")
    cm = as_user(m)
    slot_id = (await cm.post("/mentors/me/slots", json={"start_at": _future(24)})).json()["id"]
    bid = (await as_user(mentee).post("/bookings", json={"slot_id": slot_id})).json()["id"]
    r = await cm.patch(f"/bookings/{bid}", json={"action": "decline"})
    assert r.status_code == 200 and r.json()["status"] == "declined"
    slot = (await db.execute(MentorSlot.__table__.select().where(MentorSlot.id == slot_id))).first()
    assert slot.status == "open"   # freed
    notes = (await db.execute(Notification.__table__.select().where(Notification.type == "booking_declined"))).all()
    assert any(n.user_id == mentee.id for n in notes)


async def test_mentee_cancel_frees_slot(make_user, as_user, db):
    from app.models.connection import MentorSlot
    m = await _make_mentor(make_user, db, name="M")
    mentee = await make_user(name="Mentee")
    cm = as_user(m)
    slot_id = (await cm.post("/mentors/me/slots", json={"start_at": _future(24)})).json()["id"]
    cme = as_user(mentee)
    bid = (await cme.post("/bookings", json={"slot_id": slot_id})).json()["id"]
    r = await cme.patch(f"/bookings/{bid}", json={"action": "cancel"})
    assert r.status_code == 200 and r.json()["status"] == "cancelled"
    slot = (await db.execute(MentorSlot.__table__.select().where(MentorSlot.id == slot_id))).first()
    assert slot.status == "open"


async def test_book_self_and_wrong_actor(make_user, as_user, db):
    m = await _make_mentor(make_user, db, name="M")
    mentee = await make_user(name="Mentee")
    stranger = await make_user(name="Stranger")
    cm = as_user(m)
    slot_id = (await cm.post("/mentors/me/slots", json={"start_at": _future(24)})).json()["id"]
    # Mentor books own slot → 400.
    assert (await cm.post("/bookings", json={"slot_id": slot_id})).status_code == 400
    bid = (await as_user(mentee).post("/bookings", json={"slot_id": slot_id})).json()["id"]
    # Stranger cannot act on the booking.
    assert (await as_user(stranger).patch(f"/bookings/{bid}", json={"action": "confirm"})).status_code == 403
    # Mentee cannot confirm (only cancel).
    assert (await as_user(mentee).patch(f"/bookings/{bid}", json={"action": "confirm"})).status_code == 403


async def test_bookings_me_split(make_user, as_user, db):
    m = await _make_mentor(make_user, db, name="M")
    mentee = await make_user(name="Mentee")
    cm = as_user(m)
    slot_id = (await cm.post("/mentors/me/slots", json={"start_at": _future(24)})).json()["id"]
    cme = as_user(mentee)
    await cme.post("/bookings", json={"slot_id": slot_id})
    res_mentee = await cme.get("/bookings/me")
    assert len(res_mentee.json()["as_mentee"]) == 1
    res_mentor = await cm.get("/bookings/me")
    assert len(res_mentor.json()["as_mentor"]) == 1
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && python -m pytest tests/test_mentors.py -v`
Expected: FAIL — `/mentors` routes + mentor-profile write missing.

- [ ] **Step 3: Add mentor-profile write to `PATCH /users/me`**

In `backend/app/routers/users.py`, inside `update_me` (the `PATCH /me` handler),
where it already handles `currently_building` and `portfolio_links` (~lines
383–390), add handling for the mentor fields. After the `portfolio_links` block,
add:

```python
    if "is_mentor" in data:
        current_user.is_mentor = bool(data.pop("is_mentor"))
    if "mentor_bio" in data:
        mb = (data.pop("mentor_bio") or "").strip()[:400]
        current_user.mentor_bio = mb or None
    if "mentor_topics" in data:
        raw = data.pop("mentor_topics") or []
        clean = []
        for t in raw[:6]:
            s = str(t).strip()[:40]
            if s:
                clean.append(s)
        current_user.mentor_topics = json.dumps(clean) if clean else None
```

(`json` already imported. The remaining `data` fields fall through to the existing
generic `setattr` loop, which must NOT receive `is_mentor`/`mentor_bio`/
`mentor_topics` — popping them here prevents that.)

- [ ] **Step 4: Create the mentor router**

Create `backend/app/routers/mentors.py`:

```python
import datetime as dt
import json

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.database import get_db
from app.models.connection import MentorSlot, Booking
from app.models.user import User
from app.schemas.connection import (
    BookingActionIn,
    BookingIn,
    SlotIn,
)
from app.services.notifications import add_notification

router = APIRouter(prefix="/mentors", tags=["mentors"])
booking_router = APIRouter(prefix="/bookings", tags=["bookings"])


def _topics(user: User) -> list[str]:
    if not user.mentor_topics:
        return []
    try:
        return [str(t).strip() for t in json.loads(user.mentor_topics) if str(t).strip()]
    except Exception:
        return []


@router.get("", response_model=list[dict])
async def list_mentors(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """All mentors with their open-slot counts."""
    mentors = (await db.execute(
        select(User).where(User.is_mentor == True, User.is_deleted == False,
                           User.is_registered == True)
    )).scalars().all()
    if not mentors:
        return []
    ids = [m.id for m in mentors]
    open_rows = (await db.execute(
        select(MentorSlot.mentor_id, func.count(MentorSlot.id))
        .where(MentorSlot.mentor_id.in_(ids), MentorSlot.status == "open",
               MentorSlot.start_at > dt.datetime.utcnow())
        .group_by(MentorSlot.mentor_id)
    )).all()
    open_by = {mid: c for mid, c in open_rows}
    return [
        {"id": m.id, "display_name": m.display_name, "photo_url": m.photo_url,
         "bio": m.mentor_bio, "topics": _topics(m), "open_slots": open_by.get(m.id, 0)}
        for m in mentors
    ]


@router.get("/{mentor_id}/slots", response_model=dict)
async def list_slots(
    mentor_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """A mentor's slots. Others see open future slots; the mentor sees all
    non-cancelled slots."""
    is_self = mentor_id == current_user.id
    q = select(MentorSlot).where(MentorSlot.mentor_id == mentor_id)
    if is_self:
        q = q.where(MentorSlot.status != "cancelled")
    else:
        q = q.where(MentorSlot.status == "open", MentorSlot.start_at > dt.datetime.utcnow())
    rows = (await db.execute(q.order_by(MentorSlot.start_at.asc()))).scalars().all()
    return {
        "slots": [
            {"id": s.id, "start_at": s.start_at.isoformat() if s.start_at else None,
             "status": s.status, "duration_min": s.duration_min}
            for s in rows
        ],
    }


@router.post("/me/slots", response_model=dict)
async def create_slot(
    body: SlotIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Mentor publishes a future 15-minute slot."""
    start = body.start_at
    if start.tzinfo is not None:
        start = start.replace(tzinfo=None)
    if start <= dt.datetime.utcnow():
        raise HTTPException(status_code=422, detail="start_at must be in the future")
    slot = MentorSlot(mentor_id=current_user.id, start_at=start, duration_min=15, status="open")
    db.add(slot)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="You already have a slot at that time")
    await db.refresh(slot)
    return {"ok": True, "id": slot.id}


@router.delete("/me/slots/{slot_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_slot(
    slot_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Cancel an OPEN slot you own. A booked slot must be freed by declining the
    booking instead."""
    slot = (await db.execute(
        select(MentorSlot).where(MentorSlot.id == slot_id,
                                 MentorSlot.mentor_id == current_user.id)
    )).scalar_one_or_none()
    if not slot:
        raise HTTPException(status_code=404, detail="Slot not found")
    if slot.status == "booked":
        raise HTTPException(status_code=409, detail="Decline the booking to free this slot")
    await db.delete(slot)
    await db.commit()


@booking_router.post("", response_model=dict)
async def create_booking(
    body: BookingIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Mentee books an open slot → booking 'requested', slot 'booked'."""
    slot = (await db.execute(
        select(MentorSlot).where(MentorSlot.id == body.slot_id)
    )).scalar_one_or_none()
    if not slot:
        raise HTTPException(status_code=404, detail="Slot not found")
    if slot.mentor_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot book your own slot")
    if slot.status != "open":
        raise HTTPException(status_code=409, detail="Slot is not available")

    slot.status = "booked"
    note = (body.note or "").strip()[:200] or None
    booking = Booking(slot_id=slot.id, mentor_id=slot.mentor_id,
                      mentee_id=current_user.id, status="requested", note=note)
    db.add(booking)
    await db.flush()
    bid = booking.id
    add_notification(db, slot.mentor_id, "booking_request", actor_id=current_user.id)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Slot was just taken")
    return {"ok": True, "id": bid, "status": "requested"}


@booking_router.patch("/{booking_id}", response_model=dict)
async def act_on_booking(
    booking_id: int,
    body: BookingActionIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Mentor confirms/declines; mentee cancels. Declining/cancelling frees the
    slot back to open."""
    booking = (await db.execute(
        select(Booking).where(Booking.id == booking_id)
    )).scalar_one_or_none()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    action = body.action
    is_mentor = current_user.id == booking.mentor_id
    is_mentee = current_user.id == booking.mentee_id

    if action == "confirm":
        if not is_mentor:
            raise HTTPException(status_code=403, detail="Only the mentor can confirm")
        booking.status = "confirmed"
        add_notification(db, booking.mentee_id, "booking_confirmed", actor_id=current_user.id)
    elif action == "decline":
        if not is_mentor:
            raise HTTPException(status_code=403, detail="Only the mentor can decline")
        booking.status = "declined"
        add_notification(db, booking.mentee_id, "booking_declined", actor_id=current_user.id)
    elif action == "cancel":
        if not is_mentee:
            raise HTTPException(status_code=403, detail="Only the mentee can cancel")
        booking.status = "cancelled"
    else:
        raise HTTPException(status_code=400, detail="action must be confirm|decline|cancel")

    booking.decided_at = dt.datetime.utcnow()
    # Free the slot when the session won't happen.
    if booking.status in ("declined", "cancelled"):
        slot = await db.get(MentorSlot, booking.slot_id)
        if slot and slot.status == "booked":
            slot.status = "open"
    await db.commit()
    return {"status": booking.status}


@booking_router.get("/me", response_model=dict)
async def my_bookings(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """The caller's bookings as mentee and as mentor, with slot + other-party."""
    rows = (await db.execute(
        select(Booking).where(
            (Booking.mentee_id == current_user.id) | (Booking.mentor_id == current_user.id)
        ).order_by(Booking.id.desc())
    )).scalars().all()
    slot_ids = {b.slot_id for b in rows}
    other_ids = {b.mentor_id for b in rows} | {b.mentee_id for b in rows}
    other_ids.discard(current_user.id)
    slots = {}
    if slot_ids:
        for s in (await db.execute(select(MentorSlot).where(MentorSlot.id.in_(slot_ids)))).scalars().all():
            slots[s.id] = s
    people = {}
    if other_ids:
        for u in (await db.execute(select(User).where(User.id.in_(other_ids)))).scalars().all():
            people[u.id] = {"id": u.id, "display_name": u.display_name, "photo_url": u.photo_url}

    def _row(b, other_id):
        s = slots.get(b.slot_id)
        return {
            "id": b.id, "slot_id": b.slot_id, "status": b.status, "note": b.note,
            "start_at": s.start_at.isoformat() if (s and s.start_at) else None,
            "other": people.get(other_id),
            "created_at": b.created_at.isoformat() if b.created_at else None,
        }

    return {
        "as_mentee": [_row(b, b.mentor_id) for b in rows if b.mentee_id == current_user.id],
        "as_mentor": [_row(b, b.mentee_id) for b in rows if b.mentor_id == current_user.id],
    }
```

- [ ] **Step 5: Include the routers in `main.py`**

In `backend/app/main.py`, add the import in the routers import line:

```python
from app.routers import admin, auth, events, mentors, partners, projects, public, regions, search, users
```

And include both routers (after `app.include_router(users.follow_router)`):

```python
app.include_router(mentors.router)
app.include_router(mentors.booking_router)
```

- [ ] **Step 6: Run to verify it passes**

Run: `cd backend && python -m pytest tests/test_mentors.py -v`
Expected: all passed.

- [ ] **Step 7: Run the full backend suite (no regressions)**

Run: `cd backend && python -m pytest -q`
Expected: all pass (existing + the four new files).

- [ ] **Step 8: Commit**

```bash
git add backend/app/routers/mentors.py backend/app/main.py backend/app/routers/users.py backend/tests/test_mentors.py
git commit -m "feat: mentor mode + slots + bookings (full booking flow + notifications)"
```

---

## Task 11: API client methods

**Files:**
- Modify: `src/api.js`

- [ ] **Step 1: Add the connection client methods**

In `src/api.js`, inside the `users` object (after `getProfile`), add:

```javascript
  follow:        (target_type, target_id) => req("/follow", { method: "POST", body: JSON.stringify({ target_type, target_id }) }),
  unfollow:      (target_type, target_id) => req("/follow", { method: "DELETE", body: JSON.stringify({ target_type, target_id }) }),
  following:     ()       => req("/users/me/following"),
```

In the `projects` object (after `stats`), add:

```javascript
  apply:           (id, role) => req(`/projects/${id}/apply`, { method: "POST", body: JSON.stringify({ role: role || null }) }),
  postUpdate:      (id, text) => req(`/projects/${id}/updates`, { method: "POST", body: JSON.stringify({ text }) }),
  updates:         (id)       => req(`/projects/${id}/updates`),
  deleteUpdate:    (id, uid)  => req(`/projects/${id}/updates/${uid}`, { method: "DELETE" }),
```

NOTE: `projects.apply` already exists (`(id) => req(...POST)`). Replace the
existing `apply:` line with the role-aware one above (sending `{role: null}` for
the no-role case is accepted by the backend's optional `_ApplyBody`).

Add a new top-level `mentors` export after the `projects` export:

```javascript
// ── Mentors & bookings ──────────────────────────────────────────────────────
export const mentors = {
  list:        ()              => req("/mentors"),
  slots:       (id)            => req(`/mentors/${id}/slots`),
  createSlot:  (start_at)      => req("/mentors/me/slots", { method: "POST", body: JSON.stringify({ start_at }) }),
  deleteSlot:  (slotId)        => req(`/mentors/me/slots/${slotId}`, { method: "DELETE" }),
};

export const bookings = {
  book:    (slot_id, note)     => req("/bookings", { method: "POST", body: JSON.stringify({ slot_id, note: note || null }) }),
  act:     (id, action)        => req(`/bookings/${id}`, { method: "PATCH", body: JSON.stringify({ action }) }),
  mine:    ()                  => req("/bookings/me"),
};
```

- [ ] **Step 2: Commit**

```bash
git add src/api.js
git commit -m "api: follow / project-updates / mentor / booking client methods"
```

---

## Task 12: i18n keys (en/uz/ru)

**Files:**
- Modify: `src/i18n.jsx`

The file uses the per-key nested shape `"key": { en, uz, ru }`. Add these entries
inside the `STRINGS` object (e.g. after the existing `trust.*`/profile keys).

- [ ] **Step 1: Add keys**

```javascript
  // ── Batch C: follow ─────────────────────────────────────────────────────────
  "follow.btn": { en: "Follow", uz: "Kuzatish", ru: "Подписаться" },
  "follow.following": { en: "Following", uz: "Kuzatilmoqda", ru: "Вы подписаны" },
  "follow.followers": { en: "{n} followers", uz: "{n} kuzatuvchi", ru: "{n} подписчиков" },
  "follow.followersOne": { en: "1 follower", uz: "1 kuzatuvchi", ru: "1 подписчик" },
  "follow.title": { en: "Following", uz: "Kuzatilayotganlar", ru: "Подписки" },
  // ── Batch C: project updates ────────────────────────────────────────────────
  "updates.title": { en: "Updates", uz: "Yangiliklar", ru: "Обновления" },
  "updates.none": { en: "No updates yet", uz: "Hali yangilik yo‘q", ru: "Пока нет обновлений" },
  "updates.placeholder": { en: "Share an update with your followers…", uz: "Kuzatuvchilaringiz bilan yangilik ulashing…", ru: "Поделитесь обновлением с подписчиками…" },
  "updates.post": { en: "Post update", uz: "Joylash", ru: "Опубликовать" },
  "updates.delete": { en: "Delete", uz: "O‘chirish", ru: "Удалить" },
  // ── Batch C: role apply ─────────────────────────────────────────────────────
  "apply.roleLabel": { en: "Role you want (optional)", uz: "Xohlagan rolingiz (ixtiyoriy)", ru: "Желаемая роль (необязательно)" },
  "apply.rolePh": { en: "e.g. Backend dev", uz: "masalan, Backend dasturchi", ru: "напр. Backend-разработчик" },
  "apply.wants": { en: "Wants: {role}", uz: "Rol: {role}", ru: "Роль: {role}" },
  "apply.submit": { en: "Apply", uz: "Ariza berish", ru: "Подать заявку" },
  // ── Batch C: mentor mode ────────────────────────────────────────────────────
  "mentor.become": { en: "Become a mentor", uz: "Mentor bo‘lish", ru: "Стать ментором" },
  "mentor.isMentor": { en: "Mentor mode is on", uz: "Mentor rejimi yoqilgan", ru: "Режим ментора включён" },
  "mentor.bioLabel": { en: "Mentor bio", uz: "Mentor haqida", ru: "О менторе" },
  "mentor.bioPh": { en: "What can you help mentees with?", uz: "Mentilarga nimada yordam bera olasiz?", ru: "Чем вы можете помочь?" },
  "mentor.topicsLabel": { en: "Topics (up to 6)", uz: "Mavzular (6 tagacha)", ru: "Темы (до 6)" },
  "mentor.topicsPh": { en: "Startups, Fundraising…", uz: "Startaplar, Mablag‘ yig‘ish…", ru: "Стартапы, Фандрайзинг…" },
  "mentor.browse": { en: "Find a mentor", uz: "Mentor topish", ru: "Найти ментора" },
  "mentor.openSlots": { en: "{n} open slots", uz: "{n} bo‘sh vaqt", ru: "{n} свободных слотов" },
  "mentor.book": { en: "Book a session", uz: "Sessiya band qilish", ru: "Записаться" },
  "mentor.mySlots": { en: "My mentor slots", uz: "Mening vaqtlarim", ru: "Мои слоты" },
  "mentor.addSlot": { en: "Add a slot", uz: "Vaqt qo‘shish", ru: "Добавить слот" },
  "mentor.noSlots": { en: "No open slots", uz: "Bo‘sh vaqt yo‘q", ru: "Нет свободных слотов" },
  "mentor.slotPast": { en: "Pick a future time", uz: "Kelajakdagi vaqtni tanlang", ru: "Выберите будущее время" },
  // ── Batch C: bookings ───────────────────────────────────────────────────────
  "booking.title": { en: "My bookings", uz: "Bandlovlarim", ru: "Мои записи" },
  "booking.asMentee": { en: "As mentee", uz: "Menti sifatida", ru: "Как менти" },
  "booking.asMentor": { en: "As mentor", uz: "Mentor sifatida", ru: "Как ментор" },
  "booking.notePh": { en: "What do you want help with? (optional)", uz: "Nimada yordam kerak? (ixtiyoriy)", ru: "С чем нужна помощь? (необязательно)" },
  "booking.requested": { en: "Requested", uz: "So‘ralgan", ru: "Запрошено" },
  "booking.confirmed": { en: "Confirmed", uz: "Tasdiqlangan", ru: "Подтверждено" },
  "booking.declined": { en: "Declined", uz: "Rad etilgan", ru: "Отклонено" },
  "booking.cancelled": { en: "Cancelled", uz: "Bekor qilingan", ru: "Отменено" },
  "booking.confirm": { en: "Confirm", uz: "Tasdiqlash", ru: "Подтвердить" },
  "booking.decline": { en: "Decline", uz: "Rad etish", ru: "Отклонить" },
  "booking.cancel": { en: "Cancel", uz: "Bekor qilish", ru: "Отменить" },
  "booking.booked": { en: "Booked!", uz: "Band qilindi!", ru: "Записано!" },
  "booking.none": { en: "No bookings yet", uz: "Hali bandlov yo‘q", ru: "Пока нет записей" },
  // ── Batch C: inbox notification text ────────────────────────────────────────
  "inbox.new_follower": { en: "{name} started following you", uz: "{name} sizni kuzata boshladi", ru: "{name} подписался(ась) на вас" },
  "inbox.project_update": { en: "New update in {project}", uz: "{project} loyihasida yangilik", ru: "Новое обновление в {project}" },
  "inbox.booking_request": { en: "{name} requested a mentor session", uz: "{name} mentor sessiyasini so‘radi", ru: "{name} запросил(а) сессию" },
  "inbox.booking_confirmed": { en: "{name} confirmed your session", uz: "{name} sessiyangizni tasdiqladi", ru: "{name} подтвердил(а) вашу сессию" },
  "inbox.booking_declined": { en: "{name} declined your session", uz: "{name} sessiyangizni rad etdi", ru: "{name} отклонил(а) вашу сессию" },
```

- [ ] **Step 2: Commit**

```bash
git add src/i18n.jsx
git commit -m "i18n: Batch C connection keys (en/uz/ru)"
```

---

## Task 13: FollowButton shared component

**Files:**
- Create: `src/components/FollowButton.jsx`

- [ ] **Step 1: Create the component**

Create `src/components/FollowButton.jsx`:

```jsx
import { useState } from "react";
import { users } from "../api";
import { useT } from "../i18n";
import { tgAlert } from "../tg";

/**
 * Reusable follow toggle for a user or a project.
 * Props: targetType ("user"|"project"), targetId, initialFollowing, initialCount,
 *        onChange?(following, count)
 */
export const FollowButton = ({ targetType, targetId, initialFollowing = false, initialCount = 0, onChange }) => {
  const { t } = useT();
  const [following, setFollowing] = useState(!!initialFollowing);
  const [count, setCount] = useState(initialCount || 0);
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (following) {
        await users.unfollow(targetType, targetId);
        const next = Math.max(0, count - 1);
        setFollowing(false); setCount(next); onChange?.(false, next);
      } else {
        const r = await users.follow(targetType, targetId);
        const next = r?.follower_count ?? count + 1;
        setFollowing(true); setCount(next); onChange?.(true, next);
      }
    } catch (e) { tgAlert(e.message); }
    setBusy(false);
  };

  return (
    <button onClick={toggle} disabled={busy} style={{
      display: "inline-flex", alignItems: "center", gap: 6, padding: "11px 16px",
      background: following ? "var(--surface-2)" : "var(--accent)",
      border: following ? "1px solid var(--border)" : "none",
      borderRadius: "var(--radius-sm)",
      color: following ? "var(--text-2)" : "#fff",
      fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "var(--font-display)",
    }}>
      {following ? `✓ ${t("follow.following")}` : t("follow.btn")}
    </button>
  );
};
```

- [ ] **Step 2: Build to verify**

Run: `npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/components/FollowButton.jsx
git commit -m "feat: shared FollowButton toggle (user|project)"
```

---

## Task 14: Follow + mentor card in UserProfileModal

**Files:**
- Modify: `src/components/UserProfileModal.jsx`

- [ ] **Step 1: Imports + book state**

At the top of `src/components/UserProfileModal.jsx`, add imports:

```jsx
import { FollowButton } from "./FollowButton";
import { BookSlotSheet } from "./MentorSheets";
```

Inside `UserProfileModal`, after the existing `useState` hooks, add:

```jsx
  const [booking, setBooking] = useState(false);
```

- [ ] **Step 2: Add the Follow button + follower count to the header**

In the Connect-actions row (the `<div style={{ display: "flex", gap: 8,
marginBottom: 16, flexWrap: "wrap" }}>` that holds the intro/interest/report
buttons), add a `FollowButton` as the first child:

```jsx
              <FollowButton
                targetType="user"
                targetId={user.id}
                initialFollowing={user.is_following}
                initialCount={user.follower_count}
              />
```

And add a follower count line under the name `<h2>` block (after the badges/age
rows in the header `<div style={{ flex: 1, minWidth: 0 }}>`):

```jsx
                {user?.follower_count > 0 && (
                  <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 4 }}>
                    {user.follower_count === 1 ? t("follow.followersOne") : t("follow.followers", { n: user.follower_count })}
                  </div>
                )}
```

- [ ] **Step 3: Add the mentor card + book button**

After the Intentions block (the `{(user?.open_to_work || ...)}` block) and before
the About block, insert:

```jsx
            {/* Mentor card */}
            {user?.mentor?.is_mentor && (
              <div style={{
                marginBottom: 16, padding: "14px", background: "rgba(167,139,250,0.1)",
                border: "1px solid rgba(167,139,250,0.3)", borderRadius: "var(--radius-sm)",
              }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#A78BFA", marginBottom: 6 }}>
                  🎓 {t("mentor.isMentor")}
                </div>
                {user.mentor.bio && (
                  <p style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.6, margin: "0 0 8px" }}>{user.mentor.bio}</p>
                )}
                {user.mentor.topics?.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                    {user.mentor.topics.map(tp => (
                      <span key={tp} style={{ background: "rgba(167,139,250,0.15)", color: "#A78BFA",
                        borderRadius: 99, padding: "3px 10px", fontSize: 11, fontWeight: 600 }}>{tp}</span>
                    ))}
                  </div>
                )}
                <button onClick={() => setBooking(true)} style={{
                  width: "100%", padding: "10px", background: "#A78BFA", border: "none",
                  borderRadius: "var(--radius-sm)", color: "#fff", fontWeight: 700, fontSize: 13,
                  cursor: "pointer",
                }}>{t("mentor.book")}</button>
              </div>
            )}
```

- [ ] **Step 4: Render the BookSlotSheet**

Just before the final closing `</div>` of the modal's outer container (after the
`<style>` block, inside the top-level fragment / outer div), add:

```jsx
      {booking && user && (
        <BookSlotSheet mentor={user} onClose={() => setBooking(false)} />
      )}
```

- [ ] **Step 5: Build to verify**

Run: `npm run build`
Expected: success. (`MentorSheets` is created in Task 16; if building before that
task, do Task 16 first — they are commit-independent but `BookSlotSheet` must
exist for the import to resolve. Reorder: do Task 16 before Task 14's build, or
stub the import. Recommended: implement Task 16 immediately before building here.)

- [ ] **Step 6: Commit**

```bash
git add src/components/UserProfileModal.jsx
git commit -m "feat: follow toggle + mentor card + book button in profile modal"
```

---

## Task 15: Follow + Updates + role-apply in ProjectDetail

**Files:**
- Modify: `src/components/ProjectDetail.jsx`

- [ ] **Step 1: Imports + state**

At the top of `src/components/ProjectDetail.jsx`, add:

```jsx
import { FollowButton } from "./FollowButton";
```

Inside `ProjectDetail`, after the existing `useState` hooks, add:

```jsx
  const [updates, setUpdates] = useState(null);
  const [updateText, setUpdateText] = useState("");
  const [posting, setPosting] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);
  const [roleText, setRoleText] = useState("");
```

- [ ] **Step 2: Load updates**

Add an effect after the existing effects:

```jsx
  useEffect(() => {
    projects.updates(project.id).then(r => setUpdates(r.updates || [])).catch(() => setUpdates([]));
  }, [project.id]);
```

- [ ] **Step 3: Add the post-update + delete-update handlers**

Add near the other handlers:

```jsx
  const postUpdate = async () => {
    if (posting || !updateText.trim()) return;
    setPosting(true);
    try {
      await projects.postUpdate(project.id, updateText.trim());
      const r = await projects.updates(project.id);
      setUpdates(r.updates || []);
      setUpdateText("");
    } catch (e) { tgAlert(e.message); }
    setPosting(false);
  };

  const removeUpdate = async (uid) => {
    if (!await tgConfirm(t("updates.delete"))) return;
    try {
      await projects.deleteUpdate(project.id, uid);
      setUpdates(u => (u || []).filter(x => x.id !== uid));
    } catch (e) { tgAlert(e.message); }
  };
```

- [ ] **Step 4: Make Apply role-aware**

Replace the existing `handleApply` so it sends the optional role and closes the
prompt:

```jsx
  const handleApply = async () => {
    if (!project.is_fit) {
      tgAlert(t("pd.notQualified"));
      return;
    }
    setLoading(true);
    try {
      await projects.apply(project.id, roleText.trim() || null);
      const updated = await projects.get(project.id);
      setProject(updated);
      setRoleOpen(false);
      setRoleText("");
      if (onUpdate) onUpdate(updated);
    } catch (e) {
      tgAlert(e.message);
    }
    setLoading(false);
  };
```

- [ ] **Step 5: Add the Follow button near the header**

In the top button row (the `<div style={{ display: "flex", justifyContent:
"space-between", padding: "8px 20px 0" }}>` that holds favorite + close), the
favorite button is on the left and close on the right. Add a `FollowButton` for
non-creators just below the title `<h2>`. After the `{project.goal && (...)}`
block (the goal paragraph), insert:

```jsx
            {!isCreator && (
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                <FollowButton
                  targetType="project"
                  targetId={project.id}
                  initialFollowing={project.is_following}
                  initialCount={project.follower_count}
                />
                {project.follower_count > 0 && (
                  <span style={{ fontSize: 12, color: "var(--text-3)" }}>
                    {project.follower_count === 1 ? t("follow.followersOne") : t("follow.followers", { n: project.follower_count })}
                  </span>
                )}
              </div>
            )}
```

- [ ] **Step 6: Add the Updates section**

After the Members section (the `{project.members?.length > 0 && (...)}` block) and
before the Channel block, insert:

```jsx
            {/* Updates */}
            <div style={{ marginBottom: 20 }}>
              <div className="section-label">{t("updates.title")}</div>
              {isCreator && (
                <div style={{ marginBottom: 12 }}>
                  <textarea value={updateText} maxLength={500}
                    onChange={e => setUpdateText(e.target.value)} placeholder={t("updates.placeholder")}
                    rows={2} style={{ width: "100%", boxSizing: "border-box", background: "var(--surface-2)",
                      border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", color: "var(--text)",
                      padding: "10px 12px", fontSize: 13, resize: "vertical" }} />
                  <button onClick={postUpdate} disabled={posting || !updateText.trim()} style={{
                    marginTop: 6, background: "var(--accent)", border: "none", borderRadius: "var(--radius-sm)",
                    color: "#fff", padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                    {t("updates.post")}
                  </button>
                </div>
              )}
              {updates === null ? (
                <div style={{ fontSize: 12, color: "var(--text-3)" }}>{t("common.loading")}</div>
              ) : updates.length === 0 ? (
                <div style={{ fontSize: 12, color: "var(--text-3)" }}>{t("updates.none")}</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {updates.map(u => (
                    <div key={u.id} style={{ background: "var(--surface-2)", border: "1px solid var(--border)",
                      borderLeft: "3px solid var(--accent)", borderRadius: "var(--radius-sm)", padding: "10px 12px" }}>
                      <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.6 }}>{u.text}</div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                        <span style={{ fontSize: 11, color: "var(--text-3)" }}>
                          {u.author?.display_name || ""} · {(() => { try { return new Date(u.created_at).toLocaleDateString(); } catch { return ""; } })()}
                        </span>
                        {isCreator && (
                          <button onClick={() => removeUpdate(u.id)} style={{ background: "none", border: "none",
                            color: "var(--text-3)", fontSize: 11, textDecoration: "underline", cursor: "pointer" }}>
                            {t("updates.delete")}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
```

- [ ] **Step 7: Add the role prompt before Apply**

The Apply CTA at the bottom uses `<StatusButton onApply={handleApply} ...>`. For an
applicant who is fit and not yet applied/member, intercept apply to first open the
role prompt. Change the `onApply` passed to `StatusButton` to open the prompt:

Replace the `<StatusButton ... onApply={handleApply} ... />` with:

```jsx
            <StatusButton
              project={projectWithFlag}
              onApply={() => setRoleOpen(true)}
              onCancel={handleCancel}
              onLeave={handleLeave}
              loading={loading}
            />
            {roleOpen && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 6 }}>{t("apply.roleLabel")}</div>
                <input value={roleText} maxLength={80} onChange={e => setRoleText(e.target.value)}
                  placeholder={t("apply.rolePh")} style={{ width: "100%", boxSizing: "border-box",
                    background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
                    color: "var(--text)", padding: "10px 12px", fontSize: 13, marginBottom: 8 }} />
                <button onClick={handleApply} disabled={loading} style={{ width: "100%", background: "var(--accent)",
                  border: "none", borderRadius: "var(--radius-sm)", color: "#fff", padding: "12px", fontWeight: 700,
                  fontSize: 14, cursor: "pointer" }}>{t("apply.submit")}</button>
              </div>
            )}
```

- [ ] **Step 8: Build to verify**

Run: `npm run build`
Expected: success.

- [ ] **Step 9: Commit**

```bash
git add src/components/ProjectDetail.jsx
git commit -m "feat: project follow + updates feed + role-on-apply in ProjectDetail"
```

---

## Task 16: Mentor sheets — BookSlotSheet, MentorSlotsSheet, BookingsSheet

**Files:**
- Create: `src/components/MentorSheets.jsx`

- [ ] **Step 1: Create the component file**

Create `src/components/MentorSheets.jsx`:

```jsx
import { useState, useEffect } from "react";
import { mentors, bookings } from "../api";
import { useT } from "../i18n";
import { tgAlert, tgConfirm } from "../tg";

const fmtDT = (iso) => { try { return new Date(iso).toLocaleString(); } catch { return ""; } };

const Sheet = ({ title, onClose, children }) => (
  <div style={{ position: "fixed", inset: 0, zIndex: 340, display: "flex", flexDirection: "column" }}>
    <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }} />
    <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, maxWidth: 430, margin: "0 auto",
      background: "var(--surface)", borderRadius: "24px 24px 0 0", maxHeight: "88dvh",
      display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--border)" }}>
        <h2 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 800 }}>{title}</h2>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px 40px" }}>{children}</div>
    </div>
  </div>
);

// ── Mentee books a mentor's open slot ─────────────────────────────────────────
export const BookSlotSheet = ({ mentor, onClose }) => {
  const { t } = useT();
  const [slots, setSlots] = useState(null);
  const [picked, setPicked] = useState(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    mentors.slots(mentor.id).then(r => setSlots((r.slots || []).filter(s => s.status === "open")))
      .catch(e => { tgAlert(e.message); setSlots([]); });
  }, [mentor.id]);

  const book = async () => {
    if (!picked || busy) return;
    setBusy(true);
    try {
      await bookings.book(picked, note.trim() || null);
      tgAlert(t("booking.booked"));
      onClose();
    } catch (e) { tgAlert(e.message); }
    setBusy(false);
  };

  return (
    <Sheet title={t("mentor.book")} onClose={onClose}>
      {slots === null ? (
        <div style={{ color: "var(--text-3)", fontSize: 13, textAlign: "center", padding: 20 }}>{t("common.loading")}</div>
      ) : slots.length === 0 ? (
        <div style={{ color: "var(--text-3)", fontSize: 13, textAlign: "center", padding: 20 }}>{t("mentor.noSlots")}</div>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
            {slots.map(s => (
              <button key={s.id} onClick={() => setPicked(s.id)} style={{
                textAlign: "left", padding: "12px 14px", borderRadius: "var(--radius-sm)",
                background: picked === s.id ? "var(--accent-dim)" : "var(--surface-2)",
                border: picked === s.id ? "1px solid var(--accent)" : "1px solid var(--border)",
                color: "var(--text)", fontSize: 13, cursor: "pointer",
              }}>{fmtDT(s.start_at)} · {s.duration_min} min</button>
            ))}
          </div>
          <input value={note} maxLength={200} onChange={e => setNote(e.target.value)}
            placeholder={t("booking.notePh")} style={{ width: "100%", boxSizing: "border-box",
              background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
              color: "var(--text)", padding: "10px 12px", fontSize: 13, marginBottom: 10 }} />
          <button onClick={book} disabled={!picked || busy} style={{ width: "100%", background: "var(--accent)",
            border: "none", borderRadius: "var(--radius-sm)", color: "#fff", padding: "12px", fontWeight: 700,
            fontSize: 14, cursor: "pointer" }}>{t("mentor.book")}</button>
        </>
      )}
    </Sheet>
  );
};

// ── Mentor manages their own slots ────────────────────────────────────────────
export const MentorSlotsSheet = ({ onClose }) => {
  const { t } = useT();
  const [slots, setSlots] = useState(null);
  const [newAt, setNewAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [myId, setMyId] = useState(null);

  useEffect(() => {
    // We need our own id to list slots; fetch it once.
    import("../api").then(({ users }) => users.me()).then(u => {
      setMyId(u.id);
      return mentors.slots(u.id);
    }).then(r => setSlots(r.slots || [])).catch(() => setSlots([]));
  }, []);

  const add = async () => {
    if (!newAt || busy) return;
    setBusy(true);
    try {
      // datetime-local has no timezone; send as ISO (local wall-clock → backend treats as UTC).
      const iso = new Date(newAt).toISOString();
      await mentors.createSlot(iso);
      if (myId) { const r = await mentors.slots(myId); setSlots(r.slots || []); }
      setNewAt("");
    } catch (e) { tgAlert(e.message); }
    setBusy(false);
  };

  const remove = async (id) => {
    try {
      await mentors.deleteSlot(id);
      setSlots(s => (s || []).filter(x => x.id !== id));
    } catch (e) { tgAlert(e.message); }
  };

  return (
    <Sheet title={t("mentor.mySlots")} onClose={onClose}>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <input type="datetime-local" value={newAt} onChange={e => setNewAt(e.target.value)}
          style={{ flex: 1, background: "var(--surface-2)", border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)", color: "var(--text)", padding: "10px 12px", fontSize: 13 }} />
        <button onClick={add} disabled={!newAt || busy} style={{ background: "var(--accent)", border: "none",
          borderRadius: "var(--radius-sm)", color: "#fff", padding: "10px 16px", fontWeight: 700, fontSize: 13,
          cursor: "pointer" }}>{t("mentor.addSlot")}</button>
      </div>
      {slots === null ? (
        <div style={{ color: "var(--text-3)", fontSize: 13, textAlign: "center", padding: 20 }}>{t("common.loading")}</div>
      ) : slots.length === 0 ? (
        <div style={{ color: "var(--text-3)", fontSize: 13, textAlign: "center", padding: 20 }}>{t("mentor.noSlots")}</div>
      ) : slots.map(s => (
        <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "12px 14px", background: "var(--surface-2)", border: "1px solid var(--border)",
          borderRadius: "var(--radius-sm)", marginBottom: 8 }}>
          <span style={{ fontSize: 13, color: "var(--text)" }}>{fmtDT(s.start_at)}
            <span style={{ color: "var(--text-3)", marginLeft: 8, fontSize: 11 }}>· {t(`booking.${s.status}`) || s.status}</span>
          </span>
          {s.status === "open" && (
            <button onClick={() => remove(s.id)} style={{ background: "none", border: "none", color: "#FF6B6B",
              fontSize: 12, cursor: "pointer" }}>{t("booking.cancel")}</button>
          )}
        </div>
      ))}
    </Sheet>
  );
};

// ── Both-sides booking management ─────────────────────────────────────────────
export const BookingsSheet = ({ onClose }) => {
  const { t } = useT();
  const [data, setData] = useState(null);

  const load = () => bookings.mine().then(setData).catch(e => { tgAlert(e.message); setData({ as_mentee: [], as_mentor: [] }); });
  useEffect(() => { load(); }, []);

  const act = async (id, action) => {
    if (action === "cancel" && !await tgConfirm(t("booking.cancel"))) return;
    try { await bookings.act(id, action); load(); }
    catch (e) { tgAlert(e.message); }
  };

  const Row = ({ b, role }) => (
    <div style={{ padding: "12px 14px", background: "var(--surface-2)", border: "1px solid var(--border)",
      borderRadius: "var(--radius-sm)", marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{b.other?.display_name || ""}</span>
        <span style={{ fontSize: 11, color: "var(--text-3)" }}>{t(`booking.${b.status}`) || b.status}</span>
      </div>
      <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>{fmtDT(b.start_at)}</div>
      {b.note && <div style={{ fontSize: 12, color: "var(--text-2)", marginTop: 4 }}>“{b.note}”</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        {role === "mentor" && b.status === "requested" && (
          <>
            <button onClick={() => act(b.id, "confirm")} style={{ background: "var(--accent)", border: "none",
              borderRadius: "var(--radius-sm)", color: "#fff", padding: "6px 14px", fontSize: 12, fontWeight: 700,
              cursor: "pointer" }}>{t("booking.confirm")}</button>
            <button onClick={() => act(b.id, "decline")} style={{ background: "rgba(255,107,107,0.1)",
              border: "1px solid rgba(255,107,107,0.25)", borderRadius: "var(--radius-sm)", color: "#FF6B6B",
              padding: "6px 14px", fontSize: 12, cursor: "pointer" }}>{t("booking.decline")}</button>
          </>
        )}
        {role === "mentee" && (b.status === "requested" || b.status === "confirmed") && (
          <button onClick={() => act(b.id, "cancel")} style={{ background: "var(--surface-3)", border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)", color: "var(--text-2)", padding: "6px 14px", fontSize: 12,
            cursor: "pointer" }}>{t("booking.cancel")}</button>
        )}
      </div>
    </div>
  );

  return (
    <Sheet title={t("booking.title")} onClose={onClose}>
      {data === null ? (
        <div style={{ color: "var(--text-3)", fontSize: 13, textAlign: "center", padding: 20 }}>{t("common.loading")}</div>
      ) : (data.as_mentee.length === 0 && data.as_mentor.length === 0) ? (
        <div style={{ color: "var(--text-3)", fontSize: 13, textAlign: "center", padding: 20 }}>{t("booking.none")}</div>
      ) : (
        <>
          {data.as_mentee.length > 0 && (
            <>
              <div className="section-label">{t("booking.asMentee")}</div>
              {data.as_mentee.map(b => <Row key={b.id} b={b} role="mentee" />)}
            </>
          )}
          {data.as_mentor.length > 0 && (
            <>
              <div className="section-label" style={{ marginTop: 14 }}>{t("booking.asMentor")}</div>
              {data.as_mentor.map(b => <Row key={b.id} b={b} role="mentor" />)}
            </>
          )}
        </>
      )}
    </Sheet>
  );
};
```

- [ ] **Step 2: Build to verify**

Run: `npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/components/MentorSheets.jsx
git commit -m "feat: mentor sheets (book slot / manage slots / bookings)"
```

---

## Task 17: MentorsScreen browse list

**Files:**
- Create: `src/screens/MentorsScreen.jsx`

- [ ] **Step 1: Create the screen**

Create `src/screens/MentorsScreen.jsx`:

```jsx
import { useState, useEffect } from "react";
import { mentors } from "../api";
import { useT } from "../i18n";
import { tgAlert } from "../tg";
import { AvatarEl } from "../components/Shared";
import { UserProfileModal } from "../components/UserProfileModal";

export const MentorsScreen = ({ onClose }) => {
  const { t } = useT();
  const [list, setList] = useState(null);
  const [viewingId, setViewingId] = useState(null);

  useEffect(() => {
    mentors.list().then(setList).catch(e => { tgAlert(e.message); setList([]); });
  }, []);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 230, background: "var(--bg)", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "calc(var(--safe-t) + 12px) 20px 12px", borderBottom: "1px solid var(--border)" }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 800 }}>{t("mentor.browse")}</h2>
        <button onClick={onClose} style={{ background: "var(--surface-2)", border: "none", borderRadius: 99, padding: "6px 14px", color: "var(--text-2)", fontSize: 13, cursor: "pointer" }}>{t("common.back")}</button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px 40px" }}>
        {list === null ? (
          <div style={{ textAlign: "center", padding: 30, color: "var(--text-3)" }}>{t("common.loading")}</div>
        ) : list.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "var(--text-3)" }}>{t("mentor.noSlots")}</div>
        ) : list.map(m => (
          <div key={m.id} onClick={() => setViewingId(m.id)} style={{
            display: "flex", gap: 12, alignItems: "center", padding: "14px", marginBottom: 10,
            background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
            cursor: "pointer",
          }}>
            <AvatarEl name={m.display_name} size={48} photoUrl={m.photo_url} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15 }}>{m.display_name}</div>
              {m.topics?.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                  {m.topics.slice(0, 4).map(tp => (
                    <span key={tp} style={{ background: "rgba(167,139,250,0.15)", color: "#A78BFA", borderRadius: 99, padding: "2px 8px", fontSize: 10, fontWeight: 600 }}>{tp}</span>
                  ))}
                </div>
              )}
              <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>{t("mentor.openSlots", { n: m.open_slots })}</div>
            </div>
          </div>
        ))}
      </div>
      {viewingId && <UserProfileModal userId={viewingId} onClose={() => setViewingId(null)} />}
    </div>
  );
};
```

- [ ] **Step 2: Build to verify**

Run: `npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/screens/MentorsScreen.jsx
git commit -m "feat: MentorsScreen browse list"
```

---

## Task 18: Settings entries — mentor toggle, my slots, my bookings, find a mentor

**Files:**
- Modify: `src/screens/SettingsScreen.jsx`

- [ ] **Step 1: Imports + state**

At the top of `src/screens/SettingsScreen.jsx`, add imports (match the existing
relative paths — components are under `../components`):

```jsx
import { MentorSlotsSheet, BookingsSheet } from "../components/MentorSheets";
import { MentorsScreen } from "./MentorsScreen";
```

Inside `SettingsScreen`, after the existing `useState` hooks (`editOpen`,
`adminOpen`), add:

```jsx
  const [slotsOpen, setSlotsOpen] = useState(false);
  const [bookingsOpen, setBookingsOpen] = useState(false);
  const [mentorsOpen, setMentorsOpen] = useState(false);
```

- [ ] **Step 2: Render the MentorsScreen overlay**

After the existing Admin-Panel overlay early-return block (`if (adminOpen) return
(...)`), add:

```jsx
  if (mentorsOpen) return (
    <MentorsScreen onClose={() => setMentorsOpen(false)} />
  );
```

- [ ] **Step 3: Add the buttons**

In the render (after the "Edit Profile Button" block, before the Admin Dashboard
block), add the mentor/booking entries:

```jsx
        {/* Find a mentor */}
        <button onClick={() => setMentorsOpen(true)} style={{
          width: "100%", background: "var(--surface-3)", border: "1px solid var(--border)",
          borderRadius: "var(--radius-sm)", padding: "14px", cursor: "pointer", color: "var(--text)",
          fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15, marginBottom: 10,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        }}>🎓 {t("mentor.browse")}</button>

        {/* My bookings (everyone) */}
        <button onClick={() => setBookingsOpen(true)} style={{
          width: "100%", background: "var(--surface-3)", border: "1px solid var(--border)",
          borderRadius: "var(--radius-sm)", padding: "14px", cursor: "pointer", color: "var(--text)",
          fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15, marginBottom: 10,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        }}>📅 {t("booking.title")}</button>

        {/* My mentor slots (mentors only) */}
        {user.mentor?.is_mentor && (
          <button onClick={() => setSlotsOpen(true)} style={{
            width: "100%", background: "var(--surface-3)", border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)", padding: "14px", cursor: "pointer", color: "var(--text)",
            fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15, marginBottom: 10,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}>🗓️ {t("mentor.mySlots")}</button>
        )}
```

- [ ] **Step 4: Render the sheets**

Just before the final closing `</Page>` (after the Sign Out button), add the
sheet portals:

```jsx
        {slotsOpen && <MentorSlotsSheet onClose={() => setSlotsOpen(false)} />}
        {bookingsOpen && <BookingsSheet onClose={() => setBookingsOpen(false)} />}
```

- [ ] **Step 5: Build to verify**

Run: `npm run build`
Expected: success.

- [ ] **Step 6: Commit**

```bash
git add src/screens/SettingsScreen.jsx
git commit -m "feat: Settings entries for mentors / my slots / my bookings"
```

---

## Task 19: Mentor bio + topics fields in EditProfile

**Files:**
- Modify: `src/screens/EditProfileScreen.jsx`

- [ ] **Step 1: Confirm the form-state shape (already known)**

`EditProfileScreen` holds all editable `/users/me` fields in one `form` state
object updated via a `set(key, value)` helper, initialised from `me` (e.g.
`currently_building: me?.currently_building || ""`, `portfolio_links: [...]`). The
save handler calls `users.updateMe({...})` with a flat payload (currently_building,
portfolio_links, …) and then `onSaved()`. The mentor fields slot into the same
`form` object + payload. The file already imports `users` from `../api` and
`useT`. Use the existing `form`/`set` pattern (do NOT add separate `useState`
hooks — match the file).

- [ ] **Step 2: Seed the mentor fields into the `form` initial state**

In the `useState({...})` form initializer, alongside `currently_building` /
`portfolio_links`, add:

```jsx
    is_mentor: !!me?.mentor?.is_mentor,
    mentor_bio: me?.mentor?.bio || "",
    mentor_topics: (me?.mentor?.topics || []).join(", "),
```

- [ ] **Step 3: Add the UI** (place near the currently_building / portfolio editor,
inside the same form column):

```jsx
        <div style={{ marginTop: 18 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
            <input type="checkbox" checked={form.is_mentor}
              onChange={e => set("is_mentor", e.target.checked)} />
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>{t("mentor.become")}</span>
          </label>
        </div>
        {form.is_mentor && (
          <>
            <div style={{ marginTop: 12 }}>
              <div className="section-label">{t("mentor.bioLabel")}</div>
              <textarea value={form.mentor_bio} maxLength={400}
                onChange={e => set("mentor_bio", e.target.value)}
                placeholder={t("mentor.bioPh")} rows={3} style={{ width: "100%", boxSizing: "border-box",
                  background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
                  color: "var(--text)", padding: "10px 12px", fontSize: 13, resize: "vertical" }} />
            </div>
            <div style={{ marginTop: 12 }}>
              <div className="section-label">{t("mentor.topicsLabel")}</div>
              <input value={form.mentor_topics} onChange={e => set("mentor_topics", e.target.value)}
                placeholder={t("mentor.topicsPh")} style={{ width: "100%", boxSizing: "border-box",
                  background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
                  color: "var(--text)", padding: "10px 12px", fontSize: 13 }} />
            </div>
          </>
        )}
```

- [ ] **Step 4: Include the mentor fields in the save payload**

In the save handler's `users.updateMe({...})` payload object (next to
`currently_building` / `portfolio_links`), add:

```jsx
        is_mentor: form.is_mentor,
        mentor_bio: form.is_mentor ? form.mentor_bio.trim() : "",
        mentor_topics: form.is_mentor
          ? form.mentor_topics.split(",").map(s => s.trim()).filter(Boolean).slice(0, 6)
          : [],
```

(The backend `PATCH /me` handler sanitizes: caps 6 topics, trims, drops blanks,
clamps bio to 400. Sending empties when mentor mode is off clears them. `is_mentor:
false` is preserved because `model_dump(exclude_none=True)` drops only `None`, not
`False`.)

- [ ] **Step 5: Build to verify**

Run: `npm run build`
Expected: success.

- [ ] **Step 6: Commit**

```bash
git add src/screens/EditProfileScreen.jsx
git commit -m "feat: mentor bio + topics in EditProfile"
```

---

## Task 20: Render the new notification types in the inbox

**Files:**
- Modify: `src/components/InboxModal.jsx`

- [ ] **Step 1: Add the new types to `notifText` + the emoji map**

In `src/components/InboxModal.jsx`, extend the `notifText` switch with the five
new cases (before `default:`):

```jsx
    case "new_follower":      return t("inbox.new_follower", { name });
    case "project_update":    return t("inbox.project_update", { project: proj });
    case "booking_request":   return t("inbox.booking_request", { name });
    case "booking_confirmed": return t("inbox.booking_confirmed", { name });
    case "booking_declined":  return t("inbox.booking_declined", { name });
```

Extend `TYPE_EMOJI`:

```jsx
const TYPE_EMOJI = {
  mutual: "🎉", interest: "💜", intro: "👋",
  application: "🔔", accepted: "✅", declined: "📭",
  new_follower: "➕", project_update: "📣",
  booking_request: "📅", booking_confirmed: "✅", booking_declined: "🚫",
};
```

(Tap behaviour: rows with an `actor` already open `UserProfileModal` — that covers
`new_follower` and the `booking_*` types whose `actor_id` is the other party. The
`project_update` rows carry a `project` but no `actor`, so they're non-clickable in
this minimal inbox — consistent with how `accepted`/`declined` already render
project-only items. The full project deep-link from the inbox is out of scope this
batch.)

- [ ] **Step 2: Build to verify**

Run: `npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/components/InboxModal.jsx
git commit -m "feat: render new_follower / project_update / booking_* in inbox"
```

---

## Task 21: Full verification + push

- [ ] **Step 1: Full backend suite**

Run: `cd backend && python -m pytest -q`
Expected: all pass (existing + `test_follow.py` + `test_project_updates.py` +
`test_role_apply.py` + `test_mentors.py`).

- [ ] **Step 2: Frontend build**

Run: `npm run build`
Expected: success (landing prebuild + vite build).

- [ ] **Step 3: Push**

```bash
git push
```

- [ ] **Step 4: Verify on the deployed app**
  - Open another member's profile: tap Follow (button flips to Following, follower
    count ticks up), confirm they get a `new_follower` inbox item; if they're a
    mentor, the mentor card shows and "Book a session" lists their open slots.
  - Open a project (not yours): tap Follow; as the founder, post an update and
    confirm followers + members get a `project_update` inbox item and see the
    update in the Updates section; delete an update as the founder.
  - Apply to a project with a role ("Backend dev"); as the founder, see the
    requested role in the requests list.
  - In Settings → Edit Profile, toggle "Become a mentor" + add bio/topics; add a
    slot in "My mentor slots"; as another user, book it; back as the mentor,
    confirm/decline in "My bookings" and confirm both sides get the inbox items.

---

## Self-review notes

- **Spec coverage:**
  - **Follow (users + projects)** ✓ T1 (`Follow` polymorphic table) + T4
    (`_connection_extras` counts + `is_following`) + T5 (attach to profiles) + T6
    (`/follow` POST/DELETE, idempotent, `new_follower` on user-follow only,
    `/me/following`) + T7 (project follow fields) + T13 `FollowButton` + T14/T15
    UI.
  - **Project updates feed** ✓ T1 (`ProjectUpdate`) + T8 (post/list/delete +
    fan-out `project_update` to followers ∪ members − author) + T15 UI (composer +
    list) + T20 inbox.
  - **Role-specific apply** ✓ T1 (`role` column) + T9 (optional `_ApplyBody`,
    backward-compatible no-body path, surfaced in `my-requests`) + T15 UI (role
    prompt) — founder sees the role.
  - **Mentor mode + in-app booking/calendar (FULL)** ✓ T1 (`is_mentor`/bio/topics
    cols + `MentorSlot` + `Booking`) + T10 (mentor-profile write in PATCH /me,
    `/mentors` list, slots CRUD, full booking state machine confirm/decline/cancel
    with slot-freeing + `booking_request`/`confirmed`/`declined`) + T16 sheets +
    T17 MentorsScreen + T18 Settings entries + T19 EditProfile + T20 inbox.
- **Chosen availability model = explicit open slots** (concrete `mentor_slots`
  rows, not recurring rules), justified in the spec + this plan's header. State
  machine documented; slot freed on decline/cancel; double-book → 409 (status
  guard + unique `(mentor,start_at)` constraint).
- **Reuses the established patterns:** `_connection_extras` mirrors
  `_profile_extras`/`_trust_extras` (plain dict attached via `setattr` loop on the
  validated schema, on both `GET /users/{id}` and `/users/me`) — T4/T5. All
  notifications go through `add_notification` into the existing `Notification`
  table — T6/T8/T10 — and the inbox learns the new types — T20.
- **Type/name consistency:**
  - `_connection_extras` returns exactly the schema fields set in T5:
    `follower_count`, `following_count`, `is_following`, `mentor`.
  - `MentorOut{is_mentor,bio,topics}` ↔ builder `_mentor_dict` dict ↔ frontend
    `user.mentor.is_mentor/.bio/.topics` (T14).
  - `FollowIn{target_type,target_id}` ↔ `users.follow/unfollow` api payloads (T11)
    ↔ endpoint signatures (T6).
  - `ProjectUpdateIn{text}`/`ProjectUpdateOut` ↔ `projects.postUpdate/updates`
    (T11) ↔ endpoints (T8) ↔ ProjectDetail (T15).
  - `SlotIn{start_at}`, `BookingIn{slot_id,note}`, `BookingActionIn{action}` ↔
    `mentors.createSlot`/`bookings.book`/`bookings.act` (T11) ↔ mentor router
    (T10) ↔ MentorSheets (T16).
  - `role` on apply: api `projects.apply(id, role)` (T11) → `_ApplyBody{role}`
    (T9) → `ApplicationOut.role` (T3) → requests UI (T15).
  - New notification types `new_follower`, `project_update`, `booking_request`,
    `booking_confirmed`, `booking_declined` produced in T6/T8/T10, consumed in T20
    + i18n keys `inbox.*` in T12. `Notification` already carries
    `type`+`actor_id`+`project_id` (no model change).
- **Idempotency/migrations:** the four tables via `create_all`; the three `users`
  columns + `project_applications.role` via `ADD COLUMN IF NOT EXISTS`; all index
  migrations `IF NOT EXISTS` (T2). The `_ApplyBody` is optional so existing
  no-body apply callers are unaffected.
- **Auth/abuse:** all write endpoints are auth'd (`get_current_user`); follow
  rejects self-user-follow + validates target existence; follow + slot creation
  are idempotent/unique-guarded (no row blow-up under double-tap); booking is
  guarded against double-book (status check + caught IntegrityError → 409);
  booking actions are role-gated (mentor confirm/decline, mentee cancel, else
  403); project updates are founder-only; mentor profile write is self-only via
  PATCH /me with sanitization (≤6 topics, ≤400 bio).
- **No placeholders:** every step contains complete code. The one ordering caveat
  is flagged explicitly: `MentorSheets.jsx` (T16) must exist before the
  `UserProfileModal` build in T14 resolves its import — the note in T14 Step 5
  says to implement T16 first (or reorder). No silent TODOs.
- **No `done` cron + no recurrence layer** are intentionally deferred (spec "Out
  of scope") — confirmed-past sessions are labelled client-side; a future
  recurrence layer can simply generate `mentor_slots` rows, leaving this schema
  unchanged.
