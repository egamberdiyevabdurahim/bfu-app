from datetime import datetime

from pydantic import BaseModel


class RoleIn(BaseModel):
    name: str


class RoleFilledIn(BaseModel):
    is_filled: bool


class ProjectMini(BaseModel):
    id: int
    name: str
    type: str


class RoleOut(BaseModel):
    """A single project's role (project-detail view)."""
    id: int
    name: str
    is_filled: bool = False
    created_at: datetime | None = None


class OpenRoleOut(BaseModel):
    """An open role in the aggregate /roles list, carrying its project."""
    id: int
    name: str
    project: ProjectMini
    created_at: datetime | None = None
