"""Events RSVP + reminders."""
from datetime import datetime, timedelta

import pytest
from sqlalchemy import select

from app.models.event import Event
from app.models.event_rsvp import EventRsvp
from app.models.user import Notification


async def _make_event(db, **overrides) -> Event:
    defaults = dict(type="hackathon", title="Hack Night", is_approved=True, is_deleted=False)
    defaults.update(overrides)
    e = Event(**defaults)
    db.add(e)
    await db.commit()
    await db.refresh(e)
    return e


@pytest.mark.asyncio
async def test_rsvp_toggle_and_count(db, make_user, as_user):
    creator = await make_user()
    goer = await make_user()
    e = await _make_event(db, created_by=creator.id)

    client = as_user(goer)
    r = await client.post(f"/events/{e.id}/rsvp", json={"status": "going"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["rsvp_count"] == 1 and body["my_rsvp"] == "going"

    # list reflects count + this user's status
    lst = (await client.get("/events")).json()
    row = next(x for x in lst if x["id"] == e.id)
    assert row["rsvp_count"] == 1 and row["my_rsvp"] == "going"

    # un-rsvp
    r = await client.delete(f"/events/{e.id}/rsvp")
    assert r.status_code == 200
    assert r.json()["rsvp_count"] == 0 and r.json()["my_rsvp"] is None
    row = next(x for x in (await client.get("/events")).json() if x["id"] == e.id)
    assert row["rsvp_count"] == 0 and row["my_rsvp"] is None


@pytest.mark.asyncio
async def test_rsvp_switch_status_reuses_row(db, make_user, as_user):
    u = await make_user()
    e = await _make_event(db)
    client = as_user(u)

    await client.post(f"/events/{e.id}/rsvp", json={"status": "going"})
    r = await client.post(f"/events/{e.id}/rsvp", json={"status": "interested"})
    assert r.json()["my_rsvp"] == "interested"
    assert r.json()["rsvp_count"] == 0  # interested is not counted as going

    rows = (await db.execute(select(EventRsvp).where(EventRsvp.event_id == e.id))).scalars().all()
    assert len(rows) == 1 and rows[0].status == "interested"  # one row, reused


@pytest.mark.asyncio
async def test_attendees_and_my_rsvps(db, make_user, as_user):
    a = await make_user(name="Alice", surname="Anders")
    b = await make_user(name="Bob", surname="Baker")
    e1 = await _make_event(db, title="E1")
    e2 = await _make_event(db, title="E2")

    await as_user(a).post(f"/events/{e1.id}/rsvp", json={"status": "going"})
    await as_user(b).post(f"/events/{e1.id}/rsvp", json={"status": "going"})
    await as_user(a).post(f"/events/{e2.id}/rsvp", json={"status": "going"})

    att = (await as_user(a).get(f"/events/{e1.id}/attendees")).json()
    assert att["attendee_count"] == 2
    assert {x["user_id"] for x in att["attendees"]} == {a.id, b.id}

    mine = (await as_user(a).get("/events/mine/rsvps")).json()
    assert {x["id"] for x in mine} == {e1.id, e2.id}
    assert all(x["my_rsvp"] == "going" for x in mine)


@pytest.mark.asyncio
async def test_rsvp_notifies_creator_only_on_new_going_not_self(db, make_user, as_user):
    creator = await make_user()
    goer = await make_user()
    e = await _make_event(db, created_by=creator.id)

    # goer RSVPs → creator gets one event_rsvp notification carrying the event id
    await as_user(goer).post(f"/events/{e.id}/rsvp", json={"status": "going"})
    notes = (await db.execute(
        select(Notification).where(Notification.user_id == creator.id)
    )).scalars().all()
    assert len(notes) == 1
    assert notes[0].type == "event_rsvp" and notes[0].event_id == e.id and notes[0].actor_id == goer.id

    # re-RSVP does not re-notify
    await as_user(goer).post(f"/events/{e.id}/rsvp", json={"status": "going"})
    notes = (await db.execute(
        select(Notification).where(Notification.user_id == creator.id)
    )).scalars().all()
    assert len(notes) == 1

    # creator RSVPing their own event notifies nobody
    await as_user(creator).post(f"/events/{e.id}/rsvp", json={"status": "going"})
    notes = (await db.execute(
        select(Notification).where(Notification.user_id == creator.id)
    )).scalars().all()
    assert len(notes) == 1


@pytest.mark.asyncio
async def test_interested_then_going_notifies_creator_once(db, make_user, as_user):
    creator = await make_user()
    u = await make_user()
    e = await _make_event(db, created_by=creator.id)
    client = as_user(u)

    await client.post(f"/events/{e.id}/rsvp", json={"status": "interested"})  # no notify
    await client.post(f"/events/{e.id}/rsvp", json={"status": "going"})       # becomes going → notify
    notes = (await db.execute(
        select(Notification).where(Notification.user_id == creator.id)
    )).scalars().all()
    assert len(notes) == 1 and notes[0].type == "event_rsvp" and notes[0].event_id == e.id


@pytest.mark.asyncio
async def test_interested_does_not_notify_creator(db, make_user, as_user):
    creator = await make_user()
    u = await make_user()
    e = await _make_event(db, created_by=creator.id)
    await as_user(u).post(f"/events/{e.id}/rsvp", json={"status": "interested"})
    notes = (await db.execute(
        select(Notification).where(Notification.user_id == creator.id)
    )).scalars().all()
    assert notes == []


@pytest.mark.asyncio
async def test_rsvp_unknown_event_404(db, make_user, as_user):
    u = await make_user()
    r = await as_user(u).post("/events/999999/rsvp", json={"status": "going"})
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_reminder_job_sends_once_and_is_idempotent(db, engine, make_user, monkeypatch):
    """The hourly cron DMs each going-RSVP for an event closing within 24h exactly
    once (reminded_at marker), and does not re-send on a second run."""
    import rsvp_reminders
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

    sends = []

    async def _fake_send(chat_id, text, reply_markup=None):
        sends.append(chat_id)
        return True

    class _StubEngine:
        async def dispose(self):
            return None

    # Route the cron's own session/engine at the in-memory test DB + stub network.
    monkeypatch.setattr(rsvp_reminders, "send_telegram", _fake_send, raising=True)
    monkeypatch.setattr(rsvp_reminders, "engine", _StubEngine(), raising=True)
    test_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(rsvp_reminders, "AsyncSessionLocal", test_factory, raising=True)

    u = await make_user(telegram_id=555001)
    e = await _make_event(db, title="Closing soon", deadline=datetime.utcnow() + timedelta(hours=12))
    db.add(EventRsvp(event_id=e.id, user_id=u.id, status="going"))
    await db.commit()

    assert await rsvp_reminders.main() == 0
    assert sends == [555001]

    row = (await db.execute(select(EventRsvp).where(EventRsvp.user_id == u.id))).scalar_one()
    await db.refresh(row)
    assert row.reminded_at is not None

    # second run → no re-send
    sends.clear()
    assert await rsvp_reminders.main() == 0
    assert sends == []
