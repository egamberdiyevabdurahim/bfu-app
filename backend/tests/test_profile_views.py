"""Who-viewed-your-profile: recording a named view inside GET /users/{id} and
the GET /users/me/profile-viewers list."""
import datetime as dt

import pytest
from sqlalchemy import select, update

from app.models.profile_view import ProfileView

pytestmark = pytest.mark.asyncio


async def _views_of(db, viewed_id):
    """Fresh (viewer_id, updated_at) snapshots for a viewed user. Selecting
    individual columns (Core) always hits the DB and returns current values, so
    rows written by the request session are seen without identity-map staleness."""
    return (await db.execute(
        select(ProfileView.viewer_id, ProfileView.updated_at)
        .where(ProfileView.viewed_id == viewed_id)
    )).all()


async def test_viewing_records_one_row(make_user, db, as_user):
    viewer = await make_user(name="Viewer")
    target = await make_user(name="Target")
    viewer_id, target_id = viewer.id, target.id

    res = await as_user(viewer).get(f"/users/{target_id}")
    assert res.status_code == 200, res.text

    rows = await _views_of(db, target_id)
    assert len(rows) == 1
    assert rows[0].viewer_id == viewer_id
    assert rows[0].updated_at is not None


async def test_viewing_again_upserts_and_bumps_time(make_user, db, as_user):
    viewer = await make_user(name="Viewer")
    target = await make_user(name="Target")
    target_id = target.id

    assert (await as_user(viewer).get(f"/users/{target_id}")).status_code == 200

    # Backdate the single row so the second view's bump is unambiguous.
    old = dt.datetime.utcnow() - dt.timedelta(hours=1)
    await db.execute(
        update(ProfileView).where(ProfileView.viewed_id == target_id)
        .values(created_at=old, updated_at=old)
    )
    await db.commit()

    assert (await as_user(viewer).get(f"/users/{target_id}")).status_code == 200

    rows = await _views_of(db, target_id)
    assert len(rows) == 1                       # still ONE row (upsert, no pile-up)
    assert rows[0].updated_at > old             # updated_at was bumped forward


async def test_self_view_not_recorded(make_user, db, as_user):
    me = await make_user(name="Me")
    me_id = me.id

    res = await as_user(me).get(f"/users/{me_id}")
    assert res.status_code == 200, res.text

    assert await _views_of(db, me_id) == []


async def test_anon_view_not_recorded(make_user, db, client):
    target = await make_user(name="Target")
    target_id = target.id

    # No auth override on the plain `client` → HTTPBearer rejects the request
    # before the handler runs, so there's no identity → no view recorded.
    res = await client.get(f"/users/{target_id}")
    assert res.status_code in (401, 403)

    assert await _views_of(db, target_id) == []


async def test_profile_viewers_endpoint_newest_first_with_count(make_user, db, as_user):
    me = await make_user(name="Me")
    a = await make_user(name="Aziz", surname="Karimov")
    b = await make_user(name="Bek", surname="Tosh")
    a_id, b_id = a.id, b.id

    # a viewed me first, then b viewed me → b should sort ahead of a.
    now = dt.datetime.utcnow()
    db.add(ProfileView(viewer_id=a_id, viewed_id=me.id,
                       created_at=now - dt.timedelta(minutes=10),
                       updated_at=now - dt.timedelta(minutes=10)))
    db.add(ProfileView(viewer_id=b_id, viewed_id=me.id,
                       created_at=now - dt.timedelta(minutes=1),
                       updated_at=now - dt.timedelta(minutes=1)))
    await db.commit()

    res = await as_user(me).get("/users/me/profile-viewers")
    assert res.status_code == 200, res.text
    body = res.json()

    assert body["count"] == 2
    assert [r["id"] for r in body["recent"]] == [b_id, a_id]   # newest updated_at first
    assert body["recent"][0]["display_name"]                   # named, not anonymous
    assert "viewed_at" in body["recent"][0]
    assert "is_online" in body["recent"][0]


async def test_profile_viewers_excludes_banned_and_deleted(make_user, db, as_user):
    me = await make_user(name="Me")
    ok = await make_user(name="Good")
    banned = await make_user(name="Banned", banned=True)
    gone = await make_user(name="Gone", is_deleted=True)
    ok_id = ok.id

    now = dt.datetime.utcnow()
    for vid in (ok_id, banned.id, gone.id):
        db.add(ProfileView(viewer_id=vid, viewed_id=me.id,
                           created_at=now, updated_at=now))
    await db.commit()

    body = (await as_user(me).get("/users/me/profile-viewers")).json()
    assert body["count"] == 1
    assert [r["id"] for r in body["recent"]] == [ok_id]


async def test_end_to_end_view_then_list(make_user, db, as_user):
    """A real GET /users/{id} view shows up in the target's viewers list."""
    viewer = await make_user(name="Scout")
    target = await make_user(name="Star")
    viewer_id, target_id = viewer.id, target.id

    assert (await as_user(viewer).get(f"/users/{target_id}")).status_code == 200

    body = (await as_user(target).get("/users/me/profile-viewers")).json()
    assert body["count"] == 1
    assert body["recent"][0]["id"] == viewer_id
