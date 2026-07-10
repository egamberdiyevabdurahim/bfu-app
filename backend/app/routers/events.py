from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from sqlalchemy.exc import IntegrityError

from app.config import settings
from app.core.deps import get_current_user
from app.database import get_db
from app.models.event import Event
from app.models.event_rsvp import EventRsvp
from app.models.user import User
from app.services.notifications import add_notification, should_push_telegram
from app.services.notify import esc, notify_background
from app.services.ratelimit import rate_limit

router = APIRouter(prefix="/events", tags=["events"])


async def _going_count(db: AsyncSession, event_id: int) -> int:
    return (await db.execute(
        select(func.count()).where(
            EventRsvp.event_id == event_id, EventRsvp.status == "going",
        )
    )).scalar_one()

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
    rsvp_count: int = 0          # number of "going" RSVPs
    my_rsvp: str | None = None   # this user's status ("going"/"interested") or None
    model_config = {"from_attributes": True}


async def _attach_rsvp(db: AsyncSession, rows: list[Event], me_id: int) -> None:
    """Batch-annotate ORM Event rows with rsvp_count + my_rsvp in O(2) queries
    (pydantic from_attributes reads the attributes we set on the instances)."""
    ids = [e.id for e in rows]
    if not ids:
        return
    counts = dict((await db.execute(
        select(EventRsvp.event_id, func.count())
        .where(EventRsvp.event_id.in_(ids), EventRsvp.status == "going")
        .group_by(EventRsvp.event_id)
    )).all())
    mine = dict((await db.execute(
        select(EventRsvp.event_id, EventRsvp.status)
        .where(EventRsvp.user_id == me_id, EventRsvp.event_id.in_(ids))
    )).all())
    for e in rows:
        e.rsvp_count = counts.get(e.id, 0)
        e.my_rsvp = mine.get(e.id)


@router.get("", response_model=list[EventOut])
async def list_events(
    type: str | None = None,
    region_id: int | None = None,
    near: bool | None = None,
    me: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(Event).where(Event.is_deleted == False, Event.is_approved == True)
    if type:
        q = q.where(Event.type == type)
    # near=true → user's region OR region-agnostic events.
    eff_region = region_id or (me.region_id if near else None)
    if eff_region:
        q = q.where((Event.region_id == eff_region) | (Event.region_id.is_(None)))
    # Upcoming first (deadlines in the future), then most recently added.
    q = q.order_by(Event.deadline.asc().nullslast(), Event.created_at.desc()).limit(100)
    res = await db.execute(q)
    rows = res.scalars().all()
    await _attach_rsvp(db, rows, me.id)
    return rows


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
            Event.is_deleted == False, Event.is_approved == True,
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
    top = scored[:limit]
    top_ids = [e.id for _, e, _ in top]
    counts, mine = {}, {}
    if top_ids:
        counts = dict((await db.execute(
            select(EventRsvp.event_id, func.count())
            .where(EventRsvp.event_id.in_(top_ids), EventRsvp.status == "going")
            .group_by(EventRsvp.event_id)
        )).all())
        mine = dict((await db.execute(
            select(EventRsvp.event_id, EventRsvp.status)
            .where(EventRsvp.user_id == me.id, EventRsvp.event_id.in_(top_ids))
        )).all())
    out = []
    for score, e, matched in top:
        out.append({
            "id": e.id, "type": e.type, "title": e.title, "description": e.description,
            "link": e.link, "cover_url": e.cover_url,
            "deadline": e.deadline.isoformat() if e.deadline else None,
            "region_id": e.region_id,
            "matched": matched[:5], "score": score,
            "rsvp_count": counts.get(e.id, 0), "my_rsvp": mine.get(e.id),
        })
    return out


class RsvpIn(BaseModel):
    status: str = "going"   # "going" | "interested"


class AttendeeOut(BaseModel):
    user_id: int
    display_name: str
    status: str


@router.get("/mine/rsvps", response_model=list[EventOut])
async def my_rsvps(
    me: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """The current user's RSVP'd events, upcoming (soonest deadline) first."""
    rows = (await db.execute(
        select(Event, EventRsvp.status)
        .join(EventRsvp, EventRsvp.event_id == Event.id)
        .where(EventRsvp.user_id == me.id, Event.is_deleted == False)
        .order_by(Event.deadline.asc().nullslast(), Event.created_at.desc())
    )).all()
    out = []
    for e, status in rows:
        e.rsvp_count = 0  # populated below in one batch
        e.my_rsvp = status
        out.append(e)
    await _attach_rsvp(db, out, me.id)  # fills rsvp_count (and re-affirms my_rsvp)
    return out


@router.post("/{event_id}/rsvp")
async def rsvp_event(
    event_id: int,
    body: RsvpIn,
    me: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    status = body.status if body.status in ("going", "interested") else "going"
    e = (await db.execute(select(Event).where(
        Event.id == event_id, Event.is_deleted == False, Event.is_approved == True,
    ))).scalar_one_or_none()
    if not e:
        raise HTTPException(status_code=404, detail="Event not found")

    row = (await db.execute(select(EventRsvp).where(
        EventRsvp.event_id == event_id, EventRsvp.user_id == me.id,
    ))).scalar_one_or_none()
    prev_status = row.status if row else None
    # Notify the creator when this RSVP *becomes* going (first going, incl. an
    # interested→going upgrade) — never on self-RSVP or a repeat going.
    notify_creator = bool(
        status == "going" and prev_status != "going"
        and e.created_by and e.created_by != me.id
    )
    try:
        if row is None:
            # Anti-flood only on a genuinely NEW RSVP (each first 'going' pings the
            # creator). Toggling/status-changing an existing row is exempt.
            await rate_limit(db, me.id, "event_rsvp", 60, 3600)  # 60 new RSVPs / hour
            db.add(EventRsvp(event_id=event_id, user_id=me.id, status=status))
        else:
            row.status = status  # switch going<->interested (reuses the row)
        if notify_creator:
            add_notification(db, e.created_by, "event_rsvp", actor_id=me.id, event_id=event_id)
        await db.commit()
    except IntegrityError:
        # A concurrent first-RSVP won the unique (event_id,user_id) race — make
        # this an idempotent upsert instead of a 500 (matches the app-wide pattern).
        await db.rollback()
        row = (await db.execute(select(EventRsvp).where(
            EventRsvp.event_id == event_id, EventRsvp.user_id == me.id,
        ))).scalar_one_or_none()
        if row is not None:
            row.status = status
        notify_creator = False  # the request that won the insert owns the notify
        await db.commit()

    if notify_creator:
        creator = (await db.execute(
            select(User).where(User.id == e.created_by)
        )).scalar_one_or_none()
        if creator and creator.telegram_id and should_push_telegram(creator, "event_rsvp"):
            url = f"https://t.me/{settings.BOT_USERNAME}?startapp=event_{event_id}"
            notify_background(
                creator.telegram_id,
                f"🎟️ <b>{esc(me.display_name or 'Someone')}</b> is going to <b>{esc(e.title)}</b>",
                reply_markup={"inline_keyboard": [[{"text": "Open in BFU", "url": url}]]},
            )

    return {"event_id": event_id, "status": status,
            "rsvp_count": await _going_count(db, event_id), "my_rsvp": status}


@router.delete("/{event_id}/rsvp")
async def unrsvp_event(
    event_id: int,
    me: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(delete(EventRsvp).where(
        EventRsvp.event_id == event_id, EventRsvp.user_id == me.id,
    ))
    await db.commit()
    return {"event_id": event_id, "rsvp_count": await _going_count(db, event_id), "my_rsvp": None}


@router.get("/{event_id}/attendees")
async def event_attendees(
    event_id: int,
    limit: int = 50,
    me: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    total = await _going_count(db, event_id)
    rows = (await db.execute(
        select(User, EventRsvp.status)  # display_name is a @property → select the object
        .join(EventRsvp, EventRsvp.user_id == User.id)
        .where(EventRsvp.event_id == event_id, EventRsvp.status == "going",
               User.is_deleted == False)
        .order_by(EventRsvp.created_at.desc())
        .limit(max(1, min(limit, 100)))
    )).all()
    return {
        "attendee_count": total,
        "attendees": [{"user_id": u.id, "display_name": u.display_name, "status": s}
                      for u, s in rows],
    }
