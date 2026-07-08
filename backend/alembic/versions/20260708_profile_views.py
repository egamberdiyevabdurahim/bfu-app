"""Who-viewed-your-profile: profile_views (named viewers, LinkedIn-style).

Idempotent + safe to re-run. In production this table is already created at
runtime by app.main's startup (Base.metadata.create_all + the CREATE INDEX
IF NOT EXISTS guards), so this revision only fills gaps and never hard-fails on
an already-migrated DB.

Revision ID: 20260708_profile_views
Revises: 20260708_messaging
Create Date: 2026-07-08
"""
import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "20260708_profile_views"
down_revision = "20260708_messaging"
branch_labels = None
depends_on = None


def _has_table(bind, name: str) -> bool:
    insp = sa.inspect(bind)
    return name in insp.get_table_names()


def upgrade() -> None:
    bind = op.get_bind()

    if not _has_table(bind, "profile_views"):
        op.create_table(
            "profile_views",
            sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
            sa.Column("viewer_id", sa.BigInteger(), nullable=False),
            sa.Column("viewed_id", sa.BigInteger(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        )

    # Indexes + the one-row-per-pair unique constraint (guarded — Postgres
    # supports IF NOT EXISTS; SQLite tolerates re-run via the try/except).
    stmts = [
        "CREATE INDEX IF NOT EXISTS ix_profile_views_viewer ON profile_views (viewer_id)",
        "CREATE INDEX IF NOT EXISTS ix_profile_views_viewed ON profile_views (viewed_id)",
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_profile_view_pair ON profile_views (viewer_id, viewed_id)",
        "CREATE INDEX IF NOT EXISTS ix_profile_views_viewed_updated ON profile_views (viewed_id, updated_at)",
    ]
    for s in stmts:
        try:
            op.execute(s)
        except Exception:
            pass


def downgrade() -> None:
    try:
        op.drop_table("profile_views")
    except Exception:
        pass
