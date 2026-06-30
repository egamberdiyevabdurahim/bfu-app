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
