"""GET /public/u/{id}/data — the JSON contract the Chorsu desktop /u/{id}
page fetches. Grounded 1:1 in _profile_extras/_trust_extras/_connection_extras/
_collaborators/_achievements_extras — no invented fields."""
import pytest

pytestmark = pytest.mark.asyncio


async def _mk_project(db, creator_id, name, *, is_active=True):
    from app.models.project import Project
    p = Project(type="startup", creator_id=creator_id, name=name, about="x",
                is_active=is_active, is_draft=False, is_deleted=False, is_approved=True)
    db.add(p)
    await db.commit()
    await db.refresh(p)
    return p


async def test_profile_data_full_shape(make_user, db, client):
    from app.models.region import Region
    from app.models.user_analysis import UserAnalysis

    region = Region(name_en="Tashkent", name_uz="Toshkent", name_ru="Ташкент")
    db.add(region)
    await db.commit()
    await db.refresh(region)

    user = await make_user(
        name="Aziz", surname="Karimov", checked=True, region_id=region.id,
        birth_year=2003, open_to_work=True, open_to_volunteering=False,
    )
    db.add(UserAnalysis(user_id=user.id, skills=["React", "Python"], knowledges=[],
                        interests=[], preparations=[], goals=[]))
    await db.commit()
    await _mk_project(db, user.id, "Solar Farm")

    res = await client.get(f"/public/u/{user.id}/data")
    assert res.status_code == 200, res.text
    body = res.json()

    assert body["id"] == user.id
    assert body["checked"] is True
    assert body["region"] == {"id": region.id, "name_en": "Tashkent", "name_uz": "Toshkent", "name_ru": "Ташкент"}
    assert body["age"] == 2026 - 2003
    assert body["skills"] == ["React", "Python"]
    assert body["stats"]["projects_founded"] == 1
    assert body["looking_for"] == "work"          # open_to_work=True, open_to_volunteering=False
    assert body["rating"] == {"average": None, "count": 0}
    assert body["mutual_connections"] == {"count": 0, "preview": []}
    assert "achievements" in body
    assert body["og_image_url"].startswith("/public/og/") or "/public/og/" in body["og_image_url"]
    assert body["telegram_open_url"].endswith(f"startapp=user_{user.id}")


async def test_profile_data_looking_for_volunteering(make_user, client):
    user = await make_user(name="Vol", open_to_work=False, open_to_volunteering=True)
    res = await client.get(f"/public/u/{user.id}/data")
    assert res.json()["looking_for"] == "volunteering"


async def test_profile_data_looking_for_both(make_user, client):
    user = await make_user(name="Both", open_to_work=True, open_to_volunteering=True)
    res = await client.get(f"/public/u/{user.id}/data")
    assert res.json()["looking_for"] == "both"


async def test_profile_data_looking_for_neither(make_user, client):
    user = await make_user(name="Neither", open_to_work=False, open_to_volunteering=False)
    res = await client.get(f"/public/u/{user.id}/data")
    assert res.json()["looking_for"] is None


async def test_profile_data_no_region_is_null(make_user, client):
    user = await make_user(name="NoRegion", region_id=None)
    res = await client.get(f"/public/u/{user.id}/data")
    assert res.json()["region"] is None


async def test_profile_data_404_for_missing_deleted_or_unregistered(make_user, client):
    assert (await client.get("/public/u/999999/data")).status_code == 404

    deleted = await make_user(name="Deleted", is_deleted=True)
    assert (await client.get(f"/public/u/{deleted.id}/data")).status_code == 404

    unregistered = await make_user(name="Pending", is_registered=False)
    assert (await client.get(f"/public/u/{unregistered.id}/data")).status_code == 404


async def test_profile_data_no_pii_leak(make_user, client):
    """Same privacy bar as the existing HTML route: no phone, telegram_id,
    lat/long, or email in the public JSON."""
    user = await make_user(name="Private", phone_number="+998901234567")
    res = await client.get(f"/public/u/{user.id}/data")
    body = res.json()
    dumped = str(body)
    assert "998901234567" not in dumped
    assert "telegram_id" not in dumped
    assert "phone_number" not in dumped
    assert "latitude" not in dumped and "longitude" not in dumped
