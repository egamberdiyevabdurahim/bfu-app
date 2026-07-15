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
from app.models.partner import Partner
from app.models.user import User
from app.schemas.event import EventDetailOut, EventOut, MyResponseOut, RsvpIn
from app.services.event_forms import has_form, parse_answers
from app.services.notifications import add_notification, should_push_telegram
from app.services.notify import esc, notify_background, push_event
from app.services.ratelimit import rate_limit

router = APIRouter(prefix="/events", tags=["events"])


async def _going_count(db: AsyncSession, event_id: int) -> int:
    """Raw count of "going" RSVPs — the public "N going" number (includes anyone
    later marked no_show; they still RSVP'd going)."""
    return (await db.execute(
        select(func.count()).where(
            EventRsvp.event_id == event_id, EventRsvp.status == "going",
        )
    )).scalar_one()


async def _status_counts(db: AsyncSession, event_id: int) -> tuple[int, int]:
    """(going_count, waitlist_count) for one event in a single grouped query."""
    rows = dict((await db.execute(
        select(EventRsvp.status, func.count())
        .where(EventRsvp.event_id == event_id)
        .group_by(EventRsvp.status)
    )).all())
    return rows.get("going", 0), rows.get("waitlisted", 0)


async def _seats_taken(db: AsyncSession, event_id: int) -> int:
    """"Going" RSVPs that actually OCCUPY a seat — excludes no-shows. This is the
    number the capacity gate + waitlist promotion reason about: an admin marking
    a going attendee ``no_show`` frees their seat for the oldest waitlisted."""
    return (await db.execute(
        select(func.count()).where(
            EventRsvp.event_id == event_id,
            EventRsvp.status == "going",
            EventRsvp.lead_status != "no_show",
        )
    )).scalar_one()


def _seats_left(capacity: int | None, going: int) -> int | None:
    """Displayed seats-left from capacity and the raw going count (null =
    unlimited; never negative)."""
    return None if capacity is None else max(0, capacity - going)


async def promote_from_waitlist(db: AsyncSession, event: Event) -> EventRsvp | None:
    """Promote the OLDEST waitlisted RSVP to "going" when a seat is free.

    Mutates the row (caller commits) and returns it, or None when the event is
    unlimited, still full, or has no one waiting. Promotes AT MOST ONE — one
    freed seat, one promotion. Shared by the un-RSVP path (events) and the admin
    no_show path (admin router)."""
    if event.capacity is None:
        return None
    if await _seats_taken(db, event.id) >= event.capacity:
        return None  # still full — guard against over-promoting
    row = (await db.execute(
        select(EventRsvp)
        .where(EventRsvp.event_id == event.id, EventRsvp.status == "waitlisted")
        .order_by(EventRsvp.created_at.asc(), EventRsvp.id.asc())
        .limit(1)
    )).scalar_one_or_none()
    if row is None:
        return None
    row.status = "going"
    return row


# Localized "a seat opened up for {title}" DM (HTML — {title} is esc()'d by the
# caller). Sent best-effort to a waitlisted registrant on promotion.
_SEAT_OPENED = {
    "en": "🎟️ A seat opened up for <b>{title}</b> — you're off the waitlist and you're going!",
    "uz": "🎟️ <b>{title}</b> tadbirida joy bo'shadi — endi navbatda emassiz, boryapsiz!",
    "ru": "🎟️ Освободилось место на «<b>{title}</b>» — вы больше не в листе ожидания, вы участвуете!",
}


async def notify_seat_opened(db: AsyncSession, user_id: int, event: Event) -> None:
    """Best-effort DM to a just-promoted registrant. Respects reachability + the
    events mute (via push_event); never raises."""
    try:
        u = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
        if u is not None:
            push_event(u, "event_reminder", _SEAT_OPENED, fmt={"title": esc(event.title)})
    except Exception:
        pass

_CATS = ("skills", "knowledges", "interests", "preparations", "goals")


def _user_tags(analysis) -> list[str]:
    out: list[str] = []
    if analysis:
        for c in _CATS:
            out.extend(t for t in (getattr(analysis, c, None) or []))
    return out


async def _attach_rsvp(db: AsyncSession, rows: list[Event], me_id: int) -> None:
    """Batch-annotate ORM Event rows with rsvp_count/going_count/waitlist_count/
    seats_left + my_rsvp in O(2) queries — no N+1 (pydantic from_attributes reads
    the attributes we set on the instances)."""
    ids = [e.id for e in rows]
    if not ids:
        return
    # One grouped query yields every (event, status) tally at once.
    status_counts: dict[tuple[int, str], int] = {}
    for eid, st, c in (await db.execute(
        select(EventRsvp.event_id, EventRsvp.status, func.count())
        .where(EventRsvp.event_id.in_(ids))
        .group_by(EventRsvp.event_id, EventRsvp.status)
    )).all():
        status_counts[(eid, st)] = c
    mine = dict((await db.execute(
        select(EventRsvp.event_id, EventRsvp.status)
        .where(EventRsvp.user_id == me_id, EventRsvp.event_id.in_(ids))
    )).all())
    for e in rows:
        going = status_counts.get((e.id, "going"), 0)
        e.rsvp_count = going
        e.going_count = going
        e.waitlist_count = status_counts.get((e.id, "waitlisted"), 0)
        e.seats_left = _seats_left(e.capacity, going)
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
    status_counts: dict[tuple[int, str], int] = {}
    mine = {}
    if top_ids:
        for eid, st, c in (await db.execute(
            select(EventRsvp.event_id, EventRsvp.status, func.count())
            .where(EventRsvp.event_id.in_(top_ids))
            .group_by(EventRsvp.event_id, EventRsvp.status)
        )).all():
            status_counts[(eid, st)] = c
        mine = dict((await db.execute(
            select(EventRsvp.event_id, EventRsvp.status)
            .where(EventRsvp.user_id == me.id, EventRsvp.event_id.in_(top_ids))
        )).all())
    out = []
    for score, e, matched in top:
        going = status_counts.get((e.id, "going"), 0)
        out.append({
            "id": e.id, "type": e.type, "title": e.title, "description": e.description,
            "link": e.link, "cover_url": e.cover_url,
            "deadline": e.deadline.isoformat() if e.deadline else None,
            "starts_at": e.starts_at.isoformat() if e.starts_at else None,
            "region_id": e.region_id,
            "matched": matched[:5], "score": score,
            "rsvp_count": going, "my_rsvp": mine.get(e.id),
            "has_form": e.has_form,
            "capacity": e.capacity, "going_count": going,
            "waitlist_count": status_counts.get((e.id, "waitlisted"), 0),
            "seats_left": _seats_left(e.capacity, going),
        })
    return out


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
    requested = body.status if body.status in ("going", "interested") else "going"
    e = (await db.execute(select(Event).where(
        Event.id == event_id, Event.is_deleted == False, Event.is_approved == True,
    ))).scalar_one_or_none()
    if not e:
        raise HTTPException(status_code=404, detail="Event not found")

    # ── registration form ────────────────────────────────────────────────────
    # If the event asks questions, a "going" RSVP must answer them — validated
    # HERE, server-side (app.services.event_forms is the single rulebook; the
    # client is never the only gate). "interested" never requires the form, and
    # an event with no form ignores `answers` entirely. A 422 writes nothing:
    # this runs before any db.add / row mutation. A capacity-overflow RSVP still
    # fills the form (they registered) — it's only their status that becomes
    # "waitlisted", so the form is required for any "going" request.
    answers: dict | None = None
    if has_form(e.form_schema) and requested == "going":
        answers, errors = parse_answers(e.form_schema, body.answers)
        if errors:
            raise HTTPException(
                status_code=422,
                detail={"message": "Please fix the form", "errors": errors},
            )

    row = (await db.execute(select(EventRsvp).where(
        EventRsvp.event_id == event_id, EventRsvp.user_id == me.id,
    ))).scalar_one_or_none()
    prev_status = row.status if row else None

    # ── answers are FINAL once submitted ──────────────────────────────────────
    # For a form event, once you've registered ("going"/"waitlisted" with saved
    # answers) the answers can't be edited — a re-submit is refused (409). This is
    # the server-side gate behind the read-only "You're registered" UI; the only
    # way to change anything is to withdraw (DELETE) and register again. (An
    # "interested" row never filled the form, so it can still upgrade to going.)
    if (
        has_form(e.form_schema) and requested == "going"
        and row is not None and row.status in ("going", "waitlisted") and row.answers
    ):
        raise HTTPException(
            status_code=409,
            detail="You're already registered for this event — your answers can't be changed.",
        )

    # ── capacity / waitlist ───────────────────────────────────────────────────
    # A "going" request when the event is at capacity is stored "waitlisted"
    # instead. A user already "going" re-RSVPing is never demoted; "interested"
    # is unaffected; a null capacity is unlimited (never waitlists).
    status = requested
    if requested == "going" and prev_status != "going" and e.capacity is not None:
        if await _seats_taken(db, event_id) >= e.capacity:
            status = "waitlisted"
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
            db.add(EventRsvp(
                event_id=event_id, user_id=me.id, status=status, answers=answers,
            ))
        else:
            row.status = status  # switch going<->interested (reuses the row)
            if answers is not None:
                row.answers = answers  # re-RSVP overwrites (people fix typos)
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
            if answers is not None:
                row.answers = answers
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

    going, waitl = await _status_counts(db, event_id)
    return {
        "event_id": event_id, "status": status, "my_rsvp": status,
        "waitlisted": status == "waitlisted",
        "rsvp_count": going, "going_count": going, "waitlist_count": waitl,
        "capacity": e.capacity, "seats_left": _seats_left(e.capacity, going),
    }


@router.delete("/{event_id}/rsvp")
async def unrsvp_event(
    event_id: int,
    me: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Was this a going seat? If so, freeing it may promote the oldest waitlisted.
    row = (await db.execute(select(EventRsvp).where(
        EventRsvp.event_id == event_id, EventRsvp.user_id == me.id,
    ))).scalar_one_or_none()
    was_going = row is not None and row.status == "going"
    e = await db.get(Event, event_id)
    await db.execute(delete(EventRsvp).where(
        EventRsvp.event_id == event_id, EventRsvp.user_id == me.id,
    ))
    promoted = None
    if was_going and e is not None:
        promoted = await promote_from_waitlist(db, e)  # DELETE already applied → seat freed
    await db.commit()
    if promoted is not None and e is not None:
        await notify_seat_opened(db, promoted.user_id, e)  # best-effort, after commit
    cap = e.capacity if e is not None else None
    going, waitl = await _status_counts(db, event_id)
    return {
        "event_id": event_id, "my_rsvp": None,
        "rsvp_count": going, "going_count": going, "waitlist_count": waitl,
        "capacity": cap, "seats_left": _seats_left(cap, going),
    }


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


@router.get("/{event_id}/my-response", response_model=MyResponseOut)
async def my_form_response(
    event_id: int,
    me: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """The caller's own saved answers (so the client can review/edit them).
    `answers` is null when they haven't RSVP'd or the event has no form."""
    row = (await db.execute(select(EventRsvp).where(
        EventRsvp.event_id == event_id, EventRsvp.user_id == me.id,
    ))).scalar_one_or_none()
    return {"answers": row.answers if row else None}


# Declared LAST: a bare "/{event_id}" would otherwise shadow the literal routes
# above ("/for-me", "/mine/rsvps") — FastAPI matches in declaration order.
@router.get("/{event_id}", response_model=EventDetailOut)
async def get_event(
    event_id: int,
    me: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """One event + its registration form (`form_schema`, null when there's none)."""
    e = (await db.execute(select(Event).where(
        Event.id == event_id, Event.is_deleted == False, Event.is_approved == True,
    ))).scalar_one_or_none()
    if not e:
        raise HTTPException(status_code=404, detail="Event not found")
    await _attach_rsvp(db, [e], me.id)
    # Resolve the hosting partner's name for the "Hosted by …" credit on the
    # detail page (e.g. Marstiff). Set as a plain attribute so EventDetailOut
    # picks it up via from_attributes. Null for BFU-run events.
    if e.partner_id:
        e.partner_name = await db.scalar(
            select(Partner.name).where(Partner.id == e.partner_id)
        )
    return e
