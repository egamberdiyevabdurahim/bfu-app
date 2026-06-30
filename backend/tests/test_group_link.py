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
