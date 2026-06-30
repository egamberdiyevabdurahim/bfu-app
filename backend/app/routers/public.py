"""Unauthenticated landing endpoints — no JWT needed. Used by the public
marketing site at brightfuturesuzbekistan.uz/ and /r/<id>."""
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
from app.database import get_db
from app.models.project import Project
from app.models.region import Region
from app.models.user import User
from app.routers.users import _profile_extras, _trust_extras


# Re-exported from the shared signing module (importable by ORM models too).
from app.services.signing import avatar_sig, card_sig  # noqa: E402,F401

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
    png = render_card_png(
        name=(user.name or "BFU member").capitalize(),
        region=region_name, age=age, gender=user.gender,
        checked=bool(user.checked), tags=tags, photo_bytes=photo_bytes,
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


def _esc(s) -> str:
    """Minimal HTML escaping for text interpolated into the public page.
    Every user-supplied string rendered below (name, about/currently_building,
    vouch text + author name, project names, portfolio labels/urls) MUST pass
    through this before being placed in the HTML — there is no React/JSX
    auto-escaping on this server-rendered page."""
    return (str(s or "")
            .replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            .replace('"', "&quot;").replace("'", "&#39;"))


@router.get("/u/{user_id}", response_class=HTMLResponse)
async def public_profile(user_id: int, db: AsyncSession = Depends(get_db)):
    """Crawlable, login-free profile page for sharing with employers. Reuses the
    Batch-A `_profile_extras` + Batch-B `_trust_extras` builders. No JS.

    Every interpolated value is run through `_esc()` (HTML-escape) since this
    page renders user-supplied strings (name, about/currently_building, vouch
    text, vouch author name, portfolio labels) with no framework escaping.
    Portfolio links are also restricted to http(s):// — enforced upstream by
    `_sanitize_portfolio` (Batch A), re-checked here as defense in depth."""
    user = (await db.execute(
        select(User).options(selectinload(User.analysis))
        .where(User.id == user_id, User.is_deleted == False, User.is_registered == True)
    )).scalar_one_or_none()
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

    canonical = f"{base}/u/{user.id}" if base else f"/u/{user.id}"
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
