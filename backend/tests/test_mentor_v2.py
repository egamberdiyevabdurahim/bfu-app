"""Mentorship v2 — meeting link + post-session rating."""
import datetime as dt
import json

import pytest
from sqlalchemy import select

from app.models.connection import Booking, MentorSlot

pytestmark = pytest.mark.asyncio


async def _make_mentor(make_user, db, **kw):
    m = await make_user(**kw)
    m.is_mentor = True
    m.mentor_bio = "Bio"
    m.mentor_topics = json.dumps(["Startups"])
    await db.commit()
    return m


async def _confirmed_booking(db, mentor, mentee, *, start_at):
    """Insert a slot + confirmed booking directly (create_slot forbids past slots)."""
    slot = MentorSlot(mentor_id=mentor.id, start_at=start_at, duration_min=15, status="booked")
    db.add(slot)
    await db.flush()
    b = Booking(slot_id=slot.id, mentor_id=mentor.id, mentee_id=mentee.id, status="confirmed")
    db.add(b)
    await db.commit()
    await db.refresh(b)
    return b


# ── Meeting link ──────────────────────────────────────────────────────────────
async def test_meeting_link_set_edit_clear_and_visible(make_user, as_user, db):
    mentor = await _make_mentor(make_user, db, name="M")
    mentee = await make_user(name="Mentee")
    b = await _confirmed_booking(db, mentor, mentee, start_at=dt.datetime.utcnow() + dt.timedelta(hours=1))

    cm = as_user(mentor)
    r = await cm.patch(f"/bookings/{b.id}/meeting-link", json={"url": "https://meet.google.com/abc"})
    assert r.status_code == 200, r.text
    assert r.json()["meeting_link"] == "https://meet.google.com/abc"

    # both parties see it in /bookings/me
    mine = (await as_user(mentee).get("/bookings/me")).json()
    assert mine["as_mentee"][0]["meeting_link"] == "https://meet.google.com/abc"
    theirs = (await as_user(mentor).get("/bookings/me")).json()
    assert theirs["as_mentor"][0]["meeting_link"] == "https://meet.google.com/abc"

    # clear with empty
    r = await cm.patch(f"/bookings/{b.id}/meeting-link", json={"url": ""})
    assert r.json()["meeting_link"] is None


async def test_meeting_link_guards(make_user, as_user, db):
    mentor = await _make_mentor(make_user, db, name="M")
    mentee = await make_user(name="Mentee")
    b = await _confirmed_booking(db, mentor, mentee, start_at=dt.datetime.utcnow() + dt.timedelta(hours=1))

    # non-http → 422
    assert (await as_user(mentor).patch(f"/bookings/{b.id}/meeting-link", json={"url": "javascript:alert(1)"})).status_code == 422
    # mentee cannot set → 403
    assert (await as_user(mentee).patch(f"/bookings/{b.id}/meeting-link", json={"url": "https://x.com"})).status_code == 403
    # unknown booking → 404
    assert (await as_user(mentor).patch("/bookings/999999/meeting-link", json={"url": "https://x.com"})).status_code == 404


async def test_meeting_link_requires_confirmed(make_user, as_user, db):
    mentor = await _make_mentor(make_user, db, name="M")
    mentee = await make_user(name="Mentee")
    slot = MentorSlot(mentor_id=mentor.id, start_at=dt.datetime.utcnow() + dt.timedelta(hours=2), duration_min=15, status="booked")
    db.add(slot); await db.flush()
    b = Booking(slot_id=slot.id, mentor_id=mentor.id, mentee_id=mentee.id, status="requested")
    db.add(b); await db.commit(); await db.refresh(b)
    assert (await as_user(mentor).patch(f"/bookings/{b.id}/meeting-link", json={"url": "https://x.com"})).status_code == 409


# ── Post-session rating ───────────────────────────────────────────────────────
async def test_rate_finished_session_and_mentor_avg(make_user, as_user, db):
    mentor = await _make_mentor(make_user, db, name="M")
    a = await make_user(name="A")
    c = await make_user(name="C")
    # two finished sessions
    b1 = await _confirmed_booking(db, mentor, a, start_at=dt.datetime.utcnow() - dt.timedelta(hours=1))
    b2 = await _confirmed_booking(db, mentor, c, start_at=dt.datetime.utcnow() - dt.timedelta(hours=2))

    assert (await as_user(a).post(f"/bookings/{b1.id}/rating", json={"stars": 5, "note": "Great"})).status_code == 200
    assert (await as_user(c).post(f"/bookings/{b2.id}/rating", json={"stars": 3})).status_code == 200

    # mentor directory avg = (5+3)/2 = 4.0, count 2
    mentors = (await as_user(a).get("/mentors")).json()
    row = next(m for m in mentors if m["id"] == mentor.id)
    assert row["session_rating"] == {"average": 4.0, "count": 2}

    # re-rate updates in place (5 → 4): avg = (4+3)/2 = 3.5
    assert (await as_user(a).post(f"/bookings/{b1.id}/rating", json={"stars": 4})).status_code == 200
    row = next(m for m in (await as_user(a).get("/mentors")).json() if m["id"] == mentor.id)
    assert row["session_rating"]["average"] == 3.5
    # my_rating + can_rate reflect the re-rating (full replace → the omitted note clears)
    mine = (await as_user(a).get("/bookings/me")).json()["as_mentee"][0]
    assert mine["my_rating"] == {"stars": 4, "note": None} and mine["can_rate"] is False


async def test_cancelled_booking_rating_excluded_and_link_hidden(make_user, as_user, db):
    """A rating on a session the mentee later cancels must NOT count toward the
    mentor's public average, and the stale meeting link must not surface."""
    mentor = await _make_mentor(make_user, db, name="M")
    mentee = await make_user(name="Mentee")
    b = await _confirmed_booking(db, mentor, mentee, start_at=dt.datetime.utcnow() - dt.timedelta(hours=1))
    cm = as_user(mentor)
    await cm.patch(f"/bookings/{b.id}/meeting-link", json={"url": "https://meet.google.com/x"})
    await as_user(mentee).post(f"/bookings/{b.id}/rating", json={"stars": 1})

    # counts while confirmed
    row = next(m for m in (await cm.get("/mentors")).json() if m["id"] == mentor.id)
    assert row["session_rating"] == {"average": 1.0, "count": 1}

    # mentee cancels the (rated) booking
    assert (await as_user(mentee).patch(f"/bookings/{b.id}", json={"action": "cancel"})).status_code == 200

    # now excluded from the public average, and the link is hidden on the cancelled row
    row = next(m for m in (await cm.get("/mentors")).json() if m["id"] == mentor.id)
    assert row["session_rating"] == {"average": None, "count": 0}
    mine = (await as_user(mentee).get("/bookings/me")).json()["as_mentee"][0]
    assert mine["status"] == "cancelled" and mine["meeting_link"] is None


async def test_rating_gates(make_user, as_user, db):
    mentor = await _make_mentor(make_user, db, name="M")
    mentee = await make_user(name="Mentee")
    # future (not-yet-happened) confirmed session → 409
    fut = await _confirmed_booking(db, mentor, mentee, start_at=dt.datetime.utcnow() + dt.timedelta(hours=1))
    assert (await as_user(mentee).post(f"/bookings/{fut.id}/rating", json={"stars": 5})).status_code == 409
    # can_rate is False for a not-yet-finished session
    row = (await as_user(mentee).get("/bookings/me")).json()["as_mentee"][0]
    assert row["can_rate"] is False

    past = await _confirmed_booking(db, mentor, mentee, start_at=dt.datetime.utcnow() - dt.timedelta(hours=1))
    # mentor cannot rate → 403
    assert (await as_user(mentor).post(f"/bookings/{past.id}/rating", json={"stars": 5})).status_code == 403
    # out-of-range → 422
    assert (await as_user(mentee).post(f"/bookings/{past.id}/rating", json={"stars": 9})).status_code == 422
    # a finished session IS rateable → can_rate True before rating
    row = next(r for r in (await as_user(mentee).get("/bookings/me")).json()["as_mentee"] if r["id"] == past.id)
    assert row["can_rate"] is True
