"""Announce gate: nothing about an event reaches a member's chat without an
explicit admin press.

The founder's rule — "disable sending message about events without admin's
permission to chats." So creating or approving an event must NOT fan out DMs or
post to the group; only POST /admin/events/{id}/announce does, and only for a
live (approved) event, and only once (a second press is refused unless forced).

`_fire_event_push` (the DM fan-out) and `_broadcast_to_group` (the group card)
are the two things that actually touch chats — both are spied here so a test can
assert precisely whether an action reached out.
"""
import pytest

import app.routers.admin as admin_mod
from app.models.event import Event

pytestmark = pytest.mark.asyncio


@pytest.fixture()
def spy_reach(monkeypatch):
    """Record every attempt to reach members' chats. Returns {"push": [...],
    "group": [...]}: push holds the event_ids handed to the DM fan-out, group the
    start_params handed to the group broadcast. Both are patched on the admin
    module, which is where `_announce_event` looks them up at call time."""
    seen = {"push": [], "group": []}
    monkeypatch.setattr(admin_mod, "_fire_event_push", lambda eid: seen["push"].append(eid))

    async def _spy_group(text, start_param):
        seen["group"].append(start_param)

    monkeypatch.setattr(admin_mod, "_broadcast_to_group", _spy_group)
    return seen


async def _make_event(db, **overrides) -> Event:
    defaults = dict(type="meetup", title="Free SAT Mock Test",
                    is_approved=True, is_deleted=False)
    defaults.update(overrides)
    e = Event(**defaults)
    db.add(e)
    await db.commit()
    await db.refresh(e)
    return e


async def _admin(make_user):
    return await make_user(name="Boss", role="admin")


# ── create / approve must stay silent ─────────────────────────────────────────

async def test_create_event_does_not_reach_chats(db, make_user, as_user, spy_reach):
    admin = await _admin(make_user)
    r = await as_user(admin).post("/admin/events", json={"type": "meetup", "title": "SAT Mock"})
    assert r.status_code == 201, r.text
    # Neither the DM fan-out nor the group card fired on create.
    assert spy_reach["push"] == []
    assert spy_reach["group"] == []
    # And the row is unannounced.
    assert r.json()["announced_at"] is None


async def test_approve_event_does_not_reach_chats(db, make_user, as_user, spy_reach):
    admin = await _admin(make_user)
    e = await _make_event(db, is_approved=False)  # a pending (partner-style) event
    r = await as_user(admin).patch(f"/admin/events/{e.id}/approve")
    assert r.status_code == 200, r.text
    assert r.json()["is_approved"] is True
    # Approve only makes it visible — it reaches no chats and stays unannounced.
    assert spy_reach["push"] == []
    assert spy_reach["group"] == []
    assert r.json()["announced_at"] is None


# ── announce: the ONE explicit door ───────────────────────────────────────────

async def test_announce_fires_push_and_group_and_stamps(db, make_user, as_user, spy_reach):
    admin = await _admin(make_user)
    e = await _make_event(db)  # approved
    r = await as_user(admin).post(f"/admin/events/{e.id}/announce")
    assert r.status_code == 200, r.text
    assert spy_reach["push"] == [e.id]
    assert spy_reach["group"] == [f"event_{e.id}"]
    assert r.json()["announced_at"] is not None


async def test_announce_requires_approved(db, make_user, as_user, spy_reach):
    admin = await _admin(make_user)
    e = await _make_event(db, is_approved=False)
    r = await as_user(admin).post(f"/admin/events/{e.id}/announce")
    assert r.status_code == 400, r.text
    # Nothing reached any chat.
    assert spy_reach["push"] == []
    assert spy_reach["group"] == []


async def test_announce_second_press_is_refused_then_forceable(db, make_user, as_user, spy_reach):
    admin = await _admin(make_user)
    e = await _make_event(db)
    r1 = await as_user(admin).post(f"/admin/events/{e.id}/announce")
    assert r1.status_code == 200, r1.text
    # A stray second press does NOT re-blast.
    r2 = await as_user(admin).post(f"/admin/events/{e.id}/announce")
    assert r2.status_code == 409, r2.text
    assert spy_reach["push"] == [e.id]  # still just the one fan-out
    # …but a deliberate re-announce (force) is allowed.
    r3 = await as_user(admin).post(f"/admin/events/{e.id}/announce?force=true")
    assert r3.status_code == 200, r3.text
    assert spy_reach["push"] == [e.id, e.id]


async def test_announce_missing_event_404(db, make_user, as_user, spy_reach):
    admin = await _admin(make_user)
    r = await as_user(admin).post("/admin/events/999999/announce")
    assert r.status_code == 404, r.text


async def test_announce_is_admin_only(db, make_user, as_user, spy_reach):
    member = await make_user(name="Reg", role="user")
    e = await _make_event(db)
    r = await as_user(member).post(f"/admin/events/{e.id}/announce")
    assert r.status_code in (401, 403), r.text
    assert spy_reach["push"] == []
