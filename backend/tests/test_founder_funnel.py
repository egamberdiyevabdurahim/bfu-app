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
