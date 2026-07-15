"""Shared event-management core — the single implementation of the responses
table, CSV export, lead funnel, and lead/score PATCH that BOTH the admin panel
(app.routers.admin) and the partner self-serve panel (app.routers.partner) call.

Each function takes ``(db, event, ...)`` — the caller loads + authorizes the
event first (admin: any event; partner: only its own, via the partner router's
scoping guard), then hands the loaded row here. Nothing in this module decides
*who* may see an event; it only builds the payloads. Keeping this logic in one
place is why the partner panel can never drift from the admin panel (identical
CSV columns, identical funnel keys, identical pipeline rules).
"""
from __future__ import annotations

import csv
import io
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException
from fastapi.responses import Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.event import Event
from app.models.event_rsvp import EventRsvp
from app.models.user import User
from app.schemas.event import FormResponseOut
from app.services.audit import log_action
from app.services.event_forms import (
    answer_to_text, has_form, normalize_schema, validate_schema,
)
from app.services.notify import esc, push_event

# The partner lead-pipeline stages a registrant can be advanced through. The
# PATCH endpoints are the single validation gate (422 on anything else). This is
# the ONE definition — admin.py re-exports it so `from app.routers.admin import
# LEAD_STATUSES` (and the partner router) both see the same set.
LEAD_STATUSES = {"registered", "showed", "scored", "called", "enrolled", "no_show"}

# Lead-pipeline stages (from EventRsvp.lead_status) + RSVP statuses (from
# EventRsvp.status). Disjoint sets → the funnel dict merges both without
# collision. Every key is reported (0 when absent).
_FUNNEL_LEAD_KEYS = ("registered", "showed", "scored", "called", "enrolled", "no_show")
_FUNNEL_STATUS_KEYS = ("waitlisted", "going", "interested")

# Localized "your {title} result: {score}" DM (HTML — {title} is esc()'d by the
# caller; {score} is an int). Sent best-effort when a score is set/changed.
_SCORE_RESULT = {
    "en": "📊 Your <b>{title}</b> result: <b>{score}</b>",
    "uz": "📊 <b>{title}</b> natijangiz: <b>{score}</b>",
    "ru": "📊 Ваш результат «<b>{title}</b>»: <b>{score}</b>",
}


def to_naive_utc(dt: datetime | None) -> datetime | None:
    """Normalize an incoming datetime for storage in a timezone-NAIVE column.

    A Z-suffixed ISO value (``.toISOString()``) parses to a tz-AWARE datetime;
    assigning that to a "timestamp without time zone" column raises asyncpg
    ``DataError`` → HTTP 500 on Postgres (SQLite silently accepts it, hiding the
    bug). So: convert an aware value to UTC and drop the tzinfo (same wall-clock
    instant); pass a naive value through unchanged."""
    if dt is not None and dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def checked_schema(raw: Any) -> list[dict] | None:
    """Validate an admin/partner-supplied question list against the ONE rulebook
    (app.services.event_forms) and return the normalized blob to store. 422s with
    {question_key: reason} so the panel can point at the offending row."""
    errors = validate_schema(raw)
    if errors:
        raise HTTPException(
            status_code=422,
            detail={"message": "Invalid form_schema", "errors": errors},
        )
    return normalize_schema(raw)


async def event_responses(db: AsyncSession, event_id: int) -> list[tuple[EventRsvp, User]]:
    """(rsvp, user) pairs for the 'going' registrations, oldest first."""
    return list((await db.execute(
        select(EventRsvp, User)
        .join(User, User.id == EventRsvp.user_id)
        .where(EventRsvp.event_id == event_id, EventRsvp.status == "going")
        .order_by(EventRsvp.created_at.asc(), EventRsvp.id.asc())
    )).all())


async def build_responses(db: AsyncSession, event: Event) -> list[FormResponseOut]:
    """Everyone who registered ('going') for this event, with their form answers
    + pipeline fields. `event` is already loaded + authorized by the caller."""
    rows = await event_responses(db, event.id)
    return [
        FormResponseOut(
            user_id=u.id, display_name=u.display_name, tg_username=u.tg_username,
            phone_number=u.phone_number, submitted_at=r.created_at, answers=r.answers,
            lead_status=r.lead_status, score=r.score,
        )
        for r, u in rows
    ]


async def build_funnel(db: AsyncSession, event: Event) -> dict:
    """Stage counts: the partner lead pipeline (lead_status) plus the RSVP status
    breakdown, in two grouped queries. ``total`` = every RSVP row."""
    lead_rows = dict((await db.execute(
        select(EventRsvp.lead_status, func.count())
        .where(EventRsvp.event_id == event.id)
        .group_by(EventRsvp.lead_status)
    )).all())
    status_rows = dict((await db.execute(
        select(EventRsvp.status, func.count())
        .where(EventRsvp.event_id == event.id)
        .group_by(EventRsvp.status)
    )).all())
    funnel = {k: 0 for k in (_FUNNEL_LEAD_KEYS + _FUNNEL_STATUS_KEYS)}
    for k, c in lead_rows.items():
        if k in funnel:
            funnel[k] = c
    for k, c in status_rows.items():
        if k in funnel:
            funnel[k] = c
    funnel["total"] = sum(status_rows.values())
    return funnel


async def build_responses_csv(db: AsyncSession, event: Event) -> Response:
    """The responses table as a spreadsheet: one column per question (header =
    the question's LABEL, in schema order). UTF-8 **with BOM** so Excel renders
    Uzbek/Cyrillic text instead of mojibake."""
    schema = event.form_schema if has_form(event.form_schema) else []
    rows = await event_responses(db, event.id)

    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\r\n")
    w.writerow(
        ["user_id", "name", "username", "phone", "submitted_at", "lead_status", "score"]
        + [q.get("label", q.get("key", "")) for q in schema]
    )
    for r, u in rows:
        answers = r.answers or {}
        w.writerow(
            [
                u.id,
                u.display_name,
                f"@{u.tg_username}" if u.tg_username else "",
                u.phone_number or "",
                r.created_at.isoformat(sep=" ", timespec="seconds") if r.created_at else "",
                r.lead_status,
                "" if r.score is None else r.score,
            ]
            + [answer_to_text(answers.get(q.get("key"))) for q in schema]
        )

    body = "﻿" + buf.getvalue()   # BOM first -> Excel-safe UTF-8
    filename = f"event-{event.id}-responses.csv"
    return Response(
        content=body.encode("utf-8"),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


async def update_event_response(
    db: AsyncSession, event: Event, user_id: int, patch: dict, actor_id: int,
) -> FormResponseOut:
    """Advance one registrant through the lead pipeline (lead_status) and/or
    record a number (score). Both optional — a patch may set just one. An unknown
    lead_status is a 422 and writes nothing. `event` is pre-loaded + authorized.

    Side effects (best-effort, after commit):
      * setting/changing ``score`` DMs the student their result (localized);
      * marking a going attendee ``no_show`` frees their seat → the oldest
        waitlisted registrant is promoted to going and DMed.

    `actor_id` is the acting user (admin, or the partner org's owner) — recorded
    in the audit log so a partner edit is attributable."""
    # Imported lazily: these live in the events router, which admin.py also
    # imports at module load — a local import here keeps the service free of any
    # router-import-order coupling.
    from app.routers.events import notify_seat_opened, promote_from_waitlist

    row = (await db.execute(select(EventRsvp).where(
        EventRsvp.event_id == event.id, EventRsvp.user_id == user_id,
    ))).scalar_one_or_none()
    if not row:
        raise HTTPException(404, "Registration not found")
    old_lead, old_score = row.lead_status, row.score
    if "lead_status" in patch and patch["lead_status"] is not None:
        if patch["lead_status"] not in LEAD_STATUSES:
            raise HTTPException(
                status_code=422,
                detail={"message": "Invalid lead_status", "allowed": sorted(LEAD_STATUSES)},
            )
        row.lead_status = patch["lead_status"]
    if "score" in patch:
        row.score = patch["score"]

    # A no_show releases the attendee's seat → promote the oldest waitlisted.
    became_no_show = (
        patch.get("lead_status") == "no_show" and old_lead != "no_show"
    )
    score_changed = (
        "score" in patch and patch["score"] is not None and patch["score"] != old_score
    )
    promoted = None
    if became_no_show:
        # autoflush writes the no_show above before the seat count runs.
        promoted = await promote_from_waitlist(db, event)

    await log_action(db, actor_id, "event.response.update", "event", event.id,
                     {"user_id": user_id, **patch})
    await db.commit()

    u = await db.get(User, user_id)
    if promoted is not None:
        await notify_seat_opened(db, promoted.user_id, event)
    if score_changed and u is not None:
        push_event(u, "event_reminder", _SCORE_RESULT,
                   fmt={"title": esc(event.title), "score": patch["score"]})

    return FormResponseOut(
        user_id=user_id, display_name=u.display_name if u else str(user_id),
        tg_username=u.tg_username if u else None,
        phone_number=u.phone_number if u else None,
        submitted_at=row.created_at, answers=row.answers,
        lead_status=row.lead_status, score=row.score,
    )
