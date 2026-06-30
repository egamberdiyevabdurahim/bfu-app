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
