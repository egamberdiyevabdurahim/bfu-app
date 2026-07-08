"""Global search across people, projects, and events.

Powers the desktop ⌘K command palette (``people`` + ``projects``) and the
Telegram Mini App search modal (``users`` + ``events``). Auth-gated like every
other member-facing endpoint.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.database import get_db
from app.models.event import Event
from app.models.project import Project
from app.models.region import Region
from app.models.user import User
from app.schemas.search import SearchResults

router = APIRouter(prefix="/search", tags=["search"])


@router.get("", response_model=SearchResults)
async def search(
    q: str = Query("", max_length=80),
    limit: int = Query(8, ge=1, le=25),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Fast keyword search across people + projects (+ events for the mini app).

    Case-insensitive (ILIKE on Postgres; ``lower() LIKE lower()`` on the SQLite
    test dialect). Each group is capped at ``limit`` (default 8). An empty /
    whitespace-only ``q`` short-circuits to empty results so a blank palette
    never triggers a full-table scan.
    """
    term = (q or "").strip()
    if not term:
        return SearchResults()

    like = f"%{term}%"
    lang = current_user.language or "en"

    # ── People — exclude self, banned, soft-deleted, and unregistered. Same
    #    visibility filters the rest of the app uses for member listings. ──
    users = (await db.execute(
        select(User).where(
            User.is_deleted == False, User.is_registered == True,
            User.banned == False, User.id != current_user.id,
            or_(
                User.name.ilike(like),
                User.surname.ilike(like),
                User.tg_username.ilike(like),
            ),
        ).order_by(User.id.desc()).limit(limit)
    )).scalars().all()

    # Resolve region names in ONE extra query (async lazy-loading the
    # `user.region` relationship per row would N+1 / raise).
    region_ids = {u.region_id for u in users if u.region_id}
    region_names: dict[int, str] = {}
    if region_ids:
        for r in (await db.execute(
            select(Region).where(Region.id.in_(region_ids))
        )).scalars().all():
            region_names[r.id] = r.get_name(lang)

    people = [
        {
            "id": u.id,
            "name": u.name,
            "display_name": u.display_name,
            "photo_url": u.photo_url,
            "region": region_names.get(u.region_id),
            "region_id": u.region_id,
            "is_online": u.is_online,
            "checked": u.checked,
        }
        for u in users
    ]

    # ── Projects — only approved, non-draft, non-deleted (public feed rules). ──
    projects = (await db.execute(
        select(Project).where(
            Project.is_deleted == False,
            Project.is_approved == True,
            Project.is_draft == False,
            or_(Project.name.ilike(like), Project.goal.ilike(like)),
        ).order_by(Project.is_pinned.desc(), Project.created_at.desc()).limit(limit)
    )).scalars().all()
    projects_out = [
        {
            "id": p.id,
            "name": p.name,
            "goal": p.goal or (p.about[:120] if p.about else None),
            "type": p.type,
            "is_hiring": bool(p.is_hiring),
        }
        for p in projects
    ]

    # ── Events — kept for the Telegram Mini App's search modal (res.events). ──
    events = (await db.execute(
        select(Event).where(
            Event.is_deleted == False,
            or_(Event.title.ilike(like), Event.description.ilike(like)),
        ).order_by(Event.created_at.desc()).limit(limit)
    )).scalars().all()
    events_out = [
        {
            "id": e.id,
            "title": e.title,
            "type": e.type,
            "deadline": e.deadline.isoformat() if e.deadline else None,
        }
        for e in events
    ]

    return {
        "people": people,
        "users": people,      # alias — the mini app reads res.users
        "projects": projects_out,
        "events": events_out,
    }
