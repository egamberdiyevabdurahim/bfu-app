"""GET /public/project/{id}/data — the Chorsu desktop /p/{id} project page contract."""
import pytest

pytestmark = pytest.mark.asyncio


async def _project(db, creator_id, **over):
    from app.models.project import Project
    defaults = dict(type="startup", creator_id=creator_id, name="SolarBazaar",
                    goal="Light up the bazaar", about="Climate hardware for founders.",
                    is_active=True, is_hiring=True, is_approved=True,
                    is_draft=False, is_deleted=False)
    defaults.update(over)
    p = Project(**defaults)
    db.add(p); await db.commit(); await db.refresh(p)
    return p


async def test_project_data_full_shape(make_user, db, client):
    from app.models.project import ProjectMember, ProjectReqSkill, ProjectReqKnowledge, ProjectReqRegion
    from app.models.region import Region

    r = Region(name_en="Tashkent City", name_uz="Toshkent shahri", name_ru="Город Ташкент")
    db.add(r); await db.commit(); await db.refresh(r)

    founder = await make_user(name="Aziza", checked=True)
    member = await make_user(name="Rustam")
    proj = await _project(db, founder.id)
    db.add_all([
        ProjectMember(project_id=proj.id, user_id=member.id),
        ProjectReqSkill(project_id=proj.id, skill_name="Hardware"),
        ProjectReqKnowledge(project_id=proj.id, knowledge_name="Solar"),
        ProjectReqRegion(project_id=proj.id, region_id=r.id),
    ])
    await db.commit()

    res = await client.get(f"/public/project/{proj.id}/data")
    assert res.status_code == 200, res.text
    b = res.json()
    assert b["id"] == proj.id
    assert b["name"] == "SolarBazaar"
    assert b["type"] == "startup"
    assert b["is_hiring"] is True
    assert b["founder"]["id"] == founder.id and b["founder"]["checked"] is True
    assert b["team_count"] == 1 and b["team"][0]["id"] == member.id
    assert b["looking_for"]["skills"] == ["Hardware"]
    assert b["looking_for"]["knowledges"] == ["Solar"]
    assert b["looking_for"]["regions"][0] == {
        "id": r.id, "name_en": "Tashkent City", "name_uz": "Toshkent shahri", "name_ru": "Город Ташкент"}
    assert b["canonical_url"].endswith(f"/p/{proj.id}")


async def test_project_data_excludes_creator_from_team(make_user, db, client):
    from app.models.project import ProjectMember
    founder = await make_user(name="Solo")
    proj = await _project(db, founder.id)
    # creator is also a member row (common) — must not double-appear in team
    db.add(ProjectMember(project_id=proj.id, user_id=founder.id))
    await db.commit()
    b = (await client.get(f"/public/project/{proj.id}/data")).json()
    assert b["team_count"] == 0
    assert all(m["id"] != founder.id for m in b["team"])


async def test_project_data_404_when_not_public(make_user, db, client):
    founder = await make_user(name="F")
    assert (await client.get("/public/project/999999/data")).status_code == 404

    draft = await _project(db, founder.id, is_draft=True, is_approved=True)
    assert (await client.get(f"/public/project/{draft.id}/data")).status_code == 404

    unapproved = await _project(db, founder.id, is_approved=False)
    assert (await client.get(f"/public/project/{unapproved.id}/data")).status_code == 404

    deleted = await _project(db, founder.id, is_deleted=True)
    assert (await client.get(f"/public/project/{deleted.id}/data")).status_code == 404


async def test_project_data_no_pii_leak(make_user, db, client):
    founder = await make_user(name="F", phone_number="+998901234567")
    proj = await _project(db, founder.id)
    b = (await client.get(f"/public/project/{proj.id}/data")).json()
    dumped = str(b)
    for leak in ("998901234567", "phone_number", "telegram_id", "latitude", "longitude"):
        assert leak not in dumped
