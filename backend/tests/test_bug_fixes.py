"""Regressions for the 4 bugs the desktop bug-hunt surfaced (backend-side).
F1 (AI re-analyze double-429) is fixed on the frontend. F2/F3/F4 here."""
import pytest
from sqlalchemy import select

pytestmark = pytest.mark.asyncio


async def test_update_project_can_clear_optional_fields(make_user, db, as_user):
    """F2: a founder must be able to CLEAR goal/about/gender_req/age_from/age_to,
    not just change them (exclude_none used to silently drop the nulls)."""
    from app.models.project import Project

    owner = await make_user(name="Owner")
    p = Project(type="startup", creator_id=owner.id, name="P", goal="old goal",
                about="old about", gender_req="male", age_from=18, age_to=30,
                is_approved=True, is_draft=False, is_deleted=False)
    db.add(p); await db.commit(); await db.refresh(p)

    client = as_user(owner)
    res = await client.patch(
        f"/projects/{p.id}",
        json={"goal": None, "about": None, "gender_req": None, "age_from": None, "age_to": None},
    )
    assert res.status_code == 200, res.text

    await db.refresh(p)
    assert p.goal is None
    assert p.about is None
    assert p.gender_req is None
    assert p.age_from is None
    assert p.age_to is None


async def test_update_project_absent_field_untouched(make_user, db, as_user):
    """A field NOT sent in the PATCH must keep its value (only explicit nulls clear)."""
    from app.models.project import Project

    owner = await make_user(name="Owner2")
    p = Project(type="startup", creator_id=owner.id, name="Keep", goal="keep me",
                is_approved=True, is_draft=False, is_deleted=False)
    db.add(p); await db.commit(); await db.refresh(p)

    client = as_user(owner)
    res = await client.patch(f"/projects/{p.id}", json={"name": "Renamed"})
    assert res.status_code == 200, res.text
    await db.refresh(p)
    assert p.name == "Renamed"
    assert p.goal == "keep me"          # untouched


async def test_update_school_can_clear_group_and_pin(make_user, db, as_user):
    """F3: clearing group_link / latitude / longitude on a school must persist."""
    from app.models.region import Region, School

    admin = await make_user(name="Admin", role="super_admin")
    r = Region(name_en="R", name_uz="R", name_ru="R")
    db.add(r); await db.commit(); await db.refresh(r)
    s = School(name="Sch", region_id=r.id, group_link="https://t.me/x",
               latitude=41.0, longitude=69.0)
    db.add(s); await db.commit(); await db.refresh(s)

    client = as_user(admin)
    res = await client.patch(
        f"/admin/schools/{s.id}", json={"group_link": None, "latitude": None, "longitude": None}
    )
    assert res.status_code == 200, res.text
    await db.refresh(s)
    assert s.group_link is None
    assert s.latitude is None
    assert s.longitude is None
    assert s.name == "Sch"              # untouched


async def test_update_lc_can_clear_group(make_user, db, as_user):
    from app.models.region import Region, LearningCenter

    admin = await make_user(name="Admin2", role="super_admin")
    r = Region(name_en="R2", name_uz="R2", name_ru="R2")
    db.add(r); await db.commit(); await db.refresh(r)
    lc = LearningCenter(name="LC", region_id=r.id, group_link="https://t.me/y")
    db.add(lc); await db.commit(); await db.refresh(lc)

    client = as_user(admin)
    res = await client.patch(f"/admin/learning-centers/{lc.id}", json={"group_link": None})
    assert res.status_code == 200, res.text
    await db.refresh(lc)
    assert lc.group_link is None


async def test_admin_list_events_excludes_deleted(make_user, db, as_user):
    """F4: soft-deleted events must NOT come back in the admin events list."""
    from app.models.event import Event

    admin = await make_user(name="Admin3", role="super_admin")
    live = Event(type="hackathon", title="Live", is_approved=True, is_deleted=False)
    gone = Event(type="hackathon", title="Gone", is_approved=True, is_deleted=True)
    db.add_all([live, gone]); await db.commit()

    client = as_user(admin)
    res = await client.get("/admin/events")
    assert res.status_code == 200, res.text
    titles = [e["title"] for e in res.json()]
    assert "Live" in titles
    assert "Gone" not in titles
