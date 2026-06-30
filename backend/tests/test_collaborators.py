"""Batch D frequent collaborators: derived from 2+ shared projects."""
import pytest

pytestmark = pytest.mark.asyncio


async def _mk_project(db, creator_id, name, **kw):
    from app.models.project import Project
    defaults = dict(type="startup", creator_id=creator_id, name=name, is_active=True,
                    is_hiring=True, is_draft=False, is_deleted=False, is_approved=True)
    defaults.update(kw)
    p = Project(**defaults)
    db.add(p)
    await db.commit()
    await db.refresh(p)
    return p


async def _member(db, project_id, user_id):
    from app.models.project import ProjectMember
    db.add(ProjectMember(project_id=project_id, user_id=user_id))
    await db.commit()


async def test_collaborators_two_shared(make_user, db):
    from app.routers.users import _collaborators
    u = await make_user(name="U")
    buddy = await make_user(name="Buddy")
    once = await make_user(name="Once")
    # Two shared projects between u and buddy.
    p1 = await _mk_project(db, u.id, "P1")
    p2 = await _mk_project(db, u.id, "P2")
    p3 = await _mk_project(db, u.id, "P3")
    await _member(db, p1.id, u.id); await _member(db, p1.id, buddy.id)
    await _member(db, p2.id, u.id); await _member(db, p2.id, buddy.id)
    await _member(db, p3.id, u.id); await _member(db, p3.id, once.id)  # only 1 shared

    out = await _collaborators(db, u)
    ids = {c["id"]: c for c in out["preview"]}
    assert buddy.id in ids and ids[buddy.id]["shared"] == 2
    assert once.id not in ids        # only 1 shared → excluded
    assert u.id not in ids           # self excluded
    assert out["count"] == 1


async def test_founder_counts_as_participant(make_user, db):
    from app.routers.users import _collaborators
    founder = await make_user(name="F")
    u = await make_user(name="U")
    # founder created both; u is a member of both → they share 2 projects even
    # though founder has no project_members row.
    p1 = await _mk_project(db, founder.id, "P1")
    p2 = await _mk_project(db, founder.id, "P2")
    await _member(db, p1.id, u.id)
    await _member(db, p2.id, u.id)
    out = await _collaborators(db, u)
    ids = {c["id"]: c for c in out["preview"]}
    assert founder.id in ids and ids[founder.id]["shared"] == 2


async def test_drafts_and_deleted_excluded(make_user, db):
    from app.routers.users import _collaborators
    u = await make_user(name="U")
    buddy = await make_user(name="B")
    p1 = await _mk_project(db, u.id, "P1")
    draft = await _mk_project(db, u.id, "Draft", is_draft=True)
    await _member(db, p1.id, u.id); await _member(db, p1.id, buddy.id)
    await _member(db, draft.id, u.id); await _member(db, draft.id, buddy.id)
    out = await _collaborators(db, u)  # only 1 LIVE shared project → excluded
    assert out["count"] == 0


async def test_profile_endpoints_include_collaborators(make_user, as_user, db):
    u = await make_user(name="U")
    buddy = await make_user(name="B")
    p1 = await _mk_project(db, u.id, "P1")
    p2 = await _mk_project(db, u.id, "P2")
    await _member(db, p1.id, u.id); await _member(db, p1.id, buddy.id)
    await _member(db, p2.id, u.id); await _member(db, p2.id, buddy.id)

    c = as_user(buddy)
    res = await c.get(f"/users/{u.id}")
    assert res.status_code == 200, res.text
    assert res.json()["collaborators"]["count"] == 1
    me = as_user(u)
    res_me = await me.get("/users/me")
    assert res_me.json()["collaborators"]["count"] == 1
