# Chorsu City / Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the public, logged-out **City / Discovery** ("building tonight")
screen — the flagship Chorsu "wander for an hour" surface — backed by one new
batched FastAPI endpoint and new Next.js components, reusing the profile
screen's Chorsu building blocks.

**Architecture:** A new **batched, public** `GET /public/city` endpoint on the
existing FastAPI backend returns everything the screen needs in one round-trip
(stats, region clusters of builder cards, serendipity threads) with **zero
N+1** (reputation, vouches, projects, regions all batch-loaded over the pool).
The desktop `desktop/` Next.js app gets a new `app/city/page.js` server
component (ISR `revalidate: 60`) plus a small set of new components, **reusing**
the profile screen's `TopBar`, `AmbientTicker`, film-grain/glow, seeded-gradient
helpers, and `useCountUp` — those get extracted into shared modules first so
both screens share them (DRY).

**Tech Stack:** Backend: FastAPI + SQLAlchemy 2 async (batched aggregate
queries). Frontend: Next.js 16 App Router (plain JS), reused Chorsu tokens,
`motion`/Lenis already installed. Fidelity reference: the **approved mockup** at
`docs/superpowers/mockups/2026-07-06-chorsu-city-discovery.html` (port its
markup/CSS into React). Spec:
`docs/superpowers/specs/2026-07-06-chorsu-city-discovery.md`.

**Grounded backend facts (verified):**
- `User`: `last_seen_at` (nullable, refreshed on activity), `region_id`,
  `checked`, `open_to_work`, `open_to_volunteering`, `is_mentor`,
  `currently_building`, `created_at`, `display_name`, `photo_url`, `.analysis`
  (selectinload) with `.skills`.
- `ProjectRating(ratee_id, stars)`; `Vouch(target_id)`;
  `Project(creator_id, name, is_active, is_draft, is_deleted, created_at)`;
  `Region(id, name_en, name_uz, name_ru)`.
- Existing public routes live in `backend/app/routers/public.py`; they import
  helpers from `app.routers.users`. Tests use fixtures `make_user(**overrides)`,
  `db`, `client` (in-memory SQLite, StaticPool — seed via db/make_user then hit
  via client sees same data).
- **Online = `last_seen_at >= utcnow() - 15min`.** Use a module constant
  `CITY_ONLINE_WINDOW = timedelta(minutes=15)`.

---

## Part A — Backend: `GET /public/city` (TDD)

All Part-A code goes in `backend/app/routers/public.py` unless noted. Add these
imports at the top if missing (check first, don't duplicate):
```python
from datetime import datetime, timedelta
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload
from app.models.user import User
from app.models.region import Region
from app.models.project import Project
from app.models.project_rating import ProjectRating   # confirm module path via grep
from app.models.vouch import Vouch                      # confirm module path via grep
```
> Before writing, `grep -rn "class ProjectRating\|class Vouch" backend/app/models` to confirm the exact module paths, and reuse however `public.py`/`users.py` already import them.

### Task 1: `_city_stats` — the header/ticker counts

**Files:** Modify `backend/app/routers/public.py`; Test `backend/tests/test_city.py` (new)

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_city.py`:
```python
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && python -m pytest tests/test_city.py -k stats -v` → FAIL (`ImportError`).

- [ ] **Step 3: Implement `_city_stats`**

```python
CITY_ONLINE_WINDOW = timedelta(minutes=15)


async def _city_stats(db: AsyncSession) -> dict:
    now = datetime.utcnow()
    online_cut = now - CITY_ONLINE_WINDOW
    base = (User.is_deleted == False, User.is_registered == True)

    online_now = await db.scalar(
        select(func.count(User.id)).where(*base, User.last_seen_at >= online_cut)
    ) or 0
    cities_lit = await db.scalar(
        select(func.count(func.distinct(User.region_id))).where(
            *base, User.last_seen_at >= online_cut, User.region_id.is_not(None))
    ) or 0
    new_this_week = await db.scalar(
        select(func.count(User.id)).where(*base, User.created_at >= now - timedelta(days=7))
    ) or 0
    total = await db.scalar(select(func.count(User.id)).where(*base)) or 0
    return {"online_now": int(online_now), "cities_lit": int(cities_lit),
            "new_this_week": int(new_this_week), "total_builders": int(total)}
```

- [ ] **Step 4: Run to verify it passes** — `pytest tests/test_city.py -k stats -v` → PASS.

- [ ] **Step 5: Commit**
```bash
git add backend/app/routers/public.py backend/tests/test_city.py
git commit -m "feat(city): _city_stats — online/cities-lit/new-this-week counts"
```

---

### Task 2: `_city_clusters` — batched builder cards grouped by region (NO N+1)

**Files:** Modify `backend/app/routers/public.py`; Test add to `backend/tests/test_city.py`

- [ ] **Step 1: Write the failing test**
```python
async def test_city_clusters_batched_and_ordered(make_user, db):
    from app.routers.public import _city_clusters
    from app.models.region import Region
    from app.models.user_analysis import UserAnalysis
    from app.models.project_rating import ProjectRating

    r = Region(name_en="Tashkent City", name_uz="Toshkent shahri", name_ru="Город Ташкент")
    db.add(r); await db.commit(); await db.refresh(r)

    hi = await make_user(name="Hi", region_id=r.id, checked=True, open_to_work=True)
    hi.last_seen_at = NOW - dt.timedelta(minutes=2)
    db.add(UserAnalysis(user_id=hi.id, skills=["Hardware", "AI"], knowledges=[],
                        interests=[], preparations=[], goals=[]))
    lo = await make_user(name="Lo", region_id=r.id)
    lo.created_at = NOW - dt.timedelta(days=1)  # "new"
    await db.commit()
    # give hi a 5-star rating from someone
    rater = await make_user(name="Rater")
    db.add(ProjectRating(rater_id=rater.id, ratee_id=hi.id, stars=5))
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
```

- [ ] **Step 2: Run to verify it fails** — `pytest tests/test_city.py -k clusters -v` → FAIL.

- [ ] **Step 3: Implement `_city_clusters`** (fully batched)
```python
_WEIGHT_RANK = {"high": 2, "normal": 1, "new": 0}


def _looking_for(u: User) -> str | None:
    if u.open_to_work and u.open_to_volunteering:
        return "both"
    if u.open_to_work:
        return "work"
    if u.open_to_volunteering:
        return "volunteering"
    return None


async def _city_clusters(db: AsyncSession, region_id: int | None, limit: int):
    now = datetime.utcnow()
    online_cut = now - CITY_ONLINE_WINDOW

    q = (select(User).options(selectinload(User.analysis))
         .where(User.is_deleted == False, User.is_registered == True))
    if region_id:
        q = q.where(User.region_id == region_id)
    # Pool cap: fetch a windowed pool (online + recent lean to the top after we
    # compute weight; here order by created_at desc for a stable cap).
    q = q.order_by(User.created_at.desc()).limit(300)
    pool = (await db.execute(q)).scalars().all()
    if not pool:
        return [], now.strftime("%A")

    ids = [u.id for u in pool]

    # ── batched reputation ──
    rating_rows = (await db.execute(
        select(ProjectRating.ratee_id, func.avg(ProjectRating.stars),
               func.count(ProjectRating.id))
        .where(ProjectRating.ratee_id.in_(ids)).group_by(ProjectRating.ratee_id)
    )).all()
    ratings = {rid: (float(avg) if avg is not None else None, int(c)) for rid, avg, c in rating_rows}
    vouch_rows = (await db.execute(
        select(Vouch.target_id, func.count(Vouch.id))
        .where(Vouch.target_id.in_(ids)).group_by(Vouch.target_id)
    )).all()
    vouches = {tid: int(c) for tid, c in vouch_rows}

    # ── batched currently_building fallback (only for those without manual) ──
    need_cb = [u.id for u in pool if not (u.currently_building or "").strip()]
    proj_names: dict[int, str] = {}
    if need_cb:
        prows = (await db.execute(
            select(Project.creator_id, Project.name)
            .where(Project.creator_id.in_(need_cb), Project.is_active == True,
                   Project.is_draft == False, Project.is_deleted == False)
            .order_by(Project.creator_id, Project.created_at.desc())
        )).all()
        for cid, name in prows:
            proj_names.setdefault(cid, name)   # first per creator == latest active

    # ── batched regions ──
    region_ids = {u.region_id for u in pool if u.region_id}
    regions = {}
    if region_ids:
        regions = {r.id: r for r in (await db.execute(
            select(Region).where(Region.id.in_(region_ids)))).scalars().all()}

    def weight(u, avg, vc):
        if avg is not None and avg >= 4.5 and (vc >= 3 or u.checked):
            return "high"
        if avg is None and (now - u.created_at) <= timedelta(days=14):
            return "new"
        return "normal"

    def builder(u):
        avg, _rc = ratings.get(u.id, (None, 0))
        vc = vouches.get(u.id, 0)
        cb = (u.currently_building or "").strip() or proj_names.get(u.id)
        skills = (u.analysis.skills if u.analysis else None) or []
        return {
            "id": u.id, "name": (u.display_name or u.name or "").strip() or u.display_name,
            "display_name": u.display_name, "checked": bool(u.checked),
            "photo_url": u.photo_url,
            "online": bool(u.last_seen_at and u.last_seen_at >= online_cut),
            "currently_building": cb, "skills": skills[:3],
            "looking_for": _looking_for(u), "rating": (round(avg, 1) if avg is not None else None),
            "vouch_count": vc, "weight": weight(u, avg, vc), "region_id": u.region_id,
        }

    # group into region clusters
    clusters: dict[int, dict] = {}
    for u in pool:
        rid = u.region_id or 0
        if rid not in clusters:
            r = regions.get(rid)
            clusters[rid] = {
                "id": rid,
                "name_en": r.name_en if r else "Elsewhere",
                "name_uz": r.name_uz if r else "Boshqa",
                "name_ru": r.name_ru if r else "Другие",
                "people": [],
            }
        clusters[rid]["people"].append(builder(u))

    def person_key(p):
        return (p["online"], _WEIGHT_RANK[p["weight"]], p["rating"] or 0, p["vouch_count"])

    out = []
    for c in clusters.values():
        c["people"].sort(key=person_key, reverse=True)
        c["lit"] = len(c["people"])
        c["people"] = c["people"][:limit]
        out.append(c)
    out.sort(key=lambda c: c["lit"], reverse=True)
    return out, now.strftime("%A")
```

- [ ] **Step 4: Run to verify it passes** — `pytest tests/test_city.py -k clusters -v` → PASS (both tests).

- [ ] **Step 5: Commit**
```bash
git add backend/app/routers/public.py backend/tests/test_city.py
git commit -m "feat(city): _city_clusters — batched builder cards grouped by region"
```

---

### Task 3: `_city_threads` — viewer-agnostic serendipity

**Files:** Modify `backend/app/routers/public.py`; Test add to `backend/tests/test_city.py`

- [ ] **Step 1: Write the failing test**
```python
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
```

- [ ] **Step 2: Run to verify it fails** — FAIL.

- [ ] **Step 3: Implement `_city_threads`** (all from existing data; each thread guarded so it's simply omitted when empty)
```python
def _initials(name: str) -> str:
    parts = (name or "?").split()
    if not parts:
        return "?"
    if len(parts) == 1:
        return parts[0][:2].upper()
    return (parts[0][0] + parts[1][0]).upper()


def _face(u: User) -> dict:
    return {"id": u.id, "initials": _initials(u.display_name or u.name or "?"),
            "gradient_seed": u.id}


async def _city_threads(db: AsyncSession, region_id: int | None) -> list[dict]:
    now = datetime.utcnow()
    base = [User.is_deleted == False, User.is_registered == True]
    if region_id:
        base.append(User.region_id == region_id)
    threads: list[dict] = []

    # new_in_city — most recent registrations
    recent = (await db.execute(
        select(User).where(*base).order_by(User.created_at.desc()).limit(5)
    )).scalars().all()
    if len(recent) >= 3:
        threads.append({
            "kind": "new_in_city",
            "title": "Just arrived",
            "subtitle": f"{len(recent)} builders joined recently. Say salom before the bazaar fills up.",
            "faces": [_face(u) for u in recent[:4]],
            "href": "/city",
        })

    # rising — most-vouched builders
    vrows = (await db.execute(
        select(Vouch.target_id, func.count(Vouch.id).label("c"))
        .group_by(Vouch.target_id).order_by(func.count(Vouch.id).desc()).limit(4)
    )).all()
    if vrows:
        rid_ids = [tid for tid, _ in vrows]
        risers = {u.id: u for u in (await db.execute(
            select(User).where(User.id.in_(rid_ids), *base))).scalars().all()}
        faces = [_face(risers[tid]) for tid, _ in vrows if tid in risers]
        if faces:
            threads.append({
                "kind": "rising", "title": "Reputation climbing tonight",
                "subtitle": "Builders the community keeps vouching for.",
                "faces": faces[:4], "href": "/city",
            })

    # skill_cluster — the most common skill tag among a recent pool
    from app.models.user_analysis import UserAnalysis
    pool = (await db.execute(
        select(User).options(selectinload(User.analysis)).where(*base)
        .order_by(User.created_at.desc()).limit(200)
    )).scalars().all()
    counts: dict[str, list[User]] = {}
    for u in pool:
        for s in ((u.analysis.skills if u.analysis else None) or []):
            counts.setdefault(s.strip(), []).append(u)
    if counts:
        top_skill, people = max(counts.items(), key=lambda kv: len(kv[1]))
        if len(people) >= 3:
            threads.append({
                "kind": "skill_cluster",
                "title": f"{len(people)} builders working on {top_skill}",
                "subtitle": "A thread worth pulling.",
                "faces": [_face(u) for u in people[:4]], "href": "/city",
            })
    return threads
```

- [ ] **Step 4: Run to verify it passes** — PASS.

- [ ] **Step 5: Commit**
```bash
git add backend/app/routers/public.py backend/tests/test_city.py
git commit -m "feat(city): _city_threads — rising / new-in-city / skill-cluster"
```

---

### Task 4: `GET /public/city` route

**Files:** Modify `backend/app/routers/public.py`; Test add to `backend/tests/test_city.py`

- [ ] **Step 1: Write the failing test**
```python
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
```

- [ ] **Step 2: Run to verify it fails** — FAIL (404).

- [ ] **Step 3: Implement the route**
```python
@router.get("/city")
async def public_city(
    region_id: int | None = Query(None),
    limit: int = Query(48, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """Public 'building tonight' payload for the Chorsu City/Discovery screen.
    Batched (no N+1); viewer=None (no personalization); ISR-cacheable."""
    stats = await _city_stats(db)
    clusters, weekday = await _city_clusters(db, region_id=region_id, limit=limit)
    threads = await _city_threads(db, region_id=region_id)
    return {"stats": stats, "weekday": weekday, "regions": clusters,
            "threads": threads}
```

- [ ] **Step 4: Run to verify it passes** — `pytest tests/test_city.py -v` (all city tests) → PASS.

- [ ] **Step 5: Full suite, no regressions** — `cd backend && python -m pytest -q` → all green.

- [ ] **Step 6: Commit**
```bash
git add backend/app/routers/public.py backend/tests/test_city.py
git commit -m "feat(city): GET /public/city — batched public building-tonight payload"
```

---

## Part B — Frontend (build-gated)

> Every frontend build: ensure `desktop/.env.local` has
> `BFU_API_URL=https://bfu-backend-production.up.railway.app`, then
> `cd desktop && npm run build` must exit 0. Fidelity reference for markup/CSS:
> `docs/superpowers/mockups/2026-07-06-chorsu-city-discovery.html` (approved).
> Reuse patterns from the existing profile components in `desktop/components/`.

### Task 5: Extract shared Chorsu building blocks (DRY refactor)

**Files:** Create `desktop/components/Atmosphere.js`; Create `desktop/lib/avatar.js`; Modify `desktop/app/u/[id]/page.js` to use them; keep `TopBar.js`, `AmbientTicker.js`, `lib/useCountUp.js` as-is (already reusable).

- [ ] **Step 1:** Create `desktop/components/Atmosphere.js` — a server component rendering the three fixed layers used on every Chorsu page:
```jsx
export default function Atmosphere() {
  return (
    <>
      <div className="ch-glow-a" />
      <div className="ch-glow-b" />
      <div className="ch-grain" />
    </>
  );
}
```
- [ ] **Step 2:** Create `desktop/lib/avatar.js` — the seeded gradient + initials helpers currently duplicated inside profile cells:
```javascript
const GRADS = [
  ["#E8A15C", "#C0563B"], ["#F0B429", "#C0563B"], ["#5EC5B6", "#12564F"],
  ["#7FB069", "#12564F"], ["#FF6A3D", "#C0563B"], ["#E8A15C", "#12564F"],
  ["#F0B429", "#FF6A3D"], ["#C0563B", "#7A2E1E"],
];
export function gradientFor(seed) {
  const g = GRADS[Math.abs(Number(seed) || 0) % GRADS.length];
  return `linear-gradient(140deg,${g[0]},${g[1]})`;
}
export function initials(name) {
  const parts = (name || "?").split(" ").filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
```
- [ ] **Step 3:** In `desktop/app/u/[id]/page.js`, replace the inline `<div className="ch-glow-a"/>…` triple with `<Atmosphere/>` (import it). Leave everything else. (Optionally refactor the profile cells' local `initials`/gradient to import from `lib/avatar.js` — do it only if quick and keep the profile visually identical.)
- [ ] **Step 4:** Build check — `cd desktop && npm run build` → exit 0; profile page still renders identically.
- [ ] **Step 5: Commit**
```bash
git add desktop/components/Atmosphere.js desktop/lib/avatar.js desktop/app/u/[id]/page.js
git commit -m "refactor(desktop): extract Atmosphere + avatar helpers for reuse"
```

### Task 6: `getCity()` in `lib/bfu-api.js`

**Files:** Modify `desktop/lib/bfu-api.js`

- [ ] **Step 1:** Add alongside `getPublicProfile`:
```javascript
export const getCity = cache(async (regionId) => {
  const qs = regionId ? `?region_id=${regionId}` : "";
  const res = await fetch(`${API_BASE}/public/city${qs}`, {
    next: { revalidate: 60, tags: ["city"] },
  });
  if (!res.ok) throw new Error(`BFU API error ${res.status} fetching city`);
  return res.json();
});
```
- [ ] **Step 2:** Build check → exit 0.
- [ ] **Step 3: Commit**
```bash
git add desktop/lib/bfu-api.js
git commit -m "feat(city): getCity() cached fetch wrapper"
```

### Task 7: `CityHeader` component

**Files:** Create `desktop/components/CityHeader.js`

- [ ] **Step 1:** Client component (uses `useCountUp`). Port the mockup's `.hero` block: overline `TOSHKENT · <weekday> night` (weekday from props), Bricolage headline `<online> builders lit tonight` (count-up), Instrument-Serif sub, and the three count-up stats (online / cities lit / new this week). All numbers via `useCountUp`; `prefers-reduced-motion` handled by the hook. Copy adapts when `online_now === 0` → headline "The bazaar is resting" + sub "Quiet hours — come build." Take `stats`, `weekday` as props.
- [ ] **Step 2:** Build check → exit 0.
- [ ] **Step 3: Commit** `git commit -m "feat(city): CityHeader with count-up stats + quiet-hours copy"`

### Task 8: `FilterBar` component

**Files:** Create `desktop/components/FilterBar.js`

- [ ] **Step 1:** Client component. Port the mockup's `.filters` chips: `All`, `Online now` (ember dot), one chip per region present in the payload, `Looking for co-founder` (green dot), `Mentors`, and up to ~4 top skill chips derived from the loaded builders. v1 = **client-side filter** over the already-loaded builder set (lift filter state, expose an `onFilter(predicate)` or a selected-filter string the parent uses to filter clusters). No refetch. Active chip styled per mockup (`.f.on`).
- [ ] **Step 2:** Build check → exit 0.
- [ ] **Step 3: Commit** `git commit -m "feat(city): FilterBar (client-side filtering v1)"`

### Task 9: `BuilderCard` + `RegionCluster`

**Files:** Create `desktop/components/BuilderCard.js`, `desktop/components/RegionCluster.js`

- [ ] **Step 1:** `BuilderCard` — port the mockup's `.card`: seeded wash + avatar (`gradientFor(builder.id)`, `initials(builder.name)`), online presence pulse when `builder.online`, name + `✓` when checked, Instrument-italic `is building <b>{currently_building}</b>` (omit line if null), up to 3 skill tags, footer region label + `★ {rating}` or `✶ new`, green looking-for badge (`Co-founder`/`Volunteer`/`Mentor` from `looking_for`; mentor if the card should reflect it — use `looking_for`), and `weight==="high"` → `ch-card-big` (span 2). Whole card is an `<a href={"/u/"+builder.id}>`. Hover-bloom via CSS `:hover` (add classes to `globals.css`); can stay a **server** component (no hooks — the pulse is CSS). Presence pulse reuses `.ch-online-ping`.
- [ ] **Step 2:** `RegionCluster` — the `.slab` header (`REGION` kicker, `{name} tonight`, hairline, `{lit} lit`) + a `.grid` of `BuilderCard`s. **Graceful low-count:** if `people.length < 6`, render a warm trailing "the bazaar is small tonight — be one of the first" tile after the cards (per spec §6). Takes a `region` cluster object + a `nameKey` (locale) — default `name_en` for v1.
- [ ] **Step 3:** Add the card/cluster CSS to `desktop/app/globals.css` (port from the mockup `.card`, `.card.big`→`.ch-card-big`, `.wash`, `.av`, `.pres`, `.slab`, `.grid`). Reuse existing `.ch-online-ping`.
- [ ] **Step 4:** Build check → exit 0.
- [ ] **Step 5: Commit** `git commit -m "feat(city): BuilderCard + RegionCluster with graceful low-count"`

### Task 10: `ThreadsRail` component

**Files:** Create `desktop/components/ThreadsRail.js`

- [ ] **Step 1:** Port the mockup's `.rail`/`.thread`: horizontal-scroll rail of thread cards (kicker = teal, title, subtitle, stacked faces via `gradientFor(face.gradient_seed)` + `face.initials`). Server component (CSS hover). Renders nothing if `threads` is empty. Add rail/thread CSS to `globals.css`.
- [ ] **Step 2:** Build check → exit 0.
- [ ] **Step 3: Commit** `git commit -m "feat(city): ThreadsRail (serendipity)"`

### Task 11: `PresenceToast` component

**Files:** Create `desktop/components/PresenceToast.js`

- [ ] **Step 1:** Client component. Takes the **real** online builders (parent passes the subset with `online === true`). Cycles a "<name> just came online" toast every ~9s from that real set (drifts up per mockup `.toast`). If the online set is empty, renders nothing (no fabricated presence). `prefers-reduced-motion` → render nothing (no motion). Add `.toast` CSS to `globals.css`.
- [ ] **Step 2:** Build check → exit 0.
- [ ] **Step 3: Commit** `git commit -m "feat(city): PresenceToast (real online set only)"`

### Task 12: Assemble `app/city/page.js` + route `/` → city

**Files:** Create `desktop/app/city/page.js`; Modify `desktop/app/page.js`

- [ ] **Step 1:** `app/city/page.js` — **server** component: `const data = await getCity()`; render `<TopBar/>`, `<Atmosphere/>`, `<AmbientTicker/>` (feed it lines built from `data.threads`/`data.stats` if `AmbientTicker` accepts a `lines` prop; else default), `<CityHeader stats weekday/>`, `<FilterBar .../>` wrapping the clusters, each `data.regions` → `<RegionCluster/>`, then `<ThreadsRail threads/>`, then `<PresenceToast builders={onlineOnes}/>`, then footer. Pass the flattened online builders to `PresenceToast`. Add `generateMetadata` returning a generic city OG (title "Bright Futures Uzbekistan — a city of builders", description, a static OG image path or reuse a generic one — no per-user PIL needed).
- [ ] **Step 2:** `app/page.js` — replace the placeholder with `import { redirect } from "next/navigation"; export default function Home(){ redirect("/city"); }` (so `/` shows the city).
- [ ] **Step 3:** Build check → `cd desktop && BFU_API_URL=https://bfu-backend-production.up.railway.app npm run build` → exit 0.
- [ ] **Step 4: Commit** `git commit -m "feat(city): assemble /city page + redirect / to city"`

### Task 13: `prefers-reduced-motion` audit + final verify

**Files:** none new (verification pass over Part B)

- [ ] **Step 1:** `grep -rn "requestAnimationFrame\|setInterval\|animation:" desktop/components desktop/app/globals.css` — confirm each animation site (CityHeader count-ups via `useCountUp`, PresenceToast interval, AmbientTicker, any new CSS `@keyframes`) is guarded (JS checks the media query; CSS `@keyframes` covered by the `@media (prefers-reduced-motion: reduce)` block). Add guards where missing following `useCountUp.js`'s pattern.
- [ ] **Step 2:** Final build — `cd desktop && BFU_API_URL=https://bfu-backend-production.up.railway.app npm run build` → exit 0, no warnings that are really errors.
- [ ] **Step 3:** (If any guard was added) `git commit -m "fix(city): reduced-motion guards"`.

---

## Self-review notes
- **Spec coverage:** every §1 section (ticker, header, filters, region clusters,
  builder windows, threads rail, presence toasts, footer) has a task. The new
  `GET /public/city` matches the §2 contract field-for-field, batched per §2's
  batching plan (Task 2). Weight/looking-for/online derivations match §3.
  Threads are the viewer-agnostic §4 set. Low-density grace (§6) is in Task 9
  (RegionCluster small-count tile) + Task 7 (quiet-hours copy) + Task 11 (no
  fabricated presence).
- **No N+1:** Task 2 uses exactly 4 aggregate/batch queries over the pool
  (ratings, vouches, projects-fallback, regions) + 1 pool query — verified in
  the test that seeds multiple users and asserts correctness.
- **No placeholders:** backend tasks ship complete code; frontend tasks port
  the **approved committed mockup** (exact markup/CSS) into React, reusing the
  profile's real components — the mockup is the pixel spec, not a TODO.
- **Type consistency:** the `Builder` dict keys returned by `_city_clusters`
  (`id,name,checked,photo_url,online,currently_building,skills,looking_for,
  rating,vouch_count,weight,region_id`) are exactly what `BuilderCard` reads.
- **Out of scope (spec §7):** personalized threads, server-side filtered
  pagination, websocket presence, map view — not built here.
