from sqlalchemy import BigInteger, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.mixins import SoftDeleteMixin


class Region(SoftDeleteMixin, Base):
    __tablename__ = "regions"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    name_uz: Mapped[str] = mapped_column(String(255))
    name_en: Mapped[str] = mapped_column(String(255))
    name_ru: Mapped[str] = mapped_column(String(255))

    learning_centers = relationship("LearningCenter", back_populates="region")
    schools = relationship("School", back_populates="region")
    users = relationship("User", back_populates="region")

    def get_name(self, lang: str) -> str:
        return getattr(self, f"name_{lang}", self.name_en)


class LearningCenter(SoftDeleteMixin, Base):
    __tablename__ = "learning_centers"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255))
    region_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("regions.id"))
    parent_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("learning_centers.id"), nullable=True)
    group_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    group_link: Mapped[str | None] = mapped_column(String(512), nullable=True)

    region = relationship("Region", back_populates="learning_centers")
    users = relationship("UserLearningCenter", back_populates="learning_center")
    parent = relationship("LearningCenter", remote_side="LearningCenter.id", back_populates="branches")
    branches = relationship("LearningCenter", back_populates="parent")

    @property
    def is_branch(self) -> bool:
        return self.parent_id is not None


class School(SoftDeleteMixin, Base):
    __tablename__ = "schools"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255))
    region_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("regions.id"))
    group_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    group_link: Mapped[str | None] = mapped_column(String(512), nullable=True)

    region = relationship("Region", back_populates="schools")
    users = relationship("UserSchool", back_populates="school")
