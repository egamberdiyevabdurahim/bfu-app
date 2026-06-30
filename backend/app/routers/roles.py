"""Aggregate open-roles discovery across all live projects."""
from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.database import get_db
from app.models.project import Project
from app.models.role import ProjectRole
from app.models.user import User

router = APIRouter(prefix="/roles", tags=["roles"])

_LIMIT = 200


@router.get("", response_model=dict)
async def open_roles(
    q: str | None = Query(None, max_length=80),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Every OPEN role across approved + hiring + active + non-draft +
    non-deleted projects, newest first. `q` filters by role name (case-insensitive
    substring)."""
    stmt = (
        select(ProjectRole, Project)
        .join(Project, Project.id == ProjectRole.project_id)
        .where(
            ProjectRole.is_filled == False,
            Project.is_deleted == False,
            Project.is_draft == False,
            Project.is_approved == True,
            Project.is_hiring == True,
            Project.is_active == True,
        )
        .order_by(ProjectRole.id.desc())
        .limit(_LIMIT)
    )
    if q and q.strip():
        stmt = stmt.where(func.lower(ProjectRole.name).like(f"%{q.strip().lower()}%"))
    rows = (await db.execute(stmt)).all()
    return {
        "roles": [
            {
                "id": role.id,
                "name": role.name,
                "project": {"id": proj.id, "name": proj.name, "type": proj.type},
                "created_at": role.created_at.isoformat() if role.created_at else None,
            }
            for role, proj in rows
        ],
    }
