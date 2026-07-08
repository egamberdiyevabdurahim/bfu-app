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
    online.last_seen_at = NOW - dt.timedelta(minutes=2)          # online (<5min)
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


async def test_city_clusters_exposes_mentor_flag(make_user, db):
    """The Builder card contract must expose `mentor` (from User.is_mentor) so the
    City 'Mentors' filter chip has real backing data."""
    from app.routers.public import _city_clusters
    m = await make_user(name="Mentor", is_mentor=True)
    n = await make_user(name="NotMentor")
    clusters, _ = await _city_clusters(db, region_id=None, limit=48)
    by_id = {p["id"]: p for c in clusters for p in c["people"]}
    assert by_id[m.id]["mentor"] is True
    assert by_id[n.id]["mentor"] is False


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


async def test_city_threads_new_in_city_has_recency_window(make_user, db):
    """`new_in_city` must only surface genuinely recent joins. Old accounts that
    happen to be the newest rows in a quiet community are NOT 'just arrived'."""
    from app.routers.public import _city_threads
    for i in range(4):
        u = await make_user(name=f"Old{i}")
        u.created_at = NOW - dt.timedelta(days=60)   # all registered long ago
    await db.commit()
    threads = await _city_threads(db, region_id=None)
    assert not [t for t in threads if t["kind"] == "new_in_city"]


async def test_city_threads_skill_cluster_dedups_repeated_skill(make_user, db):
    """A user listing the same skill twice must count once in a skill cluster —
    no inflated count, no duplicate face."""
    from app.routers.public import _city_threads
    from app.models.user_analysis import UserAnalysis
    dup = await make_user(name="Dup")
    db.add(UserAnalysis(user_id=dup.id, skills=["AI", "AI"], knowledges=[],
                        interests=[], preparations=[], goals=[]))
    for i in range(2):
        u = await make_user(name=f"AiPerson{i}")
        db.add(UserAnalysis(user_id=u.id, skills=["AI"], knowledges=[],
                            interests=[], preparations=[], goals=[]))
    await db.commit()
    threads = await _city_threads(db, region_id=None)
    sc = [t for t in threads if t["kind"] == "skill_cluster"]
    assert sc
    assert sc[0]["title"].startswith("3 builders")   # 3 unique, not 4
    fids = [f["id"] for f in sc[0]["faces"]]
    assert len(fids) == len(set(fids))               # faces unique
    assert dup.id in fids


async def test_city_endpoint_end_to_end(make_user, db, client):
    from app.models.region import Region
    r = Region(name_en="Tashkent City", name_uz="Toshkent shahri", name_ru="Город Ташкент")
    db.add(r); await db.commit(); await db.refresh(r)
    u = await make_user(name="Aziza", region_id=r.id, checked=True, open_to_work=True)
    u.last_seen_at = NOW - dt.timedelta(minutes=3)
    await db.commit()

    res = await client.get("/public/city")
    assert res.status_code == 200, res.text
    body = res.json()
    assert set(body) >= {"stats", "weekday", "regions", "threads"}
    assert body["stats"]["online_now"] >= 1
    assert any(p["id"] == u.id for c in body["regions"] for p in c["people"])
    # no PII leak in the public payload
    dumped = str(body)
    for leak in ("telegram_id", "phone_number", "latitude", "longitude"):
        assert leak not in dumped


async def test_city_endpoint_region_focus(make_user, db, client):
    from app.models.region import Region
    r = Region(name_en="Samarkand", name_uz="Samarqand", name_ru="Самарканд")
    db.add(r); await db.commit(); await db.refresh(r)
    inreg = await make_user(name="In", region_id=r.id)
    await make_user(name="Out")  # different/no region
    res = await client.get(f"/public/city?region_id={r.id}")
    body = res.json()
    ids = [p["id"] for c in body["regions"] for p in c["people"]]
    assert inreg.id in ids
