"""In-app messaging: 1:1 DMs + project team chats, plus user blocks.

Design notes
------------
* A `Conversation` is either a 'dm' (exactly two members) or a 'project' team
  chat (the project's creator + accepted members).
* DM find-or-create is made race-safe by a deterministic `dm_key`
  ("{min_uid}:{max_uid}"), unique across the table. Project chats are one per
  project via a unique `project_id`. Both nullable columns allow many NULLs
  (Postgres + SQLite), so a project chat has dm_key NULL and a DM has
  project_id NULL without colliding.
* Reports reuse the generic `Report` model (target_type="message") that the
  admin /reports panel already lists — no parallel report table.
"""
from datetime import datetime

from sqlalchemy import (
    BigInteger, DateTime, ForeignKey, Index, String, Text, UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Conversation(Base):
    __tablename__ = "conversations"
    __table_args__ = (
        UniqueConstraint("dm_key", name="uq_conversation_dm_key"),
        UniqueConstraint("project_id", name="uq_conversation_project"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    kind: Mapped[str] = mapped_column(String(12))  # "dm" | "project"
    # Set only for project chats (one conversation per project).
    project_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("projects.id", ondelete="CASCADE"), nullable=True
    )
    # Deterministic key for DM dedupe: "{min(a,b)}:{max(a,b)}". NULL for project.
    dm_key: Mapped[str | None] = mapped_column(String(40), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    members = relationship(
        "ConversationMember", back_populates="conversation",
        cascade="all, delete-orphan",
    )


class ConversationMember(Base):
    __tablename__ = "conversation_members"
    __table_args__ = (
        UniqueConstraint("conversation_id", "user_id",
                         name="uq_conv_member_conv_user"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    conversation_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("conversations.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    # When the member last opened the conversation. NULL = never read.
    last_read_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    conversation = relationship("Conversation", back_populates="members")


class Message(Base):
    __tablename__ = "messages"
    __table_args__ = (
        Index("ix_messages_conv_created", "conversation_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    conversation_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("conversations.id", ondelete="CASCADE"), index=True
    )
    sender_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, index=True
    )


class Block(Base):
    """`blocker_id` has blocked `blocked_id`. A block in EITHER direction stops
    DM creation + sending between the two users."""
    __tablename__ = "blocks"
    __table_args__ = (
        UniqueConstraint("blocker_id", "blocked_id", name="uq_block_pair"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    blocker_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    blocked_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
