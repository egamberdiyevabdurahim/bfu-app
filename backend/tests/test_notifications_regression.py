"""Hotfix regression: GET /users/me/notifications must not 500 when a
notification has an actor. (Was importing a nonexistent `avatar_url` from
app.routers.public — the real helper lives in app.services.signing and is
already applied via User.photo_url, so the import was both wrong-module and
unused. Only triggers when actor_ids is non-empty, which is why no existing
test caught it.)
"""
import pytest

from app.models.user import Notification

pytestmark = pytest.mark.asyncio


async def test_notifications_with_actor_does_not_500(make_user, as_user, db):
    me = await make_user(name="Me")
    actor = await make_user(name="Actor")
    db.add(Notification(user_id=me.id, type="interest", actor_id=actor.id))
    await db.commit()

    c = as_user(me)
    res = await c.get("/users/me/notifications")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["items"][0]["actor"]["id"] == actor.id
    assert body["items"][0]["actor"]["display_name"] == actor.display_name


async def test_notifications_with_project_does_not_500(make_user, as_user, db):
    from app.models.project import Project

    me = await make_user(name="Me")
    p = Project(type="startup", creator_id=me.id, name="Solar Farm", about="x",
                is_active=True, is_draft=False, is_deleted=False, is_approved=True)
    db.add(p)
    await db.commit()
    await db.refresh(p)
    db.add(Notification(user_id=me.id, type="accepted", project_id=p.id))
    await db.commit()

    c = as_user(me)
    res = await c.get("/users/me/notifications")
    assert res.status_code == 200, res.text


async def test_notifications_empty_does_not_500(make_user, as_user, db):
    me = await make_user(name="Me")
    c = as_user(me)
    res = await c.get("/users/me/notifications")
    assert res.status_code == 200, res.text
