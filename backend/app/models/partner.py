from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.mixins import SoftDeleteMixin, TimestampMixin


class Partner(SoftDeleteMixin, TimestampMixin, Base):
    """A partner organisation (university, learning center, employer, NGO).
    Created + vetted by admins, so `verified` defaults True. An optional
    owner_user_id links a Telegram user who may submit opportunities for the
    org (those go through the admin approval queue)."""
    __tablename__ = "partners"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255))
    about: Mapped[str | None] = mapped_column(Text, nullable=True)
    website: Mapped[str | None] = mapped_column(String(512), nullable=True)
    logo_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    region_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("regions.id"), nullable=True
    )
    owner_user_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True, index=True)
    verified: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
