import datetime as dt
import json

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.database import get_db
from app.models.connection import MentorSlot, Booking
from app.models.user import User
from app.schemas.connection import (
    BookingActionIn,
    BookingIn,
    SlotIn,
)
from app.services.notifications import add_notification

router = APIRouter(prefix="/mentors", tags=["mentors"])
booking_router = APIRouter(prefix="/bookings", tags=["bookings"])


def _topics(user: User) -> list[str]:
    if not user.mentor_topics:
        return []
    try:
        return [str(t).strip() for t in json.loads(user.mentor_topics) if str(t).strip()]
    except Exception:
        return []


@router.get("", response_model=list[dict])
async def list_mentors(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """All mentors with their open-slot counts."""
    mentors = (await db.execute(
        select(User).where(User.is_mentor == True, User.is_deleted == False,
                           User.is_registered == True)
    )).scalars().all()
    if not mentors:
        return []
    ids = [m.id for m in mentors]
    open_rows = (await db.execute(
        select(MentorSlot.mentor_id, func.count(MentorSlot.id))
        .where(MentorSlot.mentor_id.in_(ids), MentorSlot.status == "open",
               MentorSlot.start_at > dt.datetime.utcnow())
        .group_by(MentorSlot.mentor_id)
    )).all()
    open_by = {mid: c for mid, c in open_rows}
    return [
        {"id": m.id, "display_name": m.display_name, "photo_url": m.photo_url,
         "bio": m.mentor_bio, "topics": _topics(m), "open_slots": open_by.get(m.id, 0)}
        for m in mentors
    ]


@router.get("/{mentor_id}/slots", response_model=dict)
async def list_slots(
    mentor_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """A mentor's slots. Others see open future slots; the mentor sees all
    non-cancelled slots."""
    is_self = mentor_id == current_user.id
    q = select(MentorSlot).where(MentorSlot.mentor_id == mentor_id)
    if is_self:
        q = q.where(MentorSlot.status != "cancelled")
    else:
        q = q.where(MentorSlot.status == "open", MentorSlot.start_at > dt.datetime.utcnow())
    rows = (await db.execute(q.order_by(MentorSlot.start_at.asc()))).scalars().all()
    return {
        "slots": [
            {"id": s.id, "start_at": s.start_at.isoformat() if s.start_at else None,
             "status": s.status, "duration_min": s.duration_min}
            for s in rows
        ],
    }


@router.post("/me/slots", response_model=dict)
async def create_slot(
    body: SlotIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Mentor publishes a future 15-minute slot."""
    start = body.start_at
    if start.tzinfo is not None:
        start = start.replace(tzinfo=None)
    if start <= dt.datetime.utcnow():
        raise HTTPException(status_code=422, detail="start_at must be in the future")
    slot = MentorSlot(mentor_id=current_user.id, start_at=start, duration_min=15, status="open")
    db.add(slot)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="You already have a slot at that time")
    await db.refresh(slot)
    return {"ok": True, "id": slot.id}


@router.delete("/me/slots/{slot_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_slot(
    slot_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Cancel an OPEN slot you own. A booked slot must be freed by declining the
    booking instead."""
    slot = (await db.execute(
        select(MentorSlot).where(MentorSlot.id == slot_id,
                                 MentorSlot.mentor_id == current_user.id)
    )).scalar_one_or_none()
    if not slot:
        raise HTTPException(status_code=404, detail="Slot not found")
    if slot.status == "booked":
        raise HTTPException(status_code=409, detail="Decline the booking to free this slot")
    await db.delete(slot)
    await db.commit()


@booking_router.post("", response_model=dict)
async def create_booking(
    body: BookingIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Mentee books an open slot → booking 'requested', slot 'booked'."""
    slot = (await db.execute(
        select(MentorSlot).where(MentorSlot.id == body.slot_id)
    )).scalar_one_or_none()
    if not slot:
        raise HTTPException(status_code=404, detail="Slot not found")
    if slot.mentor_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot book your own slot")
    if slot.status != "open":
        raise HTTPException(status_code=409, detail="Slot is not available")

    slot.status = "booked"
    note = (body.note or "").strip()[:200] or None
    booking = Booking(slot_id=slot.id, mentor_id=slot.mentor_id,
                      mentee_id=current_user.id, status="requested", note=note)
    db.add(booking)
    await db.flush()
    bid = booking.id
    add_notification(db, slot.mentor_id, "booking_request", actor_id=current_user.id)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Slot was just taken")
    return {"ok": True, "id": bid, "status": "requested"}


@booking_router.patch("/{booking_id}", response_model=dict)
async def act_on_booking(
    booking_id: int,
    body: BookingActionIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Mentor confirms/declines; mentee cancels. Declining/cancelling frees the
    slot back to open."""
    booking = (await db.execute(
        select(Booking).where(Booking.id == booking_id)
    )).scalar_one_or_none()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    action = body.action
    is_mentor = current_user.id == booking.mentor_id
    is_mentee = current_user.id == booking.mentee_id

    if action not in ("confirm", "decline", "cancel"):
        raise HTTPException(status_code=400, detail="action must be confirm|decline|cancel")

    # Terminal-state guard: a finalized booking cannot be acted on again. This
    # also blocks illegal transitions (e.g. confirm after cancel) and prevents
    # re-running the slot-freeing logic on an already-declined/cancelled
    # booking, which could wrongly reopen a slot that's since been re-booked.
    if booking.status not in ("requested", "confirmed"):
        raise HTTPException(status_code=409, detail="Booking already finalized")

    if action == "confirm":
        if not is_mentor:
            raise HTTPException(status_code=403, detail="Only the mentor can confirm")
        if booking.status != "requested":
            raise HTTPException(status_code=409, detail="Booking already finalized")
        booking.status = "confirmed"
        add_notification(db, booking.mentee_id, "booking_confirmed", actor_id=current_user.id)
    elif action == "decline":
        if not is_mentor:
            raise HTTPException(status_code=403, detail="Only the mentor can decline")
        if booking.status != "requested":
            raise HTTPException(status_code=409, detail="Booking already finalized")
        booking.status = "declined"
        add_notification(db, booking.mentee_id, "booking_declined", actor_id=current_user.id)
    elif action == "cancel":
        if not is_mentee:
            raise HTTPException(status_code=403, detail="Only the mentee can cancel")
        if booking.status not in ("requested", "confirmed"):
            raise HTTPException(status_code=409, detail="Booking already finalized")
        booking.status = "cancelled"

    booking.decided_at = dt.datetime.utcnow()
    # Free the slot when the session won't happen.
    if booking.status in ("declined", "cancelled"):
        slot = await db.get(MentorSlot, booking.slot_id)
        if slot and slot.status == "booked":
            slot.status = "open"
    await db.commit()
    return {"status": booking.status}


@booking_router.get("/me", response_model=dict)
async def my_bookings(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """The caller's bookings as mentee and as mentor, with slot + other-party."""
    rows = (await db.execute(
        select(Booking).where(
            (Booking.mentee_id == current_user.id) | (Booking.mentor_id == current_user.id)
        ).order_by(Booking.id.desc())
    )).scalars().all()
    slot_ids = {b.slot_id for b in rows}
    other_ids = {b.mentor_id for b in rows} | {b.mentee_id for b in rows}
    other_ids.discard(current_user.id)
    slots = {}
    if slot_ids:
        for s in (await db.execute(select(MentorSlot).where(MentorSlot.id.in_(slot_ids)))).scalars().all():
            slots[s.id] = s
    people = {}
    if other_ids:
        for u in (await db.execute(select(User).where(User.id.in_(other_ids)))).scalars().all():
            people[u.id] = {"id": u.id, "display_name": u.display_name, "photo_url": u.photo_url}

    def _row(b, other_id):
        s = slots.get(b.slot_id)
        return {
            "id": b.id, "slot_id": b.slot_id, "status": b.status, "note": b.note,
            "start_at": s.start_at.isoformat() if (s and s.start_at) else None,
            "other": people.get(other_id),
            "created_at": b.created_at.isoformat() if b.created_at else None,
        }

    return {
        "as_mentee": [_row(b, b.mentor_id) for b in rows if b.mentee_id == current_user.id],
        "as_mentor": [_row(b, b.mentee_id) for b in rows if b.mentor_id == current_user.id],
    }
