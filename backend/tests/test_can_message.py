"""Telegram reachability (`can_message`): capture write-access, self-heal from
send outcomes, and the bulk pending-reminder. Story-link users open the Mini App
without starting the bot, so the bot can only DM them once they grant write
access — these paths keep the flag honest so admin nudges target the reachable."""
import pytest

pytestmark = pytest.mark.asyncio


async def _row(client_admin, user_id):
    rows = (await client_admin.get("/admin/users")).json()
    return next(u for u in rows if u["id"] == user_id)


async def test_allow_messages_upgrades_flag(make_user, as_user):
    """The Mini App calls this right after the user grants write access."""
    u = await make_user(name="Grantor", can_message=False)
    r = await as_user(u).post("/users/me/allow-messages")
    assert r.status_code == 200, r.text
    assert r.json() == {"ok": True, "can_message": True}


async def test_allow_messages_persists_visible_to_admin(make_user, as_user):
    admin = await make_user(name="Admin", role="admin")
    u = await make_user(name="Grantor", can_message=False)
    assert (await _row(as_user(admin), u.id))["can_message"] is False
    await as_user(u).post("/users/me/allow-messages")
    assert (await _row(as_user(admin), u.id))["can_message"] is True


async def test_nudge_marks_reachable_on_success(make_user, as_user):
    """A delivered nudge (mocked ok) proves the bot can DM them → flag flips True."""
    admin = await make_user(name="Admin", role="admin")
    pending = await make_user(name="Half", is_registered=False, can_message=False)
    r = await as_user(admin).post(f"/admin/users/{pending.id}/nudge-register")
    assert r.status_code == 200, r.text
    assert r.json()["ok"] is True
    assert r.json()["can_message"] is True
    assert (await _row(as_user(admin), pending.id))["can_message"] is True


async def test_nudge_all_pending_targets_only_reachable(make_user, as_user):
    """Bulk reminder DMs only can_message=True pending users and reports how many
    were skipped as unreachable."""
    admin = await make_user(name="Admin", role="admin")
    reachable = await make_user(name="Reachable", is_registered=False, can_message=True)
    unreachable = await make_user(name="Gone", is_registered=False, can_message=False)
    registered = await make_user(name="Done", is_registered=True, can_message=True)  # excluded

    r = await as_user(admin).post("/admin/users/nudge-all-pending")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["pending"] == 2                 # both unregistered, registered one excluded
    assert body["sent"] == 1                    # only the reachable one
    assert body["unreachable_skipped"] == 1     # the never-started one
    assert body["failed"] == 0

    # The registered user was never in scope.
    assert (await _row(as_user(admin), registered.id))["is_registered"] is True


async def test_nudge_all_pending_is_admin_gated(make_user, as_user):
    plain = await make_user(name="Plain")
    assert (await as_user(plain).post("/admin/users/nudge-all-pending")).status_code == 403


async def test_auth_captures_allows_write_to_pm(make_user, as_user, client, monkeypatch):
    """A returning login whose initData carries allows_write_to_pm=true upgrades
    can_message. Missing field must NOT downgrade an already-True flag."""
    u = await make_user(name="Returner", can_message=False)
    admin = await make_user(name="Admin", role="admin")

    monkeypatch.setattr("app.routers.auth.validate_init_data", lambda s: {"ok": True})
    monkeypatch.setattr(
        "app.routers.auth.parse_tg_user",
        lambda params: {"id": u.telegram_id, "first_name": "Returner",
                        "allows_write_to_pm": True},
    )
    res = await client.post("/auth/telegram", json={"init_data": "x"})
    assert res.status_code == 200, res.text
    assert (await _row(as_user(admin), u.id))["can_message"] is True

    # A later login WITHOUT the field must leave the True flag intact (upgrade-only).
    monkeypatch.setattr(
        "app.routers.auth.parse_tg_user",
        lambda params: {"id": u.telegram_id, "first_name": "Returner"},
    )
    res = await client.post("/auth/telegram", json={"init_data": "x"})
    assert res.status_code == 200, res.text
    assert (await _row(as_user(admin), u.id))["can_message"] is True
