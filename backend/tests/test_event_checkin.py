"""QR check-in: per-registrant ticket code + idempotent, scoped, wrong-event-safe
door check-in that marks a registrant SHOWED.

Marstiff scans this at a real door, so the guarantees are pinned: a code is stable
per registrant, a second scan never double-counts, a code from another event can't
check someone into the wrong door, and an unknown code is a clean 404.
"""
import pytest
from sqlalchemy import select

from app.models.event import Event
from app.models.event_rsvp import EventRsvp

pytestmark = pytest.mark.asyncio


async def _admin(make_user):
    return await make_user(name="Boss", role="admin")


async def _make_event(db, **overrides) -> Event:
    defaults = dict(type="meetup", title="Free SAT Mock Test",
                    is_approved=True, is_deleted=False)
    defaults.update(overrides)
    e = Event(**defaults)
    db.add(e)
    await db.commit()
    await db.refresh(e)
    return e


async def _going(db, event_id, user_id):
    db.add(EventRsvp(event_id=event_id, user_id=user_id, status="going"))
    await db.commit()


# ── the attendee's ticket ─────────────────────────────────────────────────────

async def test_my_ticket_generates_stable_code(db, make_user, as_user):
    member = await make_user(name="Ali")
    e = await _make_event(db)
    await _going(db, e.id, member.id)

    r = await as_user(member).get(f"/events/{e.id}/my-ticket")
    assert r.status_code == 200, r.text
    body = r.json()
    code = body["code"]
    assert len(code) == 6
    assert body["qr"] == f"{e.id}.{code}"
    assert body["checked_in"] is False
    # Stable across requests (generated once, then reused).
    r2 = await as_user(member).get(f"/events/{e.id}/my-ticket")
    assert r2.json()["code"] == code


async def test_my_ticket_404_when_not_registered(db, make_user, as_user):
    member = await make_user()
    e = await _make_event(db)
    r = await as_user(member).get(f"/events/{e.id}/my-ticket")
    assert r.status_code == 404, r.text


# ── the door check-in ─────────────────────────────────────────────────────────

async def test_checkin_marks_showed_and_is_idempotent(db, make_user, as_user):
    admin = await _admin(make_user)
    member = await make_user(name="Ali Valiyev")
    e = await _make_event(db)
    await _going(db, e.id, member.id)
    code = (await as_user(member).get(f"/events/{e.id}/my-ticket")).json()["code"]

    # First scan (via the full QR payload) → checked in, marked showed.
    r = await as_user(admin).post(f"/admin/events/{e.id}/checkin", json={"code": f"{e.id}.{code}"})
    assert r.status_code == 200, r.text
    assert r.json()["already_checked_in"] is False
    assert "Ali" in r.json()["name"]  # display_name (name + surname initial)

    row = (await db.execute(select(EventRsvp).where(EventRsvp.event_id == e.id))).scalar_one()
    assert row.lead_status == "showed"
    assert row.checked_in_at is not None

    # Second scan (bare code this time) → idempotent, reports already checked in.
    r2 = await as_user(admin).post(f"/admin/events/{e.id}/checkin", json={"code": code})
    assert r2.status_code == 200, r2.text
    assert r2.json()["already_checked_in"] is True


async def test_checkin_wrong_event_is_409(db, make_user, as_user):
    admin = await _admin(make_user)
    member = await make_user(name="Ali")
    e1 = await _make_event(db, title="Event 1")
    e2 = await _make_event(db, title="Event 2")
    await _going(db, e1.id, member.id)
    code = (await as_user(member).get(f"/events/{e1.id}/my-ticket")).json()["code"]

    # Scanning e1's ticket at e2's door → rejected (wrong event).
    r = await as_user(admin).post(f"/admin/events/{e2.id}/checkin", json={"code": f"{e1.id}.{code}"})
    assert r.status_code == 409, r.text


async def test_checkin_unknown_code_is_404(db, make_user, as_user):
    admin = await _admin(make_user)
    e = await _make_event(db)
    r = await as_user(admin).post(f"/admin/events/{e.id}/checkin", json={"code": "ZZZZ99"})
    assert r.status_code == 404, r.text


async def test_checkin_roster_lists_going_with_codes(db, make_user, as_user):
    admin = await _admin(make_user)
    m1 = await make_user(name="Ali")
    m2 = await make_user(name="Vali")
    e = await _make_event(db)
    await _going(db, e.id, m1.id)
    await _going(db, e.id, m2.id)

    r = await as_user(admin).get(f"/admin/events/{e.id}/checkin-roster")
    assert r.status_code == 200, r.text
    roster = r.json()
    assert len(roster) == 2
    assert all(x.get("code") and "name" in x and "checked_in" in x for x in roster)
    # Codes are unique within the event.
    codes = [x["code"] for x in roster]
    assert len(set(codes)) == 2
