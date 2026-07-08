"""Real user presence — is_online helper, POST /users/me/heartbeat, and that
/public/city online_now reflects a fresh heartbeat."""
import datetime as dt

# Async tests are collected via the suite-wide asyncio_mode=auto (see conftest);
# no module-level asyncio marker so the one sync test below stays unmarked.


def test_is_online_helper():
    from app.services.presence import ONLINE_WINDOW, is_online

    assert ONLINE_WINDOW == dt.timedelta(minutes=5)
    now = dt.datetime.utcnow()
    assert is_online(now) is True                                   # just now
    assert is_online(now - dt.timedelta(minutes=1)) is True         # fresh
    assert is_online(now - dt.timedelta(minutes=10)) is False       # stale
    assert is_online(None) is False                                 # never seen
    # Tolerates an accidentally tz-aware value without raising.
    aware = dt.datetime.now(dt.timezone.utc)
    assert is_online(aware) is True


async def test_heartbeat_sets_last_seen_and_marks_online(make_user, db, as_user):
    from app.services.presence import is_online

    u = await make_user(name="Pinger")
    u.last_seen_at = None
    await db.commit()
    assert is_online(u.last_seen_at) is False   # offline before any ping

    client = as_user(u)
    res = await client.post("/users/me/heartbeat")
    assert res.status_code == 200, res.text
    assert res.json() == {"ok": True}

    await db.refresh(u)
    assert u.last_seen_at is not None
    assert is_online(u.last_seen_at) is True     # a fresh ping → online


async def test_me_reports_is_online_after_heartbeat(make_user, db, as_user):
    u = await make_user(name="Seen")
    u.last_seen_at = None
    await db.commit()

    client = as_user(u)
    await client.post("/users/me/heartbeat")
    me = (await client.get("/users/me")).json()
    assert me["is_online"] is True
    assert me["last_seen_at"] is not None


async def test_city_online_now_reflects_heartbeat(make_user, db):
    """A user seen just now counts toward online_now; a 30-min-old one doesn't."""
    from app.routers.public import _city_stats

    fresh = await make_user(name="Fresh")
    fresh.last_seen_at = dt.datetime.utcnow()
    stale = await make_user(name="Stale")
    stale.last_seen_at = dt.datetime.utcnow() - dt.timedelta(minutes=30)
    await db.commit()

    s = await _city_stats(db)
    assert s["online_now"] == 1


async def test_ten_minute_old_last_seen_is_offline(make_user, db):
    from app.routers.public import _city_stats

    u = await make_user(name="Away")
    u.last_seen_at = dt.datetime.utcnow() - dt.timedelta(minutes=10)
    await db.commit()

    s = await _city_stats(db)
    assert s["online_now"] == 0
