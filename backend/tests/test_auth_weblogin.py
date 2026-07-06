"""Desktop 'log in via the bot' handshake: POST /auth/web-login/start +
GET /auth/web-login/poll. The bot's confirm step is simulated by writing the
WebLoginToken row directly (what bot._handle_web_login does)."""
import datetime as dt

import pytest
from sqlalchemy import select

from app.core.security import decode_token
from app.models.web_login import WebLoginToken

pytestmark = pytest.mark.asyncio


async def _start(client):
    res = await client.post("/auth/web-login/start")
    assert res.status_code == 200, res.text
    return res.json()


async def _confirm(db, nonce, user_id):
    """What the bot does when the user taps Start on the deep link."""
    row = (await db.execute(select(WebLoginToken).where(WebLoginToken.nonce == nonce))).scalar_one()
    row.user_id = user_id
    row.confirmed = True
    await db.commit()


async def test_start_returns_nonce_and_deeplink(client):
    body = await _start(client)
    assert body["nonce"]
    assert body["deep_link"].endswith(f"start=web_{body['nonce']}")
    assert body["deep_link"].startswith("https://t.me/")
    assert body["expires_in"] == 300


async def test_poll_pending_then_confirmed(make_user, db, client):
    user = await make_user(name="Aziza")
    body = await _start(client)
    nonce = body["nonce"]

    # not yet tapped → pending
    r1 = await client.get(f"/auth/web-login/poll?nonce={nonce}")
    assert r1.status_code == 200 and r1.json()["status"] == "pending"

    # bot confirms
    await _confirm(db, nonce, user.id)

    r2 = await client.get(f"/auth/web-login/poll?nonce={nonce}")
    assert r2.status_code == 200
    j = r2.json()
    assert j["status"] == "ok"
    assert decode_token(j["access_token"])["sub"] == str(user.id)


async def test_poll_is_single_use(make_user, db, client):
    user = await make_user(name="Aziza")
    nonce = (await _start(client))["nonce"]
    await _confirm(db, nonce, user.id)
    assert (await client.get(f"/auth/web-login/poll?nonce={nonce}")).status_code == 200
    # second time: row was burned
    assert (await client.get(f"/auth/web-login/poll?nonce={nonce}")).status_code == 404


async def test_poll_unknown_nonce_404(client):
    assert (await client.get("/auth/web-login/poll?nonce=nope")).status_code == 404


async def test_poll_expired_410(db, client):
    nonce = (await _start(client))["nonce"]
    row = (await db.execute(select(WebLoginToken).where(WebLoginToken.nonce == nonce))).scalar_one()
    row.created_at = dt.datetime.utcnow() - dt.timedelta(minutes=10)
    await db.commit()
    assert (await client.get(f"/auth/web-login/poll?nonce={nonce}")).status_code == 410


async def test_poll_confirmed_but_banned_403(make_user, db, client):
    user = await make_user(name="Banned", banned=True)
    nonce = (await _start(client))["nonce"]
    await _confirm(db, nonce, user.id)
    assert (await client.get(f"/auth/web-login/poll?nonce={nonce}")).status_code == 403
