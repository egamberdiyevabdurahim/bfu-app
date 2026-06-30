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
