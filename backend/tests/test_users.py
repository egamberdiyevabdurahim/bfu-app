"""User-endpoint regressions: mass-assignment guard + mutual interest."""
import pytest

pytestmark = pytest.mark.asyncio


async def test_patch_me_mass_assignment_guard(make_user, as_user, db):
    """PATCH /users/me must ignore tg_username and is_registered (excluded from
    UserUpdate) — only the whitelisted fields may change."""
    from app.models.user import User

    user = await make_user(
        name="Original",
        tg_username="real_handle",
        is_registered=False,
    )
    c = as_user(user)

    res = await c.patch(
        "/users/me",
        json={"name": "X", "tg_username": "hacker", "is_registered": True},
    )
    assert res.status_code == 200, res.text
    body = res.json()

    # Whitelisted field changed.
    assert body["name"] == "X"
    # Protected fields untouched in the response.
    assert body["tg_username"] == "real_handle"
    assert body["is_registered"] is False

    # ...and untouched in the DB.
    fresh = await db.get(User, user.id)
    await db.refresh(fresh)
    assert fresh.tg_username == "real_handle"
    assert fresh.is_registered is False


async def test_mutual_interest(make_user, as_user):
    """B→A interest is not mutual; A→B interest then reports mutual=True."""
    a = await make_user(name="Alice")
    b = await make_user(name="Bob")

    # B expresses interest in A first → not mutual yet.
    cb = as_user(b)
    res = await cb.post(f"/users/{a.id}/interest")
    assert res.status_code == 200, res.text
    assert res.json()["mutual"] is False

    # A now expresses interest in B → reciprocated.
    ca = as_user(a)
    res = await ca.post(f"/users/{b.id}/interest")
    assert res.status_code == 200, res.text
    assert res.json()["mutual"] is True
