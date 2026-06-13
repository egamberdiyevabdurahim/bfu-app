from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.mixins import SoftDeleteMixin, TimestampMixin


class Project(SoftDeleteMixin, TimestampMixin, Base):
    """Polymorphic: type='startup' or 'volunteering'."""
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    type: Mapped[str] = mapped_column(String(20), index=True)
    creator_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(255))
    goal: Mapped[str | None] = mapped_column(Text, nullable=True)
    channel: Mapped[str | None] = mapped_column(String(255), nullable=True)
    about: Mapped[str | None] = mapped_column(Text, nullable=True)
    age_from: Mapped[int | None] = mapped_column(Integer, nullable=True)
    age_to: Mapped[int | None] = mapped_column(Integer, nullable=True)
    gender_req: Mapped[str | None] = mapped_column(String(10), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_hiring: Mapped[bool] = mapped_column(Boolean, default=True)
    is_approved: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    is_pinned: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    is_draft: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    view_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")

    creator = relationship("User", backref="created_projects")
    members = relationship("ProjectMember", back_populates="project", cascade="all, delete-orphan")
    req_regions = relationship("ProjectReqRegion", back_populates="project", cascade="all, delete-orphan")
    req_skills = relationship("ProjectReqSkill", back_populates="project", cascade="all, delete-orphan")
    req_knowledges = relationship("ProjectReqKnowledge", back_populates="project", cascade="all, delete-orphan")
    applications = relationship("ProjectApplication", back_populates="project", cascade="all, delete-orphan")


class ProjectMember(Base):
    __tablename__ = "project_members"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("projects.id", ondelete="CASCADE"))
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"))
    joined_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    project = relationship("Project", back_populates="members")
    user = relationship("User")


class ProjectReqRegion(Base):
    __tablename__ = "project_req_regions"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("projects.id", ondelete="CASCADE"))
    region_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("regions.id"))

    project = relationship("Project", back_populates="req_regions")
    region = relationship("Region")


class ProjectReqSkill(Base):
    __tablename__ = "project_req_skills"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("projects.id", ondelete="CASCADE"))
    skill_name: Mapped[str] = mapped_column(String(255))

    project = relationship("Project", back_populates="req_skills")


class ProjectReqKnowledge(Base):
    __tablename__ = "project_req_knowledges"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("projects.id", ondelete="CASCADE"))
    knowledge_name: Mapped[str] = mapped_column(String(255))

    project = relationship("Project", back_populates="req_knowledges")


class ProjectApplication(Base):
    """Pending/Accepted/Declined join requests — replaces direct join."""
    __tablename__ = "project_applications"
    __table_args__ = (
        UniqueConstraint("project_id", "applicant_id", name="uq_application_project_applicant"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("projects.id", ondelete="CASCADE"))
    applicant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"))
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending | accepted | declined
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    project = relationship("Project", back_populates="applications")
    applicant = relationship("User")
