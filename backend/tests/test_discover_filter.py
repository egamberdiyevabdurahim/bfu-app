"""Characterization tests for GET /users/discover?skill=/knowledge= filtering,
pinning behavior before pushing a coarse pre-filter into SQL. The exact
case-insensitive membership check must stay identical: only rows whose analysis
actually contains the tag come back, case-insensitively, paginated.
"""
import pytest

from app.models.user_analysis import UserAnalysis

pytestmark = pytest.mark.asyncio


async def _analysis(db, user_id, *, skills=None, knowledges=None):
    db.add(UserAnalysis(user_id=user_id, skills=skills or [], knowledges=knowledges or [],
                        interests=[], preparations=[], goals=[]))
    await db.commit()


async def test_skill_filter_case_insensitive_match(make_user, as_user, db):
    me = await make_user(name="Me")
    hit = await make_user(name="Hit")
    miss = await make_user(name="Miss")
    no_analysis = await make_user(name="NoAnalysis")  # excluded (no analysis row)
    await _analysis(db, hit.id, skills=["react", "python"])
    await _analysis(db, miss.id, skills=["welding"])

    c = as_user(me)
    res = await c.get("/users/discover?skill=React")  # query cased differently than stored
    assert res.status_code == 200, res.text
    ids = {u["id"] for u in res.json()}
    assert hit.id in ids
    assert miss.id not in ids
    assert no_analysis.id not in ids


async def test_skill_filter_matches_mixed_case_storage(make_user, as_user, db):
    """Defensive: even if a stored tag isn't lowercase, the case-insensitive
    check must still match (the Python check lowercases both sides)."""
    me = await make_user(name="Me")
    hit = await make_user(name="Hit")
    await _analysis(db, hit.id, skills=["React"])  # stored capitalized

    c = as_user(me)
    res = await c.get("/users/discover?skill=react")
    ids = {u["id"] for u in res.json()}
    assert hit.id in ids


async def test_skill_filter_no_substring_false_positive(make_user, as_user, db):
    """`skill=react` must NOT match a user whose only skill is 'reactjs'."""
    me = await make_user(name="Me")
    other = await make_user(name="Other")
    await _analysis(db, other.id, skills=["reactjs"])

    c = as_user(me)
    res = await c.get("/users/discover?skill=react")
    ids = {u["id"] for u in res.json()}
    assert other.id not in ids


async def test_knowledge_filter(make_user, as_user, db):
    me = await make_user(name="Me")
    hit = await make_user(name="Hit")
    await _analysis(db, hit.id, knowledges=["calculus"])

    c = as_user(me)
    res = await c.get("/users/discover?knowledge=Calculus")
    ids = {u["id"] for u in res.json()}
    assert hit.id in ids


async def test_skill_filter_pagination(make_user, as_user, db):
    me = await make_user(name="Me")
    hits = []
    for i in range(5):
        u = await make_user(name=f"H{i}")
        await _analysis(db, u.id, skills=["react"])
        hits.append(u.id)

    c = as_user(me)
    page1 = (await c.get("/users/discover?skill=react&limit=2&offset=0")).json()
    page2 = (await c.get("/users/discover?skill=react&limit=2&offset=2")).json()
    assert len(page1) == 2
    assert len(page2) == 2
    # No overlap between pages.
    assert not ({u["id"] for u in page1} & {u["id"] for u in page2})
