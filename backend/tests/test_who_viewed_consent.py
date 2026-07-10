"""Who-viewed-me consent (incognito): don't record my views + hide my viewers."""
import pytest

pytestmark = pytest.mark.asyncio


async def _viewers_count(as_user, u):
    r = await as_user(u).get("/users/me/profile-viewers")
    assert r.status_code == 200, r.text
    return r.json()["count"]


async def test_visible_viewer_is_recorded(make_user, as_user):
    a = await make_user(name="A")
    b = await make_user(name="B")
    assert (await as_user(a).get(f"/users/{b.id}")).status_code == 200  # A (default consent) views B
    assert await _viewers_count(as_user, b) == 1  # B sees A


async def test_incognito_viewer_not_recorded(make_user, as_user):
    a = await make_user(name="A")
    b = await make_user(name="B")
    assert (await as_user(a).patch("/users/me", json={"who_viewed_consent": False})).status_code == 200
    assert (await as_user(a).get(f"/users/{b.id}")).status_code == 200  # A incognito views B
    assert await _viewers_count(as_user, b) == 0  # B never sees A


async def test_incognito_hides_own_viewers(make_user, as_user):
    a = await make_user(name="A")
    b = await make_user(name="B")
    assert (await as_user(b).get(f"/users/{a.id}")).status_code == 200  # B views A (B visible)
    assert await _viewers_count(as_user, a) == 1  # A sees B
    # A goes incognito → reciprocity hides A's viewer list
    await as_user(a).patch("/users/me", json={"who_viewed_consent": False})
    assert await _viewers_count(as_user, a) == 0
    # back on → sees B again
    await as_user(a).patch("/users/me", json={"who_viewed_consent": True})
    assert await _viewers_count(as_user, a) == 1


async def test_incognito_retroactively_hidden_from_others(make_user, as_user):
    # A views B while visible, THEN goes incognito → A disappears from B's list
    # (retroactive), and reappears when A re-enables consent (reversible).
    a = await make_user(name="A")
    b = await make_user(name="B")
    assert (await as_user(a).get(f"/users/{b.id}")).status_code == 200
    assert await _viewers_count(as_user, b) == 1
    await as_user(a).patch("/users/me", json={"who_viewed_consent": False})
    assert await _viewers_count(as_user, b) == 0  # retroactively hidden
    await as_user(a).patch("/users/me", json={"who_viewed_consent": True})
    assert await _viewers_count(as_user, b) == 1  # reversible


async def test_consent_reflected_in_me_response(make_user, as_user):
    a = await make_user(name="A")
    r = await as_user(a).patch("/users/me", json={"who_viewed_consent": False})
    assert r.status_code == 200 and r.json()["who_viewed_consent"] is False
