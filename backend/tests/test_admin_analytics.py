"""Batch E admin analytics: cohort retention, region heatmap, skill gap."""
import datetime as dt

import pytest

pytestmark = pytest.mark.asyncio


async def _admin(make_user):
    return await make_user(name="Boss", role="super_admin")


# ── Retention ────────────────────────────────────────────────────────────────

async def test_retention_requires_admin(make_user, as_user, db):
    plain = await make_user(name="Plain")
    c = as_user(plain)
    assert (await c.get("/admin/analytics/retention")).status_code == 403


async def test_retention_buckets_and_active(make_user, as_user, db):
    admin = await _admin(make_user)
    now = dt.datetime.utcnow()
    this_month = now.replace(day=1, hour=12, minute=0, second=0, microsecond=0)
    # last calendar month (subtract ~32 days from the 1st, then snap to its 1st)
    prev_month = (this_month - dt.timedelta(days=5)).replace(day=1, hour=12)

    # This month: 2 users, 1 active (recent last_seen), 1 inactive (null).
    u1 = await make_user(name="U1")
    u1.created_at = this_month; u1.last_seen_at = now - dt.timedelta(days=2)
    u2 = await make_user(name="U2")
    u2.created_at = this_month; u2.last_seen_at = None
    # Prev month: 2 users, 1 active (recent), 1 stale (>30d).
    u3 = await make_user(name="U3")
    u3.created_at = prev_month; u3.last_seen_at = now - dt.timedelta(days=10)
    u4 = await make_user(name="U4")
    u4.created_at = prev_month; u4.last_seen_at = now - dt.timedelta(days=120)
    await db.commit()

    c = as_user(admin)
    res = await c.get("/admin/analytics/retention", params={"active_days": 30})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["active_days"] == 30
    cohorts = {row["month"]: row for row in body["cohorts"]}
    tm = this_month.strftime("%Y-%m")
    pm = prev_month.strftime("%Y-%m")
    # The admin themself was created "now" too — count them into this month.
    assert cohorts[tm]["total"] >= 2 and cohorts[tm]["active"] >= 1
    assert cohorts[pm]["total"] == 2 and cohorts[pm]["active"] == 1
    assert cohorts[pm]["retention_pct"] == 50
    # Newest-first ordering.
    assert body["cohorts"][0]["month"] >= body["cohorts"][-1]["month"] or \
        body["cohorts"][-1]["month"] == "older"


async def test_retention_active_days_clamped(make_user, as_user, db):
    admin = await _admin(make_user)
    c = as_user(admin)
    assert (await c.get("/admin/analytics/retention",
                        params={"active_days": 9999})).json()["active_days"] == 365
    assert (await c.get("/admin/analytics/retention",
                        params={"active_days": 0})).json()["active_days"] == 1
