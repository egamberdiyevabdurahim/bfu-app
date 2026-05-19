from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_admin_user, get_super_admin_user
from app.database import get_db
from app.models.user import User
from app.models.project import Project
from app.models.region import Region, School, LearningCenter
from app.schemas.user import AdminUserOut
from app.schemas.project import AdminProjectOut
from pydantic import BaseModel

router = APIRouter(prefix="/admin", tags=["admin"])

class StatsOut(BaseModel):
    users: int
    projects: int
    regions: int
    schools: int
    learning_centers: int

class UpdateGroupConfig(BaseModel):
    group_id: int | None = None
    group_link: str | None = None
    name: str | None = None
    region_id: int | None = None
    latitude: float | None = None
    longitude: float | None = None

class UpdateRoleConfig(BaseModel):
    role: str

# ── Stats ────────────────────────────────────────────────────────────────────

@router.get("/stats", response_model=StatsOut)
async def get_stats(
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    users = await db.scalar(select(func.count(User.id)))
    projects = await db.scalar(select(func.count(Project.id)))
    regions = await db.scalar(select(func.count(Region.id)))
    schools = await db.scalar(select(func.count(School.id)))
    lcs = await db.scalar(select(func.count(LearningCenter.id)))
    
    return StatsOut(
        users=users or 0,
        projects=projects or 0,
        regions=regions or 0,
        schools=schools or 0,
        learning_centers=lcs or 0,
    )

# ── Users ────────────────────────────────────────────────────────────────────

@router.get("/users", response_model=list[AdminUserOut])
async def list_users(
    skip: int = 0, limit: int = 50,
    search: str | None = None,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    q = select(User).order_by(User.id.desc())
    if search:
        search_term = f"%{search}%"
        q = q.where(User.name.ilike(search_term) | User.surname.ilike(search_term) | User.tg_username.ilike(search_term))
    
    q = q.offset(skip).limit(limit)
    res = await db.execute(q)
    return res.scalars().all()

@router.patch("/users/{user_id}/toggle-check")
async def toggle_user_check(
    user_id: int,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    user.checked = not user.checked
    await db.commit()
    return {"checked": user.checked}

@router.patch("/users/{user_id}/role")
async def update_user_role(
    user_id: int,
    body: UpdateRoleConfig,
    super_admin: User = Depends(get_super_admin_user),
    db: AsyncSession = Depends(get_db)
):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    if body.role not in ("user", "admin", "super_admin"):
        raise HTTPException(400, "Invalid role")
    user.role = body.role
    await db.commit()
    return {"role": user.role}

@router.delete("/users/{user_id}")
async def soft_delete_user(
    user_id: int,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    user.is_deleted = True
    await db.commit()
    return {"detail": "User soft deleted"}

@router.delete("/users/{user_id}/hard")
async def hard_delete_user(
    user_id: int,
    super_admin: User = Depends(get_super_admin_user),
    db: AsyncSession = Depends(get_db)
):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    await db.delete(user)
    await db.commit()
    return {"detail": "User hard deleted"}

# ── Projects ─────────────────────────────────────────────────────────────────

@router.get("/projects", response_model=list[AdminProjectOut])
async def list_projects(
    skip: int = 0, limit: int = 50,
    search: str | None = None,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    q = select(Project).order_by(Project.id.desc())
    if search:
        q = q.where(Project.name.ilike(f"%{search}%"))
    
    q = q.offset(skip).limit(limit)
    res = await db.execute(q)
    return res.scalars().all()

@router.patch("/projects/{project_id}/approve")
async def approve_project(
    project_id: int,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    p = await db.get(Project, project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    p.is_approved = not p.is_approved
    await db.commit()
    return {"is_approved": p.is_approved}

@router.delete("/projects/{project_id}")
async def soft_delete_project(
    project_id: int,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    p = await db.get(Project, project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    p.is_deleted = True
    await db.commit()
    return {"detail": "Project soft deleted"}

@router.delete("/projects/{project_id}/hard")
async def hard_delete_project(
    project_id: int,
    super_admin: User = Depends(get_super_admin_user),
    db: AsyncSession = Depends(get_db)
):
    p = await db.get(Project, project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    await db.delete(p)
    await db.commit()
    return {"detail": "Project hard deleted"}

# ── Locations ────────────────────────────────────────────────────────────────

@router.get("/regions")
async def list_regions(admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(Region).order_by(Region.id))
    return res.scalars().all()

@router.get("/schools")
async def list_schools(admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(School).where(School.is_deleted == False).order_by(School.id))
    return res.scalars().all()

@router.patch("/schools/{school_id}")
async def update_school(
    school_id: int,
    body: UpdateGroupConfig,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    s = await db.get(School, school_id)
    if not s:
        raise HTTPException(404, "School not found")
    if body.group_id is not None:
        s.group_id = body.group_id
    if body.group_link is not None:
        s.group_link = body.group_link
    if body.name is not None:
        name = body.name.strip()
        if not name:
            raise HTTPException(400, "Name cannot be empty")
        s.name = name
    if body.region_id is not None:
        if not await db.get(Region, body.region_id):
            raise HTTPException(400, "Region not found")
        s.region_id = body.region_id
    if body.latitude is not None:
        s.latitude = body.latitude
    if body.longitude is not None:
        s.longitude = body.longitude
    await db.commit()
    return s

@router.delete("/schools/{school_id}")
async def delete_school(
    school_id: int,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    s = await db.get(School, school_id)
    if not s:
        raise HTTPException(404, "School not found")
    s.is_deleted = True
    await db.commit()
    return {"detail": "School deleted"}

@router.get("/learning-centers")
async def list_lcs(admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(LearningCenter).where(LearningCenter.is_deleted == False).order_by(LearningCenter.id))
    return res.scalars().all()

@router.patch("/learning-centers/{lc_id}")
async def update_lc(
    lc_id: int,
    body: UpdateGroupConfig,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    lc = await db.get(LearningCenter, lc_id)
    if not lc:
        raise HTTPException(404, "Learning Center not found")
    if body.group_id is not None:
        lc.group_id = body.group_id
    if body.group_link is not None:
        lc.group_link = body.group_link
    if body.name is not None:
        name = body.name.strip()
        if not name:
            raise HTTPException(400, "Name cannot be empty")
        lc.name = name
    if body.region_id is not None:
        if not await db.get(Region, body.region_id):
            raise HTTPException(400, "Region not found")
        lc.region_id = body.region_id
    if body.latitude is not None:
        lc.latitude = body.latitude
    if body.longitude is not None:
        lc.longitude = body.longitude
    await db.commit()
    return lc

@router.delete("/learning-centers/{lc_id}")
async def delete_lc(
    lc_id: int,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    lc = await db.get(LearningCenter, lc_id)
    if not lc:
        raise HTTPException(404, "Learning Center not found")
    lc.is_deleted = True
    await db.commit()
    return {"detail": "Learning Center deleted"}
