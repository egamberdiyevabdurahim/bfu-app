from datetime import datetime

from sqlalchemy import (
    JSON,
    BigInteger,
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class EventRsvp(Base):
    """A user's RSVP to an event (which, on BFU, is an opportunity keyed by a
    deadline — grant/scholarship/hackathon/meetup). ``status`` is ``going`` (the
    countable RSVP), ``interested`` (a softer save), or ``waitlisted`` (a
    ``going`` request that arrived after the event's capacity filled — promoted
    to ``going`` automatically when a seat frees; see app.routers.events). One
    row per (event, user) — toggling status reuses the row; un-RSVP deletes it."""

    __tablename__ = "event_rsvps"
    __table_args__ = (
        UniqueConstraint("event_id", "user_id", name="uq_event_rsvp_event_user"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    event_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("events.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    status: Mapped[str] = mapped_column(String(16), default="going")
    # Answers to the event's registration form (Event.form_schema), keyed by
    # question key: {"q1": "Ali, 11-sinf", "q4": ["a","b"]}. NULL when the event
    # has no form (plain RSVP). Server-validated on write — see
    # app.services.event_forms.parse_answers; a re-RSVP overwrites this blob.
    answers: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    # Stamped with utcnow() only after the deadline reminder push succeeds, so the
    # hourly cron sends exactly one reminder per RSVP (see rsvp_reminders.py).
    reminded_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # ── Partner lead pipeline ────────────────────────────────────────────────
    # The registrant's stage in the partner's funnel, advanced by an admin/partner
    # in the panel. One of: registered | showed | scored | called | enrolled |
    # no_show. Defaults to "registered" on RSVP. (Allowed set lives in the admin
    # router — the single validation gate.)
    lead_status: Mapped[str] = mapped_column(
        String(20), default="registered", server_default="registered"
    )
    # A number the partner records for this registrant (e.g. a SAT mock score).
    score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Idempotency stamp for the T-1h (starts_at) reminder, mirroring `reminded_at`
    # (the T-24h deadline reminder) so each window fires exactly once per RSVP.
    reminded_1h_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # For events with ORGANIZER-SET custom reminder times (Event.reminder_times):
    # a JSON list of the reminder-time ISO strings ALREADY sent to this RSVP, so
    # the hourly cron fires each custom reminder exactly once. NULL/[] = none sent
    # yet. (Legacy auto T-24h/T-1h events keep using reminded_at/reminded_1h_at.)
    reminders_sent: Mapped[list | None] = mapped_column(JSON, nullable=True)
    # ── QR check-in ──────────────────────────────────────────────────────────
    # A short, unguessable per-registrant code (unique within the event). Encoded
    # in the attendee's ticket QR ("{event_id}.{code}") and also typeable as a
    # manual fallback. Generated when the RSVP becomes 'going'. Door staff scan the
    # QR → POST /events/{id}/checkin {code} marks the registrant showed.
    checkin_code: Mapped[str | None] = mapped_column(String(16), nullable=True, index=True)
    # When the registrant was scanned in at the door (idempotent: a second scan is
    # a no-op that reports "already checked in"). NULL = not yet checked in.
    checked_in_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
