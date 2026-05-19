"""Unauthenticated landing endpoints — no JWT needed. Used by the public
marketing site at brightfuturesuzbekistan.uz/ and /r/<id>."""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.project import Project
from app.models.region import Region
from app.models.user import User

router = APIRouter(prefix="/public", tags=["public"])


class PublicRegion(BaseModel):
    id: int
    name_en: str
    name_uz: str
    name_ru: str
    member_count: int = 0
    project_count: int = 0
    model_config = {"from_attributes": True}


class PublicProject(BaseModel):
    id: int
    type: str
    name: str
    goal: str | None = None
    created_at: datetime
    model_config = {"from_attributes": True}


@router.get("/regions", response_model=list[PublicRegion])
async def list_public_regions(db: AsyncSession = Depends(get_db)):
    regs = (await db.execute(
        select(Region).where(Region.is_deleted == False).order_by(Region.id)
    )).scalars().all()
    # Per-region counts (small loops — only 14 regions).
    out = []
    for r in regs:
        m = await db.scalar(
            select(func.count(User.id)).where(
                User.region_id == r.id, User.is_registered == True, User.is_deleted == False
            )
        )
        p = await db.scalar(
            select(func.count(Project.id)).where(
                Project.is_deleted == False,
                Project.is_approved == True,
                Project.is_draft == False,
            )
        )
        out.append(PublicRegion(
            id=r.id, name_en=r.name_en, name_uz=r.name_uz, name_ru=r.name_ru,
            member_count=m or 0, project_count=p or 0,
        ))
    return out


@router.get("/regions/{region_id}", response_model=dict)
async def region_landing(region_id: int, db: AsyncSession = Depends(get_db)):
    r = await db.get(Region, region_id)
    if not r or r.is_deleted:
        raise HTTPException(404, "Region not found")
    members = await db.scalar(
        select(func.count(User.id)).where(
            User.region_id == region_id, User.is_registered == True, User.is_deleted == False
        )
    ) or 0
    proj_rows = (await db.execute(
        select(Project).where(
            Project.is_deleted == False,
            Project.is_approved == True,
            Project.is_draft == False,
        ).order_by(Project.is_pinned.desc(), Project.created_at.desc()).limit(20)
    )).scalars().all()
    return {
        "id": r.id,
        "name_en": r.name_en, "name_uz": r.name_uz, "name_ru": r.name_ru,
        "member_count": members,
        "projects": [
            {"id": p.id, "type": p.type, "name": p.name, "goal": p.goal,
             "created_at": p.created_at}
            for p in proj_rows
        ],
    }
