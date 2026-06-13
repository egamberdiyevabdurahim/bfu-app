from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.mixins import SoftDeleteMixin, TimestampMixin


class User(SoftDeleteMixin, TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    telegram_id: Mapped[int] = mapped_column(BigInteger, index=True, unique=True)
    tg_username: Mapped[str | None] = mapped_column(String(255), nullable=True)
    language: Mapped[str] = mapped_column(String(2), default="en")
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    surname: Mapped[str | None] = mapped_column(String(255), nullable=True)
    gender: Mapped[str | None] = mapped_column(String(10), nullable=True)
    birth_year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    phone_number: Mapped[str | None] = mapped_column(String(20), nullable=True)
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    region_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("regions.id"), nullable=True)
    about: Mapped[str | None] = mapped_column(Text, nullable=True)
    role: Mapped[str] = mapped_column(String(20), default="user", server_default="user")
    is_registered: Mapped[bool] = mapped_column(Boolean, default=False)
    checked: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    denied_fields: Mapped[str | None] = mapped_column(Text, nullable=True)
    denied_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    open_to_work: Mapped[bool] = mapped_column(Boolean, default=False)
    open_to_volunteering: Mapped[bool] = mapped_column(Boolean, default=False)
    referred_by: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id"), nullable=True)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_nudged_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # Admin removal. Unlike is_deleted (which /auth/telegram auto-restores
    # for users who come back), banned users are refused at login.
    banned: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    # Telegram profile-photo file_id (stable; file_path expires so we re-resolve
    # via getFile on demand). Refreshed on each login. None = no photo / private.
    photo_file_id: Mapped[str | None] = mapped_column(String(255), nullable=True)

    region = relationship("Region", back_populates="users")
    learning_centers = relationship("UserLearningCenter", back_populates="user", cascade="all, delete-orphan")
    school = relationship("UserSchool", back_populates="user", uselist=False, cascade="all, delete-orphan")
    analysis = relationship("UserAnalysis", back_populates="user", uselist=False, cascade="all, delete-orphan")

    @property
    def display_name(self) -> str:
        name = self.name.capitalize() if self.name else ""
        initial = f"{self.surname[0].upper()}" if self.surname else ""
        return f"{name}. {initial}" if initial else name

    @property
    def photo_url(self) -> str | None:
        """Signed avatar URL (None if no Telegram photo). Read by UserPublic
        via from_attributes; the frontend falls back to initials on error."""
        from app.services.signing import avatar_url
        return avatar_url(self.id, self.photo_file_id)


class UserLearningCenter(Base):
    __tablename__ = "user_learning_centers"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"))
    learning_center_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("learning_centers.id"))

    user = relationship("User", back_populates="learning_centers")
    learning_center = relationship("LearningCenter", back_populates="users")


class Report(TimestampMixin, Base):
    __tablename__ = "reports"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    reporter_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"))
    target_type: Mapped[str] = mapped_column(String(16))  # "user" | "project"
    target_id: Mapped[int] = mapped_column(BigInteger)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    resolved: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")


class Favorite(Base):
    """User bookmarks a project (no application implied)."""
    __tablename__ = "favorites"

    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    project_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Interest(Base):
    """Soft 'interested in your profile' ping — lighter than a full intro."""
    __tablename__ = "interests"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    from_user_id: Mapped[int] = mapped_column(BigInteger, index=True)
    to_user_id: Mapped[int] = mapped_column(BigInteger, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


class AuditLog(Base):
    """Append-only record of admin actions for accountability."""
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    admin_id: Mapped[int] = mapped_column(BigInteger, index=True)
    action: Mapped[str] = mapped_column(String(64), index=True)
    target_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    target_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    details: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


class BioTranslation(Base):
    """Cached Claude bio translations to keep cost ~zero per view."""
    __tablename__ = "bio_translations"

    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    lang: Mapped[str] = mapped_column(String(2), primary_key=True)
    source_hash: Mapped[str] = mapped_column(String(64))  # invalidate on source change
    text: Mapped[str] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class ErrorLog(Base):
    """Recent unhandled API errors — surfaced in the admin panel."""
    __tablename__ = "error_logs"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    path: Mapped[str] = mapped_column(String(512))
    method: Mapped[str] = mapped_column(String(8))
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    traceback: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class PendingLocation(Base):
    """Last geo-location an admin shared with the Telegram bot.
    Used to auto-fill a school/LC position from the web admin."""
    __tablename__ = "pending_locations"

    telegram_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)


class UserSchool(Base):
    __tablename__ = "user_schools"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    school_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("schools.id"))

    user = relationship("User", back_populates="school")
    school = relationship("School", back_populates="users")
