"""Partner self-serve panel (/partner/*).

A PARTNER is a User(role='partner') linked to a Partner org
(Partner.owner_user_id == its id). It is NOT an admin: it gets a SCOPED panel
over ONLY its own events, is HIDDEN from City discovery, and can never touch
another partner's events (cross-partner access is a 404).

The responses/CSV/funnel/lead-score core is shared with the admin panel
(app.services.event_admin), so these tests also lock in that a partner PATCH
advances the pipeline exactly like an admin one.
"""
import pytest

from app.models.event import Event
from app.models.event_rsvp import EventRsvp
from app.models.partner import Partner

pytestmark = pytest.mark.asyncio


SCHEMA = [
    {"key": "q1", "label": "Ismingiz", "type": "text", "required": True},
    {"key": "q2", "label": "Yoshingiz", "type": "number", "required": False},
]
ANSWERS = {"q1": "Ali, 11-sinf", "q2": "17"}


async def _partner(db, make_user, name="Acme"):
    """A partner OWNER user (role='partner') + its linked Partner org."""
    owner = await make_user(name=name, surname="Org", role="partner")
    p = Partner(name=f"{name} Org", owner_user_id=owner.id, verified=True)
    db.add(p)
    await db.commit()
    await db.refresh(p)
    return owner, p


async def _event(db, partner_id, **kw) -> Event:
    defaults = dict(type="meetup", title="Free SAT Mock",
                    is_approved=True, is_deleted=False, partner_id=partner_id,
                    form_schema=SCHEMA)
    defaults.update(kw)
    e = Event(**defaults)
    db.add(e)
    await db.commit()
    await db.refresh(e)
    return e


async def _rsvp(db, event_id, user_id, **kw) -> EventRsvp:
    defaults = dict(event_id=event_id, user_id=user_id, status="going",
                    answers=ANSWERS, lead_status="registered")
    defaults.update(kw)
    r = EventRsvp(**defaults)
    db.add(r)
    await db.commit()
    await db.refresh(r)
    return r


# ── auth gate: a non-partner is 403 everywhere on /partner/* ───────────────────

async def test_plain_user_403_on_partner_routes(db, make_user, as_user):
    u = await make_user()  # role defaults to "user"
    c = as_user(u)
    assert (await c.get("/partner/me")).status_code == 403
    assert (await c.get("/partner/events")).status_code == 403
    assert (await c.post("/partner/events", json={"type": "meetup", "title": "X"})).status_code == 403


async def test_admin_is_not_a_partner_403(db, make_user, as_user):
    """An admin is not a partner — the partner panel is a different role, not a
    privilege level, so an admin gets 403 (it uses /admin/* instead)."""
    admin = await make_user(name="Boss", role="admin")
    assert (await as_user(admin).get("/partner/me")).status_code == 403


async def test_partner_role_without_org_404(db, make_user, as_user):
    """role='partner' but no linked org → 404 (half-provisioned account can't
    reach the panel without a resolvable org to scope routes against)."""
    orphan = await make_user(name="NoOrg", role="partner")
    assert (await as_user(orphan).get("/partner/me")).status_code == 404


# ── /partner/me returns the org ───────────────────────────────────────────────

async def test_partner_me_returns_org(db, make_user, as_user):
    owner, p = await _partner(db, make_user, name="Marstiff")
    r = await as_user(owner).get("/partner/me")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["partner"]["id"] == p.id
    assert body["partner"]["name"] == "Marstiff Org"
    assert body["owner"]["id"] == owner.id


# ── a partner sees ONLY its own events ─────────────────────────────────────────

async def test_partner_sees_only_own_events(db, make_user, as_user):
    owner_a, pa = await _partner(db, make_user, name="Alpha")
    owner_b, pb = await _partner(db, make_user, name="Beta")
    ea = await _event(db, pa.id, title="Alpha Event")
    eb = await _event(db, pb.id, title="Beta Event")

    rows = (await as_user(owner_a).get("/partner/events")).json()
    ids = {row["id"] for row in rows}
    assert ea.id in ids
    assert eb.id not in ids          # Beta's event is invisible to Alpha
    assert all(row["partner_id"] == pa.id for row in rows)


# ── a partner-created event is is_approved=False (moderation) ──────────────────

async def test_partner_created_event_is_unapproved(db, make_user, as_user):
    owner, p = await _partner(db, make_user)
    r = await as_user(owner).post("/partner/events", json={
        "type": "meetup", "title": "Partner Meetup",
        "starts_at": "2026-09-01T10:00:00",
        "form_schema": SCHEMA,
    })
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["is_approved"] is False           # pending admin approval
    assert body["partner_id"] == p.id             # forced to caller's org
    assert body["has_form"] is True

    # persisted the same way
    row = await db.get(Event, body["id"])
    assert row.is_approved is False and row.partner_id == p.id


async def test_partner_create_event_validates_form_schema(db, make_user, as_user):
    owner, p = await _partner(db, make_user)
    r = await as_user(owner).post("/partner/events", json={
        "type": "meetup", "title": "Bad form",
        "form_schema": [{"key": "q1", "label": "x", "type": "choice"}],  # choice needs options
    })
    assert r.status_code == 422, r.text


async def test_partner_cannot_forge_partner_id_on_create(db, make_user, as_user):
    """Even if a client sends a partner_id, it's ignored — the event is stamped
    with the caller's org (the body model has no partner_id field)."""
    owner_a, pa = await _partner(db, make_user, name="Alpha")
    owner_b, pb = await _partner(db, make_user, name="Beta")
    r = await as_user(owner_a).post("/partner/events",
                                    json={"type": "meetup", "title": "X", "partner_id": pb.id})
    assert r.status_code == 201, r.text
    assert r.json()["partner_id"] == pa.id


# ── edit MY event; cannot edit another partner's ──────────────────────────────

async def test_partner_edits_own_event(db, make_user, as_user):
    owner, p = await _partner(db, make_user)
    e = await _event(db, p.id, capacity=None)
    r = await as_user(owner).patch(f"/partner/events/{e.id}",
                                   json={"capacity": 30, "starts_at": "2026-10-01T09:00:00"})
    assert r.status_code == 200, r.text
    assert r.json()["capacity"] == 30
    assert r.json()["starts_at"].startswith("2026-10-01T09:00:00")


async def test_partner_cannot_edit_foreign_event(db, make_user, as_user):
    owner_a, pa = await _partner(db, make_user, name="Alpha")
    owner_b, pb = await _partner(db, make_user, name="Beta")
    eb = await _event(db, pb.id)
    r = await as_user(owner_a).patch(f"/partner/events/{eb.id}", json={"capacity": 5})
    assert r.status_code == 404


# ── responses / funnel / csv are scoped; cross-partner is a 404 ───────────────

async def test_partner_reads_own_responses_and_funnel_and_csv(db, make_user, as_user):
    owner, p = await _partner(db, make_user)
    e = await _event(db, p.id)
    registrant = await make_user(name="ali", surname="v", tg_username="ali",
                                 phone_number="+998901112233")
    await _rsvp(db, e.id, registrant.id)

    rows = (await as_user(owner).get(f"/partner/events/{e.id}/responses")).json()
    assert len(rows) == 1 and rows[0]["user_id"] == registrant.id

    funnel = (await as_user(owner).get(f"/partner/events/{e.id}/funnel")).json()
    assert funnel["going"] == 1 and funnel["registered"] == 1 and funnel["total"] == 1

    csv_r = await as_user(owner).get(f"/partner/events/{e.id}/responses.csv")
    assert csv_r.status_code == 200
    text = csv_r.content.decode("utf-8-sig")
    header = text.splitlines()[0].split(",")
    assert header[:5] == ["user_id", "name", "username", "phone", "submitted_at"]
    assert "lead_status" in header and "score" in header


async def test_partner_cannot_read_foreign_event_responses(db, make_user, as_user):
    owner_a, pa = await _partner(db, make_user, name="Alpha")
    owner_b, pb = await _partner(db, make_user, name="Beta")
    eb = await _event(db, pb.id)
    reg = await make_user(name="beta-reg")
    await _rsvp(db, eb.id, reg.id)

    c = as_user(owner_a)
    assert (await c.get(f"/partner/events/{eb.id}/responses")).status_code == 404
    assert (await c.get(f"/partner/events/{eb.id}/responses.csv")).status_code == 404
    assert (await c.get(f"/partner/events/{eb.id}/funnel")).status_code == 404
    assert (await c.patch(f"/partner/events/{eb.id}/responses/{reg.id}",
                          json={"lead_status": "showed"})).status_code == 404


# ── PATCH lead_status / score on MY registrant ────────────────────────────────

async def test_partner_patches_lead_status_and_score(db, make_user, as_user):
    owner, p = await _partner(db, make_user)
    e = await _event(db, p.id)
    reg = await make_user(name="ali", surname="v")
    await _rsvp(db, e.id, reg.id)

    r = await as_user(owner).patch(
        f"/partner/events/{e.id}/responses/{reg.id}",
        json={"lead_status": "scored", "score": 1490},
    )
    assert r.status_code == 200, r.text
    assert r.json()["lead_status"] == "scored" and r.json()["score"] == 1490

    row = await db.get(EventRsvp, (await _one_rsvp_id(db, e.id)))
    assert row.lead_status == "scored" and row.score == 1490


async def test_partner_patch_invalid_lead_status_422(db, make_user, as_user):
    owner, p = await _partner(db, make_user)
    e = await _event(db, p.id)
    reg = await make_user(name="ali", surname="v")
    await _rsvp(db, e.id, reg.id)
    r = await as_user(owner).patch(
        f"/partner/events/{e.id}/responses/{reg.id}", json={"lead_status": "graduated"}
    )
    assert r.status_code == 422


async def _one_rsvp_id(db, event_id):
    from sqlalchemy import select
    return (await db.execute(
        select(EventRsvp.id).where(EventRsvp.event_id == event_id)
    )).scalar_one()


# ── AI report: scoped, delegates to the shared service ────────────────────────

async def test_partner_ai_report_delegates(db, make_user, as_user, monkeypatch):
    owner, p = await _partner(db, make_user)
    e = await _event(db, p.id)

    async def _fake(event_id: int) -> dict:
        return {"summary": f"report {event_id}", "response_count": 2, "generated_at": None}

    monkeypatch.setattr("app.routers.partner.generate_event_report", _fake, raising=True)
    r = await as_user(owner).get(f"/partner/events/{e.id}/ai-report")
    assert r.status_code == 200, r.text
    assert r.json()["summary"] == f"report {e.id}"


# ── discovery exclusion: a partner org never appears in City / discover ───────

async def test_partner_excluded_from_public_city(db, make_user, client):
    owner, p = await _partner(db, make_user, name="Hidden")
    builder = await make_user(name="Real", surname="Builder")

    r = await client.get("/public/city")
    assert r.status_code == 200, r.text
    body = r.json()
    people_ids = {
        person["id"]
        for cluster in body["regions"]
        for person in cluster["people"]
    }
    face_ids = {
        face["id"]
        for thread in body["threads"]
        for face in thread.get("faces", [])
    }
    assert owner.id not in people_ids
    assert owner.id not in face_ids


async def test_partner_excluded_from_discover(db, make_user, as_user):
    partner_owner, p = await _partner(db, make_user, name="Hidden")
    viewer = await make_user(name="Viewer")
    other = await make_user(name="Visible")

    rows = (await as_user(viewer).get("/users/discover")).json()
    ids = {row["id"] for row in rows}
    assert other.id in ids               # a normal builder still shows
    assert partner_owner.id not in ids   # the partner org does not


# ── admin make-partner flips role + creates the org ───────────────────────────

async def test_admin_make_partner_flips_role_and_creates_org(db, make_user, as_user):
    admin = await make_user(name="Boss", role="admin")
    target = await make_user(name="Uni", surname="Rep")

    r = await as_user(admin).post(f"/admin/users/{target.id}/make-partner",
                                  json={"name": "Best University"})
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["owner_user_id"] == target.id
    assert body["name"] == "Best University"
    assert body["verified"] is True

    await db.refresh(target)
    assert target.role == "partner"

    # the new partner can now reach the scoped panel
    me = await as_user(target).get("/partner/me")
    assert me.status_code == 200
    assert me.json()["partner"]["id"] == body["id"]


async def test_admin_make_partner_is_idempotent(db, make_user, as_user):
    """Re-running make-partner relinks the SAME org (no duplicate)."""
    from sqlalchemy import func, select

    admin = await make_user(name="Boss", role="admin")
    target = await make_user(name="Uni", surname="Rep")

    r1 = await as_user(admin).post(f"/admin/users/{target.id}/make-partner", json={})
    r2 = await as_user(admin).post(f"/admin/users/{target.id}/make-partner", json={})
    assert r1.status_code == 201 and r2.status_code == 201
    assert r1.json()["id"] == r2.json()["id"]

    count = await db.scalar(
        select(func.count(Partner.id)).where(Partner.owner_user_id == target.id)
    )
    assert count == 1


async def test_make_partner_requires_admin(db, make_user, as_user):
    plain = await make_user(name="NotAdmin")
    target = await make_user(name="Target")
    r = await as_user(plain).post(f"/admin/users/{target.id}/make-partner", json={})
    assert r.status_code == 403
