"""Events v2 backend: a free-text location, multi-region (or unlimited)
targeting, and answers that are FINAL once submitted — plus the spreadsheet-safe
phone column in the CSV.

Contract the frontends target:
  * ``location``   — free-text venue; round-trips on create/edit/get.
  * ``region_ids`` — list[int]; null/[] = unlimited (everyone). De-duped, and the
                     legacy single ``region_id`` is kept = region_ids[0].
  * re-submitting a form RSVP once registered → 409 (answers locked); the way to
    change anything is withdraw + register again.
  * CSV phone is wrapped ``="…"`` (Excel-safe) and falls back to a form-captured
    phone when the profile phone is blank.
"""
import csv
import io

import pytest
from sqlalchemy import select

from app.models.event import Event
from app.models.region import Region
from app.services.event_admin import normalize_region_ids

pytestmark = pytest.mark.asyncio


async def _admin(make_user):
    return await make_user(name="Boss", role="admin")


async def _regions(db, n=3):
    rs = []
    for i in range(n):
        r = Region(name_uz=f"R{i}", name_en=f"R{i}", name_ru=f"R{i}")
        db.add(r)
        rs.append(r)
    await db.commit()
    for r in rs:
        await db.refresh(r)
    return rs


# ── normalize_region_ids (the one rulebook) ───────────────────────────────────

async def test_normalize_region_ids_dedupes_and_unlimited():
    assert normalize_region_ids([2, 2, 3]) == [2, 3]          # de-dupe, order kept
    assert normalize_region_ids([2, "3", -1, 0, "x", None]) == [2, 3]  # coerce+drop junk
    assert normalize_region_ids([]) is None                    # empty → unlimited
    assert normalize_region_ids(None) is None                  # null → unlimited
    assert normalize_region_ids("nope") is None                # non-list → unlimited


# ── location + region_ids round-trip ──────────────────────────────────────────

async def test_location_and_region_ids_round_trip(db, make_user, as_user):
    admin = await _admin(make_user)
    r0, r1, r2 = await _regions(db, 3)
    c = as_user(admin)

    r = await c.post("/admin/events", json={
        "type": "meetup", "title": "SAT Mock",
        "location": "  Tashkent, Marstiff HQ  ",
        "region_ids": [r1.id, r1.id, r2.id],   # dupe collapses
    })
    assert r.status_code == 201, r.text
    eid = r.json()["id"]
    assert r.json()["location"] == "Tashkent, Marstiff HQ"         # trimmed
    assert r.json()["region_ids"] == [r1.id, r2.id]
    assert r.json()["region_id"] == r1.id                          # legacy = first

    # public detail exposes them too
    d = await as_user(admin).get(f"/events/{eid}")
    assert d.status_code == 200, d.text
    assert d.json()["location"] == "Tashkent, Marstiff HQ"
    assert d.json()["region_ids"] == [r1.id, r2.id]

    # edit to unlimited (empty list) clears both region fields
    r = await c.patch(f"/admin/events/{eid}", json={"region_ids": []})
    assert r.status_code == 200, r.text
    assert r.json()["region_ids"] is None
    assert r.json()["region_id"] is None

    row = (await db.execute(select(Event).where(Event.id == eid))).scalar_one()
    assert row.region_ids is None and row.region_id is None


async def test_location_optional_defaults_null(db, make_user, as_user):
    admin = await _admin(make_user)
    r = await as_user(admin).post("/admin/events", json={"type": "grant", "title": "No place"})
    assert r.status_code == 201, r.text
    assert r.json()["location"] is None
    assert r.json()["region_ids"] is None


# ── answers final after submit ────────────────────────────────────────────────

SCHEMA = [{"key": "q1", "label": "Ism", "type": "text", "required": True}]


async def _form_event(db, make_user, as_user):
    admin = await _admin(make_user)
    r = await as_user(admin).post("/admin/events", json={
        "type": "meetup", "title": "Free SAT Mock", "form_schema": SCHEMA,
    })
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def test_answers_are_final_after_submit(db, make_user, as_user):
    eid = await _form_event(db, make_user, as_user)
    member = await make_user(name="Ali")
    c = as_user(member)

    # first submit registers
    r = await c.post(f"/events/{eid}/rsvp", json={"status": "going", "answers": {"q1": "Ali"}})
    assert r.status_code == 200, r.text
    assert r.json()["my_rsvp"] == "going"

    # editing the answers is refused
    r = await c.post(f"/events/{eid}/rsvp", json={"status": "going", "answers": {"q1": "CHANGED"}})
    assert r.status_code == 409, r.text

    # the stored answer is untouched
    row = (await db.execute(select(Event).where(Event.id == eid))).scalar_one()  # noqa: F841
    mine = await c.get(f"/events/{eid}/my-response")
    assert mine.json()["answers"] == {"q1": "Ali"}

    # withdraw, then a fresh registration is allowed again
    assert (await c.delete(f"/events/{eid}/rsvp")).status_code == 200
    r = await c.post(f"/events/{eid}/rsvp", json={"status": "going", "answers": {"q1": "Ali v2"}})
    assert r.status_code == 200, r.text
    mine = await c.get(f"/events/{eid}/my-response")
    assert mine.json()["answers"] == {"q1": "Ali v2"}


# ── CSV phone: Excel-safe + form-answer fallback ──────────────────────────────

async def test_csv_phone_is_excel_safe_and_falls_back(db, make_user, as_user):
    admin = await _admin(make_user)
    # a form that also asks for a phone (prefill-tagged)
    schema = [
        {"key": "name", "label": "Ism", "type": "text", "required": True},
        {"key": "tel", "label": "Telefon", "type": "phone", "required": False, "prefill": "phone"},
    ]
    r = await as_user(admin).post("/admin/events", json={
        "type": "meetup", "title": "SAT Mock", "form_schema": schema,
    })
    eid = r.json()["id"]

    # member WITH a profile phone
    with_phone = await make_user(name="Has Phone", phone_number="998901112233")
    await as_user(with_phone).post(f"/events/{eid}/rsvp",
                                   json={"status": "going", "answers": {"name": "A", "tel": "998900000000"}})
    # member WITHOUT a profile phone but who typed one in the form
    no_phone = await make_user(name="No Phone", phone_number=None)
    await as_user(no_phone).post(f"/events/{eid}/rsvp",
                                 json={"status": "going", "answers": {"name": "B", "tel": "998907654321"}})

    resp = await as_user(admin).get(f"/admin/events/{eid}/responses.csv")
    assert resp.status_code == 200, resp.text
    body = resp.content.decode("utf-8").lstrip("﻿")  # drop the Excel BOM
    rows = list(csv.reader(io.StringIO(body)))
    header, data = rows[0], rows[1:]
    phone_col = header.index("phone")
    phones = {r[phone_col] for r in data}
    # After CSV-unescaping, each phone is the Excel text formula ="…" (so Excel
    # never renders it as 9.98E+11 or drops a leading + / 0).
    assert '="998901112233"' in phones   # profile phone wins
    assert '="998907654321"' in phones   # blank profile → form-captured phone
