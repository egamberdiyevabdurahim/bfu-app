"""Real presence: ensure users.last_seen_at + index (idempotent).

The column already exists in production (created at runtime by app.main's
startup migrations and by create_all), so this revision is written to be a
safe no-op when re-run or applied to an already-migrated DB. `versions/` was
previously empty, so this is the baseline revision (down_revision = None).

Revision ID: 20260708_presence
Revises:
Create Date: 2026-07-08
"""
import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "20260708_presence"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name
    if dialect == "postgresql":
        # Postgres supports IF NOT EXISTS on both — cheapest idempotent path.
        op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP;")
        op.execute(
            "CREATE INDEX IF NOT EXISTS ix_users_last_seen_at ON users (last_seen_at);"
        )
    else:
        # SQLite / others: no ADD COLUMN IF NOT EXISTS → guard with try/except.
        try:
            op.add_column("users", sa.Column("last_seen_at", sa.DateTime(), nullable=True))
        except Exception:
            pass
        try:
            op.create_index("ix_users_last_seen_at", "users", ["last_seen_at"])
        except Exception:
            pass


def downgrade() -> None:
    # Presence data is disposable; guarded so downgrade never hard-fails.
    try:
        op.drop_index("ix_users_last_seen_at", table_name="users")
    except Exception:
        pass
    try:
        op.drop_column("users", "last_seen_at")
    except Exception:
        pass
