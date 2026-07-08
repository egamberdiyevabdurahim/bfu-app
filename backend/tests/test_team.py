"""Project TEAM management: full roster (founder + members, with member-roles)
and founder-only role/removal controls.

The MEMBER role tested here (project_members.role) is a founder-set title on an
actual teammate — distinct from the OPEN roles a project hires for
(project_roles / project_applications.role, covered by test_project_roles.py /
test_open_roles.py)."""
import pytest

pytestmark = pytest.mark.asyncio


async def _mk_project(db, creator_id, name="Proj", **kw):
    from app.models.project import Project
    defaults = dict(type="startup", creator_id=creator_id, name=name, is_active=True,
                    is_hiring=True, is_draft=False, is_deleted=False, is_approved=True)
    defaults.update(kw)
    p = Project(**defaults)
    db.add(p)
    await db.commit()
    await db.refresh(p)
    return p


async def _member(db, project_id, user_id, role=None):
    from app.models.project import ProjectMember
    db.add(ProjectMember(project_id=project_id, user_id=user_id, role=role))
    await db.commit()


# ── GET /projects/{id}/team ─────────────────────────────────────────────────────

async def test_get_team_roster_founder_first_with_roles(make_user, as_user, db):
    founder = await make_user(name="Aziza")
    mate = await make_user(name="Rustam")
    p = await _mk_project(db, founder.id)
    # Founder + one member, each with a member-role.
    await _member(db, p.id, founder.id, role="CEO")
    await _member(db, p.id, mate.id, role="Backend")

    c = as_user(founder)
    res = await c.get(f"/projects/{p.id}/team")
    assert res.status_code == 200, res.text
    roster = res.json()
    assert isinstance(roster, list) and len(roster) == 2
    # Founder leads the roster.
    assert roster[0]["is_founder"] is True
    assert roster[0]["user"]["id"] == founder.id
    assert roster[0]["role"] == "CEO"
    assert "is_online" in roster[0]["user"]
    # Member carries their role and is flagged non-founder.
    assert roster[1]["is_founder"] is False
    assert roster[1]["user"]["id"] == mate.id
    assert roster[1]["role"] == "Backend"


async def test_get_team_synthesizes_founder_without_member_row(make_user, as_user, db):
    # Legacy project where the founder has no project_members row: the roster
    # must still lead with the founder.
    founder = await make_user(name="Solo")
    mate = await make_user(name="M")
    p = await _mk_project(db, founder.id)
    await _member(db, p.id, mate.id)

    c = as_user(founder)
    roster = (await c.get(f"/projects/{p.id}/team")).json()
    assert roster[0]["is_founder"] is True and roster[0]["user"]["id"] == founder.id


async def test_get_team_404_when_missing(make_user, as_user, db):
    founder = await make_user(name="F")
    c = as_user(founder)
    assert (await c.get("/projects/999999/team")).status_code == 404


# ── PATCH /projects/{id}/team/{user_id} ─────────────────────────────────────────

async def test_founder_sets_member_role(make_user, as_user, db):
    founder = await make_user(name="F")
    mate = await make_user(name="M")
    p = await _mk_project(db, founder.id)
    await _member(db, p.id, founder.id)
    await _member(db, p.id, mate.id)

    c = as_user(founder)
    r = await c.patch(f"/projects/{p.id}/team/{mate.id}", json={"role": "  Designer  "})
    assert r.status_code == 200, r.text
    assert r.json()["role"] == "Designer"  # trimmed
    roster = (await c.get(f"/projects/{p.id}/team")).json()
    got = next(m for m in roster if m["user"]["id"] == mate.id)
    assert got["role"] == "Designer"


async def test_founder_can_set_own_role(make_user, as_user, db):
    founder = await make_user(name="F")
    p = await _mk_project(db, founder.id)
    await _member(db, p.id, founder.id)
    c = as_user(founder)
    r = await c.patch(f"/projects/{p.id}/team/{founder.id}", json={"role": "Founder & CEO"})
    assert r.status_code == 200 and r.json()["role"] == "Founder & CEO"


async def test_patch_empty_role_clears_it(make_user, as_user, db):
    founder = await make_user(name="F")
    mate = await make_user(name="M")
    p = await _mk_project(db, founder.id)
    await _member(db, p.id, mate.id, role="Backend")
    c = as_user(founder)
    r = await c.patch(f"/projects/{p.id}/team/{mate.id}", json={"role": "   "})
    assert r.status_code == 200 and r.json()["role"] is None


async def test_non_founder_patch_forbidden(make_user, as_user, db):
    founder = await make_user(name="F")
    mate = await make_user(name="M")
    p = await _mk_project(db, founder.id)
    await _member(db, p.id, mate.id)
    c = as_user(mate)  # a member, but not the founder
    r = await c.patch(f"/projects/{p.id}/team/{mate.id}", json={"role": "Hacker"})
    assert r.status_code == 403


async def test_patch_non_member_400(make_user, as_user, db):
    founder = await make_user(name="F")
    stranger = await make_user(name="S")
    p = await _mk_project(db, founder.id)
    c = as_user(founder)
    r = await c.patch(f"/projects/{p.id}/team/{stranger.id}", json={"role": "X"})
    assert r.status_code == 400


# ── DELETE /projects/{id}/team/{user_id} ────────────────────────────────────────

async def test_founder_removes_member(make_user, as_user, db):
    founder = await make_user(name="F")
    mate = await make_user(name="M")
    p = await _mk_project(db, founder.id)
    await _member(db, p.id, founder.id)
    await _member(db, p.id, mate.id)

    c = as_user(founder)
    assert (await c.delete(f"/projects/{p.id}/team/{mate.id}")).status_code == 204
    roster = (await c.get(f"/projects/{p.id}/team")).json()
    assert all(m["user"]["id"] != mate.id for m in roster)
    assert len(roster) == 1 and roster[0]["is_founder"] is True


async def test_delete_founder_blocked(make_user, as_user, db):
    founder = await make_user(name="F")
    p = await _mk_project(db, founder.id)
    await _member(db, p.id, founder.id)
    c = as_user(founder)
    r = await c.delete(f"/projects/{p.id}/team/{founder.id}")
    assert r.status_code == 400


async def test_non_founder_delete_forbidden(make_user, as_user, db):
    founder = await make_user(name="F")
    mate = await make_user(name="M")
    other = await make_user(name="O")
    p = await _mk_project(db, founder.id)
    await _member(db, p.id, mate.id)
    await _member(db, p.id, other.id)
    c = as_user(mate)
    r = await c.delete(f"/projects/{p.id}/team/{other.id}")
    assert r.status_code == 403


async def test_delete_non_member_404(make_user, as_user, db):
    founder = await make_user(name="F")
    stranger = await make_user(name="S")
    p = await _mk_project(db, founder.id)
    c = as_user(founder)
    r = await c.delete(f"/projects/{p.id}/team/{stranger.id}")
    assert r.status_code == 404


# ── Public /p/{id} payload now carries member roles ─────────────────────────────

async def test_public_project_team_carries_roles(make_user, db, client):
    founder = await make_user(name="F")
    mate = await make_user(name="M")
    p = await _mk_project(db, founder.id)
    await _member(db, p.id, founder.id, role="Founder")
    await _member(db, p.id, mate.id, role="Backend")

    b = (await client.get(f"/public/project/{p.id}/data")).json()
    # Founder excluded from `team` (kept in `founder`), so its role rides along
    # separately as `founder_role`.
    assert b["team_count"] == 1
    assert b["team"][0]["id"] == mate.id
    assert b["team"][0]["role"] == "Backend"
    assert "is_online" in b["team"][0]
    assert b["founder_role"] == "Founder"
