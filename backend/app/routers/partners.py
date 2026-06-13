"""Partner organisations — public directory + profile, and the owner's
opportunity-submission flow (submissions go to the admin approval queue)."""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.database import get_db
from app.models.event import Event
from app.models.partner import Partner
from app.models.user import User

router = APIRouter(prefix="/partners", tags=["partners"])


def _partner_dict(p: Partner) -> dict:
    return {"id": p.id, "name": p.name, "about": p.about, "website": p.website,
            "logo_url": p.logo_url, "region_id": p.region_id, "verified": p.verified}


@router.get("", response_model=list[dict])
async def list_partners(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(
        select(Partner).where(Partner.is_deleted == False, Partner.verified == True)
        .order_by(Partner.name.asc())
    )).scalars().all()
    return [_partner_dict(p) for p in rows]


@router.get("/mine", response_model=dict)
async def my_partner(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """The org the current user manages (or null) — drives the in-app
    'post opportunity' affordance."""
    p = (await db.execute(
        select(Partner).where(Partner.owner_user_id == current_user.id,
                              Partner.is_deleted == False)
    )).scalar_one_or_none()
    return {"partner": _partner_dict(p) if p else None}


class OpportunityIn(BaseModel):
    type: str  # hackathon | grant | scholarship | meetup | other
    title: str
    description: str | None = None
    link: str | None = None
    deadline: datetime | None = None
    region_id: int | None = None


@router.post("/mine/opportunity", response_model=dict)
async def submit_opportunity(
    body: OpportunityIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """A partner owner submits an opportunity → pending admin approval."""
    p = (await db.execute(
        select(Partner).where(Partner.owner_user_id == current_user.id,
                              Partner.is_deleted == False)
    )).scalar_one_or_none()
    if not p:
        raise HTTPException(403, "You don't manage a partner org")
    if not (body.title or "").strip():
        raise HTTPException(400, "Title required")
    e = Event(
        type=body.type, title=body.title.strip(), description=body.description,
        link=body.link, deadline=body.deadline, region_id=body.region_id,
        created_by=current_user.id, partner_id=p.id, is_approved=False,
    )
    db.add(e)
    await db.commit()
    return {"ok": True, "pending": True}


@router.get("/{partner_id}", response_model=dict)
async def partner_profile(
    partner_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    p = await db.get(Partner, partner_id)
    if not p or p.is_deleted or not p.verified:
        raise HTTPException(404, "Partner not found")
    evs = (await db.execute(
        select(Event).where(
            Event.partner_id == partner_id, Event.is_deleted == False,
            Event.is_approved == True,
        ).order_by(Event.created_at.desc()).limit(30)
    )).scalars().all()
    return {
        **_partner_dict(p),
        "events": [
            {"id": e.id, "type": e.type, "title": e.title, "description": e.description,
             "link": e.link, "deadline": e.deadline.isoformat() if e.deadline else None}
            for e in evs
        ],
    }
