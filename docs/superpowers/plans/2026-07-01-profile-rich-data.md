# Profile Rich Data (Batch A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show real activity on a BFU profile — founded/joined projects, live stats, a "currently building" line (auto+manual), and free-form portfolio links — all public.

**Architecture:** Two new text columns on `users` (`currently_building`, `portfolio_links` as JSON). Everything else (project lists, stats) is derived live from existing `projects` / `project_members` / `project_applications` tables. A single server helper computes the "extras" and attaches them to the existing `GET /users/{id}` (UserPublic) and `GET /users/me` (UserResponse) responses. The write path goes through the existing `PATCH /users/me`. The frontend renders one shared display component across UserProfileModal + SettingsScreen, and adds editor fields to EditProfileScreen.

**Tech Stack:** FastAPI + SQLAlchemy 2 async + Postgres (backend), React 19 + Vite (frontend), pytest (tests). Migrations are idempotent `ALTER TABLE ... IF NOT EXISTS` run in `app/main.py` lifespan (no Alembic).

**Spec:** `docs/superpowers/specs/2026-07-01-profile-rich-data-design.md`

---

## File structure

- `backend/app/models/user.py` — add 2 columns to `User`
- `backend/app/main.py` — add 2 idempotent migration statements
- `backend/app/schemas/user.py` — `ProfileProject`, `ProfileStats`; new fields on `UserPublic` + `UserResponse`; new write fields on `UserUpdate`
- `backend/app/routers/users.py` — `_sanitize_portfolio()` + `_profile_extras()` helpers; wire into `get_user_profile`, `get_me`, `update_me`
- `backend/tests/test_profile_extras.py` — new test file
- `src/components/ProfileExtras.jsx` — new shared display component (Currently building + Stats + Projects + Portfolio)
- `src/components/UserProfileModal.jsx` — render `<ProfileExtras>`
- `src/screens/SettingsScreen.jsx` — render `<ProfileExtras>` for own profile
- `src/screens/EditProfileScreen.jsx` — add `currently_building` field + portfolio links editor
- `src/i18n.jsx` — new keys (en/uz/ru)

---

## Task 1: Add the two columns to the User model

**Files:**
- Modify: `backend/app/models/user.py` (after `photo_file_id`, ~line 41)

- [ ] **Step 1: Add the columns**

In `backend/app/models/user.py`, after the `photo_file_id` line inside `class User`, add:

```python
    # Free-text "what am I building right now" line, shown above the bio.
    # When null, the profile API auto-derives it from the latest active founded project.
    currently_building: Mapped[str | None] = mapped_column(Text, nullable=True)
    # JSON array of {"label","url"} (max 5), validated/sanitized on write.
    portfolio_links: Mapped[str | None] = mapped_column(Text, nullable=True)
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/models/user.py
git commit -m "model: add currently_building + portfolio_links to User"
```

---

## Task 2: Idempotent migration for the two columns

**Files:**
- Modify: `backend/app/main.py` (the `migrations` list, ~line 69 after the `photo_file_id` migration)

- [ ] **Step 1: Add migration statements**

In `backend/app/main.py`, inside the `migrations = [...]` list, right after the `photo_file_id` line, add:

```python
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS currently_building TEXT;",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS portfolio_links TEXT;",
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/main.py
git commit -m "migrate: add currently_building + portfolio_links columns"
```

---

## Task 3: Schemas — slim project + stats + new response/write fields

**Files:**
- Modify: `backend/app/schemas/user.py`

- [ ] **Step 1: Add the new schema classes and fields**

In `backend/app/schemas/user.py`, add these two classes near the top (after `AnalysisOut`):

```python
class ProfileProject(BaseModel):
    id: int
    name: str
    type: str
    is_active: bool
    # Founder list uses created_at; member list uses joined_at. Whichever is
    # relevant for the row is placed in `date` so the frontend stays simple.
    date: datetime | None = None

    model_config = {"from_attributes": True}


class ProfileStats(BaseModel):
    projects_founded: int = 0
    projects_joined: int = 0
    applications_accepted: int = 0


class PortfolioLink(BaseModel):
    label: str
    url: str
```

Add these fields to **both** `UserPublic` and `UserResponse` (anywhere among the existing fields, before `model_config`):

```python
    currently_building: str | None = None
    currently_building_source: str | None = None  # "manual" | "auto" | None
    portfolio_links: list[PortfolioLink] = []
    founded_projects: list[ProfileProject] = []
    member_projects: list[ProfileProject] = []
    stats: ProfileStats = ProfileStats()
```

Add these fields to `UserUpdate` (write path):

```python
    currently_building: str | None = None
    portfolio_links: list[PortfolioLink] | None = None
```

- [ ] **Step 2: Verify imports compile**

Run: `cd backend && python -c "import app.schemas.user"`
Expected: no output, exit 0.

- [ ] **Step 3: Commit**

```bash
git add backend/app/schemas/user.py
git commit -m "schema: profile extras (projects, stats, portfolio) + write fields"
```

---

## Task 4: Portfolio sanitizer helper (TDD)

**Files:**
- Modify: `backend/app/routers/users.py` (add helper near the other module helpers, ~line 60)
- Test: `backend/tests/test_profile_extras.py` (new)

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_profile_extras.py`:

```python
"""Profile rich-data: portfolio sanitizer, extras builder, profile endpoints."""
import pytest

pytestmark = pytest.mark.asyncio


def test_sanitize_portfolio_filters_and_caps():
    from app.routers.users import _sanitize_portfolio

    # Drops non-http, blank label/url; caps label at 40; caps list at 5.
    raw = [
        {"label": "GitHub", "url": "https://github.com/x"},
        {"label": "Bad", "url": "javascript:alert(1)"},   # bad scheme → dropped
        {"label": "", "url": "https://nolabel.com"},        # blank label → dropped
        {"label": "NoUrl", "url": ""},                      # blank url → dropped
        {"label": "x" * 60, "url": "https://long.com"},     # label trimmed to 40
        {"label": "A", "url": "https://a.com"},
        {"label": "B", "url": "https://b.com"},
        {"label": "C", "url": "https://c.com"},
        {"label": "D", "url": "https://d.com"},
        {"label": "E", "url": "https://e.com"},             # 6th valid → dropped by cap
    ]
    out = _sanitize_portfolio(raw)
    assert len(out) == 5
    assert out[0] == {"label": "GitHub", "url": "https://github.com/x"}
    assert len(out[1]["label"]) == 40
    assert all(l["url"].startswith("http") for l in out)


def test_sanitize_portfolio_handles_garbage():
    from app.routers.users import _sanitize_portfolio
    assert _sanitize_portfolio(None) == []
    assert _sanitize_portfolio("not a list") == []
    assert _sanitize_portfolio([1, "x", {"label": "ok", "url": "https://ok.com"}]) == [
        {"label": "ok", "url": "https://ok.com"}
    ]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_profile_extras.py -k sanitize -v`
Expected: FAIL with `ImportError` / `cannot import name '_sanitize_portfolio'`.

- [ ] **Step 3: Implement the helper**

In `backend/app/routers/users.py`, near the other module-level helpers (e.g. after `_write_denied`, ~line 62), add:

```python
def _sanitize_portfolio(raw) -> list[dict]:
    """Coerce arbitrary input into at most 5 valid {label,url} entries.
    Drops non-dicts, blank label/url, non-http(s) URLs; caps label at 40 chars."""
    if not isinstance(raw, list):
        return []
    out: list[dict] = []
    for item in raw:
        if len(out) >= 5:
            break
        if not isinstance(item, dict):
            continue
        label = str(item.get("label", "")).strip()[:40]
        url = str(item.get("url", "")).strip()
        if not label or not url:
            continue
        if not (url.startswith("http://") or url.startswith("https://")):
            continue
        out.append({"label": label, "url": url})
    return out
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_profile_extras.py -k sanitize -v`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/routers/users.py backend/tests/test_profile_extras.py
git commit -m "feat: portfolio link sanitizer (max 5, http-only, 40-char label)"
```

---

## Task 5: Profile-extras builder (TDD)

**Files:**
- Modify: `backend/app/routers/users.py` (add `_profile_extras`; ensure `Project`, `ProjectMember`, `ProjectApplication` are imported)
- Test: `backend/tests/test_profile_extras.py`

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_profile_extras.py`:

```python
async def _mk_project(db, creator_id, name, *, type="startup", is_active=True,
                      is_draft=False, is_deleted=False):
    from app.models.project import Project
    p = Project(type=type, creator_id=creator_id, name=name, is_active=is_active,
                is_draft=is_draft, is_deleted=is_deleted, is_approved=True)
    db.add(p)
    await db.commit()
    await db.refresh(p)
    return p


async def test_profile_extras_counts_and_lists(make_user, db):
    from app.routers.users import _profile_extras
    from app.models.project import Project, ProjectMember, ProjectApplication

    owner = await make_user(name="Owner")
    other = await make_user(name="Other")

    # Owner founds: 1 active, 1 closed, 1 draft (draft excluded), 1 deleted (excluded).
    await _mk_project(db, owner.id, "Active One", is_active=True)
    await _mk_project(db, owner.id, "Closed One", is_active=False)
    await _mk_project(db, owner.id, "Draft One", is_draft=True)
    await _mk_project(db, owner.id, "Deleted One", is_deleted=True)

    # Owner is a member of one project founded by `other` (counts as joined).
    others_proj = await _mk_project(db, other.id, "Others Proj")
    db.add(ProjectMember(project_id=others_proj.id, user_id=owner.id))
    # Owner is also a member-row of their OWN active project → must NOT double-list.
    own_active = (await db.execute(
        Project.__table__.select().where(Project.creator_id == owner.id, Project.name == "Active One")
    )).first()
    db.add(ProjectMember(project_id=own_active.id, user_id=owner.id))
    # One accepted application by owner to someone else's project.
    db.add(ProjectApplication(project_id=others_proj.id, applicant_id=owner.id, status="accepted"))
    db.add(ProjectApplication(project_id=others_proj.id, applicant_id=other.id, status="pending"))
    await db.commit()

    extras = await _profile_extras(db, owner)

    founded_names = {p["name"] for p in extras["founded_projects"]}
    assert founded_names == {"Active One", "Closed One"}  # no draft, no deleted
    member_names = {p["name"] for p in extras["member_projects"]}
    assert member_names == {"Others Proj"}                 # not own project
    assert extras["stats"]["projects_founded"] == 2
    assert extras["stats"]["projects_joined"] == 1
    assert extras["stats"]["applications_accepted"] == 1


async def test_currently_building_manual_auto_null(make_user, db):
    from app.routers.users import _profile_extras

    # Manual wins.
    u1 = await make_user(name="M", currently_building="My manual line")
    await _mk_project(db, u1.id, "AutoProj", is_active=True)
    e1 = await _profile_extras(db, u1)
    assert e1["currently_building"] == "My manual line"
    assert e1["currently_building_source"] == "manual"

    # No manual → auto from latest active founded project.
    u2 = await make_user(name="A")
    await _mk_project(db, u2.id, "AutoProj2", is_active=True)
    e2 = await _profile_extras(db, u2)
    assert e2["currently_building"] == "AutoProj2"
    assert e2["currently_building_source"] == "auto"

    # No manual, no active project → null.
    u3 = await make_user(name="N")
    await _mk_project(db, u3.id, "ClosedOnly", is_active=False)
    e3 = await _profile_extras(db, u3)
    assert e3["currently_building"] is None
    assert e3["currently_building_source"] is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_profile_extras.py -k "extras or currently" -v`
Expected: FAIL — `cannot import name '_profile_extras'`.

- [ ] **Step 3: Implement the builder**

First ensure the imports exist at the top of `backend/app/routers/users.py`. If not already imported, add:

```python
from app.models.project import Project, ProjectMember, ProjectApplication
```

Then add the helper (after `_sanitize_portfolio`):

```python
async def _profile_extras(db: AsyncSession, user: User) -> dict:
    """Derive the rich-profile payload for `user` from existing project tables.
    Returns a plain dict the endpoints attach to the response schema."""
    import json

    # Founded (exclude drafts + soft-deleted), newest first.
    founded = (await db.execute(
        select(Project)
        .where(Project.creator_id == user.id,
               Project.is_draft == False, Project.is_deleted == False)
        .order_by(Project.created_at.desc())
    )).scalars().all()

    # Joined = member of a project they did NOT found (exclude drafts/deleted).
    joined_rows = (await db.execute(
        select(Project, ProjectMember.joined_at)
        .join(ProjectMember, ProjectMember.project_id == Project.id)
        .where(ProjectMember.user_id == user.id,
               Project.creator_id != user.id,
               Project.is_draft == False, Project.is_deleted == False)
        .order_by(ProjectMember.joined_at.desc())
    )).all()

    accepted = await db.scalar(
        select(func.count(ProjectApplication.id)).where(
            ProjectApplication.applicant_id == user.id,
            ProjectApplication.status == "accepted",
        )
    ) or 0

    founded_projects = [
        {"id": p.id, "name": p.name, "type": p.type, "is_active": p.is_active,
         "date": p.created_at}
        for p in founded
    ]
    member_projects = [
        {"id": p.id, "name": p.name, "type": p.type, "is_active": p.is_active,
         "date": joined_at}
        for (p, joined_at) in joined_rows
    ]

    # currently_building: manual wins, else latest active founded project name.
    manual = (user.currently_building or "").strip()
    if manual:
        cb, src = manual, "manual"
    else:
        active = next((p for p in founded if p.is_active), None)
        cb, src = (active.name, "auto") if active else (None, None)

    try:
        portfolio = _sanitize_portfolio(json.loads(user.portfolio_links)) if user.portfolio_links else []
    except Exception:
        portfolio = []

    return {
        "currently_building": cb,
        "currently_building_source": src,
        "portfolio_links": portfolio,
        "founded_projects": founded_projects,
        "member_projects": member_projects,
        "stats": {
            "projects_founded": len(founded_projects),
            "projects_joined": len(member_projects),
            "applications_accepted": accepted,
        },
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_profile_extras.py -k "extras or currently" -v`
Expected: all passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/routers/users.py backend/tests/test_profile_extras.py
git commit -m "feat: profile-extras builder (founded/joined/stats/currently_building)"
```

---

## Task 6: Attach extras to GET /users/{id} and GET /users/me (TDD)

**Files:**
- Modify: `backend/app/routers/users.py` (`get_user_profile` ~line 1020; `get_me` ~line 109)
- Test: `backend/tests/test_profile_extras.py`

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_profile_extras.py`:

```python
async def test_get_user_profile_includes_extras(make_user, as_user, db):
    owner = await make_user(name="Owner")
    viewer = await make_user(name="Viewer")
    await _mk_project(db, owner.id, "Public Proj", is_active=True)

    c = as_user(viewer)
    res = await c.get(f"/users/{owner.id}")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["stats"]["projects_founded"] == 1
    assert body["founded_projects"][0]["name"] == "Public Proj"
    assert body["currently_building"] == "Public Proj"
    assert body["currently_building_source"] == "auto"


async def test_get_me_includes_extras(make_user, as_user, db):
    me = await make_user(name="Me", currently_building="Shipping BFU")
    await _mk_project(db, me.id, "My Startup")
    c = as_user(me)
    res = await c.get("/users/me")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["currently_building"] == "Shipping BFU"
    assert body["currently_building_source"] == "manual"
    assert body["stats"]["projects_founded"] == 1
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && python -m pytest tests/test_profile_extras.py -k "get_user_profile or get_me" -v`
Expected: FAIL — `stats` absent / `KeyError` (fields default to empty until wired).

- [ ] **Step 3: Wire into `get_user_profile`**

In `get_user_profile` (the `@router.get("/{user_id}")` handler), after the `out = UserPublic.model_validate(user)` line and the connector-badge block, before `return out`, add:

```python
    extras = await _profile_extras(db, user)
    for k, v in extras.items():
        setattr(out, k, v)
```

- [ ] **Step 4: Wire into `get_me`**

Find the `@router.get("/me", response_model=UserResponse)` handler (~line 109). It currently builds/returns the current user. After it constructs the `UserResponse` (it likely does `UserResponse.model_validate(current_user)` — if it returns the ORM object directly, change it to validate first), attach extras the same way. Concretely, ensure the handler ends with:

```python
    out = UserResponse.model_validate(current_user)
    extras = await _profile_extras(db, current_user)
    for k, v in extras.items():
        setattr(out, k, v)
    return out
```

(If `get_me` already returns `UserResponse.model_validate(...)`, just insert the two `extras` lines before `return`. If it returns `current_user` directly, replace that return with the block above. The handler already has `db` and `current_user` from its signature.)

- [ ] **Step 5: Run to verify it passes**

Run: `cd backend && python -m pytest tests/test_profile_extras.py -v`
Expected: all passed.

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/users.py backend/tests/test_profile_extras.py
git commit -m "feat: attach profile extras to GET /users/{id} and /users/me"
```

---

## Task 7: Write path — PATCH /users/me accepts the two fields (TDD)

**Files:**
- Modify: `backend/app/routers/users.py` (`update_me` ~line 253)
- Test: `backend/tests/test_profile_extras.py`

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_profile_extras.py`:

```python
async def test_patch_me_writes_currently_building_and_portfolio(make_user, as_user, db):
    from app.models.user import User
    user = await make_user(name="Edit")
    c = as_user(user)

    res = await c.patch("/users/me", json={
        "currently_building": "  Building an EdTech app  ",
        "portfolio_links": [
            {"label": "GitHub", "url": "https://github.com/me"},
            {"label": "Bad", "url": "ftp://nope.com"},  # dropped
        ],
    })
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["currently_building"] == "Building an EdTech app"  # trimmed
    assert body["currently_building_source"] == "manual"
    assert body["portfolio_links"] == [{"label": "GitHub", "url": "https://github.com/me"}]

    fresh = await db.get(User, user.id)
    await db.refresh(fresh)
    assert fresh.currently_building == "Building an EdTech app"
    assert '"github.com/me"' in fresh.portfolio_links


async def test_patch_me_clears_currently_building_with_empty_string(make_user, as_user):
    user = await make_user(name="Clear", currently_building="old")
    c = as_user(user)
    res = await c.patch("/users/me", json={"currently_building": ""})
    assert res.status_code == 200, res.text
    # Empty → stored as null → resolves to auto/null (no projects → null).
    assert res.json()["currently_building"] is None
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && python -m pytest tests/test_profile_extras.py -k patch_me -v`
Expected: FAIL — fields ignored (`currently_building` is None / portfolio empty), because `UserUpdate` uses `exclude_none` and the special handling isn't there yet. (The empty-string test may already pass-by-accident; the write test will fail.)

- [ ] **Step 3: Implement special handling in `update_me`**

In `update_me`, the body is parsed as `data = body.model_dump(exclude_none=True)`. Because `exclude_none=True` drops `None`, an explicit `currently_building: ""` IS included (empty string is not None) and an explicit `portfolio_links` list is included. Add handling **right after** `school_id`/`lc_ids` are popped (~line 262), and BEFORE the generic `for field, value in data.items()` loop:

```python
    import json
    if "currently_building" in data:
        cb = (data.pop("currently_building") or "").strip()[:140]
        current_user.currently_building = cb or None
    if "portfolio_links" in data:
        raw = data.pop("portfolio_links")
        # body.model_dump turned PortfolioLink models into dicts already.
        clean = _sanitize_portfolio(raw)
        current_user.portfolio_links = json.dumps(clean) if clean else None
```

These `pop`s remove the fields from `data` so the generic `setattr` loop below won't touch them with raw values.

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && python -m pytest tests/test_profile_extras.py -v`
Expected: all passed.

- [ ] **Step 5: Run the full backend suite (no regressions)**

Run: `cd backend && python -m pytest -q`
Expected: all pass (existing suite + new file).

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/users.py backend/tests/test_profile_extras.py
git commit -m "feat: PATCH /users/me writes currently_building + portfolio_links"
```

---

## Task 8: i18n keys (en/uz/ru)

**Files:**
- Modify: `src/i18n.jsx`

- [ ] **Step 1: Add keys**

In `src/i18n.jsx`, add these keys to each of the `en`, `uz`, `ru` dictionaries (match the file's existing structure — flat `"key": "value"` entries):

```
// en
"profile.building": "Currently building",
"profile.founded": "Founded",
"profile.member": "Member of",
"profile.portfolio": "Links",
"profile.stat.founded": "Founded",
"profile.stat.joined": "Joined",
"profile.stat.accepted": "Accepted",
"profile.active": "Active",
"profile.closed": "Closed",
"profile.noProjects": "No projects yet",
"edit.building": "Currently building",
"edit.buildingPh": "e.g. Building an AI tutor for IELTS",
"edit.links": "Portfolio links",
"edit.linkLabel": "Label (e.g. GitHub)",
"edit.linkUrl": "https://...",
"edit.addLink": "+ Add link",

// uz
"profile.building": "Hozir ustida ishlayapti",
"profile.founded": "Asos solgan",
"profile.member": "A'zo",
"profile.portfolio": "Havolalar",
"profile.stat.founded": "Asos solgan",
"profile.stat.joined": "Qo'shilgan",
"profile.stat.accepted": "Qabul qilingan",
"profile.active": "Faol",
"profile.closed": "Yopilgan",
"profile.noProjects": "Hozircha loyiha yo'q",
"edit.building": "Hozir ustida ishlayapti",
"edit.buildingPh": "masalan: IELTS uchun AI repetitor quryapman",
"edit.links": "Portfolio havolalar",
"edit.linkLabel": "Nom (masalan GitHub)",
"edit.linkUrl": "https://...",
"edit.addLink": "+ Havola qo'shish",

// ru
"profile.building": "Сейчас работает над",
"profile.founded": "Основал",
"profile.member": "Участник",
"profile.portfolio": "Ссылки",
"profile.stat.founded": "Основал",
"profile.stat.joined": "Участвует",
"profile.stat.accepted": "Принят",
"profile.active": "Активен",
"profile.closed": "Закрыт",
"profile.noProjects": "Пока нет проектов",
"edit.building": "Сейчас работает над",
"edit.buildingPh": "напр.: делаю AI-репетитора для IELTS",
"edit.links": "Ссылки портфолио",
"edit.linkLabel": "Название (напр. GitHub)",
"edit.linkUrl": "https://...",
"edit.addLink": "+ Добавить ссылку",
```

- [ ] **Step 2: Commit**

```bash
git add src/i18n.jsx
git commit -m "i18n: profile rich-data keys (en/uz/ru)"
```

---

## Task 9: Shared `ProfileExtras` display component

**Files:**
- Create: `src/components/ProfileExtras.jsx`

- [ ] **Step 1: Create the component**

Create `src/components/ProfileExtras.jsx`:

```jsx
import { useT } from "../i18n";

const TYPE_ICON = { startup: "🚀", volunteering: "🤝" };

function StatTile({ value, label }) {
  return (
    <div style={{ flex: 1, textAlign: "center", padding: "10px 4px",
      background: "var(--surface-2)", border: "1px solid var(--border)",
      borderRadius: "var(--radius-sm)" }}>
      <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 20, color: "var(--text)" }}>{value}</div>
      <div style={{ fontSize: 10, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 2 }}>{label}</div>
    </div>
  );
}

function ProjectRow({ p, onOpen }) {
  const { t } = useT();
  return (
    <button onClick={() => onOpen?.(p.id)} style={{
      width: "100%", display: "flex", alignItems: "center", gap: 10, textAlign: "left",
      background: "var(--surface-2)", border: "1px solid var(--border)",
      borderRadius: "var(--radius-sm)", padding: "10px 12px", cursor: "pointer", marginBottom: 6,
    }}>
      <span style={{ fontSize: 16 }}>{TYPE_ICON[p.type] || "•"}</span>
      <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, color: "var(--text)",
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</span>
      <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 99,
        background: p.is_active ? "rgba(78,205,196,0.15)" : "var(--surface-3)",
        color: p.is_active ? "#4ECDC4" : "var(--text-3)" }}>
        {p.is_active ? t("profile.active") : t("profile.closed")}
      </span>
    </button>
  );
}

export const ProfileExtras = ({ user, onOpenProject }) => {
  const { t } = useT();
  if (!user) return null;
  const founded = user.founded_projects || [];
  const member = user.member_projects || [];
  const stats = user.stats || {};
  const links = user.portfolio_links || [];
  const hasProjects = founded.length > 0 || member.length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, marginTop: 4 }}>
      {/* Currently building */}
      {user.currently_building && (
        <div style={{ display: "flex", alignItems: "center", gap: 8,
          background: "var(--accent-dim)", border: "1px solid var(--accent)",
          borderRadius: "var(--radius-sm)", padding: "10px 12px" }}>
          <span style={{ fontSize: 15 }}>🔨</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 10, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>{t("profile.building")}</div>
            <div style={{ fontSize: 14, color: "var(--text)", fontWeight: 600 }}>{user.currently_building}</div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div style={{ display: "flex", gap: 8 }}>
        <StatTile value={stats.projects_founded ?? 0} label={t("profile.stat.founded")} />
        <StatTile value={stats.projects_joined ?? 0} label={t("profile.stat.joined")} />
        <StatTile value={stats.applications_accepted ?? 0} label={t("profile.stat.accepted")} />
      </div>

      {/* Projects */}
      {hasProjects ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {founded.length > 0 && (
            <div>
              <div className="section-label">{t("profile.founded")}</div>
              {founded.map(p => <ProjectRow key={p.id} p={p} onOpen={onOpenProject} />)}
            </div>
          )}
          {member.length > 0 && (
            <div>
              <div className="section-label">{t("profile.member")}</div>
              {member.map(p => <ProjectRow key={p.id} p={p} onOpen={onOpenProject} />)}
            </div>
          )}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: "var(--text-3)", textAlign: "center", padding: "4px 0" }}>{t("profile.noProjects")}</div>
      )}

      {/* Portfolio links */}
      {links.length > 0 && (
        <div>
          <div className="section-label">{t("profile.portfolio")}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {links.map((l, i) => (
              <a key={i} href={l.url} target="_blank" rel="noopener noreferrer" style={{
                fontSize: 12, fontWeight: 600, padding: "6px 12px", borderRadius: 99,
                background: "var(--surface-2)", border: "1px solid var(--border)",
                color: "var(--accent)", textDecoration: "none" }}>🔗 {l.label}</a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ProfileExtras.jsx
git commit -m "feat: shared ProfileExtras display component"
```

---

## Task 10: Render ProfileExtras in UserProfileModal

**Files:**
- Modify: `src/components/UserProfileModal.jsx`

- [ ] **Step 1: Import + render**

In `src/components/UserProfileModal.jsx`, add the import at the top:

```jsx
import { ProfileExtras } from "./ProfileExtras";
```

Then render it inside the scrollable body. Place it **after** the Analysis Tags block and before the closing of the content `div` (after the `{hasAnyTags && (...)}` block, before the `{!user?.about && !hasAnyTags && (...)}` empty-state). Insert:

```jsx
            <div style={{ marginTop: 18 }}>
              <ProfileExtras user={user} />
            </div>
```

(UserProfileModal has no project-opening navigation, so `onOpenProject` is omitted — rows are non-navigating taps here, which is acceptable; a later batch can wire deep navigation.)

Also update the empty-state condition so it doesn't show when the user has projects. Change:

```jsx
            {!user?.about && !hasAnyTags && (
```
to:
```jsx
            {!user?.about && !hasAnyTags && !(user?.founded_projects?.length || user?.member_projects?.length) && (
```

- [ ] **Step 2: Build to verify no syntax errors**

Run: `npm run build`
Expected: build succeeds (the landing prebuild + vite build both complete).

- [ ] **Step 3: Commit**

```bash
git add src/components/UserProfileModal.jsx
git commit -m "feat: show ProfileExtras in UserProfileModal"
```

---

## Task 11: Render ProfileExtras in SettingsScreen (own profile)

**Files:**
- Modify: `src/screens/SettingsScreen.jsx`

- [ ] **Step 1: Import + render**

In `src/screens/SettingsScreen.jsx`, add at the top:

```jsx
import { ProfileExtras } from "../components/ProfileExtras";
```

In the Profile Card area (after the tags block inside the profile card, before the `InviteCard`), render:

```jsx
        <div style={{ marginBottom: 12 }}>
          <ProfileExtras user={user} />
        </div>
```

(`user` here is the `/users/me` response, which now carries the extras.)

- [ ] **Step 2: Build to verify**

Run: `npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/screens/SettingsScreen.jsx
git commit -m "feat: show ProfileExtras on own profile (Settings)"
```

---

## Task 12: EditProfileScreen — currently_building + portfolio editor

**Files:**
- Modify: `src/screens/EditProfileScreen.jsx`

- [ ] **Step 1: Read the file to find the form-state shape**

Run: `sed -n '1,80p' src/screens/EditProfileScreen.jsx`
Note how `form` state and the save payload are built (the screen uses a `form` object and calls `users.updateMe(...)`).

- [ ] **Step 2: Add the two fields to form state**

Where the form state is initialized from `me` (the existing `useState({...})`), add:

```jsx
    currently_building: me.currently_building || "",
    portfolio_links: Array.isArray(me.portfolio_links) ? me.portfolio_links : [],
```

- [ ] **Step 3: Add the UI controls**

Inside the form body (after the "about" textarea section), add:

```jsx
        <div>
          <div className="section-label">{t("edit.building")}</div>
          <input className="input-field" maxLength={140}
            placeholder={t("edit.buildingPh")}
            value={form.currently_building}
            onChange={e => set("currently_building", e.target.value)} />
        </div>

        <div>
          <div className="section-label">{t("edit.links")}</div>
          {form.portfolio_links.map((l, i) => (
            <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
              <input className="input-field" style={{ flex: "0 0 35%" }}
                placeholder={t("edit.linkLabel")} value={l.label}
                onChange={e => {
                  const next = [...form.portfolio_links];
                  next[i] = { ...next[i], label: e.target.value };
                  set("portfolio_links", next);
                }} />
              <input className="input-field" style={{ flex: 1 }}
                placeholder={t("edit.linkUrl")} value={l.url}
                onChange={e => {
                  const next = [...form.portfolio_links];
                  next[i] = { ...next[i], url: e.target.value };
                  set("portfolio_links", next);
                }} />
              <button type="button" onClick={() => set("portfolio_links", form.portfolio_links.filter((_, j) => j !== i))}
                style={{ background: "var(--surface-3)", border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)", color: "#FF6B6B", padding: "0 12px", cursor: "pointer" }}>✕</button>
            </div>
          ))}
          {form.portfolio_links.length < 5 && (
            <button type="button" onClick={() => set("portfolio_links", [...form.portfolio_links, { label: "", url: "" }])}
              style={{ background: "var(--surface-2)", border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)", color: "var(--accent)", padding: "8px 12px",
                fontSize: 13, fontWeight: 600, cursor: "pointer" }}>{t("edit.addLink")}</button>
          )}
        </div>
```

If the screen uses a local `set(key, value)` helper (like AuthScreen), reuse it. If it sets state differently (e.g. `setForm(f => ({...f, key: value}))`), adapt the `onChange`/`set` calls to that pattern — match the file's existing convention.

- [ ] **Step 4: Include the fields in the save payload**

Where the screen builds the `users.updateMe({...})` payload, add:

```jsx
        currently_building: form.currently_building,
        portfolio_links: form.portfolio_links.filter(l => l.label.trim() && l.url.trim()),
```

- [ ] **Step 5: Build to verify**

Run: `npm run build`
Expected: success.

- [ ] **Step 6: Commit**

```bash
git add src/screens/EditProfileScreen.jsx
git commit -m "feat: edit currently_building + portfolio links in EditProfile"
```

---

## Task 13: Manual verification + push

- [ ] **Step 1: Full backend suite**

Run: `cd backend && python -m pytest -q`
Expected: all pass.

- [ ] **Step 2: Frontend build**

Run: `npm run build`
Expected: success.

- [ ] **Step 3: Push**

```bash
git push
```

- [ ] **Step 4: Verify on the deployed Mini App**

Open the Mini App, edit your own profile to add a "currently building" line + a GitHub link, save, reopen the profile — confirm the line, links, stats, and any founded/joined projects render. Open another member's profile and confirm their projects/stats show.

---

## Self-review notes

- **Spec coverage:** currently_building (auto+manual) ✓ T5/T7/T12; portfolio free-form ✓ T4/T7/T12; founded+joined incl. closed, drafts excluded ✓ T5; live stats incl. applications_accepted ✓ T5; public visibility (no toggle) ✓ (no privacy code added); UserProfileModal + SettingsScreen + EditProfileScreen surfaces ✓ T10/T11/T12; i18n en/uz/ru ✓ T8.
- **Deferred (correctly absent):** privacy toggle, mutual connections, endorsement, rating, public web URL, resume export.
- **Type consistency:** `_profile_extras` returns dict keys exactly matching the schema fields set in T6 (`currently_building`, `currently_building_source`, `portfolio_links`, `founded_projects`, `member_projects`, `stats`); `ProfileProject.date` carries created_at (founded) / joined_at (member); `_sanitize_portfolio` shape `{label,url}` matches `PortfolioLink` + frontend.
