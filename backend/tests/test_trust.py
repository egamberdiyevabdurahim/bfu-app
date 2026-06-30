"""Batch B trust layer: endorsements, vouches, ratings, mutual connections."""
import pytest

pytestmark = pytest.mark.asyncio


async def _mk_project(db, creator_id, name, *, is_active=True, is_draft=False, is_deleted=False):
    from app.models.project import Project
    p = Project(type="startup", creator_id=creator_id, name=name, is_active=is_active,
                is_draft=is_draft, is_deleted=is_deleted, is_approved=True)
    db.add(p)
    await db.commit()
    await db.refresh(p)
    return p


async def _set_skills(db, user_id, skills):
    from app.models.user_analysis import UserAnalysis
    db.add(UserAnalysis(user_id=user_id, skills=skills, knowledges=[],
                        interests=[], preparations=[], goals=[]))
    await db.commit()


async def test_trust_extras_endorsements_and_viewer_flag(make_user, db):
    from app.routers.users import _trust_extras
    from app.models.trust import Endorsement

    target = await make_user(name="Target")
    e1 = await make_user(name="E1")
    e2 = await make_user(name="E2")
    await _set_skills(db, target.id, ["React", "Python"])
    db.add(Endorsement(endorser_id=e1.id, target_id=target.id, skill="React"))
    db.add(Endorsement(endorser_id=e2.id, target_id=target.id, skill="React"))
    db.add(Endorsement(endorser_id=e1.id, target_id=target.id, skill="Python"))
    await db.commit()

    # Viewed by e1 → React endorsed_by_me True; viewed by stranger → False.
    seen_e1 = {e["skill"]: e for e in (await _trust_extras(db, target, e1))["endorsements"]}
    assert seen_e1["React"]["count"] == 2
    assert seen_e1["React"]["endorsed_by_me"] is True
    assert seen_e1["Python"]["count"] == 1

    stranger = await make_user(name="S")
    seen_s = {e["skill"]: e for e in (await _trust_extras(db, target, stranger))["endorsements"]}
    assert seen_s["React"]["endorsed_by_me"] is False


async def test_trust_extras_vouches_and_rating(make_user, db):
    from app.routers.users import _trust_extras
    from app.models.trust import Vouch, ProjectRating

    target = await make_user(name="Target")
    a1 = await make_user(name="A1")
    db.add(Vouch(author_id=a1.id, target_id=target.id, text="Great teammate."))
    # ratings: 5 and 4 → avg 4.5, count 2
    p = await _mk_project(db, a1.id, "Closed", is_active=False)
    db.add(ProjectRating(project_id=p.id, rater_id=a1.id, ratee_id=target.id, stars=5))
    r2 = await make_user(name="R2")
    db.add(ProjectRating(project_id=p.id, rater_id=r2.id, ratee_id=target.id, stars=4))
    await db.commit()

    extras = await _trust_extras(db, target, a1)
    assert extras["vouch_count"] == 1
    assert extras["vouches"][0]["text"] == "Great teammate."
    assert extras["vouches"][0]["author"]["id"] == a1.id
    assert extras["rating"]["count"] == 2
    assert extras["rating"]["average"] == 4.5


async def test_trust_extras_rating_empty_is_null(make_user, db):
    from app.routers.users import _trust_extras
    target = await make_user(name="T")
    viewer = await make_user(name="V")
    extras = await _trust_extras(db, target, viewer)
    assert extras["rating"] == {"average": None, "count": 0}
    assert extras["endorsements"] == []
    assert extras["vouches"] == []


async def test_trust_extras_mutual_connections(make_user, db):
    from app.routers.users import _trust_extras
    from app.models.user import Interest
    from app.models.project import ProjectMember

    viewer = await make_user(name="Viewer")
    target = await make_user(name="Target")
    shared = await make_user(name="Shared")     # mutual-interest with BOTH
    co = await make_user(name="Co")             # shares a project with BOTH

    # viewer <-> shared mutual interest
    db.add(Interest(from_user_id=viewer.id, to_user_id=shared.id))
    db.add(Interest(from_user_id=shared.id, to_user_id=viewer.id))
    # target <-> shared mutual interest
    db.add(Interest(from_user_id=target.id, to_user_id=shared.id))
    db.add(Interest(from_user_id=shared.id, to_user_id=target.id))

    # A project that viewer, target, and `co` are all members of.
    owner = await make_user(name="Owner")
    p = await _mk_project(db, owner.id, "Joint")
    for u in (viewer, target, co):
        db.add(ProjectMember(project_id=p.id, user_id=u.id))
    await db.commit()

    mc = (await _trust_extras(db, target, viewer))["mutual_connections"]
    ids = {m["id"] for m in mc["preview"]}
    assert shared.id in ids   # via mutual interest
    assert co.id in ids       # via shared project
    assert target.id not in ids and viewer.id not in ids
    assert mc["count"] == len(ids)


async def test_trust_extras_self_view_no_mutuals(make_user, db):
    from app.routers.users import _trust_extras
    me = await make_user(name="Me")
    mc = (await _trust_extras(db, me, me))["mutual_connections"]
    assert mc == {"count": 0, "preview": []}


async def test_get_user_profile_includes_trust(make_user, as_user, db):
    from app.models.trust import Vouch
    target = await make_user(name="Target")
    viewer = await make_user(name="Viewer")
    db.add(Vouch(author_id=viewer.id, target_id=target.id, text="Solid."))
    await db.commit()

    c = as_user(viewer)
    res = await c.get(f"/users/{target.id}")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["vouch_count"] == 1
    assert body["vouches"][0]["text"] == "Solid."
    assert body["rating"] == {"average": None, "count": 0}
    assert "mutual_connections" in body and "endorsements" in body


async def test_get_me_includes_trust(make_user, as_user, db):
    me = await make_user(name="Me")
    c = as_user(me)
    res = await c.get("/users/me")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["rating"] == {"average": None, "count": 0}
    assert body["mutual_connections"] == {"count": 0, "preview": []}


async def test_endorse_toggle_and_validation(make_user, as_user, db):
    from app.models.user_analysis import UserAnalysis
    target = await make_user(name="Target")
    me = await make_user(name="Me")
    db.add(UserAnalysis(user_id=target.id, skills=["React"], knowledges=[],
                        interests=[], preparations=[], goals=[]))
    await db.commit()

    c = as_user(me)
    # First tap → endorsed.
    r1 = await c.post(f"/users/{target.id}/endorse", json={"skill": "React"})
    assert r1.status_code == 200, r1.text
    assert r1.json() == {"ok": True, "endorsed": True, "count": 1}
    # Second tap → un-endorsed (toggle off).
    r2 = await c.post(f"/users/{target.id}/endorse", json={"skill": "React"})
    assert r2.json() == {"ok": True, "endorsed": False, "count": 0}
    # Skill not in target's analysis → 422.
    r3 = await c.post(f"/users/{target.id}/endorse", json={"skill": "Welding"})
    assert r3.status_code == 422


async def test_endorse_self_rejected(make_user, as_user, db):
    from app.models.user_analysis import UserAnalysis
    me = await make_user(name="Me")
    db.add(UserAnalysis(user_id=me.id, skills=["React"], knowledges=[],
                        interests=[], preparations=[], goals=[]))
    await db.commit()
    c = as_user(me)
    r = await c.post(f"/users/{me.id}/endorse", json={"skill": "React"})
    assert r.status_code == 400
