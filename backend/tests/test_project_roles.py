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
