"""Batch C project updates feed: founder posts, fan-out, read, delete."""
import pytest

pytestmark = pytest.mark.asyncio


async def _mk_project(db, creator_id, name):
    from app.models.project import Project, ProjectMember
    p = Project(type="startup", creator_id=creator_id, name=name, is_active=True,
                is_draft=False, is_deleted=False, is_approved=True)
    db.add(p)
    await db.commit()
    await db.refresh(p)
    db.add(ProjectMember(project_id=p.id, user_id=creator_id))
    await db.commit()
    return p


async def test_post_update_fans_out(make_user, as_user, db):
    from app.models.user import Notification
    from app.models.connection import Follow
    from app.models.project import ProjectMember

    founder = await make_user(name="Founder")
    member = await make_user(name="Member")
    follower = await make_user(name="Follower")
    p = await _mk_project(db, founder.id, "Proj")
    db.add(ProjectMember(project_id=p.id, user_id=member.id))
    db.add(Follow(follower_id=follower.id, target_type="project", target_id=p.id))
    await db.commit()

    c = as_user(founder)
    r = await c.post(f"/projects/{p.id}/updates", json={"text": "  We shipped v1!  "})
    assert r.status_code == 200, r.text
    notes = (await db.execute(
        Notification.__table__.select().where(Notification.type == "project_update")
    )).all()
    recipients = {n.user_id for n in notes}
    # member + follower get it; founder (author) does not.
    assert member.id in recipients and follower.id in recipients
    assert founder.id not in recipients


async def test_post_update_founder_only(make_user, as_user, db):
    founder = await make_user(name="Founder")
    other = await make_user(name="Other")
    p = await _mk_project(db, founder.id, "Proj")
    c = as_user(other)
    assert (await c.post(f"/projects/{p.id}/updates", json={"text": "hi"})).status_code == 403


async def test_post_update_empty_rejected(make_user, as_user, db):
    founder = await make_user(name="Founder")
    p = await _mk_project(db, founder.id, "Proj")
    c = as_user(founder)
    assert (await c.post(f"/projects/{p.id}/updates", json={"text": "   "})).status_code == 400


async def test_get_and_delete_updates(make_user, as_user, db):
    founder = await make_user(name="Founder")
    reader = await make_user(name="Reader")
    p = await _mk_project(db, founder.id, "Proj")
    cf = as_user(founder)
    await cf.post(f"/projects/{p.id}/updates", json={"text": "first"})
    r = await cf.post(f"/projects/{p.id}/updates", json={"text": "second"})
    uid = r.json()["id"]

    cr = as_user(reader)
    res = await cr.get(f"/projects/{p.id}/updates")
    assert res.status_code == 200, res.text
    ups = res.json()["updates"]
    assert [u["text"] for u in ups] == ["second", "first"]   # newest first
    assert ups[0]["author"]["id"] == founder.id

    # Non-author can't delete.
    assert (await cr.delete(f"/projects/{p.id}/updates/{uid}")).status_code == 403
    # Author can (re-assert auth — `as_user` overrides the shared client's
    # current identity, and the `cr` call above switched it to the reader).
    cf = as_user(founder)
    assert (await cf.delete(f"/projects/{p.id}/updates/{uid}")).status_code == 204
    # Deleting again → 404.
    assert (await cf.delete(f"/projects/{p.id}/updates/{uid}")).status_code == 404
