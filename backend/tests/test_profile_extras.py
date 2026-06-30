"""Profile rich-data: portfolio sanitizer, extras builder, profile endpoints."""
import pytest

pytestmark = pytest.mark.asyncio


def test_sanitize_portfolio_filters_and_caps():
    from app.routers.users import _sanitize_portfolio

    # Drops non-http, blank label/url; caps label at 40; caps list at 5.
    raw = [
        {"label": "GitHub", "url": "https://github.com/x"},
        {"label": "Bad", "url": "javascript:alert(1)"},   # bad scheme → dropped
        {"label": "", "url": "https://nolabel.com"},        # blank label → dropped
        {"label": "NoUrl", "url": ""},                      # blank url → dropped
        {"label": "x" * 60, "url": "https://long.com"},     # label trimmed to 40
        {"label": "A", "url": "https://a.com"},
        {"label": "B", "url": "https://b.com"},
        {"label": "C", "url": "https://c.com"},
        {"label": "D", "url": "https://d.com"},
        {"label": "E", "url": "https://e.com"},             # 6th valid → dropped by cap
    ]
    out = _sanitize_portfolio(raw)
    assert len(out) == 5
    assert out[0] == {"label": "GitHub", "url": "https://github.com/x"}
    assert len(out[1]["label"]) == 40
    assert all(l["url"].startswith("http") for l in out)


def test_sanitize_portfolio_handles_garbage():
    from app.routers.users import _sanitize_portfolio
    assert _sanitize_portfolio(None) == []
    assert _sanitize_portfolio("not a list") == []
    assert _sanitize_portfolio([1, "x", {"label": "ok", "url": "https://ok.com"}]) == [
        {"label": "ok", "url": "https://ok.com"}
    ]


async def _mk_project(db, creator_id, name, *, type="startup", is_active=True,
                      is_draft=False, is_deleted=False):
    from app.models.project import Project
    p = Project(type=type, creator_id=creator_id, name=name, is_active=is_active,
                is_draft=is_draft, is_deleted=is_deleted, is_approved=True)
    db.add(p)
    await db.commit()
    await db.refresh(p)
    return p


async def test_profile_extras_counts_and_lists(make_user, db):
    from app.routers.users import _profile_extras
    from app.models.project import Project, ProjectMember, ProjectApplication

    owner = await make_user(name="Owner")
    other = await make_user(name="Other")

    # Owner founds: 1 active, 1 closed, 1 draft (draft excluded), 1 deleted (excluded).
    await _mk_project(db, owner.id, "Active One", is_active=True)
    await _mk_project(db, owner.id, "Closed One", is_active=False)
    await _mk_project(db, owner.id, "Draft One", is_draft=True)
    await _mk_project(db, owner.id, "Deleted One", is_deleted=True)

    # Owner is a member of one project founded by `other` (counts as joined).
    others_proj = await _mk_project(db, other.id, "Others Proj")
    db.add(ProjectMember(project_id=others_proj.id, user_id=owner.id))
    # Owner is also a member-row of their OWN active project → must NOT double-list.
    own_active = (await db.execute(
        Project.__table__.select().where(Project.creator_id == owner.id, Project.name == "Active One")
    )).first()
    db.add(ProjectMember(project_id=own_active.id, user_id=owner.id))
    # One accepted application by owner to someone else's project.
    db.add(ProjectApplication(project_id=others_proj.id, applicant_id=owner.id, status="accepted"))
    db.add(ProjectApplication(project_id=others_proj.id, applicant_id=other.id, status="pending"))
    await db.commit()

    extras = await _profile_extras(db, owner)

    founded_names = {p["name"] for p in extras["founded_projects"]}
    assert founded_names == {"Active One", "Closed One"}  # no draft, no deleted
    member_names = {p["name"] for p in extras["member_projects"]}
    assert member_names == {"Others Proj"}                 # not own project
    assert extras["stats"]["projects_founded"] == 2
    assert extras["stats"]["projects_joined"] == 1
    assert extras["stats"]["applications_accepted"] == 1


async def test_currently_building_manual_auto_null(make_user, db):
    from app.routers.users import _profile_extras

    # Manual wins.
    u1 = await make_user(name="M", currently_building="My manual line")
    await _mk_project(db, u1.id, "AutoProj", is_active=True)
    e1 = await _profile_extras(db, u1)
    assert e1["currently_building"] == "My manual line"
    assert e1["currently_building_source"] == "manual"

    # No manual → auto from latest active founded project.
    u2 = await make_user(name="A")
    await _mk_project(db, u2.id, "AutoProj2", is_active=True)
    e2 = await _profile_extras(db, u2)
    assert e2["currently_building"] == "AutoProj2"
    assert e2["currently_building_source"] == "auto"

    # No manual, no active project → null.
    u3 = await make_user(name="N")
    await _mk_project(db, u3.id, "ClosedOnly", is_active=False)
    e3 = await _profile_extras(db, u3)
    assert e3["currently_building"] is None
    assert e3["currently_building_source"] is None


async def test_get_user_profile_includes_extras(make_user, as_user, db):
    owner = await make_user(name="Owner")
    viewer = await make_user(name="Viewer")
    await _mk_project(db, owner.id, "Public Proj", is_active=True)

    c = as_user(viewer)
    res = await c.get(f"/users/{owner.id}")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["stats"]["projects_founded"] == 1
    assert body["founded_projects"][0]["name"] == "Public Proj"
    assert body["currently_building"] == "Public Proj"
    assert body["currently_building_source"] == "auto"


async def test_get_me_includes_extras(make_user, as_user, db):
    me = await make_user(name="Me", currently_building="Shipping BFU")
    await _mk_project(db, me.id, "My Startup")
    c = as_user(me)
    res = await c.get("/users/me")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["currently_building"] == "Shipping BFU"
    assert body["currently_building_source"] == "manual"
    assert body["stats"]["projects_founded"] == 1


async def test_patch_me_writes_currently_building_and_portfolio(make_user, as_user, db):
    from app.models.user import User
    user = await make_user(name="Edit")
    c = as_user(user)

    res = await c.patch("/users/me", json={
        "currently_building": "  Building an EdTech app  ",
        "portfolio_links": [
            {"label": "GitHub", "url": "https://github.com/me"},
            {"label": "Bad", "url": "ftp://nope.com"},  # dropped
        ],
    })
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["currently_building"] == "Building an EdTech app"  # trimmed
    assert body["currently_building_source"] == "manual"
    assert body["portfolio_links"] == [{"label": "GitHub", "url": "https://github.com/me"}]

    fresh = await db.get(User, user.id)
    await db.refresh(fresh)
    assert fresh.currently_building == "Building an EdTech app"
    assert "github.com/me" in fresh.portfolio_links


async def test_patch_me_clears_currently_building_with_empty_string(make_user, as_user):
    user = await make_user(name="Clear", currently_building="old")
    c = as_user(user)
    res = await c.patch("/users/me", json={"currently_building": ""})
    assert res.status_code == 200, res.text
    # Empty → stored as null → resolves to auto/null (no projects → null).
    assert res.json()["currently_building"] is None
