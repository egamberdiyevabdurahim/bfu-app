"""Shared per-user write-endpoint rate limiter.

Mechanism = authoritative DB COUNT over a rolling time window, mirroring the
messaging send limit (app/routers/messages.py:541-549). We deliberately do NOT
use an in-process dict + time.monotonic() (the AI/intro/interest style) here:

* Every endpoint we guard already persists a countable row, so a COUNT(*) over
  ``created_at >= now - window`` is exact and needs no side state.
* DB-count limits survive Railway redeploys/restarts and are correct if we ever
  run more than one instance — in-memory limits reset on every deploy and grant
  a fresh quota per worker (see main.py ``_rl_hits`` / users.py ``_last_*``).
* Testability: because the suite wipes the DB between tests, the window count
  resets automatically. There is NO new in-process dict to register in
  ``tests/conftest.py``'s ``_reset_inprocess_throttles`` tuple — the whole class
  of cross-test 429 flakes that dict exists to prevent cannot occur here.

Wire shape matches every other limiter in the app: HTTP 429 with a
``{"detail": "<human message>"}`` body via ``fastapi.HTTPException``.

Caps are intentionally GENEROUS: a sincere user must never trip one; only a
script blasting notifications does. Each call site passes an explicit
``limit``/``window_s`` (see the per-endpoint constants at the call sites).
"""
from __future__ import annotations

from datetime import datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.connection import ProjectUpdate
from app.models.event_rsvp import EventRsvp
from app.models.project import Project, ProjectApplication
from app.models.trust import Endorsement, Vouch
from app.models.user import Interest, Report

# action -> (model, user_id column, human 429 message).
# The column is the "who did it" FK we count by; the model must carry a
# ``created_at`` timestamp (all of these do). ``report`` intentionally covers
# BOTH POST /users/reports and POST /messages/{id}/report — both insert a Report
# keyed by reporter_id, so a single shared budget spans the whole report surface.
_ACTIONS: dict[str, tuple[type, object, str]] = {
    "report": (Report, Report.reporter_id,
               "You're reporting too often — please slow down."),
    "interest": (Interest, Interest.from_user_id,
                 "You've sent a lot of interests recently — try again later."),
    "project_create": (Project, Project.creator_id,
                       "You're creating projects too fast — slow down."),
    "project_apply": (ProjectApplication, ProjectApplication.applicant_id,
                      "You're applying too fast — slow down."),
    "project_update": (ProjectUpdate, ProjectUpdate.author_id,
                       "You're posting updates too fast — slow down."),
    "event_rsvp": (EventRsvp, EventRsvp.user_id,
                   "You're RSVPing too fast — slow down."),
    # Rep-gaming defense: a unique constraint stops re-endorsing/vouching the SAME
    # target, but not spraying across many. Cap the daily spray (limit new rows only).
    "endorse": (Endorsement, Endorsement.endorser_id,
                "You're endorsing too fast — slow down."),
    "vouch": (Vouch, Vouch.author_id,
              "You're vouching too fast — slow down."),
}


async def rate_limit(
    db: AsyncSession, user_id: int, action: str, limit: int, window_s: int
) -> None:
    """Raise HTTP 429 if ``user_id`` already has >= ``limit`` rows for
    ``action`` within the last ``window_s`` seconds.

    Call this AFTER loading ``current_user`` and BEFORE inserting the new row,
    exactly like the messaging send limit. Threshold is ``recent >= limit`` so
    ``limit`` rows are allowed and the (limit+1)th within the window trips —
    matching messages.py (20 allowed, 21st blocked). For an endpoint that needs
    both an hourly and a daily ceiling, call this twice.

    This is a SOFT cap: the count-then-insert isn't atomic, so a burst of
    concurrent requests can overshoot by a few. That's intentional — the caps are
    generous anti-flood ceilings (a bounded overshoot is harmless), not hard
    quotas. It mirrors the messaging send limit's own count-then-insert semantics.
    """
    model, col, msg = _ACTIONS[action]
    since = datetime.utcnow() - timedelta(seconds=window_s)
    recent = await db.scalar(
        select(func.count(model.id)).where(col == user_id, model.created_at >= since)
    ) or 0
    if recent >= limit:
        raise HTTPException(status_code=429, detail=msg)
