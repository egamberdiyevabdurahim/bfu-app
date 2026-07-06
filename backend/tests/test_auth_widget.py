"""POST /auth/telegram-widget — desktop web login via the Telegram Login Widget."""
import hashlib
import hmac
import time

import pytest

from app.config import settings
from app.core.security import decode_token

pytestmark = pytest.mark.asyncio


def _sign(fields: dict) -> str:
    """Compute the Login-Widget hash exactly as Telegram does, using the test
    BOT_TOKEN, so we can forge a *valid* widget payload."""
    data = {k: v for k, v in fields.items() if k != "hash" and v is not None}
    dcs = "\n".join(f"{k}={data[k]}" for k in sorted(data))
    secret = hashlib.sha256(settings.BOT_TOKEN.encode()).digest()
    return hmac.new(secret, dcs.encode(), hashlib.sha256).hexdigest()


def _payload(tg_id: int, auth_date: int | None = None, **extra) -> dict:
    body = {"id": tg_id, "first_name": "Aziza", "username": "aziza",
            "auth_date": auth_date or int(time.time())}
    body.update(extra)
    body["hash"] = _sign(body)
    return body


async def test_widget_login_valid_registered_user(make_user, db, client):
    user = await make_user(name="Aziza")
    res = await client.post("/auth/telegram-widget", json=_payload(user.telegram_id))
    assert res.status_code == 200, res.text
    tok = res.json()["access_token"]
    assert decode_token(tok)["sub"] == str(user.id)   # token is for THIS user


async def test_widget_login_bad_hash_rejected(make_user, db, client):
    user = await make_user(name="Aziza")
    body = _payload(user.telegram_id)
    body["hash"] = "deadbeef" * 8                      # tamper
    res = await client.post("/auth/telegram-widget", json=body)
    assert res.status_code == 401


async def test_widget_login_tampered_field_rejected(make_user, db, client):
    """A valid hash for the original data must not validate once a field is
    changed (e.g. an attacker swaps the id to impersonate someone)."""
    victim = await make_user(name="Victim")
    body = _payload(victim.telegram_id)
    body["id"] = victim.telegram_id + 1                # change id, keep old hash
    res = await client.post("/auth/telegram-widget", json=body)
    assert res.status_code in (401, 404)               # hash no longer matches


async def test_widget_login_stale_rejected(make_user, db, client):
    user = await make_user(name="Aziza")
    old = int(time.time()) - 90_000                    # > 24h
    res = await client.post("/auth/telegram-widget", json=_payload(user.telegram_id, auth_date=old))
    assert res.status_code == 401


async def test_widget_login_unknown_user_404(db, client):
    res = await client.post("/auth/telegram-widget", json=_payload(987654321))
    assert res.status_code == 404


async def test_widget_login_unregistered_user_404(make_user, db, client):
    pending = await make_user(name="Pending", is_registered=False)
    res = await client.post("/auth/telegram-widget", json=_payload(pending.telegram_id))
    assert res.status_code == 404


async def test_widget_login_banned_403(make_user, db, client):
    banned = await make_user(name="Banned", banned=True)
    res = await client.post("/auth/telegram-widget", json=_payload(banned.telegram_id))
    assert res.status_code == 403
