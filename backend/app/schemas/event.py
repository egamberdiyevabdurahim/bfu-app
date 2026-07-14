"""Event + RSVP wire schemas (incl. the registration form).

`has_form` is read straight off `Event.has_form` (a model property) via
from_attributes, so every list/detail payload agrees on one source of truth.
"""
from datetime import datetime
from typing import Any

from pydantic import BaseModel


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
    has_form: bool = False       # does RSVPing require filling a registration form?
    model_config = {"from_attributes": True}


class EventDetailOut(EventOut):
    """GET /events/{id} — carries the full question list so the client can
    render the form. Validation of the answers still happens server-side."""
    form_schema: list[dict] | None = None


class RsvpIn(BaseModel):
    status: str = "going"                    # "going" | "interested"
    # Answers to the event's form, keyed by question key. REQUIRED (and
    # server-validated) when the event has a form and status == "going";
    # ignored otherwise.
    answers: dict[str, Any] | None = None


class MyResponseOut(BaseModel):
    """GET /events/{id}/my-response — the caller's own saved answers."""
    answers: dict[str, Any] | None = None


class FormResponseOut(BaseModel):
    """One row of the admin responses table."""
    user_id: int
    display_name: str
    tg_username: str | None = None
    phone_number: str | None = None
    submitted_at: datetime | None = None
    answers: dict[str, Any] | None = None
