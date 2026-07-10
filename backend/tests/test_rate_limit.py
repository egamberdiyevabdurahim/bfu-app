"""Shared per-user write-endpoint rate limiter (app/services/ratelimit.py).

These assert the DB-count-window behaviour and — critically — demonstrate that
NO conftest change is needed: the limiter keeps no in-process state, so the
per-test DB wipe resets every window automatically (contrast the AI/intro/
interest dicts that `_reset_inprocess_throttles` has to clear by hand).
"""
import datetime as dt

import pytest
from fastapi import HTTPException

from app.models.user import Report
from app.services.ratelimit import rate_limit


async def test_reports_hourly_cap_trips_on_31st(make_user, as_user):
    me = await make_user(name="Reporter")
    c = as_user(me)
    # 30 reports / hour allowed; the 31st trips (cap = recent >= limit).
    for i in range(30):
        r = await c.post("/users/reports", json={"target_type": "user", "target_id": 999})
        assert r.status_code == 200, r.text
    r = await c.post("/users/reports", json={"target_type": "user", "target_id": 999})
    assert r.status_code == 429
    assert r.json()["detail"]  # standard {"detail": ...} 429 shape


async def test_report_budget_is_per_user_not_global(make_user, as_user):
    # A second user has their own fresh budget — the limiter keys on reporter_id.
    a = await make_user(name="A")
    b = await make_user(name="B")
    ca = as_user(a)
    for _ in range(30):
        assert (await ca.post("/users/reports", json={"target_type": "user", "target_id": 1})).status_code == 200
    assert (await ca.post("/users/reports", json={"target_type": "user", "target_id": 1})).status_code == 429
    cb = as_user(b)
    assert (await cb.post("/users/reports", json={"target_type": "user", "target_id": 1})).status_code == 200


async def test_project_create_hourly_cap(make_user, as_user):
    me = await make_user(name="Founder")
    c = as_user(me)
    for i in range(5):  # 5 / hour allowed
        r = await c.post("/projects", json={"type": "startup", "name": f"P{i}"})
        assert r.status_code == 201, r.text
    r = await c.post("/projects", json={"type": "startup", "name": "over"})
    assert r.status_code == 429


async def test_rate_limit_helper_threshold_and_window(db, make_user):
    """Direct helper test — proves threshold semantics + that only rows inside the
    rolling window count (covers the daily-cap mechanism without 40+ HTTP calls)."""
    me = await make_user(name="H")
    now = dt.datetime.utcnow()
    for _ in range(3):  # 3 rows inside a 60s window
        db.add(Report(reporter_id=me.id, target_type="user", target_id=1, created_at=now))
    db.add(Report(reporter_id=me.id, target_type="user", target_id=1,  # 1 row well outside 60s
                  created_at=now - dt.timedelta(seconds=120)))
    await db.commit()

    # recent(60s)=3 → limit 3 trips (recent >= limit), limit 4 passes.
    with pytest.raises(HTTPException) as e:
        await rate_limit(db, me.id, "report", 3, 60)
    assert e.value.status_code == 429
    await rate_limit(db, me.id, "report", 4, 60)  # 3 < 4 → no raise

    # A wide window also counts the old row (4 total) → limit 4 now trips.
    with pytest.raises(HTTPException):
        await rate_limit(db, me.id, "report", 4, 300)
