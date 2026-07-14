"""Event enhancements: capacity + waitlist/auto-promotion, admin funnel, the
score-result student DM, and the form "prefill" client hint.

Rules under test (shared contract):
  * capacity round-trips create/edit; null = unlimited.
  * "going" RSVPs beyond capacity are stored "waitlisted" (not going).
  * cancelling a going seat (or an admin marking one no_show) promotes the
    OLDEST waitlisted RSVP to going — exactly one per freed seat.
  * GET /admin/events/{id}/funnel returns the stage-count dict.
  * setting a score DMs the student (best-effort); unchanged score → no DM.
  * a question may carry "prefill" (name|surname|full_name|phone|region|
    birth_year) — accepted in the schema, rejected otherwise, IGNORED by answer
    validation.

The DM path uses push_event; tests patch it at the router binding (exactly how
conftest patches send_telegram) so nothing touches the network.
"""
import pytest
from sqlalchemy import func, select

from app.models.event import Event
from app.models.event_rsvp import EventRsvp
from app.services.event_forms import (
    normalize_schema,
    validate_answers,
    validate_schema,
)

pytestmark = pytest.mark.asyncio


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


async def _going_status(db, event_id, user_id) -> str | None:
    row = (await db.execute(select(EventRsvp).where(
        EventRsvp.event_id == event_id, EventRsvp.user_id == user_id,
    ))).scalar_one_or_none()
    return row.status if row else None


# ── capacity: create / edit / get round-trip ──────────────────────────────────

async def test_capacity_round_trips_create_edit_get(db, make_user, as_user):
    admin = await _admin(make_user)
    c = as_user(admin)

    r = await c.post("/admin/events", json={"type": "meetup", "title": "Cap", "capacity": 2})
    assert r.status_code == 201, r.text
    eid = r.json()["id"]
    assert r.json()["capacity"] == 2

    # public detail exposes capacity + the derived counts
    d = (await c.get(f"/events/{eid}")).json()
    assert d["capacity"] == 2
    assert d["seats_left"] == 2 and d["going_count"] == 0 and d["waitlist_count"] == 0

    # edit moves the cap
    r = await c.patch(f"/admin/events/{eid}", json={"capacity": 5})
    assert r.status_code == 200, r.text
    assert r.json()["capacity"] == 5

    row = (await db.execute(select(Event).where(Event.id == eid))).scalar_one()
    assert row.capacity == 5


async def test_capacity_null_is_unlimited(db, make_user, as_user):
    admin = await _admin(make_user)
    r = await as_user(admin).post("/admin/events", json={"type": "grant", "title": "Open"})
    assert r.status_code == 201, r.text
    eid = r.json()["id"]
    assert r.json()["capacity"] is None
    d = (await as_user(admin).get(f"/events/{eid}")).json()
    assert d["capacity"] is None and d["seats_left"] is None


# ── waitlist on overflow ──────────────────────────────────────────────────────

async def test_going_up_to_capacity_then_next_waitlists(db, make_user, as_user):
    e = await _make_event(db, capacity=2)
    u1, u2, u3 = [await make_user() for _ in range(3)]

    r1 = await as_user(u1).post(f"/events/{e.id}/rsvp", json={"status": "going"})
    assert r1.json()["status"] == "going" and r1.json()["seats_left"] == 1

    r2 = await as_user(u2).post(f"/events/{e.id}/rsvp", json={"status": "going"})
    assert r2.json()["status"] == "going" and r2.json()["seats_left"] == 0

    r3 = await as_user(u3).post(f"/events/{e.id}/rsvp", json={"status": "going"})
    body = r3.json()
    assert body["status"] == "waitlisted" and body["my_rsvp"] == "waitlisted"
    assert body["waitlisted"] is True
    assert body["going_count"] == 2 and body["waitlist_count"] == 1 and body["seats_left"] == 0

    # persisted statuses
    assert await _going_status(db, e.id, u3.id) == "waitlisted"
    going = (await db.execute(select(func.count()).where(
        EventRsvp.event_id == e.id, EventRsvp.status == "going"))).scalar_one()
    assert going == 2


async def test_no_capacity_never_waitlists(db, make_user, as_user):
    e = await _make_event(db)  # capacity None
    for _ in range(5):
        u = await make_user()
        r = await as_user(u).post(f"/events/{e.id}/rsvp", json={"status": "going"})
        assert r.json()["status"] == "going"
    waitl = (await db.execute(select(func.count()).where(
        EventRsvp.event_id == e.id, EventRsvp.status == "waitlisted"))).scalar_one()
    assert waitl == 0


async def test_rersvp_going_is_not_demoted(db, make_user, as_user):
    e = await _make_event(db, capacity=1)
    u = await make_user()
    c = as_user(u)
    assert (await c.post(f"/events/{e.id}/rsvp", json={"status": "going"})).json()["status"] == "going"
    # re-RSVP going while "full" (by their own seat) must stay going, never waitlist
    r = await c.post(f"/events/{e.id}/rsvp", json={"status": "going"})
    assert r.json()["status"] == "going"
    assert await _going_status(db, e.id, u.id) == "going"


async def test_interested_unaffected_by_capacity(db, make_user, as_user):
    e = await _make_event(db, capacity=1)
    u1, u2 = await make_user(), await make_user()
    await as_user(u1).post(f"/events/{e.id}/rsvp", json={"status": "going"})
    r = await as_user(u2).post(f"/events/{e.id}/rsvp", json={"status": "interested"})
    assert r.json()["status"] == "interested"  # not waitlisted
    assert await _going_status(db, e.id, u2.id) == "interested"


# ── auto-promotion when a going seat frees ────────────────────────────────────

async def test_cancel_going_promotes_oldest_waitlisted_only_one(db, make_user, as_user):
    e = await _make_event(db, capacity=1)
    u1, u2, u3 = [await make_user() for _ in range(3)]
    await as_user(u1).post(f"/events/{e.id}/rsvp", json={"status": "going"})        # going
    await as_user(u2).post(f"/events/{e.id}/rsvp", json={"status": "going"})        # waitlisted (older)
    await as_user(u3).post(f"/events/{e.id}/rsvp", json={"status": "going"})        # waitlisted (newer)
    assert await _going_status(db, e.id, u2.id) == "waitlisted"
    assert await _going_status(db, e.id, u3.id) == "waitlisted"

    # u1 cancels → the OLDEST waitlisted (u2) is promoted, u3 stays waitlisted
    await as_user(u1).delete(f"/events/{e.id}/rsvp")

    assert await _going_status(db, e.id, u1.id) is None
    assert await _going_status(db, e.id, u2.id) == "going"
    assert await _going_status(db, e.id, u3.id) == "waitlisted"
    # exactly one going seat filled — never over-promoted past capacity
    going = (await db.execute(select(func.count()).where(
        EventRsvp.event_id == e.id, EventRsvp.status == "going"))).scalar_one()
    assert going == 1


async def test_cancel_with_no_waitlist_is_noop(db, make_user, as_user):
    e = await _make_event(db, capacity=2)
    u1 = await make_user()
    await as_user(u1).post(f"/events/{e.id}/rsvp", json={"status": "going"})
    r = await as_user(u1).delete(f"/events/{e.id}/rsvp")
    assert r.status_code == 200
    assert r.json()["going_count"] == 0 and r.json()["waitlist_count"] == 0


async def test_cancel_of_a_waitlisted_does_not_promote(db, make_user, as_user):
    # A waitlisted person leaving frees no going seat → nobody is promoted.
    e = await _make_event(db, capacity=1)
    u1, u2, u3 = [await make_user() for _ in range(3)]
    await as_user(u1).post(f"/events/{e.id}/rsvp", json={"status": "going"})   # going
    await as_user(u2).post(f"/events/{e.id}/rsvp", json={"status": "going"})   # waitlisted
    await as_user(u3).post(f"/events/{e.id}/rsvp", json={"status": "going"})   # waitlisted
    await as_user(u2).delete(f"/events/{e.id}/rsvp")                            # a waitlisted leaves
    assert await _going_status(db, e.id, u1.id) == "going"
    assert await _going_status(db, e.id, u3.id) == "waitlisted"                 # NOT promoted


async def test_promotion_sends_seat_opened_dm(db, make_user, as_user, monkeypatch):
    import app.routers.events as ev_mod
    calls = []
    monkeypatch.setattr(ev_mod, "push_event",
                        lambda user, ntype, textmap, **kw: calls.append((user.id, ntype, kw)))

    e = await _make_event(db, capacity=1, title="Mock")
    u1, u2 = await make_user(), await make_user()
    await as_user(u1).post(f"/events/{e.id}/rsvp", json={"status": "going"})
    await as_user(u2).post(f"/events/{e.id}/rsvp", json={"status": "going"})  # waitlisted
    await as_user(u1).delete(f"/events/{e.id}/rsvp")                          # frees seat → promote u2

    assert len(calls) == 1
    assert calls[0][0] == u2.id
    assert "Mock" in calls[0][2]["fmt"]["title"]


async def test_admin_no_show_frees_seat_and_promotes(db, make_user, as_user):
    admin = await _admin(make_user)
    e = await _make_event(db, capacity=1)
    u1, u2 = await make_user(), await make_user()
    await as_user(u1).post(f"/events/{e.id}/rsvp", json={"status": "going"})   # going
    await as_user(u2).post(f"/events/{e.id}/rsvp", json={"status": "going"})   # waitlisted

    r = await as_user(admin).patch(
        f"/admin/events/{e.id}/responses/{u1.id}", json={"lead_status": "no_show"})
    assert r.status_code == 200, r.text

    # u1 keeps their (going, no_show) row; their freed seat promoted u2.
    row1 = (await db.execute(select(EventRsvp).where(
        EventRsvp.event_id == e.id, EventRsvp.user_id == u1.id))).scalar_one()
    assert row1.status == "going" and row1.lead_status == "no_show"
    assert await _going_status(db, e.id, u2.id) == "going"


# ── admin funnel ──────────────────────────────────────────────────────────────

SCHEMA = [{"key": "q1", "label": "Ism", "type": "text", "required": True}]
ANSWERS = {"q1": "Ali"}


async def test_funnel_counts(db, make_user, as_user):
    admin = await _admin(make_user)
    e = await _make_event(db, capacity=2, form_schema=SCHEMA)
    u1, u2, u3, u4 = [await make_user() for _ in range(4)]
    await as_user(u1).post(f"/events/{e.id}/rsvp", json={"status": "going", "answers": ANSWERS})
    await as_user(u2).post(f"/events/{e.id}/rsvp", json={"status": "going", "answers": ANSWERS})
    await as_user(u3).post(f"/events/{e.id}/rsvp", json={"status": "going", "answers": ANSWERS})  # waitlisted
    await as_user(u4).post(f"/events/{e.id}/rsvp", json={"status": "interested"})

    await as_user(admin).patch(f"/admin/events/{e.id}/responses/{u1.id}", json={"lead_status": "showed"})
    await as_user(admin).patch(f"/admin/events/{e.id}/responses/{u2.id}", json={"lead_status": "enrolled"})

    f = (await as_user(admin).get(f"/admin/events/{e.id}/funnel")).json()
    assert f["going"] == 2 and f["waitlisted"] == 1 and f["interested"] == 1
    assert f["showed"] == 1 and f["enrolled"] == 1
    assert f["registered"] == 2      # u3 (waitlisted) + u4 (interested) keep the default lead stage
    assert f["scored"] == 0 and f["called"] == 0 and f["no_show"] == 0
    assert f["total"] == 4


async def test_funnel_unknown_event_404(db, make_user, as_user):
    admin = await _admin(make_user)
    assert (await as_user(admin).get("/admin/events/999999/funnel")).status_code == 404


async def test_funnel_forbidden_for_non_admin(db, make_user, as_user):
    u = await make_user()
    e = await _make_event(db)
    assert (await as_user(u).get(f"/admin/events/{e.id}/funnel")).status_code == 403


# ── score → student DM ────────────────────────────────────────────────────────

async def test_score_patch_sends_student_dm(db, make_user, as_user, monkeypatch):
    admin = await _admin(make_user)
    student = await make_user(name="Ali", surname="V", can_message=True, language="uz")
    e = await _make_event(db, title="SAT Mock", form_schema=SCHEMA)
    await as_user(student).post(f"/events/{e.id}/rsvp", json={"status": "going", "answers": ANSWERS})

    calls = []
    monkeypatch.setattr("app.routers.admin.push_event",
                        lambda user, ntype, textmap, **kw: calls.append((user.id, textmap, kw)))

    r = await as_user(admin).patch(f"/admin/events/{e.id}/responses/{student.id}", json={"score": 1500})
    assert r.status_code == 200 and r.json()["score"] == 1500
    assert len(calls) == 1
    assert calls[0][0] == student.id
    assert calls[0][2]["fmt"]["score"] == 1500
    assert "SAT Mock" in calls[0][2]["fmt"]["title"]

    # setting the SAME score again is not a change → no second DM
    r = await as_user(admin).patch(f"/admin/events/{e.id}/responses/{student.id}", json={"score": 1500})
    assert r.status_code == 200
    assert len(calls) == 1

    # changing it fires a fresh DM
    r = await as_user(admin).patch(f"/admin/events/{e.id}/responses/{student.id}", json={"score": 1480})
    assert r.status_code == 200
    assert len(calls) == 2


async def test_lead_status_only_patch_sends_no_score_dm(db, make_user, as_user, monkeypatch):
    admin = await _admin(make_user)
    student = await make_user(can_message=True)
    e = await _make_event(db, form_schema=SCHEMA)
    await as_user(student).post(f"/events/{e.id}/rsvp", json={"status": "going", "answers": ANSWERS})

    calls = []
    monkeypatch.setattr("app.routers.admin.push_event",
                        lambda *a, **k: calls.append(a))
    r = await as_user(admin).patch(
        f"/admin/events/{e.id}/responses/{student.id}", json={"lead_status": "showed"})
    assert r.status_code == 200
    assert calls == []   # no score set → no result DM


# ── form "prefill" client hint ────────────────────────────────────────────────

async def test_prefill_accepted_and_normalized():
    schema = [{"key": "q1", "label": "Ismingiz", "type": "text", "prefill": "full_name"}]
    assert validate_schema(schema) == {}
    norm = normalize_schema(schema)
    assert norm[0]["prefill"] == "full_name"


async def test_prefill_all_valid_values_accepted():
    for field in ("name", "surname", "full_name", "phone", "region", "birth_year"):
        schema = [{"key": "q", "label": "L", "type": "text", "prefill": field}]
        assert validate_schema(schema) == {}, field
        assert normalize_schema(schema)[0]["prefill"] == field


async def test_prefill_invalid_value_rejected():
    schema = [{"key": "q1", "label": "L", "type": "text", "prefill": "nickname"}]
    errors = validate_schema(schema)
    assert "q1" in errors and "prefill" in errors["q1"].lower()


async def test_prefill_absent_is_fine_and_not_normalized():
    schema = [{"key": "q1", "label": "L", "type": "text"}]
    assert validate_schema(schema) == {}
    assert "prefill" not in normalize_schema(schema)[0]


async def test_prefill_ignored_in_answer_validation():
    # prefill only affects the client; it must not touch answer validation.
    schema = [{"key": "q1", "label": "Name", "type": "text", "prefill": "full_name"}]
    assert validate_answers(schema, {"q1": "Ali"}) == {}
    # and it does not silently make the field required/optional differently
    schema_req = [{"key": "q1", "label": "N", "type": "text",
                   "required": True, "prefill": "name"}]
    assert "q1" in validate_answers(schema_req, {})          # still required
    assert validate_answers(schema_req, {"q1": "Ali"}) == {}  # satisfied normally
