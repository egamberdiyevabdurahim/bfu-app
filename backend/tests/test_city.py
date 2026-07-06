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
