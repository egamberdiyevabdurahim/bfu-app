"""Hotfix regression: /discover and /me/connections must not 500 when a user's
raw `portfolio_links` TEXT column doesn't match the `list[PortfolioLink]`
response schema. (`User.portfolio_links` is a real ORM column with a different
shape than the schema field of the same name — see `_PROFILE_EXTRAS_FIELDS` /
`_validate_from_user` in app/routers/users.py.)
"""
import pytest

from app.models.user import Interest

pytestmark = pytest.mark.asyncio


async def test_discover_does_not_500_on_users_with_no_portfolio(make_user, as_user, db):
    me = await make_user(name="Me")
    await make_user(name="Other1")
    await make_user(name="Other2")

    c = as_user(me)
    res = await c.get("/users/discover")
    assert res.status_code == 200, res.text
    body = res.json()
    assert isinstance(body, list)
    assert len(body) == 2
    for u in body:
        assert u["portfolio_links"] == []


async def test_discover_with_portfolio_links_set_does_not_500(make_user, as_user, db):
    me = await make_user(name="Me")
    await make_user(name="HasLinks", portfolio_links='[{"label": "GitHub", "url": "https://github.com/x"}]')

    c = as_user(me)
    res = await c.get("/users/discover")
    assert res.status_code == 200, res.text


async def test_me_connections_does_not_500(make_user, as_user, db):
    me = await make_user(name="Me")
    other = await make_user(name="Mutual")
    db.add(Interest(from_user_id=me.id, to_user_id=other.id))
    db.add(Interest(from_user_id=other.id, to_user_id=me.id))
    await db.commit()

    c = as_user(me)
    res = await c.get("/users/me/connections")
    assert res.status_code == 200, res.text
    body = res.json()
    assert len(body) == 1
    assert body[0]["portfolio_links"] == []
