"""GET /search — global command-palette search.

Covers: finds a matching person + project, respects the standard visibility
filters (banned/deleted/unregistered people; draft/unapproved/deleted
projects), and returns empty (no scan) for an empty / whitespace query.
"""
import datetime as dt


async def _seed_region(db):
    from app.models.region import Region
    r = Region(name_uz="Toshkent", name_en="Tashkent", name_ru="Ташкент")
    db.add(r)
    await db.commit()
    await db.refresh(r)
    return r


async def test_search_finds_person_and_project(make_user, as_user, db):
    from app.models.project import Project

    region = await _seed_region(db)
    me = await make_user(name="Me")
    # A findable person (matches on `name`), online, with a region.
    other = await make_user(
        name="Alexandra", surname="Volkova", region_id=region.id,
        last_seen_at=dt.datetime.utcnow(),
    )
    # A findable project (matches on `name`).
    db.add(Project(type="startup", creator_id=other.id, name="Alexandria Labs",
                   goal="Build a library", is_active=True, is_hiring=True,
                   is_draft=False, is_deleted=False, is_approved=True))
    await db.commit()

    c = as_user(me)
    res = (await c.get("/search", params={"q": "alex"})).json()

    people_ids = [p["id"] for p in res["people"]]
    assert other.id in people_ids
    person = next(p for p in res["people"] if p["id"] == other.id)
    assert person["display_name"]                      # non-empty
    assert person["region"] == "Tashkent"              # localized (en) name
    assert person["is_online"] is True

    project_names = [p["name"] for p in res["projects"]]
    assert "Alexandria Labs" in project_names
    proj = next(p for p in res["projects"] if p["name"] == "Alexandria Labs")
    assert proj["type"] == "startup"
    assert proj["is_hiring"] is True

    # Back-compat alias for the Telegram Mini App.
    assert res["users"] == res["people"]
    assert "events" in res


async def test_search_respects_visibility_filters(make_user, as_user, db):
    from app.models.project import Project

    me = await make_user(name="Me")
    await make_user(name="Bannedbob", banned=True)
    await make_user(name="Deletedbob", is_deleted=True)
    await make_user(name="Pendingbob", is_registered=False)
    visible = await make_user(name="Bobby")

    # Projects that must NOT surface.
    hidden_founder = await make_user(name="Founder")
    db.add_all([
        Project(type="startup", creator_id=hidden_founder.id, name="Draftberg",
                is_draft=True, is_deleted=False, is_approved=True),
        Project(type="startup", creator_id=hidden_founder.id, name="Pendingberg",
                is_draft=False, is_deleted=False, is_approved=False),
        Project(type="startup", creator_id=hidden_founder.id, name="Deletedberg",
                is_draft=False, is_deleted=True, is_approved=True),
    ])
    await db.commit()

    c = as_user(me)

    people = (await c.get("/search", params={"q": "bob"})).json()["people"]
    ids = {p["id"] for p in people}
    assert visible.id in ids
    names = {p["display_name"] for p in people}
    assert not any(n.startswith("Bannedbob".lower()) for n in names)
    # None of the excluded users leak in.
    assert len(ids) == 1

    projects = (await c.get("/search", params={"q": "berg"})).json()["projects"]
    assert projects == []


async def test_empty_query_returns_empty(make_user, as_user, db):
    from app.models.project import Project

    me = await make_user(name="Me")
    findable = await make_user(name="Findable")
    db.add(Project(type="startup", creator_id=findable.id, name="Findable Co",
                   is_draft=False, is_deleted=False, is_approved=True))
    await db.commit()

    c = as_user(me)
    for q in ("", "   "):
        res = (await c.get("/search", params={"q": q})).json()
        assert res["people"] == []
        assert res["projects"] == []
        assert res["events"] == []


async def test_search_requires_auth(client):
    # No auth override installed on the bare `client` fixture → 401/403.
    res = await client.get("/search", params={"q": "x"})
    assert res.status_code in (401, 403)


async def test_limit_caps_each_group(make_user, as_user, db):
    me = await make_user(name="Me")
    for i in range(6):
        await make_user(name=f"Searchable{i}")

    c = as_user(me)
    res = (await c.get("/search", params={"q": "searchable", "limit": 3})).json()
    assert len(res["people"]) == 3
