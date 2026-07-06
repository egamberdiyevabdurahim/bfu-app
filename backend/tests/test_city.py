"""GET /public/city — the batched, public 'building tonight' payload."""
import datetime as dt
import pytest

pytestmark = pytest.mark.asyncio

NOW = dt.datetime.utcnow()


async def _seed_project(db, creator_id, name="P", active=True):
    from app.models.project import Project
    p = Project(type="startup", creator_id=creator_id, name=name, about="x",
                is_active=active, is_draft=False, is_deleted=False, is_approved=True)
    db.add(p); await db.commit(); await db.refresh(p); return p


async def test_city_stats_counts(make_user, db):
    from app.routers.public import _city_stats
    from app.models.region import Region
    r = Region(name_en="Tashkent", name_uz="Toshkent", name_ru="Ташкент")
    db.add(r); await db.commit(); await db.refresh(r)

    online = await make_user(name="On", region_id=r.id)
    online.last_seen_at = NOW - dt.timedelta(minutes=5)          # online
    offline = await make_user(name="Off", region_id=r.id)
    offline.last_seen_at = NOW - dt.timedelta(hours=3)           # offline
    fresh = await make_user(name="New")
    fresh.created_at = NOW - dt.timedelta(days=1)                # new this week
    await db.commit()

    s = await _city_stats(db)
    assert s["online_now"] == 1
    assert s["cities_lit"] == 1        # only the one online user's region counts
    assert s["new_this_week"] >= 1
    assert s["total_builders"] >= 3


async def test_city_clusters_batched_and_ordered(make_user, db):
    from app.routers.public import _city_clusters
    from app.models.region import Region
    from app.models.user_analysis import UserAnalysis
    from app.models.trust import ProjectRating

    r = Region(name_en="Tashkent City", name_uz="Toshkent shahri", name_ru="Город Ташкент")
    db.add(r); await db.commit(); await db.refresh(r)

    hi = await make_user(name="Hi", region_id=r.id, checked=True, open_to_work=True)
    hi.last_seen_at = NOW - dt.timedelta(minutes=2)
    db.add(UserAnalysis(user_id=hi.id, skills=["Hardware", "AI"], knowledges=[],
                        interests=[], preparations=[], goals=[]))
    lo = await make_user(name="Lo", region_id=r.id)
    lo.created_at = NOW - dt.timedelta(days=1)  # "new"
    await db.commit()
    # give hi a 5-star rating from someone (ProjectRating requires a project_id)
    rater = await make_user(name="Rater")
    proj = await _seed_project(db, rater.id, name="RatedProject")
    db.add(ProjectRating(project_id=proj.id, rater_id=rater.id, ratee_id=hi.id, stars=5))
    await db.commit()

    clusters, weekday = await _city_clusters(db, region_id=None, limit=48)
    assert isinstance(weekday, str) and weekday
    tosh = next(c for c in clusters if c["id"] == r.id)
    assert tosh["name_en"] == "Tashkent City"
    assert tosh["lit"] >= 2
    ids = [p["id"] for p in tosh["people"]]
    assert hi.id in ids and lo.id in ids
    # online + rated 'hi' must sort before offline 'lo'
    assert ids.index(hi.id) < ids.index(lo.id)
    hib = next(p for p in tosh["people"] if p["id"] == hi.id)
    assert hib["online"] is True
    assert hib["rating"] == 5.0
    assert hib["looking_for"] == "work"
    assert hib["skills"] == ["Hardware", "AI"]
    assert hib["weight"] == "high"           # rating>=4.5 and checked
    lob = next(p for p in tosh["people"] if p["id"] == lo.id)
    assert lob["weight"] == "new"
    assert lob["rating"] is None


async def test_city_clusters_currently_building_falls_back_to_project(make_user, db):
    from app.routers.public import _city_clusters
    u = await make_user(name="Builder")   # no manual currently_building
    await _seed_project(db, u.id, name="SolarBazaar", active=True)
    clusters, _ = await _city_clusters(db, region_id=None, limit=48)
    person = next(p for c in clusters for p in c["people"] if p["id"] == u.id)
    assert person["currently_building"] == "SolarBazaar"
