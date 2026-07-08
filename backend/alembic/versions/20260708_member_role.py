"""project_members.role — a per-teammate title (the MEMBER role).

Adds a nullable `role` string to project_members so the founder can label each
teammate ("Backend", "Designer", …). This is distinct from the OPEN roles a
project hires for (project_roles / project_applications.role).

Idempotent + safe to re-run. In production the column is also added at runtime
by app.main's startup guard (ADD COLUMN IF NOT EXISTS), so this revision only
fills gaps and never hard-fails on an already-migrated DB.

Revision ID: 20260708_member_role
Revises: 20260708_profile_views
Create Date: 2026-07-08
"""
import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "20260708_member_role"
down_revision = "20260708_profile_views"
branch_labels = None
depends_on = None


def _has_column(bind, table: str, column: str) -> bool:
    insp = sa.inspect(bind)
    if table not in insp.get_table_names():
        return False
    return any(c["name"] == column for c in insp.get_columns(table))


def upgrade() -> None:
    bind = op.get_bind()
    if not _has_column(bind, "project_members", "role"):
        op.add_column(
            "project_members",
            sa.Column("role", sa.String(length=80), nullable=True),
        )


def downgrade() -> None:
    try:
        op.drop_column("project_members", "role")
    except Exception:
        pass
