from datetime import datetime

from sqlalchemy import JSON, BigInteger, Boolean, DateTime, ForeignKey, String, Text
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

    @property
    def has_form(self) -> bool:
        """Does this event ask registration questions? (read by EventOut)"""
        return bool(self.form_schema)
