from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ProjectRole(Base):
    """A founder-declared open position on a project (e.g. "Backend dev"). The
    aggregate /roles list shows every role whose project is live and whose
    is_filled is False. Distinct from project_applications.role (what an applicant
    asked for) and ProjectReqSkill (a required skill, not a position)."""
    __tablename__ = "project_roles"
    __table_args__ = (
        UniqueConstraint("project_id", "name", name="uq_project_role_project_name"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(80))
    is_filled: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
