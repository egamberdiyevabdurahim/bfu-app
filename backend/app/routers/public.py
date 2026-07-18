"""Unauthenticated landing endpoints — no JWT needed. Used by the public
marketing site at brightfuturesuzbekistan.uz/ and /r/<id>."""
import asyncio
import hmac
import time
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.core.handles import decode_handle
from app.database import get_db
from app.models.event import Event
from app.models.event_rsvp import EventRsvp
from app.models.partner import Partner
from app.models.project import Project
from app.models.region import Region
from app.models.trust import ProjectRating, Vouch
from app.models.user import User
from app.services.presence import ONLINE_WINDOW, is_online
from app.routers.users import (
    _achievements_extras, _collaborators, _connection_extras,
    _profile_extras, _trust_extras,
)


# Re-exported from the shared signing module (importable by ORM models too).
from app.services.signing import avatar_sig, card_sig, og_sig  # noqa: E402,F401

router = APIRouter(prefix="/public", tags=["public"])


@router.get("/events/{event_id}")
async def public_event(event_id: int, response: Response, db: AsyncSession = Depends(get_db)):
    """Unauthenticated event info for the shareable landing page (/e/{id}) — the
    link Marstiff puts on Instagram. Only PUBLIC fields (never registrants/answers).
    Anyone can view; registration itself still happens in the Mini App."""
    e = (await db.execute(select(Event).where(
        Event.id == event_id, Event.is_deleted == False, Event.is_approved == True,
    ))).scalar_one_or_none()
    if not e:
        raise HTTPException(404, "Event not found")
    going = await db.scalar(
        select(func.count(EventRsvp.id)).where(
            EventRsvp.event_id == e.id, EventRsvp.status == "going")
    ) or 0
    seats_left = None if e.capacity is None else max(0, e.capacity - int(going))
    partner_name = None
    if e.partner_id:
        partner_name = await db.scalar(select(Partner.name).where(Partner.id == e.partner_id))
    response.headers["Cache-Control"] = "public, max-age=60, s-maxage=120"
    return {
        "id": e.id, "type": e.type, "title": e.title, "description": e.description,
        "cover_url": e.cover_url, "link": e.link,
        "starts_at": e.starts_at.isoformat() if e.starts_at else None,
        "deadline": e.deadline.isoformat() if e.deadline else None,
        "location": e.location, "lat": e.lat, "lng": e.lng,
        "region_ids": e.region_ids if isinstance(e.region_ids, list) else None,
        "capacity": e.capacity, "going_count": int(going), "seats_left": seats_left,
        "has_form": e.has_form, "partner_name": partner_name,
    }

# Landing counts change slowly but the page fetches them on every anonymous
# visit. A tiny in-process TTL cache means the DB is hit at most once per TTL
# regardless of traffic; Cache-Control lets Vercel/CDN/browser cache too.
_CACHE_TTL = 120  # seconds
_cache: dict[str, tuple[float, object]] = {}


def _cache_get(key: str):
    hit = _cache.get(key)
    if hit and time.monotonic() - hit[0] < _CACHE_TTL:
        return hit[1]
    return None


def _cache_put(key: str, value):
    _cache[key] = (time.monotonic(), value)
    return value


def _set_cache_headers(response: Response):
    response.headers["Cache-Control"] = "public, max-age=120, stale-while-revalidate=600"


# ── Chorsu City / Discovery ("building tonight") ───────────────────────────────
# Online = pinged within the last 5 minutes — the single, real presence window
# shared with per-profile presence (app.services.presence.ONLINE_WINDOW).
CITY_ONLINE_WINDOW = ONLINE_WINDOW


async def _city_stats(db: AsyncSession) -> dict:
    now = datetime.utcnow()
    online_cut = now - CITY_ONLINE_WINDOW
    # role != 'partner' excludes partner ORGS — they are opportunity posters, not
    # builders, so they never appear in (or count toward) City discovery. role is
    # NOT NULL (default 'user'), so this predicate is always well-defined.
    base = (User.is_deleted == False, User.is_registered == True,
            User.role != "partner")

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
         .where(User.is_deleted == False, User.is_registered == True,
                User.role != "partner"))  # partner orgs aren't builders
    if region_id:
        q = q.where(User.region_id == region_id)
    # Pool cap: at scale (>300 builders) the cap must keep the most-recently-
    # ACTIVE users so 'building tonight' can still surface established online
    # accounts. Ordering by created_at would keep only the newest registrations
    # and silently drop online early adopters; order by last_seen_at desc
    # (NULLS LAST) instead, with created_at desc as a stable tiebreaker.
    q = q.order_by(User.last_seen_at.desc().nullslast(),
                   User.created_at.desc()).limit(300)
    pool = (await db.execute(q)).scalars().all()
    if not pool:
        return [], (now + timedelta(hours=5)).strftime("%A")

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
            "online": is_online(u.last_seen_at, now=now),
            "currently_building": cb, "skills": skills[:3],
            "looking_for": _looking_for(u), "mentor": bool(getattr(u, "is_mentor", False)),
            "rating": (round(avg, 1) if avg is not None else None),
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
    # Weekday label for the desktop "Toshkent · {weekday} night" — compute it in
    # Tashkent (UTC+5) so it doesn't name the previous day during 00:00–04:59 local
    # (UTC 19:00–23:59). `now` itself stays naive-UTC for all comparisons above.
    return out, (now + timedelta(hours=5)).strftime("%A")


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
    # role != 'partner' keeps partner orgs out of every thread (new-in-city faces,
    # rising, skill clusters) — same exclusion as the cluster pool + stats.
    base = [User.is_deleted == False, User.is_registered == True,
            User.role != "partner"]
    if region_id:
        base.append(User.region_id == region_id)
    threads: list[dict] = []

    # new_in_city — genuinely-recent registrations. Windowed to the last 14 days
    # so "Just arrived" never surfaces months-old accounts as new simply because
    # they happen to be the newest rows in a quiet community.
    recent = (await db.execute(
        select(User).where(*base, User.created_at >= now - timedelta(days=14))
        .order_by(User.created_at.desc()).limit(5)
    )).scalars().all()
    if len(recent) >= 3:
        threads.append({
            "kind": "new_in_city",
            "title": "Just arrived",
            "subtitle": f"{len(recent)} builders joined recently. Say salom before the bazaar fills up.",
            "faces": [_face(u) for u in recent[:4]],
            "href": "/city",
        })

    # rising — most-vouched builders. The base predicates (region_id,
    # is_deleted, is_registered) must be applied INSIDE the aggregate before the
    # LIMIT, otherwise globally-most-vouched but out-of-region / deleted /
    # unregistered targets would occupy the top-4 slots and then get filtered
    # out, silently starving eligible in-scope builders.
    vrows = (await db.execute(
        select(Vouch.target_id, func.count(Vouch.id).label("c"))
        .join(User, User.id == Vouch.target_id).where(*base)
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
    from app.models.user_analysis import UserAnalysis  # noqa: F401
    pool = (await db.execute(
        select(User).options(selectinload(User.analysis)).where(*base)
        .order_by(User.created_at.desc()).limit(200)
    )).scalars().all()
    counts: dict[str, list[User]] = {}
    for u in pool:
        seen_skills: set[str] = set()
        for s in ((u.analysis.skills if u.analysis else None) or []):
            key = (s or "").strip()
            if not key or key in seen_skills:
                continue  # a user listing the same skill twice counts once
            seen_skills.add(key)
            counts.setdefault(key, []).append(u)
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


def _public_user_brief(u) -> dict | None:
    """Minimal, PII-free public shape for a founder/team member on a project page."""
    if not u:
        return None
    return {
        "id": u.id,
        "name": ((u.name or "").capitalize() or u.display_name),
        "display_name": u.display_name,
        "checked": bool(u.checked),
        "photo_url": u.photo_url,
        "is_online": bool(u.is_online),
    }


@router.get("/project/{project_id}/data")
async def public_project_data(project_id: int, db: AsyncSession = Depends(get_db)):
    """JSON contract for the Chorsu desktop /p/{id} project page. Public (no
    auth); only approved, non-draft, non-deleted projects are visible."""
    from app.models.project import ProjectMember, ProjectReqRegion

    proj = (await db.execute(
        select(Project).options(
            selectinload(Project.creator),
            selectinload(Project.members).selectinload(ProjectMember.user),
            selectinload(Project.req_skills),
            selectinload(Project.req_knowledges),
            selectinload(Project.req_regions).selectinload(ProjectReqRegion.region),
        ).where(
            Project.id == project_id, Project.is_approved == True,
            Project.is_draft == False, Project.is_deleted == False,
        )
    )).scalar_one_or_none()
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")

    # The public roster excludes the founder (shown separately via `founder` /
    # FounderCell). Each entry now carries the teammate's member-role + presence
    # so the Team cell can render the full roster with roles.
    team = [
        {"id": m.user.id, "display_name": m.user.display_name,
         "checked": bool(m.user.checked), "photo_url": m.user.photo_url,
         "is_online": bool(m.user.is_online), "role": m.role}
        for m in proj.members
        if m.user and not m.user.is_deleted and m.user.id != proj.creator_id
    ]
    # The founder's own member-role (the founder is auto-added as a member on
    # create), surfaced so the Team cell can label the founder's row too.
    founder_role = next(
        (m.role for m in proj.members if m.user_id == proj.creator_id), None
    )
    regions = [
        {"id": rr.region.id, "name_en": rr.region.name_en,
         "name_uz": rr.region.name_uz, "name_ru": rr.region.name_ru}
        for rr in proj.req_regions if rr.region
    ]
    base = (settings.WEBAPP_URL or "").rstrip("/")
    return {
        "id": proj.id, "type": proj.type, "name": proj.name, "goal": proj.goal,
        "about": proj.about, "is_active": bool(proj.is_active),
        "is_hiring": bool(proj.is_hiring), "created_at": proj.created_at,
        "view_count": int(proj.view_count or 0),
        "founder": _public_user_brief(proj.creator),
        "founder_role": founder_role,
        "team": team, "team_count": len(team),
        "looking_for": {
            "skills": [s.skill_name for s in proj.req_skills],
            "knowledges": [k.knowledge_name for k in proj.req_knowledges],
            "regions": regions,
        },
        "requirements": {
            "age_from": proj.age_from, "age_to": proj.age_to,
            "gender_req": proj.gender_req,
        },
        "canonical_url": f"{base}/p/{proj.id}" if base else f"/p/{proj.id}",
    }


@router.get("/projects")
async def public_projects(
    type: str | None = Query(None),
    hiring: bool | None = Query(None),
    limit: int = Query(60, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """Public projects-discovery feed for the Chorsu /projects page. Batched
    (no N+1). Only approved, non-draft, non-deleted projects; pinned + hiring
    surface first."""
    from app.models.project import ProjectMember, ProjectReqRegion

    _visible = (Project.is_approved == True, Project.is_draft == False,
                Project.is_deleted == False)
    q = (select(Project).options(
            selectinload(Project.creator),
            selectinload(Project.req_skills),
            selectinload(Project.req_regions).selectinload(ProjectReqRegion.region),
        ).where(*_visible))
    if type:
        q = q.where(Project.type == type)
    if hiring is not None:
        q = q.where(Project.is_hiring == hiring)
    q = q.order_by(Project.is_pinned.desc(), Project.is_hiring.desc(),
                   Project.created_at.desc()).limit(limit)
    pool = (await db.execute(q)).scalars().all()

    # batched team (member) counts
    counts: dict[int, int] = {}
    if pool:
        ids = [p.id for p in pool]
        rows = (await db.execute(
            select(ProjectMember.project_id, func.count(ProjectMember.id))
            .where(ProjectMember.project_id.in_(ids))
            .group_by(ProjectMember.project_id)
        )).all()
        counts = {pid: int(c) for pid, c in rows}

    def card(p):
        region = None
        if p.req_regions and p.req_regions[0].region:
            r = p.req_regions[0].region
            region = {"id": r.id, "name_en": r.name_en, "name_uz": r.name_uz, "name_ru": r.name_ru}
        return {
            "id": p.id, "type": p.type, "name": p.name, "goal": p.goal,
            "is_hiring": bool(p.is_hiring), "is_active": bool(p.is_active),
            "pinned": bool(p.is_pinned), "created_at": p.created_at,
            "view_count": int(p.view_count or 0),
            "founder": _public_user_brief(p.creator),
            "team_count": counts.get(p.id, 0),
            "skills": [s.skill_name for s in p.req_skills][:4],
            "region": region,
        }

    total = await db.scalar(select(func.count(Project.id)).where(*_visible)) or 0
    hiring_c = await db.scalar(select(func.count(Project.id)).where(
        *_visible, Project.is_hiring == True, Project.is_active == True)) or 0
    return {"stats": {"total": int(total), "hiring": int(hiring_c)},
            "projects": [card(p) for p in pool]}


class PublicRegion(BaseModel):
    id: int
    name_en: str
    name_uz: str
    name_ru: str
    member_count: int = 0
    project_count: int = 0
    model_config = {"from_attributes": True}


class PublicProject(BaseModel):
    id: int
    type: str
    name: str
    goal: str | None = None
    created_at: datetime
    model_config = {"from_attributes": True}


class PublicStats(BaseModel):
    members: int
    projects: int
    regions: int
    verified: int


class PublicLeader(BaseModel):
    rank: int
    name: str
    initials: str
    region: str | None = None
    invites: int


@router.get("/stats", response_model=PublicStats)
async def public_stats(response: Response, db: AsyncSession = Depends(get_db)):
    """Site-wide counts shown on the landing hero. Counts only registered,
    non-deleted users; projects must be approved + non-draft to count."""
    _set_cache_headers(response)
    cached = _cache_get("stats")
    if cached is not None:
        return cached
    members = await db.scalar(
        select(func.count(User.id)).where(
            User.is_registered == True, User.is_deleted == False
        )
    ) or 0
    verified = await db.scalar(
        select(func.count(User.id)).where(
            User.is_registered == True, User.is_deleted == False, User.checked == True
        )
    ) or 0
    projects = await db.scalar(
        select(func.count(Project.id)).where(
            Project.is_deleted == False,
            Project.is_approved == True,
            Project.is_draft == False,
        )
    ) or 0
    regions = await db.scalar(
        select(func.count(Region.id)).where(Region.is_deleted == False)
    ) or 0
    return _cache_put("stats", PublicStats(
        members=members, projects=projects, regions=regions, verified=verified))


@router.get("/regions", response_model=list[PublicRegion])
async def list_public_regions(response: Response, db: AsyncSession = Depends(get_db)):
    """Per-region member and project counts for the landing's map + strip.
    Three grouped queries total (was 1 + 2×N)."""
    _set_cache_headers(response)
    cached = _cache_get("regions")
    if cached is not None:
        return cached

    regs = (await db.execute(
        select(Region).where(Region.is_deleted == False).order_by(Region.id)
    )).scalars().all()

    # members per region — one grouped query
    member_rows = (await db.execute(
        select(User.region_id, func.count(User.id))
        .where(User.is_registered == True, User.is_deleted == False,
               User.region_id.is_not(None))
        .group_by(User.region_id)
    )).all()
    members_by_region = {rid: cnt for rid, cnt in member_rows}

    # projects per creator-region — one grouped query
    proj_rows = (await db.execute(
        select(User.region_id, func.count(Project.id))
        .join(Project, Project.creator_id == User.id)
        .where(Project.is_deleted == False, Project.is_approved == True,
               Project.is_draft == False, User.region_id.is_not(None))
        .group_by(User.region_id)
    )).all()
    projects_by_region = {rid: cnt for rid, cnt in proj_rows}

    out = [
        PublicRegion(
            id=r.id, name_en=r.name_en, name_uz=r.name_uz, name_ru=r.name_ru,
            member_count=members_by_region.get(r.id, 0),
            project_count=projects_by_region.get(r.id, 0),
        )
        for r in regs
    ]
    return _cache_put("regions", out)


@router.get("/regions/{region_id}", response_model=dict)
async def region_landing(region_id: int, db: AsyncSession = Depends(get_db)):
    r = await db.get(Region, region_id)
    if not r or r.is_deleted:
        raise HTTPException(404, "Region not found")
    members = await db.scalar(
        select(func.count(User.id)).where(
            User.region_id == region_id, User.is_registered == True, User.is_deleted == False
        )
    ) or 0
    proj_rows = (await db.execute(
        select(Project).where(
            Project.is_deleted == False,
            Project.is_approved == True,
            Project.is_draft == False,
        ).order_by(Project.is_pinned.desc(), Project.created_at.desc()).limit(20)
    )).scalars().all()
    return {
        "id": r.id,
        "name_en": r.name_en, "name_uz": r.name_uz, "name_ru": r.name_ru,
        "member_count": members,
        "projects": [
            {"id": p.id, "type": p.type, "name": p.name, "goal": p.goal,
             "created_at": p.created_at}
            for p in proj_rows
        ],
    }


@router.get("/leaderboard", response_model=list[PublicLeader])
async def public_leaderboard(
    response: Response,
    period: str = Query("week", pattern="^(week|month|all)$"),
    db: AsyncSession = Depends(get_db),
):
    """Top inviters. Public version of /users/leaderboard — privacy-safe:
    shows first-name + initial + region. Used on the landing page."""
    _set_cache_headers(response)
    cached = _cache_get(f"lb:{period}")
    if cached is not None:
        return cached
    now = datetime.utcnow()
    since = None
    if period == "week":
        since = now - timedelta(days=7)
    elif period == "month":
        since = now - timedelta(days=30)

    q = (
        select(User.referred_by, func.count(User.id).label("c"))
        .where(
            User.referred_by.is_not(None),
            User.is_registered == True,
            User.is_deleted == False,
        )
    )
    if since is not None:
        q = q.where(User.created_at >= since)
    rows = (await db.execute(
        q.group_by(User.referred_by).order_by(func.count(User.id).desc()).limit(5)
    )).all()
    if not rows:
        return []

    ids = [r[0] for r in rows]
    users = (await db.execute(
        select(User).where(User.id.in_(ids))
    )).scalars().all()
    by_id = {u.id: u for u in users}

    region_names: dict[int, str] = {}
    region_ids = {u.region_id for u in users if u.region_id}
    if region_ids:
        regs = (await db.execute(
            select(Region).where(Region.id.in_(region_ids))
        )).scalars().all()
        region_names = {r.id: r.name_uz for r in regs}

    out: list[PublicLeader] = []
    for i, (rid, count) in enumerate(rows):
        u = by_id.get(rid)
        if not u:
            continue
        first = (u.name or "").strip().capitalize() or "Member"
        last = (u.surname or "").strip()
        last_initial = (last[0].upper() + ".") if last else ""
        display = f"{first} {last_initial}".strip()
        initials = (first[0] if first else "?") + (last[0] if last else "")
        out.append(PublicLeader(
            rank=i + 1,
            name=display,
            initials=initials.upper()[:2],
            region=region_names.get(u.region_id) if u.region_id else None,
            invites=int(count),
        ))
    return _cache_put(f"lb:{period}", out)


@router.get("/card.png")
async def profile_card(
    u: int = Query(..., description="user id"),
    sig: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Render a user's shareable BFU Story card as PNG. Public (Telegram
    fetches it for shareToStory) but signed so it can't be enumerated."""
    if not hmac.compare_digest(sig, card_sig(u)):
        raise HTTPException(status_code=403, detail="Bad signature")
    user = (await db.execute(
        select(User).options(selectinload(User.analysis))
        .where(User.id == u, User.is_deleted == False, User.is_registered == True)
    )).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    region_name = None
    if user.region_id:
        r = await db.get(Region, user.region_id)
        region_name = r.name_uz if r else None
    age = (datetime.utcnow().year - user.birth_year) if user.birth_year else None

    tags: list[str] = []
    if user.analysis:
        seen = set()
        for cat in ("skills", "interests", "preparations", "goals"):
            for tg in (getattr(user.analysis, cat, None) or []):
                k = tg.lower()
                if k not in seen:
                    seen.add(k); tags.append(tg)

    from app.services.card import render_card_png
    photo_bytes = None
    if user.photo_file_id:
        from app.services.telegram_media import download_photo
        photo_bytes = await download_photo(user.photo_file_id)
    # Heavy synchronous PIL render (~1s) — run OFF the event loop so it can't
    # freeze the single-process API during a share/unfurl burst.
    png = await asyncio.to_thread(
        render_card_png,
        name=(user.name or "BFU member").capitalize(),
        region=region_name, age=age, gender=user.gender,
        checked=bool(user.checked), tags=tags, photo_bytes=photo_bytes,
    )
    return Response(content=png, media_type="image/png",
                    headers={"Cache-Control": "public, max-age=600"})


@router.get("/og/{user_id}.png")
async def og_image(
    user_id: int,
    sig: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Signed 1200x630 Open Graph share image for /u/{id} (Chorsu palette).
    Public but enumeration-resistant, same pattern as /card.png and /avatar."""
    if not hmac.compare_digest(sig, og_sig(user_id)):
        raise HTTPException(status_code=403, detail="Bad signature")
    user = (await db.execute(
        select(User).options(selectinload(User.analysis))
        .where(User.id == user_id, User.is_deleted == False, User.is_registered == True)
    )).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    extras = await _profile_extras(db, user)
    trust = await _trust_extras(db, user, None)

    # Best-effort photo fetch: this endpoint is hit by social/link crawlers, so
    # a transient Telegram media failure must degrade to the initials render
    # (render_og_png handles photo_bytes=None) rather than 500 the share preview.
    photo_bytes = None
    if user.photo_file_id:
        from app.services.telegram_media import download_photo
        try:
            photo_bytes = await download_photo(user.photo_file_id)
        except Exception:
            photo_bytes = None

    from app.services.card import render_og_png
    # Off the event loop: crawlers unfurl these on every shared /u/{id} link.
    png = await asyncio.to_thread(
        render_og_png,
        name=(user.name or "BFU member").capitalize(),
        currently_building=extras.get("currently_building"),
        rating_average=trust["rating"]["average"],
        vouch_count=trust["vouch_count"],
        checked=bool(user.checked),
        photo_bytes=photo_bytes,
    )
    return Response(content=png, media_type="image/png",
                    headers={"Cache-Control": "public, max-age=600"})


@router.get("/avatar")
async def profile_avatar(
    u: int = Query(..., description="user id"),
    sig: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Stream a user's Telegram profile photo (signed, cached). 404 if none —
    the frontend falls back to initials on error."""
    if not hmac.compare_digest(sig, avatar_sig(u)):
        raise HTTPException(status_code=403, detail="Bad signature")
    user = await db.get(User, u)
    if not user or user.is_deleted or not user.photo_file_id:
        raise HTTPException(status_code=404, detail="No photo")
    from app.services.telegram_media import download_photo
    blob = await download_photo(user.photo_file_id)
    if not blob:
        raise HTTPException(status_code=404, detail="No photo")
    return Response(content=blob, media_type="image/jpeg",
                    headers={"Cache-Control": "public, max-age=86400"})


async def _resolve_public_user(db: AsyncSession, ident: str):
    """Resolve a profile handle → a public User (or None). Accepts @username, an
    opaque code, or a legacy numeric id. Username wins (a real record), then the
    opaque code, then a bare numeric id (backward compat with old /u/123 links)."""
    ident = (ident or "").lstrip("@").strip()
    if not ident:
        return None
    base = (User.is_deleted == False, User.is_registered == True)  # noqa: E712

    async def _by(cond):
        return (await db.execute(
            select(User).options(selectinload(User.analysis)).where(cond, *base)
        )).scalar_one_or_none()

    u = await _by(func.lower(User.tg_username) == ident.lower())
    if u:
        return u
    uid = decode_handle(ident)
    if uid is None and ident.isdigit():
        uid = int(ident)
    if uid is None:
        return None
    return await _by(User.id == uid)


@router.get("/u/{ident}/data")
async def public_profile_data(ident: str, db: AsyncSession = Depends(get_db)):
    """JSON contract for the desktop /u/{handle} page. `ident` is a @username,
    opaque code, or legacy numeric id (see _resolve_public_user). Anonymous-viewer
    semantics (viewer=None) — no personalization, no auth."""
    user = await _resolve_public_user(db, ident)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    extras = await _profile_extras(db, user)
    trust = await _trust_extras(db, user, None)
    conn = await _connection_extras(db, user, None)
    collab = await _collaborators(db, user)
    ach = await _achievements_extras(db, user)

    region = None
    if user.region_id:
        r = await db.get(Region, user.region_id)
        if r:
            region = {"id": r.id, "name_en": r.name_en, "name_uz": r.name_uz, "name_ru": r.name_ru}

    age = (datetime.utcnow().year - user.birth_year) if user.birth_year else None
    name = ((user.name or "").capitalize() + ((" " + user.surname.capitalize()) if user.surname else "")).strip()
    name = name or user.display_name

    # Interim "looking for" signal (see plan's scope-decision #1) — derived
    # from the existing open_to_work/open_to_volunteering booleans, not a
    # new column.
    looking_for = None
    if user.open_to_work and user.open_to_volunteering:
        looking_for = "both"
    elif user.open_to_work:
        looking_for = "work"
    elif user.open_to_volunteering:
        looking_for = "volunteering"

    base = (settings.WEBAPP_URL or "").rstrip("/")
    api_base = (settings.api_base_url or "").rstrip("/")
    bot = settings.BOT_USERNAME

    return {
        "id": user.id,
        "name": name,
        "display_name": user.display_name,
        "checked": bool(user.checked),
        "badges": user.badges,
        "photo_url": user.photo_url,
        # Real presence — drives IdentityStrip's live dot (never hardcoded).
        "is_online": is_online(user.last_seen_at),
        "last_seen": user.last_seen_at,
        "age": age,
        "gender": user.gender,
        "region": region,
        "about": user.about,
        "currently_building": extras["currently_building"],
        "currently_building_source": extras["currently_building_source"],
        "open_to_work": bool(user.open_to_work),
        "open_to_volunteering": bool(user.open_to_volunteering),
        "looking_for": looking_for,
        "skills": (user.analysis.skills if user.analysis else None) or [],
        "portfolio_links": extras["portfolio_links"],
        "founded_projects": extras["founded_projects"],
        "member_projects": extras["member_projects"],
        "stats": extras["stats"],
        "endorsements": trust["endorsements"],
        "vouches": trust["vouches"],
        "vouch_count": trust["vouch_count"],
        "rating": trust["rating"],
        "mutual_connections": trust["mutual_connections"],
        "collaborators": collab,
        "follower_count": conn["follower_count"],
        "following_count": conn["following_count"],
        "mentor": conn["mentor"],
        "achievements": ach["achievements"],
        "handle": user.handle,  # clean URL segment (@username or opaque code)
        "og_image_url": f"{api_base}/public/og/{user.id}.png?sig={og_sig(user.id)}",
        "telegram_open_url": f"https://t.me/{bot}?startapp=user_{user.id}",
        "canonical_url": f"{base}/u/{user.handle}" if base else f"/u/{user.handle}",
    }


def _esc(s) -> str:
    """Minimal HTML escaping for text interpolated into the public page.
    Every user-supplied string rendered below (name, about/currently_building,
    vouch text + author name, project names, portfolio labels/urls) MUST pass
    through this before being placed in the HTML — there is no React/JSX
    auto-escaping on this server-rendered page."""
    return (str(s or "")
            .replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            .replace('"', "&quot;").replace("'", "&#39;"))


@router.get("/u/{ident}", response_class=HTMLResponse)
async def public_profile(ident: str, db: AsyncSession = Depends(get_db)):
    """Crawlable, login-free profile page for sharing with employers. Reuses the
    Batch-A `_profile_extras` + Batch-B `_trust_extras` builders. No JS.

    Every interpolated value is run through `_esc()` (HTML-escape) since this
    page renders user-supplied strings (name, about/currently_building, vouch
    text, vouch author name, portfolio labels) with no framework escaping.
    Portfolio links are also restricted to http(s):// — enforced upstream by
    `_sanitize_portfolio` (Batch A), re-checked here as defense in depth."""
    user = await _resolve_public_user(db, ident)
    if not user:
        return HTMLResponse(
            content="<!doctype html><html><head><meta charset='utf-8'>"
                    "<title>Profile not found — BFU</title></head>"
                    "<body style='font-family:system-ui;background:#0A0A0F;color:#F0F0FF;"
                    "display:flex;min-height:100vh;align-items:center;justify-content:center'>"
                    "<div style='text-align:center'><h1>404</h1>"
                    "<p>This BFU profile doesn't exist.</p></div></body></html>",
            status_code=404,
        )

    extras = await _profile_extras(db, user)
    trust = await _trust_extras(db, user, None)

    region_name = None
    if user.region_id:
        r = await db.get(Region, user.region_id)
        region_name = (r.name_uz if r else None)
    age = (datetime.utcnow().year - user.birth_year) if user.birth_year else None
    name = _esc((user.name or "").capitalize() + ((" " + user.surname.capitalize()) if user.surname else ""))
    name = name.strip() or _esc(user.display_name)
    cb = extras.get("currently_building")
    skills = (user.analysis.skills if user.analysis else None) or []
    endo = {e["skill"]: e["count"] for e in trust["endorsements"]}
    rating = trust["rating"]
    stats = extras["stats"]
    bot = settings.BOT_USERNAME
    base = (settings.WEBAPP_URL or "").rstrip("/")
    open_url = f"https://t.me/{bot}?startapp=user_{user.id}" if bot else "#"
    desc = _esc((cb or user.about or "BFU member")[:160])

    def chip(label, count):
        badge = f" <b>{count}</b>" if count else ""
        return (f"<span style='display:inline-block;background:rgba(123,111,255,0.15);"
                f"color:#7B6FFF;border-radius:99px;padding:4px 10px;margin:0 6px 6px 0;"
                f"font-size:13px'>{_esc(label)}{badge}</span>")

    skills_html = "".join(chip(s, endo.get(s, 0)) for s in skills) or "<span style='color:#9090A8'>—</span>"

    def proj_li(p):
        status = "Active" if p["is_active"] else "Closed"
        return (f"<li style='margin-bottom:6px'>{_esc(p['name'])} "
                f"<span style='color:#9090A8;font-size:12px'>· {status}</span></li>")

    founded_html = "".join(proj_li(p) for p in extras["founded_projects"]) or "<li style='color:#9090A8'>—</li>"
    member_html = "".join(proj_li(p) for p in extras["member_projects"]) or "<li style='color:#9090A8'>—</li>"

    vouches_html = "".join(
        f"<blockquote style='margin:0 0 10px;padding:10px 14px;background:#16161F;"
        f"border-left:3px solid #7B6FFF;border-radius:8px'>“{_esc(v['text'])}” "
        f"<span style='color:#9090A8;font-size:12px'>— {_esc((v.get('author') or {}).get('display_name',''))}</span>"
        f"</blockquote>"
        for v in trust["vouches"]
    ) or "<p style='color:#9090A8'>No vouches yet.</p>"

    # Defense in depth: only ever render http(s):// portfolio links, even
    # though `_sanitize_portfolio` (Batch A) already enforces this upstream.
    links_html = "".join(
        f"<a href='{_esc(l['url'])}' rel='nofollow noopener' style='color:#7B6FFF;margin-right:12px'>{_esc(l['label'])}</a>"
        for l in extras["portfolio_links"]
        if str(l.get("url", "")).startswith(("http://", "https://"))
    )

    rating_html = (f"★ {rating['average']} <span style='color:#9090A8'>({rating['count']})</span>"
                   if rating["average"] is not None else "<span style='color:#9090A8'>No ratings yet</span>")

    meta = []
    if age:
        meta.append(f"{age} y/o")
    if region_name:
        meta.append(_esc(region_name))
    if user.checked:
        meta.append("✓ Verified")
    meta_html = " · ".join(meta)

    canonical = f"{base}/u/{user.handle}" if base else f"/u/{user.handle}"
    jsonld = (
        '{"@context":"https://schema.org","@type":"Person",'
        f'"name":"{name}","description":"{desc}","url":"{_esc(canonical)}"}}'
    )

    html = f"""<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{name} — BFU</title>
<meta name="description" content="{desc}">
<link rel="canonical" href="{_esc(canonical)}">
<meta property="og:type" content="profile">
<meta property="og:title" content="{name} — BFU">
<meta property="og:description" content="{desc}">
<meta property="og:url" content="{_esc(canonical)}">
<meta name="robots" content="index, follow">
<script type="application/ld+json">{jsonld}</script>
</head>
<body style="margin:0;font-family:system-ui,-apple-system,sans-serif;background:#0A0A0F;color:#F0F0FF">
<div style="max-width:640px;margin:0 auto;padding:32px 20px">
  <header style="display:flex;gap:16px;align-items:center;margin-bottom:8px">
    <div>
      <h1 style="margin:0;font-size:26px">{name}</h1>
      <div style="color:#9090A8;font-size:14px;margin-top:4px">{meta_html}</div>
    </div>
  </header>
  {"<p style='font-size:16px;color:#C8C8E0'>🔨 " + _esc(cb) + "</p>" if cb else ""}
  <div style="margin:16px 0;font-size:18px">{rating_html}</div>
  <div style="display:flex;gap:10px;margin:16px 0">
    <div style="flex:1;text-align:center;background:#16161F;border-radius:10px;padding:12px">
      <div style="font-size:22px;font-weight:800">{stats['projects_founded']}</div>
      <div style="font-size:11px;color:#9090A8;text-transform:uppercase">Founded</div></div>
    <div style="flex:1;text-align:center;background:#16161F;border-radius:10px;padding:12px">
      <div style="font-size:22px;font-weight:800">{stats['projects_joined']}</div>
      <div style="font-size:11px;color:#9090A8;text-transform:uppercase">Joined</div></div>
    <div style="flex:1;text-align:center;background:#16161F;border-radius:10px;padding:12px">
      <div style="font-size:22px;font-weight:800">{stats['applications_accepted']}</div>
      <div style="font-size:11px;color:#9090A8;text-transform:uppercase">Accepted</div></div>
  </div>
  <section style="margin:24px 0"><h2 style="font-size:14px;text-transform:uppercase;color:#9090A8">Skills</h2>{skills_html}</section>
  <section style="margin:24px 0"><h2 style="font-size:14px;text-transform:uppercase;color:#9090A8">Founded</h2><ul style="padding-left:18px">{founded_html}</ul></section>
  <section style="margin:24px 0"><h2 style="font-size:14px;text-transform:uppercase;color:#9090A8">Member of</h2><ul style="padding-left:18px">{member_html}</ul></section>
  <section style="margin:24px 0"><h2 style="font-size:14px;text-transform:uppercase;color:#9090A8">Vouches</h2>{vouches_html}</section>
  {"<section style='margin:24px 0'><h2 style='font-size:14px;text-transform:uppercase;color:#9090A8'>Links</h2>" + links_html + "</section>" if links_html else ""}
  <a href="{_esc(open_url)}" style="display:inline-block;margin-top:16px;background:#7B6FFF;color:#fff;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:700">Open in Telegram</a>
  <footer style="margin-top:40px;color:#9090A8;font-size:12px">Bright Futures Uzbekistan</footer>
</div>
</body></html>"""
    return HTMLResponse(content=html, status_code=200,
                        headers={"Cache-Control": "public, max-age=300"})
