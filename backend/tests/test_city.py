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


async def test_city_clusters_online_early_adopter_survives_pool_cap(make_user, db):
    """The 300-row pool cap must keep the most-recently-ACTIVE builders, not the
    most-recently-REGISTERED. An early adopter who is online right now must not be
    dropped just because 300 newer accounts registered after them."""
    from app.routers.public import _city_clusters

    # Established early adopter: registered long ago, but online right now.
    early = await make_user(name="EarlyAdopter")
    early.created_at = NOW - dt.timedelta(days=900)     # oldest registration
    early.last_seen_at = NOW - dt.timedelta(minutes=2)  # online NOW
    await db.commit()

    # 320 newer, offline registrations. All registered AFTER `early`, so under a
    # created_at-desc cap they win the 300 slots and evict `early` from the pool.
    for i in range(320):
        filler = await make_user(name=f"Filler{i}")
        filler.created_at = NOW - dt.timedelta(days=100) + dt.timedelta(seconds=i)
        filler.last_seen_at = None  # offline
    await db.commit()

    clusters, _ = await _city_clusters(db, region_id=None, limit=48)
    all_ids = [p["id"] for c in clusters for p in c["people"]]
    assert early.id in all_ids  # online early adopter must not be dropped by the cap


async def test_city_threads_shapes(make_user, db):
    from app.routers.public import _city_threads
    from app.models.user_analysis import UserAnalysis
    for i in range(4):
        u = await make_user(name=f"Climate{i}")
        db.add(UserAnalysis(user_id=u.id, skills=["Climate"], knowledges=[],
                            interests=[], preparations=[], goals=[]))
    await db.commit()
    threads = await _city_threads(db, region_id=None)
    assert isinstance(threads, list)
    kinds = {t["kind"] for t in threads}
    assert kinds <= {"rising", "new_in_city", "skill_cluster", "open_roles"}
    for t in threads:
        assert t["title"] and "faces" in t and isinstance(t["faces"], list)
        for f in t["faces"]:
            assert "id" in f and "initials" in f


async def _vouch(db, author_id, target_id):
    from app.models.trust import Vouch
    db.add(Vouch(author_id=author_id, target_id=target_id, text="great builder"))


async def test_city_threads_rising_respects_region_filter(make_user, db):
    """Region-leak regression: the `rising` thread must apply the region filter
    INSIDE the vouch aggregate before LIMIT. Four globally-most-vouched builders
    who are OUT of region must not occupy the top-4 slots and starve an
    in-region builder who has fewer (but real) vouches."""
    from app.routers.public import _city_threads
    from app.models.region import Region

    r = Region(name_en="Focus", name_uz="Focus", name_ru="Focus")
    db.add(r); await db.commit(); await db.refresh(r)

    # 4 out-of-region builders, 6 vouches each (globally the most-vouched).
    for i in range(4):
        b = await make_user(name=f"Out{i}")  # no region
        for j in range(6):
            voucher = await make_user(name=f"OutV{i}_{j}")
            await _vouch(db, voucher.id, b.id)
    # 1 in-region builder with only 2 vouches.
    inreg = await make_user(name="InRegion", region_id=r.id)
    for j in range(2):
        voucher = await make_user(name=f"InV{j}")
        await _vouch(db, voucher.id, inreg.id)
    await db.commit()

    threads = await _city_threads(db, region_id=r.id)
    rising = [t for t in threads if t["kind"] == "rising"]
    assert rising, "in-region well-vouched builder must surface a rising thread"
    face_ids = {f["id"] for f in rising[0]["faces"]}
    assert inreg.id in face_ids


async def test_city_threads_rising_excludes_deleted_and_unregistered(make_user, db):
    """Deleted/unregistered-eat-slots regression: a soft-deleted (or
    unregistered) most-vouched user must NOT consume a top-4 slot and shrink the
    thread — the aggregate must exclude them before LIMIT so 4 live eligible
    builders all surface."""
    from app.routers.public import _city_threads

    # A soft-deleted user with the MOST vouches (7).
    ghost = await make_user(name="Ghost")
    ghost.is_deleted = True
    await db.commit()
    for j in range(7):
        voucher = await make_user(name=f"GhostV{j}")
        await _vouch(db, voucher.id, ghost.id)

    # 4 live eligible builders with fewer vouches (3 each).
    live = []
    for i in range(4):
        b = await make_user(name=f"Live{i}")
        live.append(b)
        for j in range(3):
            voucher = await make_user(name=f"LiveV{i}_{j}")
            await _vouch(db, voucher.id, b.id)
    await db.commit()

    threads = await _city_threads(db, region_id=None)
    rising = [t for t in threads if t["kind"] == "rising"]
    assert rising
    face_ids = {f["id"] for f in rising[0]["faces"]}
    assert ghost.id not in face_ids           # deleted user never surfaces
    assert len(rising[0]["faces"]) == 4       # all 4 live builders fill the slots
