"""Hotfix regression: POST /users/me/finalize must not 500 on the same
portfolio_links validation mismatch as /discover and /me/connections
(User.portfolio_links is a raw TEXT column; UserResponse expects
list[PortfolioLink]). finalize_registration returned the raw ORM object
directly instead of going through _validate_from_user.
"""
import pytest

pytestmark = pytest.mark.asyncio


async def test_finalize_does_not_500(make_user, as_user, db):
    me = await make_user(name="Me", is_registered=False)
    c = as_user(me)
    res = await c.post("/users/me/finalize")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["portfolio_links"] == []
    assert body["is_registered"] is True


async def test_finalize_with_portfolio_links_set_does_not_500(make_user, as_user, db):
    me = await make_user(
        name="Me", is_registered=False,
        portfolio_links='[{"label": "GitHub", "url": "https://github.com/x"}]',
    )
    c = as_user(me)
    res = await c.post("/users/me/finalize")
    assert res.status_code == 200, res.text
