"""Who-viewed-your-profile: one row per (viewer, viewed) pair.

A `ProfileView` records that `viewer_id` looked at `viewed_id`'s profile
(recorded inside the authed GET /users/{id}). The UNIQUE (viewer_id, viewed_id)
means repeat views UPSERT — we bump `updated_at` instead of piling rows — so the
"who viewed you" list stays one row per distinct viewer, ordered by recency.
Index (viewed_id, updated_at) serves the newest-first viewers query for a user.
"""
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ProfileView(Base):
    __tablename__ = "profile_views"
    __table_args__ = (
        UniqueConstraint("viewer_id", "viewed_id", name="uq_profile_view_pair"),
        Index("ix_profile_views_viewed_updated", "viewed_id", "updated_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    viewer_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    viewed_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )
