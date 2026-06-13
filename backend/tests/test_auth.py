"""Auth-path regressions: banned users must not get fresh tokens."""
import pytest

from app.core.security import create_refresh_token

pytestmark = pytest.mark.asyncio


async def test_banned_user_refresh_rejected(make_user, client):
    """A banned user's refresh token must be refused (401).

    /auth/telegram can't be exercised without valid initData, so we cover the
    other token-issuing path: /auth/refresh filters on banned == False, so a
    structurally valid refresh token for a banned user yields 401.
    """
    user = await make_user(banned=True)
    token = create_refresh_token(user.id)

    res = await client.post("/auth/refresh", json={"refresh_token": token})
    assert res.status_code == 401, res.text


async def test_non_banned_user_refresh_ok(make_user, client):
    """Control: a normal user's refresh token mints new tokens."""
    user = await make_user(banned=False)
    token = create_refresh_token(user.id)

    res = await client.post("/auth/refresh", json={"refresh_token": token})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["access_token"]
    assert body["refresh_token"]
