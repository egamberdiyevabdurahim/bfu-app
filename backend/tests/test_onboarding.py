"""First-login onboarding: the gate flag on /users/me + the complete endpoint."""
import pytest

pytestmark = pytest.mark.asyncio


async def test_me_exposes_onboarding_completed_default_false(make_user, as_user):
    """A brand-new builder's /users/me carries onboarding_completed=False so the
    desktop /home knows to show the welcome flow."""
    me = await make_user(name="New")
    c = as_user(me)
    res = await c.get("/users/me")
    assert res.status_code == 200, res.text
    body = res.json()
    assert "onboarding_completed" in body
    assert body["onboarding_completed"] is False


async def test_onboarding_complete_flips_true_and_idempotent(make_user, as_user, db):
    """POST /users/me/onboarding-complete sets the flag true and is idempotent —
    a second call returns the same shape and never flips it back."""
    me = await make_user(name="New")
    c = as_user(me)

    r1 = await c.post("/users/me/onboarding-complete")
    assert r1.status_code == 200, r1.text
    assert r1.json() == {"ok": True, "onboarding_completed": True}

    # /users/me now reflects the completed gate.
    res = await c.get("/users/me")
    assert res.json()["onboarding_completed"] is True

    # Idempotent: calling again is a no-op with the same response.
    r2 = await c.post("/users/me/onboarding-complete")
    assert r2.status_code == 200, r2.text
    assert r2.json() == {"ok": True, "onboarding_completed": True}

    # Persisted true in the DB (async-safe reload of the column).
    await db.refresh(me)
    assert me.onboarding_completed is True
