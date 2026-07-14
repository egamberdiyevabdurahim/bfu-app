"""Marstiff-events core slice: an event's real start time (starts_at, distinct
from the signup deadline) plus a per-registrant partner lead pipeline
(lead_status + score) and a one-tap AI report.

The server is the gate: lead_status is constrained to a fixed set (422 on
anything else), the pipeline fields round-trip through the responses list + CSV,
and the AI-report route is admin-only. The AI service itself is written by a
sibling agent — here it is patched (exactly how conftest patches send_telegram)
so these tests never depend on it.
"""
import pytest
from sqlalchemy import select

from app.models.event import Event
from app.models.event_rsvp import EventRsvp
from app.routers.admin import LEAD_STATUSES

pytestmark = pytest.mark.asyncio


SCHEMA = [
    {"key": "q1", "label": "Ismingiz", "type": "text", "required": True},
    {"key": "q2", "label": "Yoshingiz", "type": "number", "required": False},
]
ANSWERS = {"q1": "Ali, 11-sinf", "q2": "17"}


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


# ── starts_at: create / edit / get round-trip ─────────────────────────────────

async def test_starts_at_round_trips_create_edit_get(db, make_user, as_user):
    admin = await _admin(make_user)
    c = as_user(admin)

    # create carries starts_at (distinct from deadline)
    r = await c.post("/admin/events", json={
        "type": "meetup", "title": "SAT Mock",
        "deadline": "2026-08-01T00:00:00",
        "starts_at": "2026-08-05T10:00:00",
    })
    assert r.status_code == 201, r.text
    eid = r.json()["id"]
    assert r.json()["starts_at"].startswith("2026-08-05T10:00:00")
    assert r.json()["deadline"].startswith("2026-08-01T00:00:00")

    # edit moves the start time
    r = await c.patch(f"/admin/events/{eid}", json={"starts_at": "2026-08-06T14:30:00"})
    assert r.status_code == 200, r.text
    assert r.json()["starts_at"].startswith("2026-08-06T14:30:00")

    # the public detail payload exposes it too
    r = await as_user(admin).get(f"/events/{eid}")
    assert r.status_code == 200, r.text
    assert r.json()["starts_at"].startswith("2026-08-06T14:30:00")

    # and it is actually persisted on the row
    row = (await db.execute(select(Event).where(Event.id == eid))).scalar_one()
    assert row.starts_at is not None and row.starts_at.hour == 14


async def test_starts_at_is_optional(db, make_user, as_user):
    admin = await _admin(make_user)
    r = await as_user(admin).post("/admin/events", json={"type": "grant", "title": "No start"})
    assert r.status_code == 201, r.text
    assert r.json()["starts_at"] is None


# ── lead_status default + the allowed set ─────────────────────────────────────

async def test_lead_status_allowed_set_is_exactly_the_contract():
    assert LEAD_STATUSES == {
        "registered", "showed", "scored", "called", "enrolled", "no_show",
    }


async def test_lead_status_defaults_registered(db, make_user, as_user):
    admin = await _admin(make_user)
    ali = await make_user(name="ali", surname="v")
    e = await _make_event(db, form_schema=SCHEMA)
    await as_user(ali).post(f"/events/{e.id}/rsvp", json={"status": "going", "answers": ANSWERS})

    # on the ORM row
    row = (await db.execute(select(EventRsvp).where(EventRsvp.event_id == e.id))).scalar_one()
    assert row.lead_status == "registered"
    assert row.score is None
    assert row.reminded_1h_at is None

    # and on the admin responses payload
    rows = (await as_user(admin).get(f"/admin/events/{e.id}/responses")).json()
    assert rows[0]["lead_status"] == "registered"
    assert rows[0]["score"] is None


# ── PATCH lead_status / score ─────────────────────────────────────────────────

async def test_patch_each_valid_lead_status(db, make_user, as_user):
    admin = await _admin(make_user)
    ali = await make_user(name="ali", surname="v")
    e = await _make_event(db, form_schema=SCHEMA)
    await as_user(ali).post(f"/events/{e.id}/rsvp", json={"status": "going", "answers": ANSWERS})

    for status_val in sorted(LEAD_STATUSES):
        r = await as_user(admin).patch(
            f"/admin/events/{e.id}/responses/{ali.id}", json={"lead_status": status_val}
        )
        assert r.status_code == 200, r.text
        assert r.json()["lead_status"] == status_val
        await db.refresh(
            (await db.execute(select(EventRsvp).where(EventRsvp.event_id == e.id))).scalar_one()
        )
    row = (await db.execute(select(EventRsvp).where(EventRsvp.event_id == e.id))).scalar_one()
    assert row.lead_status == sorted(LEAD_STATUSES)[-1]


async def test_patch_invalid_lead_status_422_and_writes_nothing(db, make_user, as_user):
    admin = await _admin(make_user)
    ali = await make_user(name="ali", surname="v")
    e = await _make_event(db, form_schema=SCHEMA)
    await as_user(ali).post(f"/events/{e.id}/rsvp", json={"status": "going", "answers": ANSWERS})

    r = await as_user(admin).patch(
        f"/admin/events/{e.id}/responses/{ali.id}", json={"lead_status": "graduated"}
    )
    assert r.status_code == 422, r.text
    row = (await db.execute(select(EventRsvp).where(EventRsvp.event_id == e.id))).scalar_one()
    assert row.lead_status == "registered"       # untouched


async def test_patch_score_sets_and_persists(db, make_user, as_user):
    admin = await _admin(make_user)
    ali = await make_user(name="ali", surname="v")
    e = await _make_event(db, form_schema=SCHEMA)
    await as_user(ali).post(f"/events/{e.id}/rsvp", json={"status": "going", "answers": ANSWERS})

    r = await as_user(admin).patch(
        f"/admin/events/{e.id}/responses/{ali.id}", json={"score": 1520}
    )
    assert r.status_code == 200, r.text
    assert r.json()["score"] == 1520
    assert r.json()["lead_status"] == "registered"     # score-only patch leaves status

    row = (await db.execute(select(EventRsvp).where(EventRsvp.event_id == e.id))).scalar_one()
    assert row.score == 1520

    # both at once
    r = await as_user(admin).patch(
        f"/admin/events/{e.id}/responses/{ali.id}",
        json={"lead_status": "scored", "score": 1490},
    )
    assert r.status_code == 200
    assert r.json()["lead_status"] == "scored" and r.json()["score"] == 1490


async def test_patch_missing_registration_404(db, make_user, as_user):
    admin = await _admin(make_user)
    e = await _make_event(db)
    r = await as_user(admin).patch(
        f"/admin/events/{e.id}/responses/999999", json={"lead_status": "showed"}
    )
    assert r.status_code == 404


# ── responses list + CSV carry the pipeline fields ────────────────────────────

async def test_responses_list_and_csv_include_lead_status_and_score(db, make_user, as_user):
    admin = await _admin(make_user)
    ali = await make_user(name="ali", surname="valiyev", tg_username="ali",
                          phone_number="+998901112233")
    e = await _make_event(db, form_schema=SCHEMA)
    await as_user(ali).post(f"/events/{e.id}/rsvp", json={"status": "going", "answers": ANSWERS})
    await as_user(admin).patch(
        f"/admin/events/{e.id}/responses/{ali.id}",
        json={"lead_status": "enrolled", "score": 1490},
    )

    rows = (await as_user(admin).get(f"/admin/events/{e.id}/responses")).json()
    assert rows[0]["lead_status"] == "enrolled" and rows[0]["score"] == 1490

    r = await as_user(admin).get(f"/admin/events/{e.id}/responses.csv")
    assert r.status_code == 200
    text = r.content.decode("utf-8-sig")
    header, first = text.splitlines()[0], text.splitlines()[1]
    cols = header.split(",")
    assert "lead_status" in cols and "score" in cols
    # legacy first five columns are unchanged (other agents/UI depend on them)
    assert cols[:5] == ["user_id", "name", "username", "phone", "submitted_at"]
    assert "enrolled" in first and "1490" in first


# ── AI report route: admin-gated, delegates to the service ────────────────────

async def test_ai_report_delegates_to_service(db, make_user, as_user, monkeypatch):
    admin = await _admin(make_user)
    e = await _make_event(db, form_schema=SCHEMA)

    async def _fake_report(event_id: int) -> dict:
        return {"summary": f"report for {event_id}", "response_count": 3,
                "generated_at": "2026-07-15T00:00:00"}

    # Patched exactly how conftest patches send_telegram: at the name the router
    # bound, so the real (sibling-agent) service is never called here.
    monkeypatch.setattr("app.routers.admin.generate_event_report", _fake_report, raising=True)

    r = await as_user(admin).get(f"/admin/events/{e.id}/ai-report")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["summary"] == f"report for {e.id}"
    assert body["response_count"] == 3


async def test_ai_report_404_for_unknown_event(db, make_user, as_user, monkeypatch):
    admin = await _admin(make_user)

    async def _fake_report(event_id: int) -> dict:
        return {"summary": "x", "response_count": 0, "generated_at": None}

    monkeypatch.setattr("app.routers.admin.generate_event_report", _fake_report, raising=True)
    r = await as_user(admin).get("/admin/events/999999/ai-report")
    assert r.status_code == 404


# ── non-admin is forbidden everywhere ─────────────────────────────────────────

async def test_non_admin_forbidden(db, make_user, as_user):
    u = await make_user()                       # plain user (role defaults to "user")
    target = await make_user(name="ali", surname="v")
    e = await _make_event(db, form_schema=SCHEMA)
    await as_user(target).post(f"/events/{e.id}/rsvp", json={"status": "going", "answers": ANSWERS})

    assert (await as_user(u).patch(
        f"/admin/events/{e.id}/responses/{target.id}", json={"lead_status": "showed"}
    )).status_code == 403
    assert (await as_user(u).get(f"/admin/events/{e.id}/ai-report")).status_code == 403
