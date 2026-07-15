"""Partner self-serve panel — /partner/*.

A PARTNER is a User with role='partner' linked to a Partner org
(Partner.owner_user_id == that user's id). It is NOT an admin: it uses BFU as a
normal member (browses City, messages) but is HIDDEN from City discovery, and it
gets a SCOPED panel over ONLY its own events.

Every event route is scoped by `_load_my_event`, which 404s the instant an
event's partner_id != the caller's partner id — so cross-partner access is
impossible (a partner can never read, edit, or export another org's leads).

The responses table / CSV / funnel / lead-score PATCH are the SAME functions the
admin panel calls (app.services.event_admin) — the two panels can never drift.
Partner-created events are is_approved=False until an admin approves them (the
existing admin approve path fires the targeted push + group card on approval).
"""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_partner_user
from app.database import get_db
from app.models.event import Event
from app.models.partner import Partner
from app.models.user import User
from app.services.audit import log_action
from app.services.event_admin import (
    build_funnel,
    build_responses,
    build_responses_csv,
    checked_schema,
    normalize_region_ids,
    to_naive_utc,
    update_event_response,
)

# generate_event_report lives in a sibling service; degrade to a no-op if it
# hasn't landed so this router imports regardless of build order (mirrors admin).
try:
    from app.services.event_ai import generate_event_report
except ImportError:  # pragma: no cover
    async def generate_event_report(event_id: int) -> dict:  # type: ignore[misc]
        return {"summary": "", "response_count": 0, "generated_at": None}

router = APIRouter(prefix="/partner", tags=["partner"])


# ── wire schemas ──────────────────────────────────────────────────────────────
class PartnerEventBody(BaseModel):
    # type/title optional at the schema level so a PATCH can send just one field;
    # POST enforces both below (400 otherwise).
    type: str | None = None
    title: str | None = None
    description: str | None = None
    link: str | None = None
    cover_url: str | None = None
    deadline: datetime | None = None       # signup cutoff
    starts_at: datetime | None = None      # when the event actually happens
    region_id: int | None = None           # ignored on write (derived from region_ids)
    # Multi-region targeting. null/[] = unlimited (everyone).
    region_ids: list[int] | None = None
    location: str | None = None            # free-text venue / place
    capacity: int | None = None
    # The registration form's question list (see app.services.event_forms).
    # null/[] = no form → plain one-click RSVP.
    form_schema: list[dict] | None = None


class PartnerEventOut(BaseModel):
    id: int
    type: str
    title: str
    description: str | None = None
    link: str | None = None
    cover_url: str | None = None
    deadline: datetime | None = None
    starts_at: datetime | None = None
    region_id: int | None = None
    region_ids: list[int] | None = None
    location: str | None = None
    partner_id: int | None = None
    capacity: int | None = None
    is_approved: bool = False
    is_deleted: bool
    form_schema: list[dict] | None = None
    has_form: bool = False
    model_config = {"from_attributes": True}


# Fields a partner may set on POST/PATCH. partner_id is FORCED to the caller's
# org and is_approved is admin-only (moderation) — neither is settable here.
# region_id is NOT here: it's derived from region_ids server-side (kept in sync),
# so a partner sets targeting via region_ids only.
_EDITABLE = ("type", "title", "description", "link", "cover_url",
             "deadline", "starts_at", "region_ids", "location", "capacity",
             "form_schema")


async def _load_my_event(db: AsyncSession, partner: Partner, event_id: int) -> Event:
    """Load an event that belongs to `partner`, else 404. The single scoping
    gate for every /partner/events/{id}* route: an event owned by another partner
    (or none) is indistinguishable from a missing one, so nothing leaks."""
    e = await db.get(Event, event_id)
    if not e or e.is_deleted or e.partner_id != partner.id:
        raise HTTPException(status_code=404, detail="Event not found")
    return e


# ── org ───────────────────────────────────────────────────────────────────────
@router.get("/me", response_model=dict)
async def partner_me(
    partner: Partner = Depends(get_partner_user),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """The caller's partner org + basic counts (drives the panel header)."""
    from sqlalchemy import func

    total = await db.scalar(
        select(func.count(Event.id)).where(
            Event.partner_id == partner.id, Event.is_deleted == False
        )
    ) or 0
    pending = await db.scalar(
        select(func.count(Event.id)).where(
            Event.partner_id == partner.id, Event.is_deleted == False,
            Event.is_approved == False,
        )
    ) or 0
    return {
        "partner": {
            "id": partner.id, "name": partner.name, "about": partner.about,
            "website": partner.website, "logo_url": partner.logo_url,
            "region_id": partner.region_id, "verified": partner.verified,
        },
        "owner": {"id": current_user.id, "display_name": current_user.display_name},
        "events": {"total": int(total), "pending": int(pending),
                   "approved": int(total) - int(pending)},
    }


# ── events (own org only) ─────────────────────────────────────────────────────
@router.get("/events", response_model=list[PartnerEventOut])
async def partner_list_events(
    partner: Partner = Depends(get_partner_user),
    db: AsyncSession = Depends(get_db),
):
    """ONLY events owned by the caller's org. Pending (unapproved) float to the
    top, mirroring the admin queue ordering."""
    res = await db.execute(
        select(Event).where(
            Event.partner_id == partner.id, Event.is_deleted == False
        ).order_by(Event.is_approved.asc(), Event.id.desc()).limit(200)
    )
    return res.scalars().all()


@router.post("/events", response_model=PartnerEventOut,
             status_code=status.HTTP_201_CREATED)
async def partner_create_event(
    body: PartnerEventBody,
    partner: Partner = Depends(get_partner_user),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create an event FOR the caller's org: partner_id is forced to the caller's
    org and is_approved=False (moderation). It stays invisible + un-pushed until
    an admin approves it via the existing admin approve path."""
    if not body.title or not body.title.strip():
        raise HTTPException(400, "Title required")
    if not body.type or not body.type.strip():
        raise HTTPException(400, "Type required")
    rids = normalize_region_ids(body.region_ids)
    e = Event(
        type=body.type.strip(), title=body.title.strip(),
        description=body.description, link=body.link, cover_url=body.cover_url,
        deadline=to_naive_utc(body.deadline), starts_at=to_naive_utc(body.starts_at),
        region_ids=rids, region_id=(rids[0] if rids else None),
        location=(body.location.strip() if body.location else None),
        created_by=current_user.id,
        partner_id=partner.id, is_approved=False, capacity=body.capacity,
        form_schema=checked_schema(body.form_schema),
    )
    db.add(e)
    await log_action(db, current_user.id, "partner.event.create", "event", None,
                     {"partner_id": partner.id, "title": e.title})
    await db.commit(); await db.refresh(e)
    return e


@router.patch("/events/{event_id}", response_model=PartnerEventOut)
async def partner_update_event(
    event_id: int,
    body: PartnerEventBody,
    partner: Partner = Depends(get_partner_user),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Edit one of MY events (form_schema, capacity, starts_at, …). partner_id
    and is_approved are never settable here — a partner can't reassign an event
    to another org or self-approve it."""
    e = await _load_my_event(db, partner, event_id)
    patch = body.model_dump(exclude_unset=True)
    if "form_schema" in patch:
        patch["form_schema"] = checked_schema(patch["form_schema"])
    if "deadline" in patch:
        patch["deadline"] = to_naive_utc(patch["deadline"])
    if "starts_at" in patch:
        patch["starts_at"] = to_naive_utc(patch["starts_at"])
    # region_ids is authoritative; normalize + keep legacy region_id in sync.
    if "region_ids" in patch:
        rids = normalize_region_ids(patch["region_ids"])
        patch["region_ids"] = rids
        e.region_id = rids[0] if rids else None
    if "location" in patch and patch["location"] is not None:
        patch["location"] = patch["location"].strip() or None
    for k, v in patch.items():
        if k in _EDITABLE:
            setattr(e, k, v)
    await log_action(db, current_user.id, "partner.event.update", "event", event_id,
                     {"partner_id": partner.id, "fields": sorted(patch.keys())})
    await db.commit(); await db.refresh(e)
    return e


# ── responses / funnel / export / AI report — the SAME core as admin ──────────
@router.get("/events/{event_id}/responses")
async def partner_event_responses(
    event_id: int,
    partner: Partner = Depends(get_partner_user),
    db: AsyncSession = Depends(get_db),
):
    e = await _load_my_event(db, partner, event_id)
    return await build_responses(db, e)


@router.get("/events/{event_id}/responses.csv")
async def partner_event_responses_csv(
    event_id: int,
    partner: Partner = Depends(get_partner_user),
    db: AsyncSession = Depends(get_db),
):
    e = await _load_my_event(db, partner, event_id)
    return await build_responses_csv(db, e)


@router.get("/events/{event_id}/funnel")
async def partner_event_funnel(
    event_id: int,
    partner: Partner = Depends(get_partner_user),
    db: AsyncSession = Depends(get_db),
):
    e = await _load_my_event(db, partner, event_id)
    return await build_funnel(db, e)


@router.get("/events/{event_id}/ai-report")
async def partner_event_ai_report(
    event_id: int,
    partner: Partner = Depends(get_partner_user),
    db: AsyncSession = Depends(get_db),
):
    """One-tap AI summary of every registration for MY event. Scoped first, then
    delegates to the shared report service (its own session, one Claude call)."""
    e = await _load_my_event(db, partner, event_id)
    return await generate_event_report(e.id)


class PartnerResponseUpdateBody(BaseModel):
    """Partner edit to one registrant's lead pipeline row."""
    lead_status: str | None = None
    score: int | None = None


@router.patch("/events/{event_id}/responses/{user_id}")
async def partner_update_event_response(
    event_id: int,
    user_id: int,
    body: PartnerResponseUpdateBody,
    partner: Partner = Depends(get_partner_user),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Advance one of MY registrants through the lead pipeline (lead_status) and/or
    record a score. Scoped to my org first; the pipeline rules + side effects are
    the same shared core the admin panel uses (event_admin.update_event_response),
    attributed to the acting partner owner in the audit log."""
    e = await _load_my_event(db, partner, event_id)
    return await update_event_response(
        db, e, user_id, body.model_dump(exclude_unset=True), current_user.id
    )
