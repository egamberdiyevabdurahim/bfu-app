"""GET /public/og/{user_id}.png — signed, enumeration-resistant OG image."""
import pytest

from app.services.signing import og_sig

pytestmark = pytest.mark.asyncio


async def test_og_image_requires_valid_signature(make_user, client):
    user = await make_user(name="Aziz")
    res = await client.get(f"/public/og/{user.id}.png", params={"sig": "bad"})
    assert res.status_code == 403


async def test_og_image_returns_png_for_valid_signature(make_user, client):
    user = await make_user(name="Aziz")
    res = await client.get(f"/public/og/{user.id}.png", params={"sig": og_sig(user.id)})
    assert res.status_code == 200, res.text
    assert res.headers["content-type"] == "image/png"
    assert res.content[:8] == b"\x89PNG\r\n\x1a\n"


async def test_og_image_404_for_missing_user(client):
    res = await client.get("/public/og/999999.png", params={"sig": og_sig(999999)})
    assert res.status_code == 404
