from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.database import get_db
from app.models.event import Event
from app.models.user import User

router = APIRouter(prefix="/events", tags=["events"])


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
