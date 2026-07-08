"""users.notification_prefs — per-user notification opt-out preferences.

Adds a NOT NULL JSON column defaulting to '{}'. Opt-out model: an absent key
means the category is ENABLED, so every existing user (empty {}) keeps all
notifications on — only a stored `false` turns something off.

Idempotent + safe to re-run. In production the column is also added at runtime
by app.main's startup guard (ADD COLUMN IF NOT EXISTS ... JSONB NOT NULL DEFAULT
'{}'::jsonb), so this revision only fills gaps and never hard-fails on an
already-migrated DB.

Revision ID: 20260708_notif_prefs
Revises: 20260708_onboarding
Create Date: 2026-07-08
"""
import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "20260708_notif_prefs"
down_revision = "20260708_onboarding"
branch_labels = None
depends_on = None


def _has_column(bind, table: str, column: str) -> bool:
    insp = sa.inspect(bind)
    if table not in insp.get_table_names():
        return False
    return any(c["name"] == column for c in insp.get_columns(table))


def upgrade() -> None:
    bind = op.get_bind()
    if not _has_column(bind, "users", "notification_prefs"):
        op.add_column(
            "users",
            sa.Column(
                "notification_prefs",
                sa.JSON(),
                nullable=False,
                server_default="{}",
            ),
        )


def downgrade() -> None:
    try:
        op.drop_column("users", "notification_prefs")
    except Exception:
        pass
