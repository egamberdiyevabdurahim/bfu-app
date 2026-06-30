# Discovery & org (Batch D) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add discovery + lightweight org on top of A/B/C: a central searchable
"open roles" list across all live projects, a derived "frequent collaborators" view
on profiles, a project group-chat deep-link flow (Telegram can't auto-create
groups), and a FULL achievements/quests system computed from existing data.

**Architecture:** One new table — `project_roles` (founder-declared open positions)
— plus one nullable `group_link` column on `projects`. Frequent collaborators are
derived live by a new `_collaborators(db, user)` helper attached to the profile
endpoints exactly like Batch A's `_profile_extras` / B's `_trust_extras` / C's
`_connection_extras`. Achievements are derived live by a new
`GET /users/me/achievements` (seven cheap `COUNT`/`EXISTS` queries — no stored
state, no notification). A new `app/routers/roles.py` owns the aggregate `GET
/roles`; per-project role CRUD + the `group_link` write live on the existing
`projects` router. No new `Notification` types this batch.

**Tech Stack:** FastAPI + SQLAlchemy 2 async + Postgres (backend), React 19 + Vite
(frontend), pytest (tests). Migrations are idempotent `CREATE INDEX ... IF NOT
EXISTS` / `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` run in `app/main.py` lifespan
(no Alembic); the new table itself is created by `Base.metadata.create_all`.

**Spec:** `docs/superpowers/specs/2026-07-01-batchD-discovery-design.md`

**Depends on:** Batch A (`_profile_extras`, `_validate_from_user`,
`_PROFILE_EXTRAS_FIELDS` in `app/routers/users.py`), Batch B (trust models
`Endorsement`/`Vouch`), and Batch C (`project_applications.role`, the
`_connection_extras` wiring on the profile endpoints, and `users.is_mentor`). This
plan stacks on C's stated end-state; if C is not yet merged, the only C touchpoints
D reads are `users.is_mentor` (achievements) and the existing extras-attach loops in
`get_user_profile` / `get_me` (collaborators attach next to them).

**Sourcing decision (open roles):** a founder-declared `project_roles` table — open
roles can't be derived from `project_applications.role` (those are roles applicants
*asked for*, invisible for a project with no applications) nor from `ProjectReqSkill`
(skills, not roles).

**Achievements decision:** purely derived (recomputed on read), matching the
codebase "derive, don't denormalize" rule; the `achievement_unlocked` notification
is SKIPPED because a reliable just-unlocked transition needs stored prior state.

---

## File structure

- `backend/app/models/role.py` — new: `ProjectRole`
- `backend/app/models/__init__.py` — import the new model
- `backend/app/main.py` — idempotent column + index migrations; include the roles router
- `backend/app/schemas/role.py` — new: role request bodies + outputs
- `backend/app/schemas/project.py` — `group_link` on `ProjectResponse`; `group_link` on `ProjectUpdate`
- `backend/app/schemas/user.py` — `Collaborators` + `collaborators` field on `UserPublic`/`UserResponse`
- `backend/app/routers/users.py` — `_collaborators` helper, attach to profile endpoints, `GET /me/achievements`
- `backend/app/routers/projects.py` — per-project role CRUD + `group_link` validation in `PATCH`
- `backend/app/routers/roles.py` — new router: aggregate `GET /roles`
- `backend/tests/test_project_roles.py` — new
- `backend/tests/test_open_roles.py` — new
- `backend/tests/test_group_link.py` — new
- `backend/tests/test_collaborators.py` — new
- `backend/tests/test_achievements.py` — new
- `src/api.js` — roles / achievements client methods + `group_link` on update
- `src/i18n.jsx` — new keys (en/uz/ru)
- `src/tg.js` — `projectChatLink` deep-link helper (re-export of openLink usage)
- `src/screens/OpenRolesScreen.jsx` — new searchable open-roles screen
- `src/screens/DiscoverScreen.jsx` — entry point to OpenRolesScreen
- `src/components/ProjectDetail.jsx` — Open-roles section + Project-chat row
- `src/components/ProfileExtras.jsx` — Frequent-collaborators block
- `src/components/AchievementsSection.jsx` — new achievements grid
- `src/screens/SettingsScreen.jsx` — mount AchievementsSection

---

## Task 1: ProjectRole model + group_link column

**Files:**
- Create: `backend/app/models/role.py`
- Modify: `backend/app/models/project.py`, `backend/app/models/__init__.py`

- [ ] **Step 1: Create the role model**

Create `backend/app/models/role.py`:

```python
from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ProjectRole(Base):
    """A founder-declared open position on a project (e.g. "Backend dev"). The
    aggregate /roles list shows every role whose project is live and whose
    is_filled is False. Distinct from project_applications.role (what an applicant
    asked for) and ProjectReqSkill (a required skill, not a position)."""
    __tablename__ = "project_roles"
    __table_args__ = (
        UniqueConstraint("project_id", "name", name="uq_project_role_project_name"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(80))
    is_filled: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
```

- [ ] **Step 2: Add the `group_link` column to `Project`**

In `backend/app/models/project.py`, in the `Project` class, after the `view_count`
column (~line 29), add:

```python
    # Batch D — founder-pasted Telegram group invite link for the project chat.
    # Bots can't create groups; the founder makes the group, adds the bot, and
    # pastes its t.me invite here. Mirrors schools.group_link / learning_centers.
    group_link: Mapped[str | None] = mapped_column(String(512), nullable=True)
```

(`String` is already imported in `project.py`.)

- [ ] **Step 3: Register the new model on Base.metadata**

In `backend/app/models/__init__.py`, add the import after the trust import line:

```python
from app.models.role import ProjectRole  # noqa: F401
```

Add `"ProjectRole",` to `__all__` (after `"Endorsement", "Vouch", "ProjectRating",`).

- [ ] **Step 4: Verify it imports**

Run: `cd backend && python -c "import app.models; from app.models.role import ProjectRole; from app.models.project import Project; assert hasattr(Project,'group_link'); print('ok')"`
Expected: `ok`.

- [ ] **Step 5: Commit**

```bash
git add backend/app/models/role.py backend/app/models/project.py backend/app/models/__init__.py
git commit -m "model: project_roles table + projects.group_link column"
```

---

## Task 2: Idempotent column + index migrations

**Files:**
- Modify: `backend/app/main.py` (the `migrations` list)

The `project_roles` table is created by `create_all`. The `projects.group_link`
column must be added on the live Postgres DB via idempotent `ADD COLUMN IF NOT
EXISTS`; we also add a `CREATE INDEX IF NOT EXISTS` for the role→project lookup.

- [ ] **Step 1: Add migration statements**

In `backend/app/main.py`, inside the `migrations = [...]` list, after the Batch-B
trust-index block (the line ending `...ON project_ratings (project_id, rater_id,
ratee_id);`), add:

```python
        # --- Batch D: discovery + org (project_roles table via create_all) ---
        "ALTER TABLE projects ADD COLUMN IF NOT EXISTS group_link VARCHAR(512);",
        "CREATE INDEX IF NOT EXISTS ix_project_roles_project ON project_roles (project_id);",
        "CREATE INDEX IF NOT EXISTS ix_project_roles_open ON project_roles (is_filled);",
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_project_role_project_name "
        "ON project_roles (project_id, name);",
```

(If Batch C's migration block is already present, append after it; ordering among
idempotent statements doesn't matter.)

- [ ] **Step 2: Commit**

```bash
git add backend/app/main.py
git commit -m "migrate: Batch D project_roles indexes + projects.group_link"
```

---

## Task 3: Schemas — role bodies + project/profile fields

**Files:**
- Create: `backend/app/schemas/role.py`
- Modify: `backend/app/schemas/project.py`, `backend/app/schemas/user.py`

- [ ] **Step 1: Create the role schema file**

Create `backend/app/schemas/role.py`:

```python
from datetime import datetime

from pydantic import BaseModel


class RoleIn(BaseModel):
    name: str


class RoleFilledIn(BaseModel):
    is_filled: bool


class ProjectMini(BaseModel):
    id: int
    name: str
    type: str


class RoleOut(BaseModel):
    """A single project's role (project-detail view)."""
    id: int
    name: str
    is_filled: bool = False
    created_at: datetime | None = None


class OpenRoleOut(BaseModel):
    """An open role in the aggregate /roles list, carrying its project."""
    id: int
    name: str
    project: ProjectMini
    created_at: datetime | None = None
```

- [ ] **Step 2: Add `group_link` to `project.py`**

In `backend/app/schemas/project.py`:

Add to `ProjectResponse` (after `member_count`, before `created_at`):

```python
    group_link: str | None = None
```

Add to `ProjectUpdate` (after `is_hiring`):

```python
    group_link: str | None = None
```

- [ ] **Step 3: Add `Collaborators` + `collaborators` field to `user.py`**

In `backend/app/schemas/user.py`, after the `MutualConnections` class (~line 68),
add:

```python
class CollaboratorMini(UserMini):
    shared: int = 0   # how many projects this person shares with the profile owner


class Collaborators(BaseModel):
    count: int = 0
    preview: list[CollaboratorMini] = []
```

Add this field to **both** `UserPublic` and `UserResponse` (after
`mutual_connections`, before `model_config`):

```python
    collaborators: Collaborators = Collaborators()
```

- [ ] **Step 4: Verify imports compile**

Run: `cd backend && python -c "import app.schemas.user, app.schemas.project, app.schemas.role; print('ok')"`
Expected: `ok`.

- [ ] **Step 5: Commit**

```bash
git add backend/app/schemas/role.py backend/app/schemas/project.py backend/app/schemas/user.py
git commit -m "schema: role outputs + project group_link + profile collaborators"
```

---

## Task 4: Per-project role CRUD (TDD)

**Files:**
- Modify: `backend/app/routers/projects.py`
- Test: `backend/tests/test_project_roles.py` (new)

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_project_roles.py`:

```python
"""Batch D per-project roles: founder-only add/list/toggle/delete."""
import pytest

pytestmark = pytest.mark.asyncio


async def _mk_project(db, creator_id, name, **kw):
    from app.models.project import Project
    defaults = dict(type="startup", creator_id=creator_id, name=name, is_active=True,
                    is_hiring=True, is_draft=False, is_deleted=False, is_approved=True)
    defaults.update(kw)
    p = Project(**defaults)
    db.add(p)
    await db.commit()
    await db.refresh(p)
    return p


async def test_founder_adds_and_lists_roles(make_user, as_user, db):
    from app.models.role import ProjectRole
    founder = await make_user(name="Founder")
    p = await _mk_project(db, founder.id, "Proj")
    c = as_user(founder)
    r = await c.post(f"/projects/{p.id}/roles", json={"name": "  Backend dev  "})
    assert r.status_code == 200, r.text
    rid = r.json()["id"]
    rows = (await db.execute(
        ProjectRole.__table__.select().where(ProjectRole.project_id == p.id)
    )).all()
    assert len(rows) == 1 and rows[0].name == "Backend dev"   # trimmed
    res = await c.get(f"/projects/{p.id}/roles")
    assert res.status_code == 200
    roles = res.json()["roles"]
    assert roles[0]["id"] == rid and roles[0]["is_filled"] is False


async def test_non_founder_cannot_add(make_user, as_user, db):
    founder = await make_user(name="Founder")
    other = await make_user(name="Other")
    p = await _mk_project(db, founder.id, "Proj")
    c = as_user(other)
    assert (await c.post(f"/projects/{p.id}/roles", json={"name": "Designer"})).status_code == 403


async def test_duplicate_role_case_insensitive(make_user, as_user, db):
    founder = await make_user(name="Founder")
    p = await _mk_project(db, founder.id, "Proj")
    c = as_user(founder)
    assert (await c.post(f"/projects/{p.id}/roles", json={"name": "Backend"})).status_code == 200
    assert (await c.post(f"/projects/{p.id}/roles", json={"name": "  backend "})).status_code == 409


async def test_empty_role_rejected(make_user, as_user, db):
    founder = await make_user(name="Founder")
    p = await _mk_project(db, founder.id, "Proj")
    c = as_user(founder)
    assert (await c.post(f"/projects/{p.id}/roles", json={"name": "   "})).status_code == 400


async def test_toggle_filled_and_delete(make_user, as_user, db):
    founder = await make_user(name="Founder")
    p = await _mk_project(db, founder.id, "Proj")
    c = as_user(founder)
    rid = (await c.post(f"/projects/{p.id}/roles", json={"name": "QA"})).json()["id"]
    r = await c.patch(f"/projects/{p.id}/roles/{rid}", json={"is_filled": True})
    assert r.status_code == 200 and r.json()["is_filled"] is True
    assert (await c.delete(f"/projects/{p.id}/roles/{rid}")).status_code == 204
    assert (await c.delete(f"/projects/{p.id}/roles/{rid}")).status_code == 404
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && python -m pytest tests/test_project_roles.py -v`
Expected: FAIL — routes missing.

- [ ] **Step 3: Implement the endpoints**

In `backend/app/routers/projects.py`, add imports near the top (after the existing
`from app.models.user import ...` line):

```python
from app.models.role import ProjectRole
from app.schemas.role import RoleIn, RoleFilledIn
```

Add a small founder-load helper and the four endpoints (place after the
`apply_to_project` handler):

```python
async def _load_owned_project(db: AsyncSession, project_id: int, user_id: int) -> Project:
    """Load a non-deleted project the caller founded, or raise 404/403."""
    project = (await db.execute(
        select(Project).where(Project.id == project_id, Project.is_deleted == False)
    )).scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.creator_id != user_id:
        raise HTTPException(status_code=403, detail="Not your project")
    return project


@router.get("/{project_id}/roles", response_model=dict)
async def list_project_roles(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """All roles on a project (open + filled), newest first. Public read."""
    project = (await db.execute(
        select(Project).where(Project.id == project_id, Project.is_deleted == False)
    )).scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    rows = (await db.execute(
        select(ProjectRole).where(ProjectRole.project_id == project_id)
        .order_by(ProjectRole.id.desc())
    )).scalars().all()
    return {
        "roles": [
            {"id": r.id, "name": r.name, "is_filled": bool(r.is_filled),
             "created_at": r.created_at.isoformat() if r.created_at else None}
            for r in rows
        ],
    }


@router.post("/{project_id}/roles", response_model=dict)
async def add_project_role(
    project_id: int,
    body: RoleIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Founder declares an open role. Case-insensitive dedupe → 409."""
    await _load_owned_project(db, project_id, current_user.id)
    name = (body.name or "").strip()[:80]
    if not name:
        raise HTTPException(status_code=400, detail="name required")
    existing = (await db.execute(
        select(ProjectRole).where(ProjectRole.project_id == project_id)
    )).scalars().all()
    if any(r.name.strip().lower() == name.lower() for r in existing):
        raise HTTPException(status_code=409, detail="Role already listed")
    role = ProjectRole(project_id=project_id, name=name, is_filled=False)
    db.add(role)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Role already listed")
    await db.refresh(role)
    return {"ok": True, "id": role.id}


@router.patch("/{project_id}/roles/{role_id}", response_model=dict)
async def set_role_filled(
    project_id: int,
    role_id: int,
    body: RoleFilledIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Founder marks a role filled/open (filled drops out of the open list)."""
    await _load_owned_project(db, project_id, current_user.id)
    role = (await db.execute(
        select(ProjectRole).where(ProjectRole.id == role_id,
                                  ProjectRole.project_id == project_id)
    )).scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    role.is_filled = bool(body.is_filled)
    await db.commit()
    return {"ok": True, "is_filled": role.is_filled}


@router.delete("/{project_id}/roles/{role_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project_role(
    project_id: int,
    role_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Founder removes a role."""
    await _load_owned_project(db, project_id, current_user.id)
    role = (await db.execute(
        select(ProjectRole).where(ProjectRole.id == role_id,
                                  ProjectRole.project_id == project_id)
    )).scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    await db.delete(role)
    await db.commit()
```

(`IntegrityError`, `select`, `status`, `HTTPException`, `Depends` are already
imported in `projects.py`.)

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && python -m pytest tests/test_project_roles.py -v`
Expected: all passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/routers/projects.py backend/tests/test_project_roles.py
git commit -m "feat: per-project open-role CRUD (founder-only)"
```

---

## Task 5: Aggregate `GET /roles` (TDD)

**Files:**
- Create: `backend/app/routers/roles.py`
- Modify: `backend/app/main.py` (include the router)
- Test: `backend/tests/test_open_roles.py` (new)

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_open_roles.py`:

```python
"""Batch D aggregate /roles: open roles across all live projects, searchable."""
import pytest

pytestmark = pytest.mark.asyncio


async def _mk_project(db, creator_id, name, **kw):
    from app.models.project import Project
    defaults = dict(type="startup", creator_id=creator_id, name=name, is_active=True,
                    is_hiring=True, is_draft=False, is_deleted=False, is_approved=True)
    defaults.update(kw)
    p = Project(**defaults)
    db.add(p)
    await db.commit()
    await db.refresh(p)
    return p


async def _add_role(db, project_id, name, is_filled=False):
    from app.models.role import ProjectRole
    r = ProjectRole(project_id=project_id, name=name, is_filled=is_filled)
    db.add(r)
    await db.commit()
    await db.refresh(r)
    return r


async def test_lists_open_roles_with_project(make_user, as_user, db):
    founder = await make_user(name="Founder")
    viewer = await make_user(name="V")
    p = await _mk_project(db, founder.id, "Acme")
    await _add_role(db, p.id, "Backend dev")
    await _add_role(db, p.id, "Designer", is_filled=True)   # filled → excluded
    c = as_user(viewer)
    res = await c.get("/roles")
    assert res.status_code == 200, res.text
    roles = res.json()["roles"]
    names = {r["name"] for r in roles}
    assert "Backend dev" in names and "Designer" not in names
    row = next(r for r in roles if r["name"] == "Backend dev")
    assert row["project"]["id"] == p.id and row["project"]["name"] == "Acme"


async def test_excludes_non_live_projects(make_user, as_user, db):
    founder = await make_user(name="Founder")
    viewer = await make_user(name="V")
    draft = await _mk_project(db, founder.id, "Draft", is_draft=True)
    deleted = await _mk_project(db, founder.id, "Deleted", is_deleted=True)
    unapproved = await _mk_project(db, founder.id, "Pending", is_approved=False)
    not_hiring = await _mk_project(db, founder.id, "Closed", is_hiring=False)
    inactive = await _mk_project(db, founder.id, "Paused", is_active=False)
    for p in (draft, deleted, unapproved, not_hiring, inactive):
        await _add_role(db, p.id, "Backend dev")
    c = as_user(viewer)
    res = await c.get("/roles")
    assert res.json()["roles"] == []


async def test_search_filters_by_name(make_user, as_user, db):
    founder = await make_user(name="Founder")
    viewer = await make_user(name="V")
    p = await _mk_project(db, founder.id, "Acme")
    await _add_role(db, p.id, "Backend developer")
    await _add_role(db, p.id, "Graphic designer")
    c = as_user(viewer)
    res = await c.get("/roles", params={"q": "design"})
    names = {r["name"] for r in res.json()["roles"]}
    assert names == {"Graphic designer"}
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && python -m pytest tests/test_open_roles.py -v`
Expected: FAIL — `/roles` route missing (404).

- [ ] **Step 3: Create the roles router**

Create `backend/app/routers/roles.py`:

```python
"""Aggregate open-roles discovery across all live projects."""
from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.database import get_db
from app.models.project import Project
from app.models.role import ProjectRole
from app.models.user import User

router = APIRouter(prefix="/roles", tags=["roles"])

_LIMIT = 200


@router.get("", response_model=dict)
async def open_roles(
    q: str | None = Query(None, max_length=80),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Every OPEN role across approved + hiring + active + non-draft +
    non-deleted projects, newest first. `q` filters by role name (case-insensitive
    substring)."""
    stmt = (
        select(ProjectRole, Project)
        .join(Project, Project.id == ProjectRole.project_id)
        .where(
            ProjectRole.is_filled == False,
            Project.is_deleted == False,
            Project.is_draft == False,
            Project.is_approved == True,
            Project.is_hiring == True,
            Project.is_active == True,
        )
        .order_by(ProjectRole.id.desc())
        .limit(_LIMIT)
    )
    if q and q.strip():
        stmt = stmt.where(func.lower(ProjectRole.name).like(f"%{q.strip().lower()}%"))
    rows = (await db.execute(stmt)).all()
    return {
        "roles": [
            {
                "id": role.id,
                "name": role.name,
                "project": {"id": proj.id, "name": proj.name, "type": proj.type},
                "created_at": role.created_at.isoformat() if role.created_at else None,
            }
            for role, proj in rows
        ],
    }
```

- [ ] **Step 4: Include the router in `main.py`**

In `backend/app/main.py`, add `roles` to the routers import line:

```python
from app.routers import admin, auth, events, partners, projects, public, regions, roles, search, users
```

And include it (after `app.include_router(projects.router)`):

```python
app.include_router(roles.router)
```

- [ ] **Step 5: Run to verify it passes**

Run: `cd backend && python -m pytest tests/test_open_roles.py -v`
Expected: all passed.

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/roles.py backend/app/main.py backend/tests/test_open_roles.py
git commit -m "feat: GET /roles aggregate open-roles list (searchable)"
```

---

## Task 6: `group_link` on PATCH /projects/{id} (TDD)

**Files:**
- Modify: `backend/app/routers/projects.py` (`update_project`)
- Test: `backend/tests/test_group_link.py` (new)

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_group_link.py`:

```python
"""Batch D project group_link: founder sets a t.me invite, surfaced on the project."""
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


async def test_founder_sets_valid_group_link(make_user, as_user, db):
    founder = await make_user(name="Founder")
    p = await _mk_project(db, founder.id, "Proj")
    c = as_user(founder)
    r = await c.patch(f"/projects/{p.id}", json={"group_link": "https://t.me/+abc123"})
    assert r.status_code == 200, r.text
    assert r.json()["group_link"] == "https://t.me/+abc123"
    # Read-back via GET.
    res = await c.get(f"/projects/{p.id}")
    assert res.json()["group_link"] == "https://t.me/+abc123"


async def test_non_telegram_url_rejected(make_user, as_user, db):
    founder = await make_user(name="Founder")
    p = await _mk_project(db, founder.id, "Proj")
    c = as_user(founder)
    assert (await c.patch(f"/projects/{p.id}", json={"group_link": "https://evil.com/x"})).status_code == 422


async def test_clearing_group_link(make_user, as_user, db):
    founder = await make_user(name="Founder")
    p = await _mk_project(db, founder.id, "Proj")
    c = as_user(founder)
    await c.patch(f"/projects/{p.id}", json={"group_link": "https://t.me/joinchat/xyz"})
    r = await c.patch(f"/projects/{p.id}", json={"group_link": ""})
    assert r.status_code == 200
    assert r.json()["group_link"] is None


async def test_non_founder_cannot_set(make_user, as_user, db):
    founder = await make_user(name="Founder")
    other = await make_user(name="Other")
    p = await _mk_project(db, founder.id, "Proj")
    c = as_user(other)
    assert (await c.patch(f"/projects/{p.id}", json={"group_link": "https://t.me/x"})).status_code == 403
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && python -m pytest tests/test_group_link.py -v`
Expected: FAIL — `group_link` not validated/applied (the field is ignored or stored
without validation, so the `evil.com` 422 case fails).

- [ ] **Step 3: Validate + apply `group_link` in `update_project`**

In `backend/app/routers/projects.py`, add a small validator helper near the other
helpers (after `_load_owned_project` from Task 4):

```python
def _clean_group_link(raw: str | None) -> str | None:
    """Normalize a project group link: empty → None; must be a Telegram URL."""
    s = (raw or "").strip()
    if not s:
        return None
    low = s.lower()
    if not (low.startswith("https://t.me/") or low.startswith("https://telegram.me/")):
        raise HTTPException(status_code=422, detail="group_link must be a https://t.me/ link")
    return s[:512]
```

In `update_project` (the `@router.patch("/{project_id}")` handler), after the
ownership check and where the body fields are applied to the project, add handling
for `group_link`. Locate the part of the handler that iterates the update body /
sets fields, and insert (using `model_dump(exclude_unset=True)` semantics — the
existing handler already distinguishes set vs unset; mirror it):

```python
    data = body.model_dump(exclude_unset=True)
    if "group_link" in data:
        project.group_link = _clean_group_link(data.pop("group_link"))
```

Place this BEFORE the existing generic field-apply loop so `group_link` is consumed
here and not double-applied. If the existing handler applies fields via explicit
`if body.x is not None: project.x = body.x` lines rather than a loop, add an
equivalent explicit block:

```python
    if body.group_link is not None or "group_link" in body.model_fields_set:
        project.group_link = _clean_group_link(body.group_link)
```

(Use whichever matches the handler's existing style; the net effect is: an
explicitly-sent `group_link` — including `""` to clear — is validated and applied,
and an omitted `group_link` leaves the column untouched.)

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && python -m pytest tests/test_group_link.py -v`
Expected: all passed.

- [ ] **Step 5: Run the project suite (no regressions)**

Run: `cd backend && python -m pytest tests/ -k "project" -q`
Expected: existing project tests still pass.

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/projects.py backend/tests/test_group_link.py
git commit -m "feat: validate + store projects.group_link on PATCH (founder only)"
```

---

## Task 7: `_collaborators` builder + attach to profile endpoints (TDD)

**Files:**
- Modify: `backend/app/routers/users.py`
- Test: `backend/tests/test_collaborators.py` (new)

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_collaborators.py`:

```python
"""Batch D frequent collaborators: derived from 2+ shared projects."""
import pytest

pytestmark = pytest.mark.asyncio


async def _mk_project(db, creator_id, name, **kw):
    from app.models.project import Project
    defaults = dict(type="startup", creator_id=creator_id, name=name, is_active=True,
                    is_hiring=True, is_draft=False, is_deleted=False, is_approved=True)
    defaults.update(kw)
    p = Project(**defaults)
    db.add(p)
    await db.commit()
    await db.refresh(p)
    return p


async def _member(db, project_id, user_id):
    from app.models.project import ProjectMember
    db.add(ProjectMember(project_id=project_id, user_id=user_id))
    await db.commit()


async def test_collaborators_two_shared(make_user, db):
    from app.routers.users import _collaborators
    u = await make_user(name="U")
    buddy = await make_user(name="Buddy")
    once = await make_user(name="Once")
    # Two shared projects between u and buddy.
    p1 = await _mk_project(db, u.id, "P1")
    p2 = await _mk_project(db, u.id, "P2")
    p3 = await _mk_project(db, u.id, "P3")
    await _member(db, p1.id, u.id); await _member(db, p1.id, buddy.id)
    await _member(db, p2.id, u.id); await _member(db, p2.id, buddy.id)
    await _member(db, p3.id, u.id); await _member(db, p3.id, once.id)  # only 1 shared

    out = await _collaborators(db, u)
    ids = {c["id"]: c for c in out["preview"]}
    assert buddy.id in ids and ids[buddy.id]["shared"] == 2
    assert once.id not in ids        # only 1 shared → excluded
    assert u.id not in ids           # self excluded
    assert out["count"] == 1


async def test_founder_counts_as_participant(make_user, db):
    from app.routers.users import _collaborators
    founder = await make_user(name="F")
    u = await make_user(name="U")
    # founder created both; u is a member of both → they share 2 projects even
    # though founder has no project_members row.
    p1 = await _mk_project(db, founder.id, "P1")
    p2 = await _mk_project(db, founder.id, "P2")
    await _member(db, p1.id, u.id)
    await _member(db, p2.id, u.id)
    out = await _collaborators(db, u)
    ids = {c["id"]: c for c in out["preview"]}
    assert founder.id in ids and ids[founder.id]["shared"] == 2


async def test_drafts_and_deleted_excluded(make_user, db):
    from app.routers.users import _collaborators
    u = await make_user(name="U")
    buddy = await make_user(name="B")
    p1 = await _mk_project(db, u.id, "P1")
    draft = await _mk_project(db, u.id, "Draft", is_draft=True)
    await _member(db, p1.id, u.id); await _member(db, p1.id, buddy.id)
    await _member(db, draft.id, u.id); await _member(db, draft.id, buddy.id)
    out = await _collaborators(db, u)  # only 1 LIVE shared project → excluded
    assert out["count"] == 0


async def test_profile_endpoints_include_collaborators(make_user, as_user, db):
    u = await make_user(name="U")
    buddy = await make_user(name="B")
    p1 = await _mk_project(db, u.id, "P1")
    p2 = await _mk_project(db, u.id, "P2")
    await _member(db, p1.id, u.id); await _member(db, p1.id, buddy.id)
    await _member(db, p2.id, u.id); await _member(db, p2.id, buddy.id)

    c = as_user(buddy)
    res = await c.get(f"/users/{u.id}")
    assert res.status_code == 200, res.text
    assert res.json()["collaborators"]["count"] == 1
    me = as_user(u)
    res_me = await me.get("/users/me")
    assert res_me.json()["collaborators"]["count"] == 1
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && python -m pytest tests/test_collaborators.py -v`
Expected: FAIL — `cannot import name '_collaborators'`.

- [ ] **Step 3: Implement the helper**

In `backend/app/routers/users.py`, add the helper right after `_connection_ids`
(it reuses the same project-participation idea, so place it near that helper):

```python
async def _collaborators(db: AsyncSession, user: User) -> dict:
    """People the user has shared 2+ live projects with (co-member or co-founder).
    Derived live from project_members + project creators — no stored table."""
    # The user's live projects (member rows ∪ founded rows).
    my_proj = set((await db.execute(
        select(ProjectMember.project_id)
        .join(Project, Project.id == ProjectMember.project_id)
        .where(ProjectMember.user_id == user.id,
               Project.is_draft == False, Project.is_deleted == False)
    )).scalars().all())
    my_proj |= set((await db.execute(
        select(Project.id).where(Project.creator_id == user.id,
                                 Project.is_draft == False, Project.is_deleted == False)
    )).scalars().all())
    if not my_proj:
        return {"count": 0, "preview": []}

    # Per other-user, how many of MY projects they participate in (member OR creator).
    shared: dict[int, int] = {}
    member_rows = (await db.execute(
        select(ProjectMember.user_id, ProjectMember.project_id)
        .where(ProjectMember.project_id.in_(my_proj))
    )).all()
    creator_rows = (await db.execute(
        select(Project.creator_id, Project.id).where(Project.id.in_(my_proj))
    )).all()
    # Count DISTINCT (other_user, project) participation so a user who is both
    # member and creator of the same project isn't double-counted for it.
    seen: set[tuple[int, int]] = set()
    for uid, pid in list(member_rows) + list(creator_rows):
        if uid == user.id:
            continue
        key = (uid, pid)
        if key in seen:
            continue
        seen.add(key)
        shared[uid] = shared.get(uid, 0) + 1

    frequent = {uid: n for uid, n in shared.items() if n >= 2}
    if not frequent:
        return {"count": 0, "preview": []}

    top_ids = sorted(frequent, key=lambda uid: (-frequent[uid], uid))[:8]
    people = (await db.execute(
        select(User).where(User.id.in_(top_ids),
                           User.is_deleted == False, User.is_registered == True)
    )).scalars().all()
    by_id = {u.id: u for u in people}
    preview = [
        {"id": uid, "display_name": by_id[uid].display_name,
         "photo_url": by_id[uid].photo_url, "shared": frequent[uid]}
        for uid in top_ids if uid in by_id
    ]
    return {"count": len(frequent), "preview": preview}
```

(`select`, `ProjectMember`, `Project`, `User`, `AsyncSession` are already imported
in `users.py`.)

- [ ] **Step 4: Guard `collaborators` against from_attributes**

Add `"collaborators"` to the `_PROFILE_EXTRAS_FIELDS` set so the base
`model_validate` doesn't try to read a `collaborators` attr off the ORM `User`:

```python
_PROFILE_EXTRAS_FIELDS = {
    "currently_building", "currently_building_source", "portfolio_links",
    "founded_projects", "member_projects", "stats",
    "endorsements", "vouches", "vouch_count", "rating", "mutual_connections",
    "collaborators",
}
```

(If Batch C already added `"mentor"` etc. to this set, keep those and just add
`"collaborators"`.)

- [ ] **Step 5: Wire into `get_user_profile` and `get_me`**

In `get_user_profile` (the `GET /users/{id}` handler), after the existing extras
loops and before `return out`, add:

```python
    out.collaborators = await _collaborators(db, user)
```

In `get_me`, after the existing extras loops and before `return out`, add:

```python
    out.collaborators = await _collaborators(db, current_user)
```

(`setattr`-style assignment also works; direct attribute set is fine because the
schema field exists with a default.)

- [ ] **Step 6: Run to verify it passes**

Run: `cd backend && python -m pytest tests/test_collaborators.py -v`
Expected: all passed.

- [ ] **Step 7: Commit**

```bash
git add backend/app/routers/users.py backend/tests/test_collaborators.py
git commit -m "feat: _collaborators (frequent collaborators) on profile endpoints"
```

---

## Task 8: `GET /me/achievements` (TDD)

**Files:**
- Modify: `backend/app/routers/users.py`
- Test: `backend/tests/test_achievements.py` (new)

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_achievements.py`:

```python
"""Batch D achievements: derived earned + progress, no stored state."""
import pytest

pytestmark = pytest.mark.asyncio

KEYS = {"first_project", "first_application", "five_invites", "verified",
        "first_endorsement", "mentor", "first_vouch_received"}


def _by_key(body):
    return {a["key"]: a for a in body["achievements"]}


async def test_fresh_user_all_locked(make_user, as_user, db):
    me = await make_user(name="Me")
    c = as_user(me)
    res = await c.get("/users/me/achievements")
    assert res.status_code == 200, res.text
    ach = _by_key(res.json())
    assert set(ach) == KEYS
    assert all(a["earned"] is False for a in ach.values())
    assert ach["five_invites"]["progress"] == {"current": 0, "target": 5}
    assert ach["first_project"]["progress"] is None   # milestone


async def test_first_project_after_founding(make_user, as_user, db):
    from app.models.project import Project
    me = await make_user(name="Me")
    db.add(Project(type="startup", creator_id=me.id, name="P", is_active=True,
                   is_draft=False, is_deleted=False, is_approved=True))
    await db.commit()
    c = as_user(me)
    ach = _by_key((await c.get("/users/me/achievements")).json())
    assert ach["first_project"]["earned"] is True


async def test_draft_project_does_not_count(make_user, as_user, db):
    from app.models.project import Project
    me = await make_user(name="Me")
    db.add(Project(type="startup", creator_id=me.id, name="D", is_active=True,
                   is_draft=True, is_deleted=False, is_approved=True))
    await db.commit()
    c = as_user(me)
    ach = _by_key((await c.get("/users/me/achievements")).json())
    assert ach["first_project"]["earned"] is False


async def test_first_application(make_user, as_user, db):
    from app.models.project import Project, ProjectApplication
    me = await make_user(name="Me")
    founder = await make_user(name="F")
    p = Project(type="startup", creator_id=founder.id, name="P", is_active=True,
                is_draft=False, is_deleted=False, is_approved=True)
    db.add(p); await db.commit(); await db.refresh(p)
    db.add(ProjectApplication(project_id=p.id, applicant_id=me.id, status="pending"))
    await db.commit()
    c = as_user(me)
    ach = _by_key((await c.get("/users/me/achievements")).json())
    assert ach["first_application"]["earned"] is True


async def test_five_invites_progress_and_earn(make_user, as_user, db):
    me = await make_user(name="Me")
    for i in range(5):
        await make_user(name=f"Ref{i}", referred_by=me.id)
    c = as_user(me)
    ach = _by_key((await c.get("/users/me/achievements")).json())
    assert ach["five_invites"]["earned"] is True
    assert ach["five_invites"]["progress"] == {"current": 5, "target": 5}


async def test_invites_partial_progress(make_user, as_user, db):
    me = await make_user(name="Me")
    await make_user(name="R1", referred_by=me.id)
    await make_user(name="R2", referred_by=me.id)
    c = as_user(me)
    ach = _by_key((await c.get("/users/me/achievements")).json())
    assert ach["five_invites"]["earned"] is False
    assert ach["five_invites"]["progress"] == {"current": 2, "target": 5}


async def test_verified_and_mentor(make_user, as_user, db):
    me = await make_user(name="Me", checked=True)
    me.is_mentor = True   # Batch C column
    await db.commit()
    c = as_user(me)
    ach = _by_key((await c.get("/users/me/achievements")).json())
    assert ach["verified"]["earned"] is True
    assert ach["mentor"]["earned"] is True


async def test_endorsement_and_vouch_received(make_user, as_user, db):
    from app.models.trust import Endorsement, Vouch
    me = await make_user(name="Me")
    other = await make_user(name="O")
    db.add(Endorsement(endorser_id=other.id, target_id=me.id, skill="Python"))
    db.add(Vouch(author_id=other.id, target_id=me.id, text="great"))
    await db.commit()
    c = as_user(me)
    ach = _by_key((await c.get("/users/me/achievements")).json())
    assert ach["first_endorsement"]["earned"] is True
    assert ach["first_vouch_received"]["earned"] is True
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && python -m pytest tests/test_achievements.py -v`
Expected: FAIL — `/users/me/achievements` route missing (404).

- [ ] **Step 3: Implement the endpoint**

In `backend/app/routers/users.py`, add the trust-model import near the other model
imports (after `from app.models.project import ...`):

```python
from app.models.trust import Endorsement, Vouch
```

(If Batch B already imported these in `users.py`, skip — don't duplicate.)

Add the endpoint on the existing `users` router (place near `my_following` /
`my_connections`):

```python
@router.get("/me/achievements", response_model=dict)
async def my_achievements(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Derived achievements: earned state + progress for count-based ones.
    Recomputed on read from existing data (no stored table, no notification).
    Display text is client-side, keyed by `key`."""
    uid = current_user.id

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
    is_mentor = bool(getattr(current_user, "is_mentor", False))

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
        milestone("verified", bool(current_user.checked)),
        milestone("first_endorsement", endorsements >= 1),
        milestone("mentor", is_mentor),
        milestone("first_vouch_received", vouches >= 1),
    ]
    return {"achievements": achievements}
```

(`func`, `select`, `Project`, `ProjectApplication`, `User` are already imported in
`users.py`.)

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && python -m pytest tests/test_achievements.py -v`
Expected: all passed.

- [ ] **Step 5: Run the full backend suite (no regressions)**

Run: `cd backend && python -m pytest -q`
Expected: all pass (existing + the five new files).

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/users.py backend/tests/test_achievements.py
git commit -m "feat: GET /users/me/achievements (derived; no stored state)"
```

---

## Task 9: API client methods

**Files:**
- Modify: `src/api.js`

- [ ] **Step 1: Add the discovery client methods**

In `src/api.js`, inside the `users` object (after `getProfile`), add:

```javascript
  achievements:  ()       => req("/users/me/achievements"),
```

In the `projects` object (after `stats`), add:

```javascript
  roles:           (id)        => req(`/projects/${id}/roles`),
  addRole:         (id, name)  => req(`/projects/${id}/roles`, { method: "POST", body: JSON.stringify({ name }) }),
  setRoleFilled:   (id, rid, is_filled) => req(`/projects/${id}/roles/${rid}`, { method: "PATCH", body: JSON.stringify({ is_filled }) }),
  deleteRole:      (id, rid)   => req(`/projects/${id}/roles/${rid}`, { method: "DELETE" }),
```

Add a new top-level `roles` export after the `projects` export:

```javascript
// ── Open roles (discovery) ──────────────────────────────────────────────────
export const roles = {
  list: (q) => req(`/roles${qs({ q })}`),
};
```

(The existing `projects.update(id, d)` already PATCHes `/projects/{id}`, so setting
`group_link` is `projects.update(id, { group_link })` — no new method needed.)

- [ ] **Step 2: Commit**

```bash
git add src/api.js
git commit -m "api: roles list / per-project role CRUD / achievements client methods"
```

---

## Task 10: i18n keys (en/uz/ru)

**Files:**
- Modify: `src/i18n.jsx`

The file uses the per-key nested shape `"key": { en, uz, ru }`. Add these entries
inside the `STRINGS` object (e.g. after the existing Batch-C keys).

- [ ] **Step 1: Add keys**

```javascript
  // ── Batch D: open roles ─────────────────────────────────────────────────────
  "roles.title": { en: "Open roles", uz: "Ochiq rollar", ru: "Открытые роли" },
  "roles.searchPh": { en: "Search roles…", uz: "Rollarni qidirish…", ru: "Поиск ролей…" },
  "roles.none": { en: "No open roles right now", uz: "Hozircha ochiq rol yo‘q", ru: "Сейчас нет открытых ролей" },
  "roles.inProject": { en: "in {project}", uz: "{project} loyihasida", ru: "в {project}" },
  "roles.sectionTitle": { en: "Open roles", uz: "Ochiq rollar", ru: "Открытые роли" },
  "roles.addPh": { en: "Add a role, e.g. Backend dev", uz: "Rol qo‘shing, masalan Backend dasturchi", ru: "Добавьте роль, напр. Backend-разработчик" },
  "roles.add": { en: "Add", uz: "Qo‘shish", ru: "Добавить" },
  "roles.markFilled": { en: "Mark filled", uz: "To‘ldi deb belgilash", ru: "Отметить занятой" },
  "roles.markOpen": { en: "Reopen", uz: "Qayta ochish", ru: "Открыть снова" },
  "roles.filled": { en: "Filled", uz: "To‘ldi", ru: "Занято" },
  "roles.remove": { en: "Remove", uz: "O‘chirish", ru: "Удалить" },
  "roles.applyFor": { en: "Apply for {role}", uz: "{role} uchun ariza", ru: "Откликнуться на {role}" },
  "roles.dup": { en: "That role is already listed", uz: "Bu rol allaqachon qo‘shilgan", ru: "Эта роль уже добавлена" },
  // ── Batch D: project chat ───────────────────────────────────────────────────
  "chat.title": { en: "Project chat", uz: "Loyiha chati", ru: "Чат проекта" },
  "chat.join": { en: "Join project chat", uz: "Loyiha chatiga qo‘shilish", ru: "Войти в чат проекта" },
  "chat.none": { en: "The founder hasn’t linked a group chat yet", uz: "Asoschi hali guruh chatini ulamagan", ru: "Основатель ещё не привязал групповой чат" },
  "chat.linkPh": { en: "Paste your Telegram group invite link (https://t.me/…)", uz: "Telegram guruh havolasini joylang (https://t.me/…)", ru: "Вставьте ссылку-приглашение Telegram (https://t.me/…)" },
  "chat.linkBtn": { en: "Link group chat", uz: "Guruh chatini ulash", ru: "Привязать чат" },
  "chat.howto": { en: "Create a Telegram group, add the BFU bot, then paste the group’s invite link here.", uz: "Telegram guruhi yarating, BFU botini qo‘shing, so‘ng guruh havolasini bu yerga joylang.", ru: "Создайте группу в Telegram, добавьте бота BFU и вставьте ссылку-приглашение группы сюда." },
  "chat.invalid": { en: "Enter a valid https://t.me/ link", uz: "To‘g‘ri https://t.me/ havolasini kiriting", ru: "Введите корректную ссылку https://t.me/" },
  // ── Batch D: frequent collaborators ─────────────────────────────────────────
  "collab.title": { en: "Frequent collaborators", uz: "Doimiy hamkorlar", ru: "Частые соавторы" },
  "collab.shared": { en: "{n} projects together", uz: "Birga {n} loyiha", ru: "{n} проектов вместе" },
  "collab.sharedOne": { en: "1 project together", uz: "Birga 1 loyiha", ru: "1 проект вместе" },
  // ── Batch D: achievements ───────────────────────────────────────────────────
  "ach.title": { en: "Achievements", uz: "Yutuqlar", ru: "Достижения" },
  "ach.locked": { en: "Locked", uz: "Yopiq", ru: "Закрыто" },
  "ach.first_project.name": { en: "First project", uz: "Birinchi loyiha", ru: "Первый проект" },
  "ach.first_project.desc": { en: "Found your first project", uz: "Birinchi loyihangizni boshlang", ru: "Создайте первый проект" },
  "ach.first_application.name": { en: "First apply", uz: "Birinchi ariza", ru: "Первая заявка" },
  "ach.first_application.desc": { en: "Apply to a project", uz: "Loyihaga ariza bering", ru: "Подайте заявку в проект" },
  "ach.five_invites.name": { en: "Connector", uz: "Bog‘lovchi", ru: "Связной" },
  "ach.five_invites.desc": { en: "Invite 5 friends", uz: "5 do‘stni taklif qiling", ru: "Пригласите 5 друзей" },
  "ach.verified.name": { en: "Verified", uz: "Tasdiqlangan", ru: "Подтверждён" },
  "ach.verified.desc": { en: "Get a verified badge", uz: "Tasdiqlangan nishon oling", ru: "Получите значок подтверждения" },
  "ach.first_endorsement.name": { en: "Endorsed", uz: "Tan olingan", ru: "Признан" },
  "ach.first_endorsement.desc": { en: "Receive a skill endorsement", uz: "Mahorat tasdig‘ini oling", ru: "Получите подтверждение навыка" },
  "ach.mentor.name": { en: "Mentor", uz: "Mentor", ru: "Ментор" },
  "ach.mentor.desc": { en: "Turn on mentor mode", uz: "Mentor rejimini yoqing", ru: "Включите режим ментора" },
  "ach.first_vouch_received.name": { en: "Trusted", uz: "Ishonchli", ru: "Надёжный" },
  "ach.first_vouch_received.desc": { en: "Get a vouch", uz: "Tavsiya oling", ru: "Получите рекомендацию" },
```

- [ ] **Step 2: Commit**

```bash
git add src/i18n.jsx
git commit -m "i18n: Batch D discovery keys (en/uz/ru)"
```

---

## Task 11: Project-chat deep-link helper

**Files:**
- Modify: `src/tg.js`

- [ ] **Step 1: Add the helper**

In `src/tg.js`, add a small helper that opens a project's group link via the
existing Telegram-link path (find the existing `openTelegramLink` / `openLink`
export and reuse it; if the file exposes `openLink(url)`, build on that):

```javascript
// Open a project's Telegram group chat (deep link). Bots can't create groups —
// the link is the founder-pasted t.me invite. No-op when unset.
export const projectChatLink = (project) => (project?.group_link || "").trim() || null;

export const openProjectChat = (project) => {
  const link = projectChatLink(project);
  if (!link) return false;
  try {
    // Prefer the Telegram WebApp opener when available; fall back to window.open.
    if (window?.Telegram?.WebApp?.openTelegramLink) {
      window.Telegram.WebApp.openTelegramLink(link);
    } else {
      window.open(link, "_blank");
    }
    return true;
  } catch {
    return false;
  }
};
```

(If `src/tg.js` already exports an `openTelegramLink(url)` wrapper, call that inside
`openProjectChat` instead of duplicating the WebApp check.)

- [ ] **Step 2: Build to verify**

Run: `npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/tg.js
git commit -m "feat: projectChatLink / openProjectChat deep-link helpers"
```

---

## Task 12: Open-roles section + project-chat row in ProjectDetail

**Files:**
- Modify: `src/components/ProjectDetail.jsx`

- [ ] **Step 1: Imports + state**

At the top of `src/components/ProjectDetail.jsx`, add:

```jsx
import { projects as projectsApi } from "../api";
import { openProjectChat } from "../tg";
```

(If `projects` is already imported under that name, reuse it — don't create an alias
clash; use the existing import binding for the new calls.)

Inside `ProjectDetail`, after the existing `useState` hooks, add:

```jsx
  const [rolesList, setRolesList] = useState(null);
  const [newRole, setNewRole] = useState("");
  const [addingRole, setAddingRole] = useState(false);
  const [linkDraft, setLinkDraft] = useState("");
  const [editingLink, setEditingLink] = useState(false);
```

- [ ] **Step 2: Load roles**

Add an effect after the existing effects:

```jsx
  useEffect(() => {
    projects.roles(project.id).then(r => setRolesList(r.roles || [])).catch(() => setRolesList([]));
  }, [project.id]);
```

- [ ] **Step 3: Role + link handlers**

Add near the other handlers (`isFounder` = `project.creator_id === me?.id`; reuse
the component's existing "am I the founder" check / `me` object):

```jsx
  const addRole = async () => {
    const name = newRole.trim();
    if (addingRole || !name) return;
    setAddingRole(true);
    try {
      const r = await projects.addRole(project.id, name);
      setRolesList(list => [{ id: r.id, name, is_filled: false }, ...(list || [])]);
      setNewRole("");
    } catch (e) { tgAlert(e.message === "Role already listed" ? t("roles.dup") : e.message); }
    setAddingRole(false);
  };

  const toggleRole = async (role) => {
    try {
      await projects.setRoleFilled(project.id, role.id, !role.is_filled);
      setRolesList(list => list.map(r => r.id === role.id ? { ...r, is_filled: !r.is_filled } : r));
    } catch (e) { tgAlert(e.message); }
  };

  const removeRole = async (role) => {
    try {
      await projects.deleteRole(project.id, role.id);
      setRolesList(list => list.filter(r => r.id !== role.id));
    } catch (e) { tgAlert(e.message); }
  };

  const saveLink = async () => {
    try {
      const updated = await projects.update(project.id, { group_link: linkDraft.trim() });
      setEditingLink(false);
      // Reflect locally so the Join button appears immediately.
      project.group_link = updated.group_link;
    } catch (e) { tgAlert(e.message?.includes("t.me") ? t("chat.invalid") : e.message); }
  };
```

(`tgAlert` and `t` are already used in this file; `projects` and `me`/founder check
already exist.)

- [ ] **Step 4: Render the Open-roles section**

Insert a section in the detail body (e.g. after the requirements/skills block,
before the apply button area):

```jsx
        {/* Open roles */}
        {(rolesList?.length > 0 || isFounder) && (
          <div style={{ marginTop: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "var(--text-2)", marginBottom: 8 }}>
              {t("roles.sectionTitle")}
            </div>
            {isFounder && (
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <input value={newRole} onChange={e => setNewRole(e.target.value)}
                  placeholder={t("roles.addPh")} style={{
                    flex: 1, padding: "10px 12px", background: "var(--surface-2)",
                    border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
                    color: "var(--text)", fontSize: 13 }} />
                <button onClick={addRole} disabled={addingRole} style={{
                  padding: "10px 14px", background: "var(--accent)", border: "none",
                  borderRadius: "var(--radius-sm)", color: "#fff", fontWeight: 700,
                  fontSize: 13, cursor: "pointer" }}>{t("roles.add")}</button>
              </div>
            )}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {(rolesList || []).map(r => (
                <span key={r.id} style={{
                  display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 12px",
                  borderRadius: 99, fontSize: 12, fontWeight: 600,
                  background: r.is_filled ? "var(--surface-3)" : "rgba(78,205,196,0.15)",
                  color: r.is_filled ? "var(--text-3)" : "#4ECDC4",
                  border: "1px solid var(--border)" }}>
                  {r.name}{r.is_filled ? ` · ${t("roles.filled")}` : ""}
                  {isFounder && (
                    <>
                      <button onClick={() => toggleRole(r)} title={r.is_filled ? t("roles.markOpen") : t("roles.markFilled")}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", fontSize: 12 }}>
                        {r.is_filled ? "↺" : "✓"}
                      </button>
                      <button onClick={() => removeRole(r)} title={t("roles.remove")}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", fontSize: 12 }}>×</button>
                    </>
                  )}
                </span>
              ))}
            </div>
          </div>
        )}
```

- [ ] **Step 5: Render the Project-chat row**

Insert after the Open-roles section:

```jsx
        {/* Project chat */}
        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "var(--text-2)", marginBottom: 8 }}>
            {t("chat.title")}
          </div>
          {project.group_link ? (
            <button onClick={() => openProjectChat(project)} style={{
              width: "100%", padding: "11px", background: "var(--accent)", border: "none",
              borderRadius: "var(--radius-sm)", color: "#fff", fontWeight: 700, fontSize: 13,
              cursor: "pointer" }}>{t("chat.join")}</button>
          ) : isFounder ? (
            editingLink ? (
              <div>
                <input value={linkDraft} onChange={e => setLinkDraft(e.target.value)}
                  placeholder={t("chat.linkPh")} style={{
                    width: "100%", padding: "10px 12px", background: "var(--surface-2)",
                    border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
                    color: "var(--text)", fontSize: 13, marginBottom: 8 }} />
                <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 8 }}>{t("chat.howto")}</div>
                <button onClick={saveLink} style={{
                  padding: "9px 14px", background: "var(--accent)", border: "none",
                  borderRadius: "var(--radius-sm)", color: "#fff", fontWeight: 700,
                  fontSize: 13, cursor: "pointer" }}>{t("common.save")}</button>
              </div>
            ) : (
              <button onClick={() => { setLinkDraft(""); setEditingLink(true); }} style={{
                width: "100%", padding: "11px", background: "var(--surface-2)",
                border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
                color: "var(--text-2)", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
                {t("chat.linkBtn")}</button>
            )
          ) : (
            <div style={{ fontSize: 12, color: "var(--text-3)" }}>{t("chat.none")}</div>
          )}
        </div>
```

(`isFounder` must be defined in the component — if the file uses a different name
for the founder check, reuse that; this plan assumes `const isFounder =
project.creator_id === me?.id`.)

- [ ] **Step 6: Build to verify**

Run: `npm run build`
Expected: success.

- [ ] **Step 7: Commit**

```bash
git add src/components/ProjectDetail.jsx
git commit -m "feat: open-roles section + project-chat row in ProjectDetail"
```

---

## Task 13: OpenRolesScreen + Discover entry point

**Files:**
- Create: `src/screens/OpenRolesScreen.jsx`
- Modify: `src/screens/DiscoverScreen.jsx`

- [ ] **Step 1: Create the screen**

Create `src/screens/OpenRolesScreen.jsx`:

```jsx
import { useState, useEffect, useRef } from "react";
import { Page, SkeletonList } from "../components/Shared";
import { Icon } from "../components/Icons";
import { roles } from "../api";
import { ProjectDetail } from "../components/ProjectDetail";
import { useT } from "../i18n";

const TYPE_ICON = { startup: "🚀", volunteering: "🤝" };

export const OpenRolesScreen = ({ onBack }) => {
  const { t } = useT();
  const [q, setQ] = useState("");
  const [list, setList] = useState(null);
  const [openProjectId, setOpenProjectId] = useState(null);
  const [prefillRole, setPrefillRole] = useState("");
  const seq = useRef(0);

  useEffect(() => {
    const my = ++seq.current;
    const h = setTimeout(() => {
      roles.list(q.trim() || undefined)
        .then(r => { if (seq.current === my) setList(r.roles || []); })
        .catch(() => { if (seq.current === my) setList([]); });
    }, 250);   // debounce
    return () => clearTimeout(h);
  }, [q]);

  return (
    <Page>
      <div style={{ padding: "calc(var(--safe-t) + 16px) 20px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          {onBack && (
            <button onClick={onBack} style={{ background: "var(--surface-2)", border: "none",
              borderRadius: 99, width: 34, height: 34, cursor: "pointer", color: "var(--text-2)" }}>
              <Icon name="arrow_left" size={16} />
            </button>
          )}
          <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 22 }}>{t("roles.title")}</h1>
        </div>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder={t("roles.searchPh")}
          style={{ width: "100%", padding: "11px 14px", background: "var(--surface-2)",
            border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
            color: "var(--text)", fontSize: 14, marginBottom: 16 }} />
      </div>

      <div style={{ padding: "0 20px 32px" }}>
        {list === null ? (
          <SkeletonList />
        ) : list.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "var(--text-3)" }}>{t("roles.none")}</div>
        ) : list.map(r => (
          <button key={r.id} onClick={() => { setPrefillRole(r.name); setOpenProjectId(r.project.id); }}
            style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, textAlign: "left",
              background: "var(--surface-2)", border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)", padding: "12px 14px", cursor: "pointer", marginBottom: 8 }}>
            <span style={{ fontSize: 18 }}>{TYPE_ICON[r.project.type] || "•"}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>{r.name}</div>
              <div style={{ fontSize: 12, color: "var(--text-3)" }}>{t("roles.inProject", { project: r.project.name })}</div>
            </div>
            <Icon name="arrow_right" size={16} />
          </button>
        ))}
      </div>

      {openProjectId && (
        <ProjectDetail
          projectId={openProjectId}
          prefillRole={prefillRole}
          onClose={() => setOpenProjectId(null)}
        />
      )}
    </Page>
  );
};
```

(`ProjectDetail` is opened by id with an optional `prefillRole`. If `ProjectDetail`
takes a full `project` object rather than `projectId`, fetch it first via
`projects.get(id)` then pass `project={...}`. The `prefillRole` prop is consumed in
the next step; if `ProjectDetail`'s apply flow already has a role field from Batch C,
prefill that field's initial state with `prefillRole`.)

- [ ] **Step 2: Wire `prefillRole` into ProjectDetail's apply field**

In `src/components/ProjectDetail.jsx`, where the apply-role field's state is
initialized (Batch C added a `roleText` state for the apply prompt), seed it from
the prop:

```jsx
  const [roleText, setRoleText] = useState(prefillRole || "");
```

And accept the prop in the component signature, e.g.
`export const ProjectDetail = ({ project, projectId, prefillRole, onClose }) => {`.
(If the component currently only takes `project`, add `projectId` + `prefillRole`
and, when only `projectId` is given, load the project via `projects.get(projectId)`
in an effect.)

- [ ] **Step 3: Add the Discover entry point**

In `src/screens/DiscoverScreen.jsx`, add an import + state + a "Browse open roles"
entry. Add near the top:

```jsx
import { OpenRolesScreen } from "./OpenRolesScreen";
```

Add state alongside the other modal toggles:

```jsx
  const [rolesOpen, setRolesOpen] = useState(false);
```

Add a button in the header action row (next to search/map/inbox buttons):

```jsx
          <button onClick={() => setRolesOpen(true)} title={t("roles.title")} style={{
            background: "var(--surface-2)", border: "none", borderRadius: 99,
            width: 38, height: 38, display: "flex", alignItems: "center",
            justifyContent: "center", cursor: "pointer", color: "var(--text-2)" }}>
            <Icon name="briefcase" size={18} />
          </button>
```

(Use an icon that exists in `Icons.jsx`; if `briefcase` isn't defined, use an
existing one like `search` or a `🧰` emoji span. Verify against `src/components/
Icons.jsx` before committing.)

Render the screen full-screen when open (before the closing fragment):

```jsx
      {rolesOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "var(--bg)" }}>
          <OpenRolesScreen onBack={() => setRolesOpen(false)} />
        </div>
      )}
```

- [ ] **Step 4: Build to verify**

Run: `npm run build`
Expected: success.

- [ ] **Step 5: Commit**

```bash
git add src/screens/OpenRolesScreen.jsx src/screens/DiscoverScreen.jsx src/components/ProjectDetail.jsx
git commit -m "feat: OpenRolesScreen (searchable) + Discover entry + role prefill on apply"
```

---

## Task 14: Frequent-collaborators block in ProfileExtras

**Files:**
- Modify: `src/components/ProfileExtras.jsx`

- [ ] **Step 1: Render the collaborators block**

In `src/components/ProfileExtras.jsx`, the component receives `user` and
`onOpenProject`; add an optional `onOpenUser` prop for collaborator taps:

```jsx
export const ProfileExtras = ({ user, onOpenProject, onOpenUser }) => {
```

Inside the returned tree (e.g. after the projects block, before portfolio links),
add:

```jsx
      {/* Frequent collaborators */}
      {user.collaborators?.count > 0 && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: "var(--text-2)", marginBottom: 8 }}>
            {t("collab.title")}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {(user.collaborators.preview || []).map(c => (
              <button key={c.id} onClick={() => onOpenUser?.(c.id)} style={{
                width: "100%", display: "flex", alignItems: "center", gap: 10, textAlign: "left",
                background: "var(--surface-2)", border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)", padding: "8px 12px", cursor: "pointer" }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", overflow: "hidden",
                  background: "var(--surface-3)", flexShrink: 0, display: "flex",
                  alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "var(--text-2)" }}>
                  {c.photo_url ? <img src={c.photo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : (c.display_name?.[0] || "?")}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)",
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.display_name}</div>
                  <div style={{ fontSize: 11, color: "var(--text-3)" }}>
                    {c.shared === 1 ? t("collab.sharedOne") : t("collab.shared", { n: c.shared })}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
```

(If `ProfileExtras` already has an `AvatarEl`-style avatar import in scope, prefer
that over the inline avatar div for consistency — check the file's imports.)

- [ ] **Step 2: Pass `onOpenUser` from the callers**

`ProfileExtras` is rendered in `SettingsScreen` (own profile) and
`UserProfileModal` (others). In each caller, pass an `onOpenUser` that opens a
`UserProfileModal` for that id. In `UserProfileModal.jsx`, it can set the existing
nested-profile state (the modal already opens other users via tap in some flows);
if no nested-open exists, pass `onOpenUser={(id) => setViewingUserId(id)}` mirroring
`InboxModal`'s pattern, adding a `viewingUserId` state + a nested `UserProfileModal`
render. In `SettingsScreen`, wire it to whatever profile-modal state it already uses
(or omit `onOpenUser` there — the block still renders, taps are no-ops, which is
acceptable for the own-profile view).

- [ ] **Step 3: Build to verify**

Run: `npm run build`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add src/components/ProfileExtras.jsx src/components/UserProfileModal.jsx src/screens/SettingsScreen.jsx
git commit -m "feat: frequent-collaborators block in ProfileExtras"
```

---

## Task 15: AchievementsSection + mount in Settings

**Files:**
- Create: `src/components/AchievementsSection.jsx`
- Modify: `src/screens/SettingsScreen.jsx`

- [ ] **Step 1: Create the component**

Create `src/components/AchievementsSection.jsx`:

```jsx
import { useState, useEffect } from "react";
import { users } from "../api";
import { useT } from "../i18n";

const EMOJI = {
  first_project: "🚀", first_application: "📨", five_invites: "🤝",
  verified: "✅", first_endorsement: "👍", mentor: "🎓", first_vouch_received: "🛡️",
};

export const AchievementsSection = () => {
  const { t } = useT();
  const [items, setItems] = useState(null);

  useEffect(() => {
    users.achievements().then(r => setItems(r.achievements || [])).catch(() => setItems([]));
  }, []);

  if (items === null) {
    return <div style={{ padding: 16, color: "var(--text-3)", fontSize: 13 }}>{t("common.loading")}</div>;
  }
  if (items.length === 0) return null;

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 16, marginBottom: 10 }}>
        🏆 {t("ach.title")}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {items.map(a => {
          const pct = a.progress ? Math.round((a.progress.current / a.progress.target) * 100) : (a.earned ? 100 : 0);
          return (
            <div key={a.key} style={{
              padding: "12px", borderRadius: "var(--radius-sm)",
              background: a.earned ? "var(--accent-dim)" : "var(--surface-2)",
              border: `1px solid ${a.earned ? "var(--accent)" : "var(--border)"}`,
              opacity: a.earned ? 1 : 0.6 }}>
              <div style={{ fontSize: 22, marginBottom: 4 }}>{EMOJI[a.key] || "🏅"}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{t(`ach.${a.key}.name`)}</div>
              <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>{t(`ach.${a.key}.desc`)}</div>
              {a.progress && !a.earned && (
                <>
                  <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 6 }}>
                    {a.progress.current} / {a.progress.target}
                  </div>
                  <div style={{ height: 4, background: "var(--surface-3)", borderRadius: 99, marginTop: 4, overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: "var(--accent)" }} />
                  </div>
                </>
              )}
              {!a.earned && !a.progress && (
                <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  {t("ach.locked")}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Mount in SettingsScreen**

In `src/screens/SettingsScreen.jsx`, add the import:

```jsx
import { AchievementsSection } from "../components/AchievementsSection";
```

Render `<AchievementsSection />` in the settings body (e.g. just after the
`InviteCard` / profile-extras block, before the language/admin rows). Place it where
it reads as part of the user's own profile summary.

- [ ] **Step 3: Build to verify**

Run: `npm run build`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add src/components/AchievementsSection.jsx src/screens/SettingsScreen.jsx
git commit -m "feat: AchievementsSection grid (earned + progress) in Settings"
```

---

## Task 16: Full verification + push

**Files:** none (verification only)

- [ ] **Step 1: Full backend suite**

Run: `cd backend && python -m pytest -q`
Expected: all pass (existing + the five new D files).

- [ ] **Step 2: Frontend build**

Run: `npm run build`
Expected: success, no unresolved imports.

- [ ] **Step 3: Verify-before-push sanity (per program norms)**

Confirm: `GET /roles` returns open roles only; a founder can add/fill/remove roles
and set a t.me group link; a profile shows frequent collaborators; the Achievements
grid shows earned + progress. (Manual check on the deployed Mini App after push, as
the program does — no automated browser test.)

- [ ] **Step 4: Push**

```bash
git push
```

(Vercel/Railway auto-deploy on push, per the program's deploy cadence. Batch D is a
self-contained, git-revertable unit.)

---

## Self-review (coverage, placeholders, name/type consistency)

Checked against the spec and the batch scope before finalizing:

- **Coverage of the 4 scope items:**
  1. Central open-roles list — `project_roles` table (Task 1), per-project CRUD
     (Task 4), aggregate `GET /roles?q=` (Task 5), `OpenRolesScreen` + Discover
     entry (Task 13). ✅
  2. Teams = frequent collaborators — `_collaborators` derived helper attached to
     both profile endpoints (Task 7), `ProfileExtras` block (Task 14). No new
     table. ✅
  3. Project group-chat deep-link — `projects.group_link` column (Task 1) +
     validated PATCH (Task 6), `openProjectChat` helper (Task 11), ProjectDetail
     chat row (Task 12). No auto-creation. ✅
  4. Achievements (FULL) — 7 derived achievements + progress, `GET /me/achievements`
     (Task 8), `AchievementsSection` (Task 15). Notification deliberately skipped
     (documented tradeoff). ✅
- **Sourcing decision** stated + justified in the spec (§1) and plan header:
  founder-declared table, not derived from applications/skills. ✅
- **Derived-vs-stored** stated + justified (spec §4, plan header): derived;
  notification skipped because transitions need stored prior state. ✅
- **No placeholders / TODO / "fill in":** every backend step ships complete code;
  frontend steps ship complete components. The only conditional language is the
  explicit "match the existing handler style" guidance in Task 6/12/13/14, which is
  unavoidable because those edits depend on Batch-C-era code shapes — each gives a
  concrete fallback so a worker is never blocked. ✅
- **Name/type consistency** (cross-checked spec ↔ plan ↔ code):
  - Table `project_roles`, model `ProjectRole`, columns `id/project_id/name/
    is_filled/created_at` — identical in model (Task 1), migration (Task 2),
    schema (Task 3), routers (Tasks 4/5). ✅
  - `projects.group_link VARCHAR(512)` — model (Task 1), migration (Task 2),
    `ProjectResponse`/`ProjectUpdate` schema (Task 3), validator (Task 6),
    surfaced read-only. Matches existing `schools/learning_centers.group_link`. ✅
  - Profile field `collaborators: {count, preview:[{id, display_name, photo_url,
    shared}]}` — schema `Collaborators`/`CollaboratorMini` (Task 3), helper return
    shape (Task 7), `_PROFILE_EXTRAS_FIELDS` guard (Task 7), frontend reads
    `user.collaborators.count/preview[].shared` (Task 14). ✅
  - Achievement keys `first_project / first_application / five_invites / verified /
    first_endorsement / mentor / first_vouch_received` — identical in endpoint
    (Task 8), tests (Task 8), i18n `ach.<key>.name/.desc` (Task 10), `EMOJI` map
    (Task 15). Response shape `{key, earned, progress:{current,target}|null}`
    consistent endpoint↔frontend. ✅
  - API client paths match routers: `/roles` (`roles.list`), `/projects/{id}/roles`
    (`projects.roles/addRole/setRoleFilled/deleteRole`), `/users/me/achievements`
    (`users.achievements`), `group_link` via existing `projects.update`. ✅
- **Idempotent migrations:** `ADD COLUMN IF NOT EXISTS` + `CREATE INDEX IF NOT
  EXISTS` / `CREATE UNIQUE INDEX IF NOT EXISTS`; table via `create_all`. ✅
- **i18n en/uz/ru:** every new user-facing string has all three (Task 10);
  no raw literals introduced in the new components beyond emojis. ✅
- **Reuse of existing patterns:** extras-attach (`_collaborators`), inbox pattern
  reused (no new types added — by design), TDD with real pytest asserts (status
  codes, row counts, exact payload shapes) on every backend task. ✅
- **No new Notification types** — confirmed across spec + plan; `InboxModal` and the
  notification renderer are untouched. ✅

Fixes applied inline during review: tightened the `_collaborators` double-count
guard (a user who is both creator and member of the same project counts that project
once via the `seen` set); pinned the open-roles filter to the full live-project
predicate (`is_approved AND is_hiring AND is_active AND NOT is_draft AND NOT
is_deleted`) consistently in the spec, the `GET /roles` query, and the
`test_excludes_non_live_projects` test.
