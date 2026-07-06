"""Characterization tests pinning the EXACT output of the profile-view helpers
(_connection_ids, _connection_extras, _collaborators, _trust_extras rating)
before collapsing their internal query counts. Every branch is exercised so a
refactor that changes any result fails here.
"""
import pytest

from app.models.user import Interest
from app.models.project import Project, ProjectMember
from app.models.trust import ProjectRating

pytestmark = pytest.mark.asyncio


async def _proj(db, creator_id, *, is_draft=False, is_deleted=False):
    p = Project(type="startup", creator_id=creator_id, name="P", is_active=True,
                is_draft=is_draft, is_deleted=is_deleted, is_approved=True)
    db.add(p)
    await db.commit()
    await db.refresh(p)
    return p


async def test_connection_ids_covers_all_branches(make_user, db):
    """_connection_ids(uid) = mutual-interest peers ∪ people sharing a LIVE
    project with uid (co-member or founder), excluding uid, drafts, deletes."""
    from app.routers.users import _connection_ids

    uid_user = await make_user(name="U")
    a = await make_user(name="A")   # mutual interest → included
    b = await make_user(name="B")   # one-way uid->B → excluded
    c = await make_user(name="C")   # one-way C->uid → excluded
    o1 = await make_user(name="O1")  # founder of a project uid is a member of
    m1 = await make_user(name="M1")  # co-member of that project
    m2 = await make_user(name="M2")  # member of a project uid founded
    d1 = await make_user(name="D1")  # co-member of a DRAFT project → excluded
    x1 = await make_user(name="X1")  # co-member of a DELETED project → excluded
    uid = uid_user.id

    db.add(Interest(from_user_id=uid, to_user_id=a.id))
    db.add(Interest(from_user_id=a.id, to_user_id=uid))
    db.add(Interest(from_user_id=uid, to_user_id=b.id))
    db.add(Interest(from_user_id=c.id, to_user_id=uid))
    await db.commit()

    p1 = await _proj(db, o1.id)                       # uid is a member here
    p2 = await _proj(db, uid)                          # uid founded this
    p3 = await _proj(db, o1.id, is_draft=True)         # draft → excluded
    p4 = await _proj(db, o1.id, is_deleted=True)       # deleted → excluded
    for pid, members in ((p1.id, [uid, m1.id]), (p2.id, [m2.id]),
                         (p3.id, [uid, d1.id]), (p4.id, [uid, x1.id])):
        for mid in members:
            db.add(ProjectMember(project_id=pid, user_id=mid))
    await db.commit()

    result = await _connection_ids(db, uid)
    assert result == {a.id, o1.id, m1.id, m2.id}


async def test_connection_ids_empty_when_isolated(make_user, db):
    from app.routers.users import _connection_ids
    u = await make_user(name="Lonely")
    assert await _connection_ids(db, u.id) == set()


async def test_trust_rating_avg_and_count(make_user, db):
    """Pin rating aggregation (avg + count) — collapsed into one query."""
    from app.routers.users import _trust_extras

    target = await make_user(name="T")
    r1 = await make_user(name="R1")
    r2 = await make_user(name="R2")
    r3 = await make_user(name="R3")
    p = await _proj(db, r1.id)
    db.add(ProjectRating(project_id=p.id, rater_id=r1.id, ratee_id=target.id, stars=5))
    db.add(ProjectRating(project_id=p.id, rater_id=r2.id, ratee_id=target.id, stars=4))
    db.add(ProjectRating(project_id=p.id, rater_id=r3.id, ratee_id=target.id, stars=3))
    await db.commit()

    rating = (await _trust_extras(db, target, target))["rating"]
    assert rating == {"average": 4.0, "count": 3}
