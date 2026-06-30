"""Batch D achievements: derived earned + progress, no stored state."""
import pytest

pytestmark = pytest.mark.asyncio

KEYS = {"first_project", "first_application", "five_invites", "verified",
        "first_endorsement", "mentor", "first_vouch_received"}


def _by_key(body):
    return {a["key"]: a for a in body["achievements"]}


async def test_fresh_user_all_locked(make_user, as_user, db):
    me = await make_user(name="Me")
    c = as_user(me)
    res = await c.get("/users/me/achievements")
    assert res.status_code == 200, res.text
    ach = _by_key(res.json())
    assert set(ach) == KEYS
    assert all(a["earned"] is False for a in ach.values())
    assert ach["five_invites"]["progress"] == {"current": 0, "target": 5}
    assert ach["first_project"]["progress"] is None   # milestone


async def test_first_project_after_founding(make_user, as_user, db):
    from app.models.project import Project
    me = await make_user(name="Me")
    db.add(Project(type="startup", creator_id=me.id, name="P", is_active=True,
                   is_draft=False, is_deleted=False, is_approved=True))
    await db.commit()
    c = as_user(me)
    ach = _by_key((await c.get("/users/me/achievements")).json())
    assert ach["first_project"]["earned"] is True


async def test_draft_project_does_not_count(make_user, as_user, db):
    from app.models.project import Project
    me = await make_user(name="Me")
    db.add(Project(type="startup", creator_id=me.id, name="D", is_active=True,
                   is_draft=True, is_deleted=False, is_approved=True))
    await db.commit()
    c = as_user(me)
    ach = _by_key((await c.get("/users/me/achievements")).json())
    assert ach["first_project"]["earned"] is False


async def test_first_application(make_user, as_user, db):
    from app.models.project import Project, ProjectApplication
    me = await make_user(name="Me")
    founder = await make_user(name="F")
    p = Project(type="startup", creator_id=founder.id, name="P", is_active=True,
                is_draft=False, is_deleted=False, is_approved=True)
    db.add(p); await db.commit(); await db.refresh(p)
    db.add(ProjectApplication(project_id=p.id, applicant_id=me.id, status="pending"))
    await db.commit()
    c = as_user(me)
    ach = _by_key((await c.get("/users/me/achievements")).json())
    assert ach["first_application"]["earned"] is True


async def test_five_invites_progress_and_earn(make_user, as_user, db):
    me = await make_user(name="Me")
    for i in range(5):
        await make_user(name=f"Ref{i}", referred_by=me.id)
    c = as_user(me)
    ach = _by_key((await c.get("/users/me/achievements")).json())
    assert ach["five_invites"]["earned"] is True
    assert ach["five_invites"]["progress"] == {"current": 5, "target": 5}


async def test_invites_partial_progress(make_user, as_user, db):
    me = await make_user(name="Me")
    await make_user(name="R1", referred_by=me.id)
    await make_user(name="R2", referred_by=me.id)
    c = as_user(me)
    ach = _by_key((await c.get("/users/me/achievements")).json())
    assert ach["five_invites"]["earned"] is False
    assert ach["five_invites"]["progress"] == {"current": 2, "target": 5}


async def test_verified_and_mentor(make_user, as_user, db):
    me = await make_user(name="Me", checked=True)
    me.is_mentor = True   # Batch C column
    await db.commit()
    c = as_user(me)
    ach = _by_key((await c.get("/users/me/achievements")).json())
    assert ach["verified"]["earned"] is True
    assert ach["mentor"]["earned"] is True


async def test_endorsement_and_vouch_received(make_user, as_user, db):
    from app.models.trust import Endorsement, Vouch
    me = await make_user(name="Me")
    other = await make_user(name="O")
    db.add(Endorsement(endorser_id=other.id, target_id=me.id, skill="Python"))
    db.add(Vouch(author_id=other.id, target_id=me.id, text="great"))
    await db.commit()
    c = as_user(me)
    ach = _by_key((await c.get("/users/me/achievements")).json())
    assert ach["first_endorsement"]["earned"] is True
    assert ach["first_vouch_received"]["earned"] is True
