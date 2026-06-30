"""Batch C mentor mode + booking: profile toggle, slots, bookings, notifications."""
import datetime as dt

import pytest

pytestmark = pytest.mark.asyncio


def _future(hours=24):
    return (dt.datetime.utcnow() + dt.timedelta(hours=hours)).isoformat()


async def _make_mentor(make_user, db, **kw):
    import json
    m = await make_user(**kw)
    m.is_mentor = True
    m.mentor_bio = "Bio"
    m.mentor_topics = json.dumps(["Startups"])
    await db.commit()
    return m


# ── Mentor profile via PATCH /me ──────────────────────────────────────────────
async def test_patch_me_sets_mentor(make_user, as_user, db):
    me = await make_user(name="Me")
    c = as_user(me)
    r = await c.patch("/users/me", json={
        "is_mentor": True, "mentor_bio": "10 yrs", "mentor_topics": ["A", "  ", "B"],
    })
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["mentor"]["is_mentor"] is True
    assert body["mentor"]["bio"] == "10 yrs"
    assert body["mentor"]["topics"] == ["A", "B"]   # blanks dropped


# ── Slots ─────────────────────────────────────────────────────────────────────
async def test_create_and_list_slots(make_user, as_user, db):
    m = await _make_mentor(make_user, db, name="M")
    c = as_user(m)
    r = await c.post("/mentors/me/slots", json={"start_at": _future(24)})
    assert r.status_code == 200, r.text
    # Past slot → 422.
    r2 = await c.post("/mentors/me/slots", json={"start_at": _future(-5)})
    assert r2.status_code == 422
    # Duplicate (mentor, start) → 409.
    same = _future(48)
    assert (await c.post("/mentors/me/slots", json={"start_at": same})).status_code == 200
    assert (await c.post("/mentors/me/slots", json={"start_at": same})).status_code == 409
    # Listing my own slots.
    res = await c.get(f"/mentors/{m.id}/slots")
    assert res.status_code == 200
    assert len(res.json()["slots"]) == 2


async def test_delete_open_slot_only(make_user, as_user, db):
    from app.models.connection import MentorSlot
    m = await _make_mentor(make_user, db, name="M")
    mentee = await make_user(name="Mentee")
    c = as_user(m)
    r = await c.post("/mentors/me/slots", json={"start_at": _future(24)})
    slot_id = r.json()["id"]
    # Book it (mentee) so it's no longer open.
    cm = as_user(mentee)
    await cm.post("/bookings", json={"slot_id": slot_id})
    # Mentor cannot delete a booked slot.
    c = as_user(m)
    assert (await c.delete(f"/mentors/me/slots/{slot_id}")).status_code == 409
    # A different open slot can be deleted.
    r2 = await c.post("/mentors/me/slots", json={"start_at": _future(48)})
    assert (await c.delete(f"/mentors/me/slots/{r2.json()['id']}")).status_code == 204


async def test_mentors_list(make_user, as_user, db):
    m = await _make_mentor(make_user, db, name="M")
    viewer = await make_user(name="V")
    cm = as_user(m)
    await cm.post("/mentors/me/slots", json={"start_at": _future(24)})
    c = as_user(viewer)
    res = await c.get("/mentors")
    assert res.status_code == 200, res.text
    rows = {r["id"]: r for r in res.json()}
    assert m.id in rows
    assert rows[m.id]["open_slots"] == 1
    assert rows[m.id]["topics"] == ["Startups"]


# ── Bookings ──────────────────────────────────────────────────────────────────
async def test_book_confirm_flow(make_user, as_user, db):
    from app.models.user import Notification
    from app.models.connection import MentorSlot, Booking
    m = await _make_mentor(make_user, db, name="M")
    mentee = await make_user(name="Mentee")
    cm = as_user(m)
    slot_id = (await cm.post("/mentors/me/slots", json={"start_at": _future(24)})).json()["id"]

    cme = as_user(mentee)
    r = await cme.post("/bookings", json={"slot_id": slot_id, "note": "  want help  "})
    assert r.status_code == 200, r.text
    bid = r.json()["id"]
    assert r.json()["status"] == "requested"
    # Slot now booked.
    slot = (await db.execute(MentorSlot.__table__.select().where(MentorSlot.id == slot_id))).first()
    assert slot.status == "booked"
    # Mentor got a booking_request.
    notes = (await db.execute(Notification.__table__.select().where(Notification.type == "booking_request"))).all()
    assert any(n.user_id == m.id for n in notes)
    # Double-book → 409.
    other = await make_user(name="Other")
    assert (await as_user(other).post("/bookings", json={"slot_id": slot_id})).status_code == 409
    # Mentor confirms.
    cm = as_user(m)
    rc = await cm.patch(f"/bookings/{bid}", json={"action": "confirm"})
    assert rc.status_code == 200
    assert rc.json()["status"] == "confirmed"
    conf = (await db.execute(Notification.__table__.select().where(Notification.type == "booking_confirmed"))).all()
    assert any(n.user_id == mentee.id for n in conf)


async def test_decline_frees_slot(make_user, as_user, db):
    from app.models.user import Notification
    from app.models.connection import MentorSlot
    m = await _make_mentor(make_user, db, name="M")
    mentee = await make_user(name="Mentee")
    cm = as_user(m)
    slot_id = (await cm.post("/mentors/me/slots", json={"start_at": _future(24)})).json()["id"]
    cme = as_user(mentee)
    bid = (await cme.post("/bookings", json={"slot_id": slot_id})).json()["id"]
    cm = as_user(m)
    r = await cm.patch(f"/bookings/{bid}", json={"action": "decline"})
    assert r.status_code == 200 and r.json()["status"] == "declined"
    slot = (await db.execute(MentorSlot.__table__.select().where(MentorSlot.id == slot_id))).first()
    assert slot.status == "open"   # freed
    notes = (await db.execute(Notification.__table__.select().where(Notification.type == "booking_declined"))).all()
    assert any(n.user_id == mentee.id for n in notes)


async def test_mentee_cancel_frees_slot(make_user, as_user, db):
    from app.models.connection import MentorSlot
    m = await _make_mentor(make_user, db, name="M")
    mentee = await make_user(name="Mentee")
    cm = as_user(m)
    slot_id = (await cm.post("/mentors/me/slots", json={"start_at": _future(24)})).json()["id"]
    cme = as_user(mentee)
    bid = (await cme.post("/bookings", json={"slot_id": slot_id})).json()["id"]
    cme = as_user(mentee)
    r = await cme.patch(f"/bookings/{bid}", json={"action": "cancel"})
    assert r.status_code == 200 and r.json()["status"] == "cancelled"
    slot = (await db.execute(MentorSlot.__table__.select().where(MentorSlot.id == slot_id))).first()
    assert slot.status == "open"


async def test_book_self_and_wrong_actor(make_user, as_user, db):
    m = await _make_mentor(make_user, db, name="M")
    mentee = await make_user(name="Mentee")
    stranger = await make_user(name="Stranger")
    cm = as_user(m)
    slot_id = (await cm.post("/mentors/me/slots", json={"start_at": _future(24)})).json()["id"]
    # Mentor books own slot → 400.
    cm = as_user(m)
    assert (await cm.post("/bookings", json={"slot_id": slot_id})).status_code == 400
    cme = as_user(mentee)
    bid = (await cme.post("/bookings", json={"slot_id": slot_id})).json()["id"]
    # Stranger cannot act on the booking.
    cs = as_user(stranger)
    assert (await cs.patch(f"/bookings/{bid}", json={"action": "confirm"})).status_code == 403
    # Mentee cannot confirm (only cancel).
    cme = as_user(mentee)
    assert (await cme.patch(f"/bookings/{bid}", json={"action": "confirm"})).status_code == 403


async def test_redecline_after_rebook_is_rejected(make_user, as_user, db):
    """A books slot S, mentor declines (S reopens), B books S, mentor RE-declines
    A's already-declined booking. Must be rejected, and B's active booking/slot
    must not be corrupted."""
    from app.models.connection import MentorSlot
    m = await _make_mentor(make_user, db, name="M")
    a = await make_user(name="A")
    b = await make_user(name="B")
    cm = as_user(m)
    slot_id = (await cm.post("/mentors/me/slots", json={"start_at": _future(24)})).json()["id"]

    ca = as_user(a)
    bid_a = (await ca.post("/bookings", json={"slot_id": slot_id})).json()["id"]

    cm = as_user(m)
    r1 = await cm.patch(f"/bookings/{bid_a}", json={"action": "decline"})
    assert r1.status_code == 200 and r1.json()["status"] == "declined"

    cb = as_user(b)
    bid_b = (await cb.post("/bookings", json={"slot_id": slot_id})).json()["id"]

    # Mentor re-declines A's already-declined booking → must be rejected.
    cm = as_user(m)
    r2 = await cm.patch(f"/bookings/{bid_a}", json={"action": "decline"})
    assert r2.status_code == 409

    # Slot must still be booked (B's hold intact, not wrongly reopened).
    slot = (await db.execute(MentorSlot.__table__.select().where(MentorSlot.id == slot_id))).first()
    assert slot.status == "booked"

    # B's booking must still be requested (untouched).
    from app.models.connection import Booking
    booking_b = (await db.execute(Booking.__table__.select().where(Booking.id == bid_b))).first()
    assert booking_b.status == "requested"


async def test_confirm_after_cancel_rejected(make_user, as_user, db):
    m = await _make_mentor(make_user, db, name="M")
    mentee = await make_user(name="Mentee")
    cm = as_user(m)
    slot_id = (await cm.post("/mentors/me/slots", json={"start_at": _future(24)})).json()["id"]
    cme = as_user(mentee)
    bid = (await cme.post("/bookings", json={"slot_id": slot_id})).json()["id"]

    cme = as_user(mentee)
    r1 = await cme.patch(f"/bookings/{bid}", json={"action": "cancel"})
    assert r1.status_code == 200 and r1.json()["status"] == "cancelled"

    cm = as_user(m)
    r2 = await cm.patch(f"/bookings/{bid}", json={"action": "confirm"})
    assert r2.status_code == 409


async def test_bookings_me_split(make_user, as_user, db):
    m = await _make_mentor(make_user, db, name="M")
    mentee = await make_user(name="Mentee")
    cm = as_user(m)
    slot_id = (await cm.post("/mentors/me/slots", json={"start_at": _future(24)})).json()["id"]
    cme = as_user(mentee)
    await cme.post("/bookings", json={"slot_id": slot_id})
    cme = as_user(mentee)
    res_mentee = await cme.get("/bookings/me")
    assert len(res_mentee.json()["as_mentee"]) == 1
    cm = as_user(m)
    res_mentor = await cm.get("/bookings/me")
    assert len(res_mentor.json()["as_mentor"]) == 1
