# Admin/founder analytics (Batch E) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface the signal the platform already stores as four read-only
analytics views: a **per-founder** views→applications→accepted funnel across all of
a founder's projects (distinct from the existing single-project
`GET /projects/{id}/stats`), and three admin views — **cohort retention** by signup
month, a **region heatmap** of supply per viloyat, and a **skill-gap report** of
demand vs supply per skill. Every endpoint is a `COUNT`/`GROUP BY` aggregate. No
new tables; one idempotent index.

**Architecture:** The founder funnel is an ownership-gated endpoint on the existing
`projects` router (`GET /projects/mine/funnel`, depends on `get_current_user`,
reports only on `creator_id == me`). The three admin views live on the existing
`admin` router under `/admin/analytics/*`, reusing `get_admin_user`. Month
bucketing (retention) and JSON-skill tallying (skill-gap supply) are done **in
Python** over single indexed scans — identical behaviour on Postgres (prod) and
SQLite (tests), matching the codebase "derive in Python, don't lean on dialect SQL"
rule. The only migration is `CREATE INDEX IF NOT EXISTS` on
`project_req_skills.skill_name` (the skill-gap demand `GROUP BY` column). Frontend
adds an "Analytics" tab to `AdminScreen` and a `FounderFunnel` component, all CSS
bars + tables (no chart library).

**Tech Stack:** FastAPI + SQLAlchemy 2 async + Postgres (backend), React 19 + Vite
(frontend), pytest (tests). Migrations are idempotent `CREATE INDEX ... IF NOT
EXISTS` statements run in `app/main.py` lifespan (no Alembic).

**Spec:** `docs/superpowers/specs/2026-07-01-batchE-analytics-design.md`

**Depends on:** nothing from Batches B/C/D. Batch E reads only tables that exist in
`main` today: `projects` (incl. `view_count`), `project_applications` (incl.
`status`/`decided_at`), `project_members`, `users` (incl. `created_at`,
`last_seen_at`, `region_id`), `regions`, `project_req_skills`, `user_analyses`
(`skills` JSON). It reuses the existing `get_current_user` (deps) and
`get_admin_user` role-gate. It is independent and git-revertable on its own.

---

## File structure

- `backend/app/main.py` — one idempotent index migration (skill-gap column)
- `backend/app/routers/projects.py` — `GET /projects/mine/funnel` (per-founder)
- `backend/app/routers/admin.py` — `GET /admin/analytics/retention`,
  `/admin/analytics/regions`, `/admin/analytics/skill-gap`
- `backend/tests/test_founder_funnel.py` — new
- `backend/tests/test_admin_analytics.py` — new
- `src/api.js` — `projects.funnel`, `admin.retention/regionStats/skillGap`
- `src/i18n.jsx` — new keys (en/uz/ru)
- `src/components/FounderFunnel.jsx` — new founder funnel component
- `src/screens/AdminScreen.jsx` — new "Analytics" tab + render
- The founder-funnel mount point (read the "my projects" screen; see Task 8)

---

## Task 1: Idempotent index migration (skill-gap grouping column)

**Files:**
- Modify: `backend/app/main.py` (the `migrations` list)

The skill-gap report groups demand on `project_req_skills.skill_name`, which is
currently unindexed. Add one idempotent index. (All other columns Batch E groups on
— `users.created_at`, `users.region_id`, `projects.creator_id`, the project feed
flags — are already indexed by earlier migrations.)

- [ ] **Step 1: Add the migration statement**

In `backend/app/main.py`, inside the `migrations = [...]` list, after the Batch-B
trust-index block (the line ending `...ON project_ratings (project_id, rater_id,
ratee_id);`), add:

```python
        # --- Batch E: analytics (read-only; index the skill-gap GROUP BY column) ---
        "CREATE INDEX IF NOT EXISTS ix_project_req_skills_skill_name "
        "ON project_req_skills (skill_name);",
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/main.py
git commit -m "migrate: index project_req_skills.skill_name for skill-gap analytics"
```

---

## Task 2: Founder funnel endpoint `GET /projects/mine/funnel` (TDD)

**Files:**
- Modify: `backend/app/routers/projects.py`
- Test: `backend/tests/test_founder_funnel.py` (new)

This is the **per-founder** cross-project funnel — distinct from the existing
single-project `GET /projects/{id}/stats`. It reuses the same per-status counting
rules so the two never disagree.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_founder_funnel.py`:

```python
"""Batch E founder funnel: cross-project views->applications->accepted per founder."""
import pytest

pytestmark = pytest.mark.asyncio


async def _mk_project(db, creator_id, name, *, views=0, **kw):
    from app.models.project import Project
    defaults = dict(type="startup", creator_id=creator_id, name=name, is_active=True,
                    is_hiring=True, is_draft=False, is_deleted=False, is_approved=True)
    defaults.update(kw)
    p = Project(view_count=views, **defaults)
    db.add(p)
    await db.commit()
    await db.refresh(p)
    return p


async def _apply(db, project_id, applicant_id, status):
    from app.models.project import ProjectApplication
    db.add(ProjectApplication(project_id=project_id, applicant_id=applicant_id, status=status))
    await db.commit()


async def test_funnel_aggregates_and_breakdown(make_user, as_user, db):
    founder = await make_user(name="Founder")
    a1 = await make_user(name="A1")
    a2 = await make_user(name="A2")
    a3 = await make_user(name="A3")

    big = await _mk_project(db, founder.id, "Big", views=320)
    await _apply(db, big.id, a1.id, "accepted")
    await _apply(db, big.id, a2.id, "pending")
    await _apply(db, big.id, a3.id, "declined")

    small = await _mk_project(db, founder.id, "Small", views=40)
    await _apply(db, small.id, a1.id, "accepted")

    empty = await _mk_project(db, founder.id, "Empty", views=5)  # no applications

    c = as_user(founder)
    res = await c.get("/projects/mine/funnel")
    assert res.status_code == 200, res.text
    body = res.json()

    # Aggregate totals are the sums across the founder's projects.
    assert body["totals"] == {
        "project_count": 3, "views": 365, "applications": 4,
        "accepted": 2, "pending": 1, "declined": 1,
    }
    # Per-project rows sorted by views desc.
    rows = body["projects"]
    assert [r["name"] for r in rows] == ["Big", "Small", "Empty"]
    big_row = rows[0]
    assert big_row["views"] == 320 and big_row["applications"] == 3
    assert big_row["accepted"] == 1 and big_row["pending"] == 1 and big_row["declined"] == 1
    assert rows[2]["applications"] == 0 and rows[2]["accepted"] == 0


async def test_funnel_includes_drafts_with_flags(make_user, as_user, db):
    founder = await make_user(name="Founder")
    draft = await _mk_project(db, founder.id, "Draft", views=3, is_draft=True, is_approved=False)
    c = as_user(founder)
    rows = (await c.get("/projects/mine/funnel")).json()["projects"]
    by_name = {r["name"]: r for r in rows}
    assert "Draft" in by_name
    assert by_name["Draft"]["is_draft"] is True and by_name["Draft"]["is_approved"] is False


async def test_funnel_excludes_other_founders_and_deleted(make_user, as_user, db):
    me = await make_user(name="Me")
    other = await make_user(name="Other")
    await _mk_project(db, other.id, "NotMine", views=99)
    await _mk_project(db, me.id, "Gone", views=10, is_deleted=True)
    mine = await _mk_project(db, me.id, "Mine", views=7)
    c = as_user(me)
    body = (await c.get("/projects/mine/funnel")).json()
    names = {r["name"] for r in body["projects"]}
    assert names == {"Mine"}
    assert body["totals"]["project_count"] == 1 and body["totals"]["views"] == 7


async def test_funnel_empty_for_non_founder(make_user, as_user, db):
    me = await make_user(name="Me")
    c = as_user(me)
    body = (await c.get("/projects/mine/funnel")).json()
    assert body["projects"] == []
    assert body["totals"] == {
        "project_count": 0, "views": 0, "applications": 0,
        "accepted": 0, "pending": 0, "declined": 0,
    }
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && python -m pytest tests/test_founder_funnel.py -v`
Expected: FAIL — route missing. (Note: `/projects/mine/funnel` must be declared
BEFORE the `GET /projects/{project_id}` dynamic route so `funnel` isn't captured as
a project id — but `mine` is also a static segment, and `/projects/mine` already
exists above `/{project_id}`; place the new route right after `my_projects` to keep
static routes grouped ahead of the dynamic one.)

- [ ] **Step 3: Implement the endpoint**

In `backend/app/routers/projects.py`, add the endpoint immediately after the
`my_projects` handler (the `@router.get("/mine", ...)` block, ~line 477). `select`,
`func`, `Project`, `ProjectApplication`, `User`, `get_current_user`, `get_db`,
`AsyncSession` are all already imported in this file:

```python
@router.get("/mine/funnel", response_model=dict)
async def my_funnel(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Per-founder analytics: views -> applications -> accepted across ALL of the
    caller's projects (drafts + inactive included, each flagged), plus a per-project
    breakdown. Read-only aggregate. Distinct from GET /projects/{id}/stats (single
    project); uses the same per-status counting so the two never disagree."""
    projects = (await db.execute(
        select(Project).where(
            Project.creator_id == current_user.id,
            Project.is_deleted == False,
        )
    )).scalars().all()

    if not projects:
        return {
            "totals": {"project_count": 0, "views": 0, "applications": 0,
                       "accepted": 0, "pending": 0, "declined": 0},
            "projects": [],
        }

    pids = [p.id for p in projects]
    # One grouped query: (project_id, status) -> count.
    status_rows = (await db.execute(
        select(ProjectApplication.project_id, ProjectApplication.status,
               func.count(ProjectApplication.id))
        .where(ProjectApplication.project_id.in_(pids))
        .group_by(ProjectApplication.project_id, ProjectApplication.status)
    )).all()
    # per_pid[pid] = {"accepted": n, "pending": n, "declined": n}
    per_pid: dict[int, dict[str, int]] = {}
    for pid, st, cnt in status_rows:
        per_pid.setdefault(pid, {})[st] = int(cnt)

    rows = []
    for p in projects:
        s = per_pid.get(p.id, {})
        accepted = s.get("accepted", 0)
        pending = s.get("pending", 0)
        declined = s.get("declined", 0)
        applications = accepted + pending + declined
        rows.append({
            "id": p.id, "name": p.name, "type": p.type,
            "is_active": bool(p.is_active), "is_draft": bool(p.is_draft),
            "is_approved": bool(p.is_approved),
            "views": int(p.view_count or 0),
            "applications": applications,
            "accepted": accepted, "pending": pending, "declined": declined,
        })

    rows.sort(key=lambda r: (-r["views"], -r["id"]))
    rows = rows[:200]

    totals = {
        "project_count": len(projects),
        "views": sum(r["views"] for r in rows),
        "applications": sum(r["applications"] for r in rows),
        "accepted": sum(r["accepted"] for r in rows),
        "pending": sum(r["pending"] for r in rows),
        "declined": sum(r["declined"] for r in rows),
    }
    return {"totals": totals, "projects": rows}
```

Note on the totals: because a single founder will never exceed the 200-row cap, the
`totals` summed over `rows` equals the true sum. (If a founder somehow had >200
projects, the totals would reflect the displayed top-200, which is acceptable and
documented in the spec.)

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && python -m pytest tests/test_founder_funnel.py -v`
Expected: all passed.

- [ ] **Step 5: Guard against route shadowing**

Run: `cd backend && python -m pytest tests/ -k "project" -q`
Expected: existing project tests still pass (confirms `/mine/funnel` didn't shadow
`/{project_id}` and vice-versa).

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/projects.py backend/tests/test_founder_funnel.py
git commit -m "feat: GET /projects/mine/funnel — per-founder views->apply->accept funnel"
```

---

## Task 3: Admin cohort-retention endpoint (TDD)

**Files:**
- Modify: `backend/app/routers/admin.py`
- Test: `backend/tests/test_admin_analytics.py` (new)

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_admin_analytics.py`:

```python
"""Batch E admin analytics: cohort retention, region heatmap, skill gap."""
import datetime as dt

import pytest

pytestmark = pytest.mark.asyncio


async def _admin(make_user):
    return await make_user(name="Boss", role="super_admin")


# ── Retention ────────────────────────────────────────────────────────────────

async def test_retention_requires_admin(make_user, as_user, db):
    plain = await make_user(name="Plain")
    c = as_user(plain)
    assert (await c.get("/admin/analytics/retention")).status_code == 403


async def test_retention_buckets_and_active(make_user, as_user, db):
    admin = await _admin(make_user)
    now = dt.datetime.utcnow()
    this_month = now.replace(day=1, hour=12, minute=0, second=0, microsecond=0)
    # last calendar month (subtract ~32 days from the 1st, then snap to its 1st)
    prev_month = (this_month - dt.timedelta(days=5)).replace(day=1, hour=12)

    # This month: 2 users, 1 active (recent last_seen), 1 inactive (null).
    u1 = await make_user(name="U1")
    u1.created_at = this_month; u1.last_seen_at = now - dt.timedelta(days=2)
    u2 = await make_user(name="U2")
    u2.created_at = this_month; u2.last_seen_at = None
    # Prev month: 2 users, 1 active (recent), 1 stale (>30d).
    u3 = await make_user(name="U3")
    u3.created_at = prev_month; u3.last_seen_at = now - dt.timedelta(days=10)
    u4 = await make_user(name="U4")
    u4.created_at = prev_month; u4.last_seen_at = now - dt.timedelta(days=120)
    await db.commit()

    c = as_user(admin)
    res = await c.get("/admin/analytics/retention", params={"active_days": 30})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["active_days"] == 30
    cohorts = {row["month"]: row for row in body["cohorts"]}
    tm = this_month.strftime("%Y-%m")
    pm = prev_month.strftime("%Y-%m")
    # The admin themself was created "now" too — count them into this month.
    assert cohorts[tm]["total"] >= 2 and cohorts[tm]["active"] >= 1
    assert cohorts[pm]["total"] == 2 and cohorts[pm]["active"] == 1
    assert cohorts[pm]["retention_pct"] == 50
    # Newest-first ordering.
    assert body["cohorts"][0]["month"] >= body["cohorts"][-1]["month"] or \
        body["cohorts"][-1]["month"] == "older"


async def test_retention_active_days_clamped(make_user, as_user, db):
    admin = await _admin(make_user)
    c = as_user(admin)
    assert (await c.get("/admin/analytics/retention",
                        params={"active_days": 9999})).json()["active_days"] == 365
    assert (await c.get("/admin/analytics/retention",
                        params={"active_days": 0})).json()["active_days"] == 1
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && python -m pytest tests/test_admin_analytics.py -k retention -v`
Expected: FAIL — route missing (404) on the buckets test; the admin-gate test may
404 instead of 403 until the route exists (it will pass once implemented).

- [ ] **Step 3: Implement the endpoint**

In `backend/app/routers/admin.py`, the imports already include `select`, `func`
(from `sqlalchemy`), `User`, `Project`, `Region`, `get_admin_user`, `datetime`. Add
`Query` to the FastAPI import line at the top:

```python
from fastapi import APIRouter, Depends, HTTPException, Query, status
```

Also add the analysis + req-skill model imports near the other model imports at the
top of the file (used by Tasks 4–5 too):

```python
from app.models.project import Project, ProjectMember, ProjectReqSkill
from app.models.user_analysis import UserAnalysis
```

(`Project` is already imported on its own line — replace that single import with the
combined line above, or add the two new names; do not import `Project` twice.)

Add the endpoint (place it after the `get_stats` handler, before `# ── Users ──`):

```python
# ── Analytics (read-only aggregates) ──────────────────────────────────────────

@router.get("/analytics/retention", response_model=dict)
async def analytics_retention(
    active_days: int = Query(30),
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Cohort retention: registered users grouped by signup month (created_at),
    with how many are still 'active' (last_seen_at within `active_days` of now).
    Month bucketing is done in Python so prod (Postgres) and tests (SQLite) match.
    Newest month first; up to 24 months then an 'older' rollup."""
    active_days = max(1, min(int(active_days), 365))
    now = datetime.utcnow()
    cutoff = now - timedelta(days=active_days)

    rows = (await db.execute(
        select(User.created_at, User.last_seen_at).where(
            User.is_registered == True, User.is_deleted == False,
            User.created_at.is_not(None),
        )
    )).all()

    # month "YYYY-MM" -> [total, active]
    buckets: dict[str, list[int]] = {}
    for created_at, last_seen_at in rows:
        key = created_at.strftime("%Y-%m")
        b = buckets.setdefault(key, [0, 0])
        b[0] += 1
        if last_seen_at is not None and last_seen_at >= cutoff:
            b[1] += 1

    months_desc = sorted(buckets.keys(), reverse=True)
    recent = months_desc[:24]
    older = months_desc[24:]

    cohorts = []
    for m in recent:
        total, active = buckets[m]
        pct = round(active / total * 100) if total else 0
        cohorts.append({"month": m, "total": total, "active": active,
                        "retention_pct": pct})
    if older:
        o_total = sum(buckets[m][0] for m in older)
        o_active = sum(buckets[m][1] for m in older)
        cohorts.append({
            "month": "older", "total": o_total, "active": o_active,
            "retention_pct": round(o_active / o_total * 100) if o_total else 0,
        })

    return {"active_days": active_days, "cohorts": cohorts}
```

Add `timedelta` to the datetime import at the top of `admin.py`. The file currently
has `from datetime import datetime`; change it to:

```python
from datetime import datetime, timedelta
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && python -m pytest tests/test_admin_analytics.py -k retention -v`
Expected: all passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/routers/admin.py backend/tests/test_admin_analytics.py
git commit -m "feat: GET /admin/analytics/retention (cohort retention by signup month)"
```

---

## Task 4: Admin region-heatmap endpoint (TDD)

**Files:**
- Modify: `backend/app/routers/admin.py`
- Test: `backend/tests/test_admin_analytics.py`

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_admin_analytics.py`:

```python
# ── Region heatmap ───────────────────────────────────────────────────────────

async def _mk_region(db, name):
    from app.models.region import Region
    r = Region(name_en=name, name_uz=name, name_ru=name)
    db.add(r)
    await db.commit()
    await db.refresh(r)
    return r


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


async def test_region_heatmap_requires_admin(make_user, as_user, db):
    plain = await make_user(name="Plain")
    c = as_user(plain)
    assert (await c.get("/admin/analytics/regions")).status_code == 403


async def test_region_heatmap_counts(make_user, as_user, db):
    admin = await _admin(make_user)
    tashkent = await _mk_region(db, "Tashkent")
    samarkand = await _mk_region(db, "Samarkand")

    # 2 members in Tashkent, 1 in Samarkand.
    f1 = await make_user(name="F1", region_id=tashkent.id)
    await make_user(name="M1", region_id=tashkent.id)
    f2 = await make_user(name="F2", region_id=samarkand.id)

    # Tashkent founder: 1 live+hiring project, 1 inactive (not open), 1 draft (excluded).
    await _mk_project(db, f1.id, "Live", is_active=True, is_hiring=True)
    await _mk_project(db, f1.id, "Closed", is_active=False, is_hiring=False)
    await _mk_project(db, f1.id, "Draft", is_draft=True, is_approved=False)
    # Samarkand founder: 1 live+hiring.
    await _mk_project(db, f2.id, "SamLive", is_active=True, is_hiring=True)

    c = as_user(admin)
    res = await c.get("/admin/analytics/regions")
    assert res.status_code == 200, res.text
    body = res.json()
    by_id = {r["id"]: r for r in body["regions"]}
    t = by_id[tashkent.id]
    assert t["members"] == 2
    assert t["projects"] == 2          # Live + Closed (approved, non-draft); Draft excluded
    assert t["open_projects"] == 1     # only Live (active+hiring)
    s = by_id[samarkand.id]
    assert s["members"] == 1 and s["projects"] == 1 and s["open_projects"] == 1
    # Ordered by members desc → Tashkent first.
    assert body["regions"][0]["id"] == tashkent.id
    # Totals are column sums.
    assert body["totals"]["members"] == 3
    assert body["totals"]["projects"] == 3
    assert body["totals"]["open_projects"] == 2
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && python -m pytest tests/test_admin_analytics.py -k region -v`
Expected: FAIL — route missing (404).

- [ ] **Step 3: Implement the endpoint**

Add to `backend/app/routers/admin.py` (after `analytics_retention`):

```python
@router.get("/analytics/regions", response_model=dict)
async def analytics_regions(
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Region heatmap: members + projects + open (active+hiring) projects per
    viloyat. Projects are attributed to the creator's region (mirrors the public
    /regions logic). Auth-gated admin data view — not the cached public version."""
    regions = (await db.execute(
        select(Region).where(Region.is_deleted == False).order_by(Region.id)
    )).scalars().all()

    # members per region — one grouped query
    member_rows = (await db.execute(
        select(User.region_id, func.count(User.id))
        .where(User.is_registered == True, User.is_deleted == False,
               User.region_id.is_not(None))
        .group_by(User.region_id)
    )).all()
    members_by_region = {rid: int(cnt) for rid, cnt in member_rows}

    # live projects per creator-region (approved, non-draft, non-deleted)
    proj_rows = (await db.execute(
        select(User.region_id, func.count(Project.id))
        .join(Project, Project.creator_id == User.id)
        .where(Project.is_deleted == False, Project.is_approved == True,
               Project.is_draft == False, User.region_id.is_not(None))
        .group_by(User.region_id)
    )).all()
    projects_by_region = {rid: int(cnt) for rid, cnt in proj_rows}

    # of those, the ones that are active AND hiring (open capacity proxy)
    open_rows = (await db.execute(
        select(User.region_id, func.count(Project.id))
        .join(Project, Project.creator_id == User.id)
        .where(Project.is_deleted == False, Project.is_approved == True,
               Project.is_draft == False, Project.is_active == True,
               Project.is_hiring == True, User.region_id.is_not(None))
        .group_by(User.region_id)
    )).all()
    open_by_region = {rid: int(cnt) for rid, cnt in open_rows}

    out = []
    for r in regions:
        out.append({
            "id": r.id, "name_en": r.name_en, "name_uz": r.name_uz, "name_ru": r.name_ru,
            "members": members_by_region.get(r.id, 0),
            "projects": projects_by_region.get(r.id, 0),
            "open_projects": open_by_region.get(r.id, 0),
        })
    out.sort(key=lambda x: (-x["members"], x["id"]))

    totals = {
        "members": sum(x["members"] for x in out),
        "projects": sum(x["projects"] for x in out),
        "open_projects": sum(x["open_projects"] for x in out),
    }
    return {"totals": totals, "regions": out}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && python -m pytest tests/test_admin_analytics.py -k region -v`
Expected: all passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/routers/admin.py backend/tests/test_admin_analytics.py
git commit -m "feat: GET /admin/analytics/regions (members/projects/open per viloyat)"
```

---

## Task 5: Admin skill-gap endpoint (TDD)

**Files:**
- Modify: `backend/app/routers/admin.py`
- Test: `backend/tests/test_admin_analytics.py`

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_admin_analytics.py`:

```python
# ── Skill gap ────────────────────────────────────────────────────────────────

async def _req_skill(db, project_id, skill):
    from app.models.project import ProjectReqSkill
    db.add(ProjectReqSkill(project_id=project_id, skill_name=skill))
    await db.commit()


async def _set_skills(db, user_id, skills):
    from app.models.user_analysis import UserAnalysis
    db.add(UserAnalysis(user_id=user_id, skills=skills, knowledges=[],
                        interests=[], preparations=[], goals=[]))
    await db.commit()


async def test_skill_gap_requires_admin(make_user, as_user, db):
    plain = await make_user(name="Plain")
    c = as_user(plain)
    assert (await c.get("/admin/analytics/skill-gap")).status_code == 403


async def test_skill_gap_demand_supply_and_casing(make_user, as_user, db):
    admin = await _admin(make_user)
    founder = await make_user(name="Founder")

    # Demand: 2 live projects need "Backend" (one cased "backend" → collapses),
    # 1 needs "React". A draft project's req-skill must NOT count.
    p1 = await _mk_project(db, founder.id, "P1")
    p2 = await _mk_project(db, founder.id, "P2")
    draft = await _mk_project(db, founder.id, "Draft", is_draft=True, is_approved=False)
    await _req_skill(db, p1.id, "Backend")
    await _req_skill(db, p2.id, "backend")     # case variant
    await _req_skill(db, p1.id, "React")
    await _req_skill(db, draft.id, "Backend")  # excluded (draft)

    # Supply: 2 members have React, 0 have Backend.
    m1 = await make_user(name="M1")
    m2 = await make_user(name="M2")
    await _set_skills(db, m1.id, ["React", "Figma"])
    await _set_skills(db, m2.id, ["react"])    # case variant of supply

    c = as_user(admin)
    res = await c.get("/admin/analytics/skill-gap")
    assert res.status_code == 200, res.text
    skills = {row["skill"].lower(): row for row in res.json()["skills"]}

    # Backend: demand 2 (Backend + backend, both live), supply 0, gap 2.
    assert skills["backend"]["demand"] == 2
    assert skills["backend"]["supply"] == 0
    assert skills["backend"]["gap"] == 2
    # React: demand 1, supply 2, gap -1.
    assert skills["react"]["demand"] == 1
    assert skills["react"]["supply"] == 2
    assert skills["react"]["gap"] == -1
    # Figma is supply-only (demand 0).
    assert skills["figma"]["demand"] == 0 and skills["figma"]["supply"] == 1
    # Sorted by gap desc → Backend (gap 2) is first.
    assert res.json()["skills"][0]["skill"].lower() == "backend"


async def test_skill_gap_excludes_deleted_members(make_user, as_user, db):
    admin = await _admin(make_user)
    gone = await make_user(name="Gone", is_deleted=True)
    await _set_skills(db, gone.id, ["Backend"])
    c = as_user(admin)
    skills = {row["skill"].lower(): row for row in (await c.get("/admin/analytics/skill-gap")).json()["skills"]}
    # No live demand and the only supplier is deleted → Backend absent entirely.
    assert "backend" not in skills
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && python -m pytest tests/test_admin_analytics.py -k skill_gap -v`
Expected: FAIL — route missing (404).

- [ ] **Step 3: Implement the endpoint**

Add to `backend/app/routers/admin.py` (after `analytics_regions`). `ProjectReqSkill`
and `UserAnalysis` were imported in Task 3:

```python
@router.get("/analytics/skill-gap", response_model=dict)
async def analytics_skill_gap(
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Demand vs supply per skill. Demand = distinct LIVE projects (approved,
    non-draft, non-deleted) requiring the skill. Supply = distinct registered,
    non-deleted members whose analysis.skills lists it. Case-insensitive; the
    canonical display casing is the most common original. Sorted by gap desc."""

    # ── Demand: GROUP BY skill_name over live projects. ──
    demand_rows = (await db.execute(
        select(ProjectReqSkill.skill_name, func.count(ProjectReqSkill.project_id))
        .join(Project, Project.id == ProjectReqSkill.project_id)
        .where(Project.is_deleted == False, Project.is_approved == True,
               Project.is_draft == False)
        .group_by(ProjectReqSkill.skill_name)
    )).all()

    # ── Supply: tally analysis.skills JSON in Python (portable across DBs). ──
    supply_rows = (await db.execute(
        select(UserAnalysis.skills)
        .join(User, User.id == UserAnalysis.user_id)
        .where(User.is_registered == True, User.is_deleted == False)
    )).all()

    # Canonical-casing map: lower -> {"display": original, "votes": Counter}
    from collections import Counter
    display_votes: dict[str, Counter] = {}
    demand: dict[str, int] = {}
    supply: dict[str, int] = {}

    def _note(raw: str) -> str | None:
        s = (raw or "").strip()
        if not s:
            return None
        key = s.lower()
        display_votes.setdefault(key, Counter())[s] += 1
        return key

    for name, cnt in demand_rows:
        key = _note(name)
        if key is None:
            continue
        demand[key] = demand.get(key, 0) + int(cnt)

    for (skills,) in supply_rows:
        for raw in (skills or []):
            key = _note(raw)
            if key is None:
                continue
            supply[key] = supply.get(key, 0) + 1  # one member contributes 1 per skill

    out = []
    for key in set(demand) | set(supply):
        # canonical display = most common original casing, ties alphabetical
        votes = display_votes.get(key)
        display = (min(sorted(votes.items()), key=lambda kv: (-kv[1], kv[0]))[0]
                   if votes else key)
        d = demand.get(key, 0)
        s = supply.get(key, 0)
        out.append({"skill": display, "demand": d, "supply": s, "gap": d - s})

    out.sort(key=lambda r: (-r["gap"], -r["demand"], r["skill"].lower()))
    out = out[:100]
    return {"skills": out}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && python -m pytest tests/test_admin_analytics.py -k skill_gap -v`
Expected: all passed.

- [ ] **Step 5: Run the full analytics suite + full backend suite**

Run: `cd backend && python -m pytest tests/test_admin_analytics.py tests/test_founder_funnel.py -q && python -m pytest -q`
Expected: all pass (existing suite + the two new files).

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/admin.py backend/tests/test_admin_analytics.py
git commit -m "feat: GET /admin/analytics/skill-gap (demand vs supply per skill)"
```

---

## Task 6: API client methods

**Files:**
- Modify: `src/api.js`

- [ ] **Step 1: Add the analytics client methods**

In `src/api.js`, inside the `projects` object (after `stats`), add:

```javascript
  funnel:            ()       => req("/projects/mine/funnel"),
```

Inside the `admin` object (after `getStats`), add:

```javascript
  retention:         (activeDays = 30) => req(`/admin/analytics/retention${qs({ active_days: activeDays })}`),
  regionStats:       ()       => req("/admin/analytics/regions"),
  skillGap:          ()       => req("/admin/analytics/skill-gap"),
```

(`qs` is already defined at the top of `api.js`.)

- [ ] **Step 2: Commit**

```bash
git add src/api.js
git commit -m "api: founder funnel + admin retention/regions/skill-gap client methods"
```

---

## Task 7: i18n keys (en/uz/ru)

**Files:**
- Modify: `src/i18n.jsx`

The file uses the per-key nested shape `"key": { en, uz, ru }`. Add these entries
inside the `STRINGS` object (e.g. after the existing admin keys).

- [ ] **Step 1: Add keys**

```javascript
  // ── Batch E: analytics ──────────────────────────────────────────────────────
  "admin.tab.analytics": { en: "Analytics", uz: "Tahlil", ru: "Аналитика" },
  "an.loadError": { en: "Couldn't load analytics", uz: "Tahlilni yuklab bo‘lmadi", ru: "Не удалось загрузить аналитику" },
  // retention
  "an.retention.title": { en: "Cohort retention", uz: "Saqlanib qolish", ru: "Удержание когорт" },
  "an.retention.sub": { en: "Members still active by signup month", uz: "Ro‘yxatdan o‘tgan oy bo‘yicha faol a’zolar", ru: "Активные участники по месяцу регистрации" },
  "an.retention.month": { en: "Month", uz: "Oy", ru: "Месяц" },
  "an.retention.total": { en: "Joined", uz: "Qo‘shilgan", ru: "Пришло" },
  "an.retention.active": { en: "Active", uz: "Faol", ru: "Активны" },
  "an.retention.older": { en: "Older", uz: "Eskiroq", ru: "Ранее" },
  "an.retention.window": { en: "Active window", uz: "Faollik oynasi", ru: "Окно активности" },
  "an.retention.days": { en: "{n} days", uz: "{n} kun", ru: "{n} дн." },
  // regions
  "an.regions.title": { en: "Region heatmap", uz: "Hududlar xaritasi", ru: "Карта регионов" },
  "an.regions.sub": { en: "Supply per viloyat", uz: "Har viloyatdagi resurs", ru: "Ресурсы по вилоятам" },
  "an.regions.members": { en: "Members", uz: "A’zolar", ru: "Участники" },
  "an.regions.projects": { en: "Projects", uz: "Loyihalar", ru: "Проекты" },
  "an.regions.open": { en: "Open", uz: "Ochiq", ru: "Открытые" },
  // skill gap
  "an.skill.title": { en: "Skill gap", uz: "Mahorat tafovuti", ru: "Дефицит навыков" },
  "an.skill.sub": { en: "What projects need vs what members have", uz: "Loyihalarga kerak vs a’zolarda bor", ru: "Что нужно проектам vs что есть у участников" },
  "an.skill.demand": { en: "Demand", uz: "Talab", ru: "Спрос" },
  "an.skill.supply": { en: "Supply", uz: "Taklif", ru: "Предложение" },
  "an.skill.gap": { en: "Gap", uz: "Tafovut", ru: "Дефицит" },
  "an.skill.none": { en: "No skill data yet", uz: "Hali mahorat ma’lumoti yo‘q", ru: "Пока нет данных о навыках" },
  // founder funnel
  "funnel.title": { en: "Your funnel", uz: "Sizning voronkangiz", ru: "Ваша воронка" },
  "funnel.sub": { en: "Views → applications → accepted across your projects", uz: "Ko‘rishlar → arizalar → qabul, loyihalaringiz bo‘yicha", ru: "Просмотры → заявки → приняты по вашим проектам" },
  "funnel.views": { en: "Views", uz: "Ko‘rishlar", ru: "Просмотры" },
  "funnel.applications": { en: "Applications", uz: "Arizalar", ru: "Заявки" },
  "funnel.accepted": { en: "Accepted", uz: "Qabul qilingan", ru: "Приняты" },
  "funnel.pending": { en: "Pending", uz: "Kutilmoqda", ru: "Ожидают" },
  "funnel.declined": { en: "Declined", uz: "Rad etilgan", ru: "Отклонены" },
  "funnel.perProject": { en: "Per project", uz: "Loyiha bo‘yicha", ru: "По проектам" },
  "funnel.empty": { en: "Found a project to see your funnel", uz: "Voronkani ko‘rish uchun loyiha boshlang", ru: "Создайте проект, чтобы увидеть воронку" },
  "funnel.draft": { en: "Draft", uz: "Qoralama", ru: "Черновик" },
  "funnel.closed": { en: "Closed", uz: "Yopiq", ru: "Закрыт" },
```

- [ ] **Step 2: Commit**

```bash
git add src/i18n.jsx
git commit -m "i18n: Batch E analytics keys (en/uz/ru)"
```

---

## Task 8: FounderFunnel component

**Files:**
- Create: `src/components/FounderFunnel.jsx`

- [ ] **Step 1: Create the component**

Create `src/components/FounderFunnel.jsx`:

```jsx
import { useState, useEffect } from "react";
import { projects } from "../api";
import { useT } from "../i18n";
import { tgAlert } from "../tg";

const pct = (num, den) => (den > 0 ? Math.round((num / den) * 100) : 0);

// A single labeled funnel bar. width = value / max (max = views, the widest stage).
const FunnelBar = ({ label, value, max, color, sub }) => (
  <div style={{ marginBottom: 10 }}>
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12,
      color: "var(--text-2)", marginBottom: 4, fontWeight: 600 }}>
      <span>{label}</span>
      <span>{value}{sub != null && <span style={{ color: "var(--text-3)", marginLeft: 6 }}>{sub}</span>}</span>
    </div>
    <div style={{ height: 10, background: "var(--surface-3)", borderRadius: 99, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${max > 0 ? Math.round((value / max) * 100) : 0}%`,
        minWidth: value > 0 ? 4 : 0, background: color, borderRadius: 99 }} />
    </div>
  </div>
);

export const FounderFunnel = () => {
  const { t } = useT();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);

  useEffect(() => {
    projects.funnel()
      .then(setData)
      .catch(() => setErr(true))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ color: "var(--text-3)", fontSize: 13, padding: 16 }}>{t("common.loading")}</div>;
  if (err || !data) return <div style={{ color: "var(--text-3)", fontSize: 13, padding: 16 }}>{t("an.loadError")}</div>;

  const tot = data.totals;
  if (!tot.project_count) {
    return <div style={{ color: "var(--text-3)", fontSize: 13, padding: 16, textAlign: "center" }}>{t("funnel.empty")}</div>;
  }
  const maxV = Math.max(tot.views, tot.applications, tot.accepted, 1);

  return (
    <div>
      <div style={{ fontWeight: 800, fontSize: 16, fontFamily: "var(--font-display)" }}>{t("funnel.title")}</div>
      <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 14 }}>{t("funnel.sub")}</div>

      <FunnelBar label={t("funnel.views")} value={tot.views} max={maxV} color="#7B6FFF" />
      <FunnelBar label={t("funnel.applications")} value={tot.applications} max={maxV} color="#4ECDC4"
        sub={`${pct(tot.applications, tot.views)}%`} />
      <FunnelBar label={t("funnel.accepted")} value={tot.accepted} max={maxV} color="#FFB347"
        sub={`${pct(tot.accepted, tot.applications)}%`} />

      <div className="section-label" style={{ marginTop: 18 }}>{t("funnel.perProject")}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {data.projects.map(p => {
          const tag = p.is_draft ? t("funnel.draft") : (!p.is_active ? t("funnel.closed") : null);
          return (
            <div key={p.id} style={{ background: "var(--surface-2)", border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)", padding: "10px 12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontWeight: 600, color: "var(--text)", fontSize: 14 }}>{p.name}</span>
                {tag && <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)",
                  background: "var(--surface-3)", borderRadius: 6, padding: "2px 6px" }}>{tag}</span>}
              </div>
              <div style={{ display: "flex", gap: 14, fontSize: 12, color: "var(--text-2)" }}>
                <span>{t("funnel.views")}: <b style={{ color: "var(--text)" }}>{p.views}</b></span>
                <span>{t("funnel.applications")}: <b style={{ color: "var(--text)" }}>{p.applications}</b></span>
                <span>{t("funnel.accepted")}: <b style={{ color: "#FFB347" }}>{p.accepted}</b></span>
              </div>
            </div>
          );
        })}
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
git add src/components/FounderFunnel.jsx
git commit -m "feat: FounderFunnel component (views->apply->accept, per-project)"
```

---

## Task 9: Mount FounderFunnel on the founder's projects surface

**Files:**
- Modify: the founder "my projects" screen (locate it first)

- [ ] **Step 1: Find the founder's projects screen**

Run: `git grep -ln "projects.mine\|myRequests\|\"projects/mine\"\|projects/mine" src`
This finds the screen(s) that already list the founder's own projects (it uses
`projects.mine()`). Open that screen and identify a sensible header/top area to drop
the funnel above the project list (e.g. a "My projects" / "Manage" view).

- [ ] **Step 2: Mount the component behind a small toggle**

At the top of the chosen screen file, import the component:

```jsx
import { FounderFunnel } from "../components/FounderFunnel";
```

(If the screen is in `src/components/`, use `./FounderFunnel`.)

Add a collapse toggle so the funnel doesn't crowd the list. Near the screen's other
`useState` hooks add:

```jsx
  const [showFunnel, setShowFunnel] = useState(false);
```

Render an expander above the project list (place it just before the list `.map`):

```jsx
      <button onClick={() => setShowFunnel(v => !v)} style={{
        width: "100%", marginBottom: 12, padding: "10px 14px", textAlign: "left",
        background: "var(--surface-2)", border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm)", color: "var(--accent)", fontWeight: 700,
        fontSize: 13, cursor: "pointer", display: "flex", justifyContent: "space-between",
      }}>
        <span>📊 {t("funnel.title")}</span>
        <span style={{ color: "var(--text-3)" }}>{showFunnel ? "−" : "+"}</span>
      </button>
      {showFunnel && (
        <div style={{ marginBottom: 16 }}>
          <FounderFunnel />
        </div>
      )}
```

(The screen already imports `useT`/`t`; if not, add `import { useT } from "../i18n";`
and `const { t } = useT();`. If the screen has no obvious project-list section,
mount the expander at the top of its main content container — the funnel is
self-contained and fetches its own data, so the only requirement is that it renders
inside an authenticated screen.)

- [ ] **Step 3: Build to verify**

Run: `npm run build`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add src
git commit -m "feat: surface FounderFunnel on the founder's projects screen"
```

---

## Task 10: Analytics tab in AdminScreen

**Files:**
- Modify: `src/screens/AdminScreen.jsx`

- [ ] **Step 1: Add the tab to the tab strip + content switch**

In `src/screens/AdminScreen.jsx`, the tab strip is built from an array of
`[tab, key]` pairs (~line 394). Add `["Analytics","admin.tab.analytics"]` right
after the Dashboard entry:

```jsx
        {[["Dashboard","admin.tab.dashboard"],["Analytics","admin.tab.analytics"],["Users","admin.tab.users"],["Projects","admin.tab.projects"],["Partners","admin.tab.partners"],["Locations","admin.tab.locations"],["Events","admin.tab.events"],["Reports","admin.tab.reports"],...(isSuper ? [["Broadcast","admin.tab.broadcast"]] : [])].map(([tab, key]) => (
```

In the content switch (~line 410), add a branch:

```jsx
            {activeTab === "Analytics" && renderAnalytics()}
```

- [ ] **Step 2: Load the analytics data**

In `loadData`, add an `Analytics` branch (alongside the other `else if` tabs). It
loads all three admin analytics endpoints in parallel and stores them under one
object so `renderAnalytics` can read them:

```jsx
      } else if (tab === "Analytics") {
        const [ret, reg, gap] = await Promise.all([
          admin.retention(activeDays), admin.regionStats(), admin.skillGap(),
        ]);
        setData({ retention: ret, regions: reg, skillGap: gap });
      }
```

Add an `activeDays` state near the other `useState` hooks at the top of the
`AdminScreen` component:

```jsx
  const [activeDays, setActiveDays] = useState(30);
```

And re-fetch retention when `activeDays` changes while on the Analytics tab — add an
effect after the existing `useEffect`:

```jsx
  useEffect(() => {
    if (activeTab === "Analytics") loadData("Analytics");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDays]);
```

- [ ] **Step 3: Add the `renderAnalytics` function**

Add this render function inside the `AdminScreen` component (e.g. after
`renderDashboard`). It uses CSS bars + tables only — no chart library:

```jsx
  const renderAnalytics = () => {
    if (!data || !data.retention) return null;
    const ret = data.retention;
    const reg = data.regions;
    const gap = data.skillGap;
    const maxMembers = Math.max(1, ...(reg?.regions || []).map(r => r.members));
    const maxDS = Math.max(1, ...(gap?.skills || []).flatMap(s => [s.demand, s.supply]));

    const Bar = ({ frac, color }) => (
      <div style={{ height: 8, background: "var(--surface-3)", borderRadius: 99, overflow: "hidden", flex: 1 }}>
        <div style={{ height: "100%", width: `${Math.round(frac * 100)}%`, minWidth: frac > 0 ? 3 : 0, background: color, borderRadius: 99 }} />
      </div>
    );

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
        {/* Retention */}
        <div>
          <div style={{ fontWeight: 800, fontSize: 16, fontFamily: "var(--font-display)" }}>{t("an.retention.title")}</div>
          <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 10 }}>{t("an.retention.sub")}</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            {[30, 60, 90].map(d => (
              <button key={d} onClick={() => setActiveDays(d)} style={{
                padding: "5px 12px", borderRadius: 99, fontSize: 12, fontWeight: 600, cursor: "pointer",
                background: activeDays === d ? "var(--accent)" : "var(--surface-2)",
                color: activeDays === d ? "#fff" : "var(--text-2)",
                border: activeDays === d ? "none" : "1px solid var(--border)",
              }}>{t("an.retention.days", { n: d })}</button>
            ))}
          </div>
          {ret.cohorts.map(row => (
            <div key={row.month} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <span style={{ width: 64, fontSize: 12, color: "var(--text-2)", fontWeight: 600 }}>
                {row.month === "older" ? t("an.retention.older") : row.month}
              </span>
              <Bar frac={row.retention_pct / 100} color="#4ECDC4" />
              <span style={{ width: 90, fontSize: 11, color: "var(--text-3)", textAlign: "right" }}>
                {row.active}/{row.total} · {row.retention_pct}%
              </span>
            </div>
          ))}
        </div>

        {/* Region heatmap */}
        <div>
          <div style={{ fontWeight: 800, fontSize: 16, fontFamily: "var(--font-display)" }}>{t("an.regions.title")}</div>
          <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 10 }}>{t("an.regions.sub")}</div>
          {(reg.regions || []).map(r => (
            <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <span style={{ width: 90, fontSize: 12, color: "var(--text-2)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {r[`name_${lang}`] || r.name_en}
              </span>
              <Bar frac={r.members / maxMembers} color="#7B6FFF" />
              <span style={{ width: 110, fontSize: 11, color: "var(--text-3)", textAlign: "right" }}>
                {r.members} · {r.projects}p · {r.open_projects} {t("an.regions.open").toLowerCase()}
              </span>
            </div>
          ))}
        </div>

        {/* Skill gap */}
        <div>
          <div style={{ fontWeight: 800, fontSize: 16, fontFamily: "var(--font-display)" }}>{t("an.skill.title")}</div>
          <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 10 }}>{t("an.skill.sub")}</div>
          {(gap.skills || []).length === 0 ? (
            <div style={{ fontSize: 12, color: "var(--text-3)" }}>{t("an.skill.none")}</div>
          ) : (gap.skills || []).map(s => (
            <div key={s.skill} style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                <span style={{ fontWeight: 600, color: "var(--text)" }}>{s.skill}</span>
                <span style={{ fontWeight: 700, color: s.gap > 0 ? "#FF6B6B" : "var(--text-3)" }}>
                  {t("an.skill.gap")}: {s.gap > 0 ? `+${s.gap}` : s.gap}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 60, fontSize: 10, color: "var(--text-3)" }}>{t("an.skill.demand")} {s.demand}</span>
                <Bar frac={s.demand / maxDS} color="#FFB347" />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3 }}>
                <span style={{ width: 60, fontSize: 10, color: "var(--text-3)" }}>{t("an.skill.supply")} {s.supply}</span>
                <Bar frac={s.supply / maxDS} color="#4ECDC4" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };
```

`lang` is available from `useT()` — confirm the component's destructuring includes
it. The top of `AdminScreen` has `const { t } = useT();`; change it to:

```jsx
  const { t, lang } = useT();
```

(`lang` is already used by the nested `EventAdminForm`/`AddLocation`/`LocationItem`
components via their own `useT()` calls, so the pattern is established.)

- [ ] **Step 4: Build to verify**

Run: `npm run build`
Expected: success.

- [ ] **Step 5: Commit**

```bash
git add src/screens/AdminScreen.jsx
git commit -m "feat: Analytics tab in AdminScreen (retention/regions/skill-gap, CSS bars)"
```

---

## Task 11: Full verification + push

- [ ] **Step 1: Full backend suite**

Run: `cd backend && python -m pytest -q`
Expected: all pass (existing + `test_founder_funnel.py` + `test_admin_analytics.py`).

- [ ] **Step 2: Frontend build**

Run: `npm run build`
Expected: success (landing prebuild + vite build).

- [ ] **Step 3: Push**

```bash
git push
```

- [ ] **Step 4: Verify on the deployed app**
  - As a founder, open the "my projects" screen, expand the funnel: views →
    applications → accepted bars + conversion %s, and a per-project breakdown with
    draft/closed tags.
  - As an admin, open Admin → Analytics: the retention table responds to the
    30/60/90 selector; the region heatmap bars size relative to the busiest region
    and label in the active language; the skill-gap table shows demand/supply mini-
    bars and red `+N` badges on under-supplied skills.
  - As a plain (non-admin) member, confirm the Analytics tab isn't reachable (the
    admin screen is only opened for admins) and that `GET /admin/analytics/*`
    returns 403 if called directly.

---

## Self-review notes

- **Spec coverage:**
  - Founder dashboard (per-founder funnel, views→apply→accept, per-project) ✓ T2
    (`GET /projects/mine/funnel`) + T8 `FounderFunnel` + T9 mount. **Distinct from**
    the existing single-project `GET /projects/{id}/stats` — new path, same
    per-status counting, sums across all of the caller's projects.
  - Cohort retention (admin, signup-month buckets, active-within-N-days) ✓ T3 +
    T10 retention section. `active_days` clamped 1..365; 24-month cap + `older`
    rollup; `NULL last_seen_at` → inactive.
  - Region heatmap (admin, members/projects/open per viloyat) ✓ T4 + T10 regions
    section. Projects attributed to creator's region (mirrors `/public/regions`);
    `open_projects` = active+hiring proxy.
  - Skill-gap report (admin, demand vs supply, top under-supplied) ✓ T5 + T10 skill
    section. Demand from `ProjectReqSkill` over live projects; supply from
    `user_analyses.skills`; case-insensitive collapse; sort by gap desc.
  - i18n en/uz/ru ✓ T7.
- **EXTEND, not duplicate:** confirmed by reading `admin.py` + `projects.py` — the
  only pre-existing analytics are `GET /admin/stats` (flat totals) and
  `GET /projects/{id}/stats` (single project). Batch E adds new paths
  (`/projects/mine/funnel`, `/admin/analytics/*`) and does **not** touch either
  existing endpoint. The funnel reuses the single-project counting rules so the two
  agree.
- **Role-gating reuses existing deps:** all three admin endpoints use
  `get_admin_user` (the same gate the rest of `admin.py` uses); the funnel uses
  `get_current_user` + ownership scoping (`creator_id == me`). 403-for-non-admin is
  asserted in `test_admin_analytics.py` for each admin endpoint.
- **Read-only / no schema churn:** no writes, no notifications, no new tables, no
  new columns. One idempotent migration only: `CREATE INDEX IF NOT EXISTS
  ix_project_req_skills_skill_name` (T1) — the single previously-unindexed GROUP BY
  column. All other grouped columns (`users.created_at`/`region_id`,
  `projects.creator_id`, the feed flags) are already indexed.
- **Cross-DB safety (Postgres prod / SQLite tests):** month bucketing (retention)
  and JSON-skills tallying (skill-gap supply) are done **in Python**, never with
  `date_trunc`/`strftime`/JSON operators, so the SQLite test suite and Postgres prod
  behave identically — the same derivation rule Batches A–D follow. The portable
  `GROUP BY`s (applications-by-status, members-by-region, projects-by-region,
  demand-by-skill-name) are plain SQL that runs on both.
- **Type/name consistency:**
  - Funnel: API returns `totals{project_count,views,applications,accepted,pending,
    declined}` + `projects[]{id,name,type,is_active,is_draft,is_approved,views,
    applications,accepted,pending,declined}` ↔ test asserts ↔ `FounderFunnel`
    reads `data.totals.*` + `data.projects[].*` ↔ `projects.funnel()` (T6).
  - Retention: `{active_days, cohorts:[{month,total,active,retention_pct}]}` ↔ test
    ↔ `renderAnalytics` ret section ↔ `admin.retention(activeDays)` (T6).
  - Regions: `{totals{members,projects,open_projects}, regions:[{id,name_en,name_uz,
    name_ru,members,projects,open_projects}]}` ↔ test ↔ regions section (uses
    `name_${lang}`) ↔ `admin.regionStats()` (T6).
  - Skill-gap: `{skills:[{skill,demand,supply,gap}]}` ↔ test ↔ skill section ↔
    `admin.skillGap()` (T6).
- **Counting honesty:** funnel `applications` = accepted+pending+declined (sum of
  the three statuses seeded in the test), so it equals `GET /projects/{id}/stats`'s
  total when those are the only statuses. If a future status is added, both
  endpoints would need it — flagged here, not silently divergent.
- **Route ordering:** `/projects/mine/funnel` is registered right after
  `/projects/mine` and both precede the dynamic `/projects/{project_id}`, so
  `funnel`/`mine` are never captured as a project id (T2 Step 5 runs the project
  suite to confirm no shadowing).
- **No chart library:** every visual is a CSS `<div>` bar or a table; confirmed no
  new dependency is introduced (the repo has none and T8/T10 add none).
- **No placeholders:** every backend step ships complete, runnable code with real
  pytest assertions over seeded rows. The only read-the-repo step is T9's mount
  point (the founder "my projects" screen), with an explicit `git grep` to locate it
  and a self-contained fallback (the funnel fetches its own data, so it renders
  inside any authenticated screen) — flagged, not left as a silent TODO.
