from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.database import get_db
from app.models.region import LearningCenter, Region, School
from app.models.user import User
from app.schemas.region import LearningCenterOut, RegionOut, SchoolOut

router = APIRouter(prefix="/regions", tags=["regions"])


@router.get("", response_model=list[RegionOut])
async def list_regions(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(Region).where(Region.is_deleted == False).order_by(Region.name_en))
    return result.scalars().all()


@router.get("/{region_id}/schools", response_model=list[SchoolOut])
async def region_schools(
    region_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(
        select(School).where(School.region_id == region_id, School.is_deleted == False).order_by(School.name)
    )
    return result.scalars().all()


@router.get("/{region_id}/learning-centers", response_model=list[LearningCenterOut])
async def region_learning_centers(
    region_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(
        select(LearningCenter)
        .where(LearningCenter.region_id == region_id, LearningCenter.is_deleted == False)
        .order_by(LearningCenter.name)
    )
    return result.scalars().all()
