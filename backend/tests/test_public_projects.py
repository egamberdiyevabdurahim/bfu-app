"""GET /public/projects — the Chorsu /projects discovery feed."""
import pytest

pytestmark = pytest.mark.asyncio


async def _project(db, creator_id, **over):
    from app.models.project import Project
    d = dict(type="startup", creator_id=creator_id, name="P", goal="g", about="a",
             is_active=True, is_hiring=True, is_approved=True, is_draft=False, is_deleted=False)
    d.update(over)
    p = Project(**d)
    db.add(p); await db.commit(); await db.refresh(p)
    return p


async def test_projects_feed_shape_and_visibility(make_user, db, client):
    from app.models.project import ProjectMember, ProjectReqSkill
    founder = await make_user(name="Aziza", checked=True)
    member = await make_user(name="Rustam")
    p = await _project(db, founder.id, name="SolarBazaar")
    db.add_all([ProjectMember(project_id=p.id, user_id=member.id),
                ProjectReqSkill(project_id=p.id, skill_name="Firmware")])
    # hidden ones must NOT appear
    await _project(db, founder.id, name="DraftOne", is_draft=True)
    await _project(db, founder.id, name="Unapproved", is_approved=False)
    await _project(db, founder.id, name="Deleted", is_deleted=True)
    await db.commit()

    res = await client.get("/public/projects")
    assert res.status_code == 200, res.text
    b = res.json()
    names = [c["name"] for c in b["projects"]]
    assert "SolarBazaar" in names
    assert not ({"DraftOne", "Unapproved", "Deleted"} & set(names))
    card = next(c for c in b["projects"] if c["name"] == "SolarBazaar")
    assert card["founder"]["id"] == founder.id
    assert card["team_count"] == 1
    assert card["skills"] == ["Firmware"]
    assert b["stats"]["total"] >= 1 and b["stats"]["hiring"] >= 1


async def test_projects_feed_orders_pinned_and_hiring_first(make_user, db, client):
    founder = await make_user(name="F")
    await _project(db, founder.id, name="Old", is_hiring=False)
    await _project(db, founder.id, name="Hiring", is_hiring=True)
    await _project(db, founder.id, name="Pinned", is_pinned=True, is_hiring=False)
    b = (await client.get("/public/projects")).json()
    names = [c["name"] for c in b["projects"]]
    assert names[0] == "Pinned"          # pinned wins
    assert names.index("Hiring") < names.index("Old")


async def test_projects_feed_filters(make_user, db, client):
    founder = await make_user(name="F")
    await _project(db, founder.id, name="Startup1", type="startup")
    await _project(db, founder.id, name="Vol1", type="volunteering")
    b = (await client.get("/public/projects?type=volunteering")).json()
    names = [c["name"] for c in b["projects"]]
    assert "Vol1" in names and "Startup1" not in names


async def test_projects_feed_no_pii(make_user, db, client):
    founder = await make_user(name="F", phone_number="+998901234567")
    await _project(db, founder.id, name="P1")
    b = (await client.get("/public/projects")).json()
    dumped = str(b)
    for leak in ("998901234567", "phone_number", "telegram_id", "latitude", "longitude"):
        assert leak not in dumped
