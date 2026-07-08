"""users.onboarding_completed — first-login onboarding gate.

Adds a NOT NULL boolean (default false) so a brand-new builder sees the desktop
welcome flow exactly once, then never again after they finish or skip it.

Idempotent + safe to re-run. In production the column is also added at runtime
by app.main's startup guard (ADD COLUMN IF NOT EXISTS ... NOT NULL DEFAULT
false), so this revision only fills gaps and never hard-fails on an
already-migrated DB.

Revision ID: 20260708_onboarding
Revises: 20260708_member_role
Create Date: 2026-07-08
"""
import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "20260708_onboarding"
down_revision = "20260708_member_role"
branch_labels = None
depends_on = None


def _has_column(bind, table: str, column: str) -> bool:
    insp = sa.inspect(bind)
    if table not in insp.get_table_names():
        return False
    return any(c["name"] == column for c in insp.get_columns(table))


def upgrade() -> None:
    bind = op.get_bind()
    if not _has_column(bind, "users", "onboarding_completed"):
        op.add_column(
            "users",
            sa.Column(
                "onboarding_completed",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("false"),
            ),
        )


def downgrade() -> None:
    try:
        op.drop_column("users", "onboarding_completed")
    except Exception:
        pass
