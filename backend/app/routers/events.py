from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import get_current_user
from app.database import get_db
from app.models.event import Event
from app.models.user import User

router = APIRouter(prefix="/events", tags=["events"])

_CATS = ("skills", "knowledges", "interests", "preparations", "goals")


def _user_tags(analysis) -> list[str]:
    out: list[str] = []
    if analysis:
        for c in _CATS:
            out.extend(t for t in (getattr(analysis, c, None) or []))
    return out


class EventOut(BaseModel):
    id: int
    type: str
    title: str
    description: str | None = None
    link: str | None = None
    cover_url: str | None = None
    deadline: datetime | None = None
    region_id: int | None = None
    created_at: datetime
    model_config = {"from_attributes": True}


@router.get("", response_model=list[EventOut])
async def list_events(
    type: str | None = None,
    region_id: int | None = None,
    near: bool | None = None,
    me: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(Event).where(Event.is_deleted == False)
    if type:
        q = q.where(Event.type == type)
    # near=true → user's region OR region-agnostic events.
    eff_region = region_id or (me.region_id if near else None)
    if eff_region:
        q = q.where((Event.region_id == eff_region) | (Event.region_id.is_(None)))
    # Upcoming first (deadlines in the future), then most recently added.
    q = q.order_by(Event.deadline.asc().nullslast(), Event.created_at.desc()).limit(100)
    res = await db.execute(q)
    return res.scalars().all()


@router.get("/for-me", response_model=list[dict])
async def opportunities_for_me(
    limit: int = 20,
    me: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Opportunity Radar: upcoming events ranked by relevance to the user —
    region match + keyword overlap with their AI tags. Returns each event plus
    the `matched` tags + `score` so the UI can show *why* it's relevant."""
    me_full = (await db.execute(
        select(User).options(selectinload(User.analysis)).where(User.id == me.id)
    )).scalar_one()
    tags = [t for t in _user_tags(me_full.analysis) if t]
    now = datetime.utcnow()

    events = (await db.execute(
        select(Event).where(
            Event.is_deleted == False,
            (Event.deadline.is_(None)) | (Event.deadline >= now),
        ).order_by(Event.deadline.asc().nullslast(), Event.created_at.desc()).limit(100)
    )).scalars().all()

    scored = []
    for e in events:
        hay = f"{e.title or ''} {e.description or ''}".lower()
        matched = [t for t in tags if t.lower() in hay]
        score = len(matched) * 2
        if e.region_id and me_full.region_id and e.region_id == me_full.region_id:
            score += 3
        # Mild recency/urgency nudge so a fresh, deadline-soon event ranks up.
        if e.deadline:
            score += 1
        scored.append((score, e, matched))

    scored.sort(key=lambda x: (x[0], x[1].created_at), reverse=True)
    out = []
    for score, e, matched in scored[:limit]:
        out.append({
            "id": e.id, "type": e.type, "title": e.title, "description": e.description,
            "link": e.link, "cover_url": e.cover_url,
            "deadline": e.deadline.isoformat() if e.deadline else None,
            "region_id": e.region_id,
            "matched": matched[:5], "score": score,
        })
    return out
