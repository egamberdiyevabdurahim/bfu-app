"""Phase-2 event backend: map pin (lat/lng), organizer-set custom reminder times,
and the reminder DM's ✅Boraman/❌Borolmayman buttons feeding coming/cant_come.

Marstiff relies on reminders to fill the room, so the custom-reminder cron is
covered hard: exactly-once per (rsvp, time), the legacy auto windows step aside
for events that carry custom times, and every DM carries the RSVP-intent buttons.
"""
from datetime import datetime, timedelta

import pytest
from sqlalchemy import select

import rsvp_reminders
from app.models.event import Event
from app.models.event_rsvp import EventRsvp

pytestmark = pytest.mark.asyncio


async def _admin(make_user):
    return await make_user(name="Boss", role="admin")


def _iso(dt: datetime) -> str:
    return dt.replace(microsecond=0).isoformat()


# ── endpoint round-trip: lat/lng + reminder_times (normalized) ────────────────

async def test_event_map_and_reminder_times_round_trip(db, make_user, as_user):
    admin = await _admin(make_user)
    c = as_user(admin)
    # Deliberately unsorted + duplicated + one Z-suffixed (aware) time.
    r = await c.post("/admin/events", json={
        "type": "meetup", "title": "SAT Mock",
        "lat": 41.311081, "lng": 69.240562,
        "reminder_times": [
            "2026-08-05T09:00:00",
            "2026-08-05T09:00:00",          # dup → collapsed
            "2026-08-04T18:00:00Z",         # aware → naive UTC
        ],
    })
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["lat"] == pytest.approx(41.311081)
    assert body["lng"] == pytest.approx(69.240562)
    # sorted, de-duped, Z stripped to naive
    assert body["reminder_times"] == [
        "2026-08-04T18:00:00", "2026-08-05T09:00:00",
    ]
    # public detail exposes the pin (for the map + deep-links)
    d = await as_user(admin).get(f"/events/{body['id']}")
    assert d.status_code == 200
    assert d.json()["lat"] == pytest.approx(41.311081)


async def test_empty_reminder_times_stored_as_null(db, make_user, as_user):
    admin = await _admin(make_user)
    r = await as_user(admin).post("/admin/events", json={
        "type": "grant", "title": "No reminders", "reminder_times": [],
    })
    assert r.status_code == 201, r.text
    assert r.json()["reminder_times"] is None  # [] normalizes to None → legacy mode


# ── lead pipeline accepts coming / cant_come (the bot-button targets) ──────────

async def test_lead_status_accepts_coming_and_cant_come(db, make_user, as_user):
    admin = await _admin(make_user)
    member = await make_user(name="Ali")
    e = Event(type="meetup", title="SAT", is_approved=True, is_deleted=False)
    db.add(e); await db.commit(); await db.refresh(e)
    db.add(EventRsvp(event_id=e.id, user_id=member.id, status="going",
                     lead_status="registered"))
    await db.commit()
    for st in ("coming", "cant_come"):
        r = await as_user(admin).patch(
            f"/admin/events/{e.id}/responses/{member.id}", json={"lead_status": st})
        assert r.status_code == 200, r.text
        assert r.json()["lead_status"] == st


# ── the custom-reminder cron (mode A) ─────────────────────────────────────────

async def test_custom_reminder_pass_sends_once_with_rsvp_buttons(db, make_user, monkeypatch):
    calls = []

    async def fake_send(tg_id, text, reply_markup=None):
        calls.append((tg_id, text, reply_markup))
        return True

    monkeypatch.setattr(rsvp_reminders, "send_telegram", fake_send)

    now = datetime.utcnow()
    past = _iso(now - timedelta(minutes=30))      # due
    future = _iso(now + timedelta(hours=6))       # not yet
    stale = _iso(now - timedelta(days=3))         # too old → never fires

    u = await make_user(telegram_id=770001, language="uz")
    e = Event(type="meetup", title="Free SAT Mock", is_approved=True, is_deleted=False,
              starts_at=now + timedelta(hours=3), reminder_times=[stale, past, future])
    db.add(e); await db.commit(); await db.refresh(e)
    db.add(EventRsvp(event_id=e.id, user_id=u.id, status="going"))
    await db.commit()

    cand, sent = await rsvp_reminders._run_custom_pass(db, now)
    assert sent == 1 and len(calls) == 1
    # the DM carries the ✅/❌ intent buttons with the right callbacks
    markup = calls[0][2]
    flat = [b for row in markup["inline_keyboard"] for b in row]
    cbs = [b.get("callback_data") for b in flat]
    assert f"ev:coming:{e.id}" in cbs and f"ev:cant:{e.id}" in cbs

    row = (await db.execute(
        select(EventRsvp).where(EventRsvp.event_id == e.id))).scalar_one()
    assert past in (row.reminders_sent or [])
    assert future not in (row.reminders_sent or [])   # not due
    assert stale not in (row.reminders_sent or [])    # too old, skipped

    # Second pass: the due one is already recorded → no re-send.
    calls.clear()
    _, sent2 = await rsvp_reminders._run_custom_pass(db, now)
    assert sent2 == 0 and calls == []


async def test_legacy_pass_skips_events_with_custom_times(db, make_user, monkeypatch):
    async def fake_send(*a, **k):
        return True
    monkeypatch.setattr(rsvp_reminders, "send_telegram", fake_send)

    now = datetime.utcnow()
    start = now + timedelta(hours=12)   # inside the T-24h window (now+1h, now+24h]
    u1 = await make_user(telegram_id=771001)
    u2 = await make_user(telegram_id=771002)

    # Event WITH custom times → excluded from the legacy T-24h pass.
    custom = Event(type="meetup", title="Custom", is_approved=True, is_deleted=False,
                   starts_at=start, reminder_times=[_iso(now + timedelta(hours=1))])
    # Event WITHOUT custom times → legacy pass handles it.
    legacy = Event(type="meetup", title="Legacy", is_approved=True, is_deleted=False,
                   starts_at=start)
    db.add_all([custom, legacy]); await db.commit()
    await db.refresh(custom); await db.refresh(legacy)
    db.add_all([
        EventRsvp(event_id=custom.id, user_id=u1.id, status="going"),
        EventRsvp(event_id=legacy.id, user_id=u2.id, status="going"),
    ])
    await db.commit()

    cand, sent = await rsvp_reminders._run_pass(
        db, now, lo=now + timedelta(hours=1), hi=now + timedelta(hours=24),
        stamp_col=EventRsvp.reminded_at, headers=rsvp_reminders.HEADER_24H,
    )
    # Only the legacy event's RSVP is a candidate; the custom one is excluded.
    assert cand == 1 and sent == 1
    legacy_rsvp = (await db.execute(select(EventRsvp).where(
        EventRsvp.event_id == legacy.id))).scalar_one()
    custom_rsvp = (await db.execute(select(EventRsvp).where(
        EventRsvp.event_id == custom.id))).scalar_one()
    assert legacy_rsvp.reminded_at is not None
    assert custom_rsvp.reminded_at is None
