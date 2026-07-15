from datetime import datetime

from sqlalchemy import JSON, BigInteger, Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.mixins import SoftDeleteMixin, TimestampMixin


class Event(SoftDeleteMixin, TimestampMixin, Base):
    __tablename__ = "events"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    type: Mapped[str] = mapped_column(String(32))  # hackathon | grant | scholarship | meetup | other
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    link: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    cover_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    deadline: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # When the event ACTUALLY happens (distinct from `deadline`, the signup
    # cutoff). Nullable — many opportunities have only a deadline. Drives the
    # T-1h reminder (see EventRsvp.reminded_1h_at) + "starts in …" UI copy.
    starts_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    region_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("regions.id"), nullable=True
    )
    created_by: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("users.id"), nullable=True
    )
    # Posting org (nullable) + moderation. Admin-created events are approved;
    # partner-submitted opportunities start unapproved (admin queue).
    partner_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True, index=True)
    is_approved: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    # Optional REGISTRATION FORM: a JSON list of question objects
    # ({"key","label","type","required","options"?,"section"?}) authored by an
    # admin in the panel — the questions are data, so changing them needs no
    # deploy. NULL / [] = no form, i.e. a plain one-click RSVP. Every rule about
    # this blob lives in app.services.event_forms (validate_schema).
    form_schema: Mapped[list | None] = mapped_column(JSON, nullable=True)
    # Max number of "going" attendees. NULL = unlimited. When set and the seats
    # are full, a new "going" RSVP is stored "waitlisted" instead; a freed seat
    # (a going attendee cancels, or an admin marks one no_show) auto-promotes the
    # OLDEST waitlisted registrant. Seat accounting excludes no-shows — see
    # app.routers.events._seats_taken.
    capacity: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # When an admin EXPLICITLY announced this event to members' chats (the
    # targeted DM fan-out + the global-group card). NULL = never announced.
    # Creating or approving an event no longer sends anything to chats on its
    # own — an admin has to press "Announce" (POST /admin/events/{id}/announce).
    # This column both gates re-announcing (no accidental double-blast) and lets
    # the panel show an "Announced ✓" state.
    announced_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    @property
    def has_form(self) -> bool:
        """Does this event ask registration questions? (read by EventOut)"""
        return bool(self.form_schema)
