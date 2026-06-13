"""Unauthenticated landing endpoints — no JWT needed. Used by the public
marketing site at brightfuturesuzbekistan.uz/ and /r/<id>."""
import time
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.project import Project
from app.models.region import Region
from app.models.user import User

router = APIRouter(prefix="/public", tags=["public"])

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
