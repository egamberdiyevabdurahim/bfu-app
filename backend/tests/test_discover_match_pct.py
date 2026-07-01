"""GET /users/discover?match=true — match_pct is the % of the CALLER's own
tags (skills/knowledges/interests/preparations/goals) that a candidate shares.
"""
import pytest

from app.models.user_analysis import UserAnalysis

pytestmark = pytest.mark.asyncio


async def _analysis(db, user_id, **cats):
    defaults = dict(skills=[], knowledges=[], interests=[], preparations=[], goals=[])
    defaults.update(cats)
    db.add(UserAnalysis(user_id=user_id, **defaults))
    await db.commit()


async def test_match_pct_reflects_tag_overlap(make_user, as_user, db):
    me = await make_user(name="Me")
    await _analysis(db, me.id, skills=["React", "Python"], interests=["Climate", "Hardware"])

    half = await make_user(name="Half")
    await _analysis(db, half.id, skills=["React"], interests=["Climate"])

    full = await make_user(name="Full")
    await _analysis(db, full.id, skills=["React", "Python"], interests=["Climate", "Hardware"])

    none_ = await make_user(name="NoOverlap")
    await _analysis(db, none_.id, skills=["Welding"])

    c = as_user(me)
    res = await c.get("/users/discover?match=true")
    assert res.status_code == 200, res.text
    by_id = {u["id"]: u["match_pct"] for u in res.json()}
    assert by_id[half.id] == 50
    assert by_id[full.id] == 100
    assert by_id[none_.id] == 0


async def test_match_pct_none_when_caller_has_no_tags(make_user, as_user, db):
    me = await make_user(name="Me")
    await _analysis(db, me.id)  # analysis row exists but every category is empty
    other = await make_user(name="Other")
    await _analysis(db, other.id, skills=["React"])

    c = as_user(me)
    res = await c.get("/users/discover?match=true")
    assert res.status_code == 200, res.text
    assert all(u["match_pct"] is None for u in res.json())


async def test_match_pct_absent_outside_match_mode(make_user, as_user, db):
    me = await make_user(name="Me")
    await _analysis(db, me.id, skills=["React"])
    other = await make_user(name="Other")
    await _analysis(db, other.id, skills=["React"])

    c = as_user(me)
    res = await c.get("/users/discover")  # no match=true
    assert res.status_code == 200, res.text
    assert all(u["match_pct"] is None for u in res.json())
