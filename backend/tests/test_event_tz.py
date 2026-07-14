"""Timezone-safety for the admin-event write path.

The desktop panel serializes datetimes with ``Date.prototype.toISOString()``,
which emits a ``Z``-suffixed (tz-AWARE) string. Pydantic parses that to an aware
``datetime``. Event.deadline / Event.starts_at are NAIVE "timestamp without time
zone" columns, so on Postgres/asyncpg assigning an aware value raises a
``DataError`` → HTTP 500. (The in-memory SQLite used by the suite is lenient and
would hide the crash, which is exactly why this regression went unnoticed.)

``_to_naive_utc`` converts an aware value to UTC and strips the tzinfo, keeping
the SAME wall-clock instant, and passes naive values through untouched. These
tests assert:

  * POST /admin/events with a Z-suffixed deadline + starts_at → 201, and the
    stored value is naive-UTC (round-trips at the same UTC wall-clock).
  * A ``+05:00`` offset is CONVERTED (Tashkent 10:00 → stored 05:00 UTC), proving
    we normalize the instant rather than blindly dropping the offset.
  * PATCH with an aware value is accepted the same way.
  * A naive input is stored verbatim (no accidental shift).
"""
import pytest
from sqlalchemy import select

from app.models.event import Event
from app.routers.admin import _to_naive_utc

pytestmark = pytest.mark.asyncio


async def _admin(make_user):
    return await make_user(name="Boss", role="admin")


# ── the shared helper in isolation ────────────────────────────────────────────

async def test_to_naive_utc_converts_and_passes_through():
    from datetime import datetime, timezone, timedelta

    # tz-aware UTC (the "Z" case) → naive, same wall-clock
    aware_z = datetime(2026, 8, 5, 10, 0, tzinfo=timezone.utc)
    out = _to_naive_utc(aware_z)
    assert out.tzinfo is None
    assert out == datetime(2026, 8, 5, 10, 0)

    # tz-aware +05:00 (Tashkent) → converted back to UTC (05:00), then naive
    aware_tashkent = datetime(2026, 8, 5, 10, 0, tzinfo=timezone(timedelta(hours=5)))
    out = _to_naive_utc(aware_tashkent)
    assert out.tzinfo is None
    assert out == datetime(2026, 8, 5, 5, 0)

    # naive → unchanged (already treated as naive-UTC)
    naive = datetime(2026, 8, 5, 10, 0)
    assert _to_naive_utc(naive) == naive
    assert _to_naive_utc(naive).tzinfo is None

    # None → None
    assert _to_naive_utc(None) is None


# ── POST /admin/events with a Z-suffixed (aware) payload ──────────────────────

async def test_create_event_accepts_z_suffixed_datetimes(db, make_user, as_user):
    """This is the exact payload the desktop sends. Must be 201 (would 500 on
    Postgres without the fix) and store a NAIVE value at the same UTC instant."""
    admin = await _admin(make_user)
    r = await as_user(admin).post("/admin/events", json={
        "type": "meetup", "title": "SAT Mock",
        "deadline": "2026-08-01T00:00:00Z",
        "starts_at": "2026-08-05T10:00:00Z",
    })
    assert r.status_code == 201, r.text
    eid = r.json()["id"]
    # Serialized back with no offset (naive), same wall-clock as the UTC input.
    assert r.json()["starts_at"].startswith("2026-08-05T10:00:00")
    assert r.json()["deadline"].startswith("2026-08-01T00:00:00")

    # The stored column is genuinely naive (tz-aware would be the latent 500).
    row = (await db.execute(select(Event).where(Event.id == eid))).scalar_one()
    assert row.starts_at.tzinfo is None
    assert row.deadline.tzinfo is None
    assert (row.starts_at.year, row.starts_at.month, row.starts_at.day,
            row.starts_at.hour) == (2026, 8, 5, 10)


async def test_create_event_converts_offset_to_utc(db, make_user, as_user):
    """A +05:00 (Tashkent) start of 10:00 is the SAME instant as 05:00 UTC, and
    must be stored as 05:00 naive — i.e. we convert, not merely drop the offset."""
    admin = await _admin(make_user)
    r = await as_user(admin).post("/admin/events", json={
        "type": "meetup", "title": "Tashkent morning",
        "starts_at": "2026-08-05T10:00:00+05:00",
    })
    assert r.status_code == 201, r.text
    eid = r.json()["id"]
    assert r.json()["starts_at"].startswith("2026-08-05T05:00:00")

    row = (await db.execute(select(Event).where(Event.id == eid))).scalar_one()
    assert row.starts_at.tzinfo is None
    assert row.starts_at.hour == 5


async def test_create_event_naive_input_is_unchanged(db, make_user, as_user):
    """A naive payload (older clients / tests) must not be shifted."""
    admin = await _admin(make_user)
    r = await as_user(admin).post("/admin/events", json={
        "type": "meetup", "title": "Naive",
        "starts_at": "2026-08-05T10:00:00",
    })
    assert r.status_code == 201, r.text
    assert r.json()["starts_at"].startswith("2026-08-05T10:00:00")
    row = (await db.execute(select(Event).where(Event.id == r.json()["id"]))).scalar_one()
    assert row.starts_at.hour == 10 and row.starts_at.tzinfo is None


# ── PATCH /admin/events/{id} with an aware value ──────────────────────────────

async def test_patch_event_accepts_aware_datetime(db, make_user, as_user):
    admin = await _admin(make_user)
    # Seed via the API (not the `db` session) so `db`'s identity map doesn't cache
    # a pre-patch copy and shadow the handler's committed write on the re-select.
    eid = (await as_user(admin).post("/admin/events", json={
        "type": "meetup", "title": "Movable", "starts_at": "2026-08-05T09:00:00",
    })).json()["id"]

    r = await as_user(admin).patch(
        f"/admin/events/{eid}", json={"starts_at": "2026-08-06T14:30:00Z"}
    )
    assert r.status_code == 200, r.text
    assert r.json()["starts_at"].startswith("2026-08-06T14:30:00")

    row = (await db.execute(select(Event).where(Event.id == eid))).scalar_one()
    assert row.starts_at.tzinfo is None
    assert row.starts_at.hour == 14 and row.starts_at.minute == 30


async def test_patch_event_offset_converted_to_utc(db, make_user, as_user):
    admin = await _admin(make_user)
    eid = (await as_user(admin).post("/admin/events", json={
        "type": "meetup", "title": "Offset patch",
    })).json()["id"]

    # 09:00+05:00 == 04:00 UTC
    r = await as_user(admin).patch(
        f"/admin/events/{eid}", json={"deadline": "2026-08-06T09:00:00+05:00"}
    )
    assert r.status_code == 200, r.text
    assert r.json()["deadline"].startswith("2026-08-06T04:00:00")
    row = (await db.execute(select(Event).where(Event.id == eid))).scalar_one()
    assert row.deadline.tzinfo is None and row.deadline.hour == 4
