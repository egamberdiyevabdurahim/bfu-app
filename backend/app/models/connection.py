from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Follow(Base):
    """One member follows a user OR a project (polymorphic). One-directional;
    no reciprocation needed (unlike Interest)."""
    __tablename__ = "follows"
    __table_args__ = (
        UniqueConstraint("follower_id", "target_type", "target_id",
                         name="uq_follow_follower_target"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    follower_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    target_type: Mapped[str] = mapped_column(String(16))   # "user" | "project"
    target_id: Mapped[int] = mapped_column(BigInteger)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class ProjectUpdate(Base):
    """A short founder-posted update on a project. Fans out to followers+members."""
    __tablename__ = "project_updates"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    author_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"))
    text: Mapped[str] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class MentorSlot(Base):
    """A concrete bookable 15-minute slot a mentor publishes. Explicit rows
    (not recurring rules) — every slot is directly bookable."""
    __tablename__ = "mentor_slots"
    __table_args__ = (
        UniqueConstraint("mentor_id", "start_at", name="uq_slot_mentor_start"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    mentor_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    start_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    duration_min: Mapped[int] = mapped_column(Integer, default=15)
    status: Mapped[str] = mapped_column(String(12), default="open")  # open | booked | cancelled
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Booking(Base):
    """A mentee's booking of a mentor slot. Lifecycle: requested → confirmed |
    declined | cancelled. Declining/cancelling frees the slot back to open."""
    __tablename__ = "bookings"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    slot_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("mentor_slots.id", ondelete="CASCADE"), index=True)
    mentor_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    mentee_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    status: Mapped[str] = mapped_column(String(12), default="requested")  # requested|confirmed|declined|cancelled
    note: Mapped[str | None] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
