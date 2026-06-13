"""Global search across people, projects, and events."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.database import get_db
from app.models.event import Event
from app.models.project import Project
from app.models.user import User

router = APIRouter(prefix="/search", tags=["search"])


def func_lower(col):
    return func.lower(col)


@router.get("", response_model=dict)
async def search(
    q: str = Query(..., min_length=2, max_length=80),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Lightweight keyword search. Returns up to a handful of each entity."""
    like = f"%{q.strip().lower()}%"

    users = (await db.execute(
        select(User).where(
            User.is_deleted == False, User.is_registered == True,
            User.id != current_user.id,
            or_(func_lower(User.name).like(like),
                func_lower(User.surname).like(like),
                func_lower(User.tg_username).like(like)),
        ).limit(10)
    )).scalars().all()

    projects = (await db.execute(
        select(Project).where(
            Project.is_deleted == False, Project.is_approved == True, Project.is_draft == False,
            or_(func_lower(Project.name).like(like), func_lower(Project.goal).like(like)),
        ).order_by(Project.is_pinned.desc(), Project.created_at.desc()).limit(10)
    )).scalars().all()

    events = (await db.execute(
        select(Event).where(
            Event.is_deleted == False,
            or_(func_lower(Event.title).like(like), func_lower(Event.description).like(like)),
        ).order_by(Event.created_at.desc()).limit(10)
    )).scalars().all()

    return {
        "users": [
            {"id": u.id, "display_name": u.display_name, "photo_url": u.photo_url,
             "region_id": u.region_id, "checked": u.checked}
            for u in users
        ],
        "projects": [
            {"id": p.id, "name": p.name, "goal": p.goal or (p.about[:120] if p.about else None),
             "type": p.type}
            for p in projects
        ],
        "events": [
            {"id": e.id, "title": e.title, "type": e.type,
             "deadline": e.deadline.isoformat() if e.deadline else None}
            for e in events
        ],
    }
