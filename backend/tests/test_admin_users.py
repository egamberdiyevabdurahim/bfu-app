"""Admin user list: lifecycle-status filter + full-detail ("show all fields")."""
import pytest

pytestmark = pytest.mark.asyncio


async def _admin(make_user):
    return await make_user(name="Boss", role="super_admin")


async def test_status_filter_separates_pending_from_registered(make_user, as_user, db):
    admin = await _admin(make_user)
    reg = await make_user(name="Reg", is_registered=True)
    pending = await make_user(name="Pending", is_registered=False)
    deleted = await make_user(name="Gone", is_registered=True, is_deleted=True)
    c = as_user(admin)

    def ids(rows):
        return {r["id"] for r in rows}

    # registered = exactly what Discover shows (registered AND not deleted).
    r = await c.get("/admin/users", params={"status": "registered"})
    assert r.status_code == 200, r.text
    got = ids(r.json())
    assert reg.id in got and pending.id not in got and deleted.id not in got

    # pending = started sign-up, never finished (the "in admin, not in Discover" case).
    r = await c.get("/admin/users", params={"status": "pending"})
    got = ids(r.json())
    assert pending.id in got and reg.id not in got and deleted.id not in got

    # deleted = soft-deleted only.
    r = await c.get("/admin/users", params={"status": "deleted"})
    got = ids(r.json())
    assert deleted.id in got and reg.id not in got

    # no filter = everyone (admin sees all, unfiltered).
    r = await c.get("/admin/users")
    got = ids(r.json())
    assert {reg.id, pending.id, deleted.id} <= got


async def test_admin_user_row_carries_status_flags(make_user, as_user, db):
    admin = await _admin(make_user)
    pending = await make_user(name="Half", is_registered=False)
    c = as_user(admin)
    row = next(u for u in (await c.get("/admin/users")).json() if u["id"] == pending.id)
    # The badge needs these three flags on every row.
    assert row["is_registered"] is False
    assert row["is_deleted"] is False
    assert row["banned"] is False


async def test_user_full_exposes_hidden_fields(make_user, as_user, db):
    admin = await _admin(make_user)
    u = await make_user(name="Deep", phone_number="+998901234567")
    c = as_user(admin)
    r = await c.get(f"/admin/users/{u.id}/full")
    assert r.status_code == 200, r.text
    data = r.json()
    # Fields the list view deliberately omits are present in the full reveal.
    assert data["phone_number"] == "+998901234567"
    assert data["telegram_id"] == u.telegram_id
    assert "is_registered" in data and "created_at" in data


async def test_user_full_404_for_missing(make_user, as_user, db):
    admin = await _admin(make_user)
    c = as_user(admin)
    assert (await c.get("/admin/users/999999/full")).status_code == 404


async def test_admin_user_endpoints_require_admin(make_user, as_user, db):
    plain = await make_user(name="Plain")
    other = await make_user(name="Other")
    c = as_user(plain)
    assert (await c.get("/admin/users")).status_code == 403
    assert (await c.get(f"/admin/users/{other.id}/full")).status_code == 403


async def test_regular_admin_cannot_moderate_super_admin(make_user, as_user, db):
    admin = await make_user(name="Admin", role="admin")
    founder = await make_user(name="Founder", role="super_admin")
    c = as_user(admin)
    # A regular admin must not ban / deny / uncheck the founder.
    assert (await c.delete(f"/admin/users/{founder.id}")).status_code == 403
    assert (await c.post(f"/admin/users/{founder.id}/deny", json={"fields": ["about"]})).status_code == 403
    assert (await c.patch(f"/admin/users/{founder.id}/toggle-check")).status_code == 403


async def test_super_admin_can_moderate_another_super_admin(make_user, as_user, db):
    boss = await make_user(name="Boss", role="super_admin")
    other = await make_user(name="Other", role="super_admin")
    c = as_user(boss)
    assert (await c.patch(f"/admin/users/{other.id}/toggle-check")).status_code == 200


async def test_nudge_register_sends_and_is_admin_gated(make_user, as_user, db):
    admin = await make_user(name="Admin", role="admin")
    pending = await make_user(name="Half", is_registered=False)
    c = as_user(admin)
    r = await c.post(f"/admin/users/{pending.id}/nudge-register")
    assert r.status_code == 200, r.text
    assert r.json()["ok"] is True  # _noop_send returns True

    # 404 for a missing user; 403 for a non-admin caller.
    assert (await c.post("/admin/users/999999/nudge-register")).status_code == 404
    plain = await make_user(name="Plain")
    assert (await as_user(plain).post(f"/admin/users/{pending.id}/nudge-register")).status_code == 403
