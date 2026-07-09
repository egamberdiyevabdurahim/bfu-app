from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class EventRsvp(Base):
    """A user's RSVP to an event (which, on BFU, is an opportunity keyed by a
    deadline — grant/scholarship/hackathon/meetup). ``status`` is ``going`` (the
    countable RSVP) or ``interested`` (a softer save). One row per (event, user)
    — toggling status reuses the row; un-RSVP deletes it."""

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
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    # Stamped with utcnow() only after the deadline reminder push succeeds, so the
    # hourly cron sends exactly one reminder per RSVP (see rsvp_reminders.py).
    reminded_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
