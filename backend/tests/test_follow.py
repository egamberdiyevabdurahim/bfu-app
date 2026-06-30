"""Batch C follow: follows table, counts, is_following, mentor sub-object."""
import pytest

pytestmark = pytest.mark.asyncio


async def _set_mentor(db, user, *, bio="Bio", topics=None):
    import json
    user.is_mentor = True
    user.mentor_bio = bio
    user.mentor_topics = json.dumps(topics if topics is not None else ["Startups"])
    await db.commit()


async def test_connection_extras_counts_and_following(make_user, db):
    from app.routers.users import _connection_extras
    from app.models.connection import Follow

    target = await make_user(name="Target")
    f1 = await make_user(name="F1")
    f2 = await make_user(name="F2")
    db.add(Follow(follower_id=f1.id, target_type="user", target_id=target.id))
    db.add(Follow(follower_id=f2.id, target_type="user", target_id=target.id))
    # target follows one project + one user.
    db.add(Follow(follower_id=target.id, target_type="project", target_id=999))
    db.add(Follow(follower_id=target.id, target_type="user", target_id=f1.id))
    await db.commit()

    # Viewed by f1 → is_following True (f1 follows target).
    seen = await _connection_extras(db, target, f1)
    assert seen["follower_count"] == 2
    assert seen["following_count"] == 2
    assert seen["is_following"] is True

    stranger = await make_user(name="S")
    seen_s = await _connection_extras(db, target, stranger)
    assert seen_s["is_following"] is False


async def test_connection_extras_self_not_following(make_user, db):
    from app.routers.users import _connection_extras
    me = await make_user(name="Me")
    extras = await _connection_extras(db, me, me)
    assert extras["is_following"] is False
    assert extras["follower_count"] == 0


async def test_connection_extras_mentor_object(make_user, db):
    from app.routers.users import _connection_extras
    m = await make_user(name="Mentor")
    await _set_mentor(db, m, bio="10 yrs fintech", topics=["Startups", "Fundraising"])
    extras = await _connection_extras(db, m, None)
    assert extras["mentor"]["is_mentor"] is True
    assert extras["mentor"]["bio"] == "10 yrs fintech"
    assert extras["mentor"]["topics"] == ["Startups", "Fundraising"]


async def test_connection_extras_non_mentor_default(make_user, db):
    from app.routers.users import _connection_extras
    u = await make_user(name="U")
    extras = await _connection_extras(db, u, None)
    assert extras["mentor"] == {"is_mentor": False, "bio": None, "topics": []}


async def test_get_user_profile_includes_connection(make_user, as_user, db):
    from app.models.connection import Follow
    target = await make_user(name="Target")
    viewer = await make_user(name="Viewer")
    db.add(Follow(follower_id=viewer.id, target_type="user", target_id=target.id))
    await db.commit()

    c = as_user(viewer)
    res = await c.get(f"/users/{target.id}")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["follower_count"] == 1
    assert body["is_following"] is True
    assert body["mentor"] == {"is_mentor": False, "bio": None, "topics": []}


async def test_get_me_includes_connection(make_user, as_user, db):
    me = await make_user(name="Me")
    c = as_user(me)
    res = await c.get("/users/me")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["follower_count"] == 0
    assert body["is_following"] is False
    assert "mentor" in body


async def _mk_project(db, creator_id, name, *, is_active=True, is_draft=False, is_deleted=False):
    from app.models.project import Project
    p = Project(type="startup", creator_id=creator_id, name=name, is_active=is_active,
                is_draft=is_draft, is_deleted=is_deleted, is_approved=True)
    db.add(p)
    await db.commit()
    await db.refresh(p)
    return p


async def test_follow_user_toggle_and_notify(make_user, as_user, db):
    from app.models.user import Notification
    from app.models.connection import Follow
    target = await make_user(name="Target")
    me = await make_user(name="Me")
    c = as_user(me)

    r1 = await c.post("/follow", json={"target_type": "user", "target_id": target.id})
    assert r1.status_code == 200, r1.text
    assert r1.json() == {"ok": True, "following": True, "follower_count": 1}
    # Re-follow is idempotent (one row).
    r2 = await c.post("/follow", json={"target_type": "user", "target_id": target.id})
    assert r2.json()["following"] is True
    rows = (await db.execute(
        Follow.__table__.select().where(Follow.target_id == target.id)
    )).all()
    assert len(rows) == 1
    # Target got exactly one new_follower notification.
    notes = (await db.execute(
        Notification.__table__.select().where(Notification.type == "new_follower")
    )).all()
    assert len([n for n in notes if n.user_id == target.id]) == 1
    # Unfollow.
    r3 = await c.request("DELETE", "/follow", json={"target_type": "user", "target_id": target.id})
    assert r3.status_code == 204
    gone = (await db.execute(
        Follow.__table__.select().where(Follow.target_id == target.id)
    )).all()
    assert gone == []


async def test_follow_project_no_notify(make_user, as_user, db):
    from app.models.user import Notification
    founder = await make_user(name="Founder")
    me = await make_user(name="Me")
    p = await _mk_project(db, founder.id, "Proj")
    c = as_user(me)
    r = await c.post("/follow", json={"target_type": "project", "target_id": p.id})
    assert r.status_code == 200, r.text
    assert r.json()["following"] is True
    notes = (await db.execute(
        Notification.__table__.select().where(Notification.type == "new_follower")
    )).all()
    assert notes == []   # project-follow never notifies


async def test_follow_self_and_missing(make_user, as_user, db):
    me = await make_user(name="Me")
    c = as_user(me)
    assert (await c.post("/follow", json={"target_type": "user", "target_id": me.id})).status_code == 400
    assert (await c.post("/follow", json={"target_type": "user", "target_id": 999999})).status_code == 404
    assert (await c.post("/follow", json={"target_type": "project", "target_id": 999999})).status_code == 404
    assert (await c.post("/follow", json={"target_type": "x", "target_id": 1})).status_code == 422


async def test_unfollow_idempotent(make_user, as_user, db):
    me = await make_user(name="Me")
    other = await make_user(name="Other")
    c = as_user(me)
    # Deleting a non-existent follow is a no-op 204.
    r = await c.request("DELETE", "/follow", json={"target_type": "user", "target_id": other.id})
    assert r.status_code == 204


async def test_my_following_lists_both(make_user, as_user, db):
    founder = await make_user(name="Founder")
    u = await make_user(name="U")
    me = await make_user(name="Me")
    p = await _mk_project(db, founder.id, "Proj")
    c = as_user(me)
    await c.post("/follow", json={"target_type": "user", "target_id": u.id})
    await c.post("/follow", json={"target_type": "project", "target_id": p.id})
    res = await c.get("/users/me/following")
    assert res.status_code == 200, res.text
    body = res.json()
    assert {x["id"] for x in body["users"]} == {u.id}
    assert {x["id"] for x in body["projects"]} == {p.id}
