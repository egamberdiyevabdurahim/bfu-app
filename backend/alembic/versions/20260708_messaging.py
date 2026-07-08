"""Messaging v1: conversations, conversation_members, messages, blocks.

Idempotent + safe to re-run. In production these tables are already created at
runtime by app.main's startup (Base.metadata.create_all + the CREATE INDEX
IF NOT EXISTS guards), so this revision only fills gaps and never hard-fails on
an already-migrated DB.

Revision ID: 20260708_messaging
Revises: 20260708_presence
Create Date: 2026-07-08
"""
import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "20260708_messaging"
down_revision = "20260708_presence"
branch_labels = None
depends_on = None


def _has_table(bind, name: str) -> bool:
    insp = sa.inspect(bind)
    return name in insp.get_table_names()


def upgrade() -> None:
    bind = op.get_bind()

    if not _has_table(bind, "conversations"):
        op.create_table(
            "conversations",
            sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
            sa.Column("kind", sa.String(length=12), nullable=False),
            sa.Column("project_id", sa.BigInteger(), nullable=True),
            sa.Column("dm_key", sa.String(length=40), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
        )

    if not _has_table(bind, "conversation_members"):
        op.create_table(
            "conversation_members",
            sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
            sa.Column("conversation_id", sa.BigInteger(), nullable=False),
            sa.Column("user_id", sa.BigInteger(), nullable=False),
            sa.Column("last_read_at", sa.DateTime(), nullable=True),
        )

    if not _has_table(bind, "messages"):
        op.create_table(
            "messages",
            sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
            sa.Column("conversation_id", sa.BigInteger(), nullable=False),
            sa.Column("sender_id", sa.BigInteger(), nullable=False),
            sa.Column("body", sa.Text(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=True),
        )

    if not _has_table(bind, "blocks"):
        op.create_table(
            "blocks",
            sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
            sa.Column("blocker_id", sa.BigInteger(), nullable=False),
            sa.Column("blocked_id", sa.BigInteger(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=True),
        )

    # Indexes + unique constraints (guarded — Postgres supports IF NOT EXISTS;
    # SQLite tolerates re-run via the try/except).
    stmts = [
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_conversation_dm_key ON conversations (dm_key)",
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_conversation_project ON conversations (project_id)",
        "CREATE INDEX IF NOT EXISTS ix_conv_members_conv ON conversation_members (conversation_id)",
        "CREATE INDEX IF NOT EXISTS ix_conv_members_user ON conversation_members (user_id)",
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_conv_member_conv_user ON conversation_members (conversation_id, user_id)",
        "CREATE INDEX IF NOT EXISTS ix_messages_conversation_id ON messages (conversation_id)",
        "CREATE INDEX IF NOT EXISTS ix_messages_sender_id ON messages (sender_id)",
        "CREATE INDEX IF NOT EXISTS ix_messages_created_at ON messages (created_at)",
        "CREATE INDEX IF NOT EXISTS ix_messages_conv_created ON messages (conversation_id, created_at)",
        "CREATE INDEX IF NOT EXISTS ix_blocks_blocker ON blocks (blocker_id)",
        "CREATE INDEX IF NOT EXISTS ix_blocks_blocked ON blocks (blocked_id)",
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_block_pair ON blocks (blocker_id, blocked_id)",
    ]
    for s in stmts:
        try:
            op.execute(s)
        except Exception:
            pass


def downgrade() -> None:
    for t in ("messages", "conversation_members", "conversations", "blocks"):
        try:
            op.drop_table(t)
        except Exception:
            pass
