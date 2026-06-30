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
