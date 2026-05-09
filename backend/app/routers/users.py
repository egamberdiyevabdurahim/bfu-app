import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.core.deps import get_current_user
from app.database import get_db
from app.models.region import LearningCenter, School
from app.models.user import User, UserLearningCenter, UserSchool
from app.schemas.user import GroupStatus, UserPublic, UserResponse, UserUpdate
from app.services.ai import analyze_and_save

router = APIRouter(prefix="/users", tags=["users"])


# ── Helper: set Telegram name tag ─────────────────────────────────────────────

async def _set_member_tag(chat_id: int, user_id: int, tag: str) -> None:
    """Call Telegram setChatMemberTag for the user in a group."""
    if not chat_id or not settings.BOT_TOKEN:
        return
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            await client.post(
                f"https://api.telegram.org/bot{settings.BOT_TOKEN}/setChatMemberTag",
                json={"chat_id": chat_id, "user_id": user_id, "tag": tag[:16]},
            )
    except Exception:
        pass  # Non-critical


async def _check_member(chat_id: int, user_id: int) -> bool:
    """Check if a user is a member of a Telegram group."""
    if not chat_id or not settings.BOT_TOKEN:
        return False
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            res = await client.post(
                f"https://api.telegram.org/bot{settings.BOT_TOKEN}/getChatMember",
                json={"chat_id": chat_id, "user_id": user_id},
            )
            data = res.json()
            status = data.get("result", {}).get("status", "")
            return status in ("member", "administrator", "creator")
    except Exception:
        return False


def _build_tag(user: User) -> str:
    name = (user.name or "").strip().capitalize()
    initial = (user.surname or "")[:1].upper()
    return f"{name}. {initial}" if initial else name


# ── Current user ──────────────────────────────────────────────────────────────

@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.patch("/me", response_model=UserResponse)
async def update_me(
    body: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    data = body.model_dump(exclude_none=True)

    school_id = data.pop("school_id", None)
    lc_ids = data.pop("learning_center_ids", None)
    old_about = current_user.about

    for field, value in data.items():
        setattr(current_user, field, value)

    if school_id is not None:
        existing = await db.execute(
            select(UserSchool).where(UserSchool.user_id == current_user.id)
        )
        row = existing.scalar_one_or_none()
        if row:
            row.school_id = school_id
        else:
            db.add(UserSchool(user_id=current_user.id, school_id=school_id))

    if lc_ids is not None:
        from sqlalchemy import delete
        await db.execute(
            delete(UserLearningCenter).where(UserLearningCenter.user_id == current_user.id)
        )
        for lc_id in lc_ids:
            db.add(UserLearningCenter(user_id=current_user.id, learning_center_id=lc_id))

    await db.commit()
    await db.refresh(current_user)

    # Auto-reanalyze if bio changed
    new_about = current_user.about
    if new_about and new_about != old_about:
        try:
            await analyze_and_save(db, current_user.id, new_about)
        except Exception:
            pass

    return current_user


@router.post("/me/analyze", response_model=dict)
async def analyze_bio(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not current_user.about:
        raise HTTPException(status_code=400, detail="about field is empty")
    tags = await analyze_and_save(db, current_user.id, current_user.about)
    return tags


@router.post("/me/fetch-tg-username", response_model=dict)
async def fetch_tg_username(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Fetch the user's Telegram username directly from the Telegram API."""
    if not current_user.telegram_id or not settings.BOT_TOKEN:
        raise HTTPException(status_code=400, detail="Cannot fetch username")
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            res = await client.post(
                f"https://api.telegram.org/bot{settings.BOT_TOKEN}/getChat",
                json={"chat_id": current_user.telegram_id},
            )
            data = res.json()
            username = data.get("result", {}).get("username")
            if username:
                current_user.tg_username = username
                await db.commit()
                return {"tg_username": username}
            return {"tg_username": None}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/me/groups", response_model=list[GroupStatus])
async def check_groups(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return list of required groups and whether the user has joined each."""
    groups_to_check: list[dict] = []

    # Default groups from config
    if settings.TG_GLOBAL_GROUP_ID:
        groups_to_check.append({
            "group_id": settings.TG_GLOBAL_GROUP_ID,
            "group_link": settings.TG_GLOBAL_GROUP_LINK,
            "name": "Global Community",
        })
    if settings.TG_OFFICIAL_CHANNEL_ID:
        groups_to_check.append({
            "group_id": settings.TG_OFFICIAL_CHANNEL_ID,
            "group_link": settings.TG_OFFICIAL_CHANNEL_LINK,
            "name": "Official Channel",
        })

    # User's school group
    school_res = await db.execute(
        select(UserSchool).options(selectinload(UserSchool.school))
        .where(UserSchool.user_id == current_user.id)
    )
    user_school = school_res.scalar_one_or_none()
    if user_school and user_school.school and user_school.school.group_id:
        groups_to_check.append({
            "group_id": user_school.school.group_id,
            "group_link": user_school.school.group_link or "",
            "name": user_school.school.name,
        })

    # User's LC groups
    lc_res = await db.execute(
        select(UserLearningCenter).options(selectinload(UserLearningCenter.learning_center))
        .where(UserLearningCenter.user_id == current_user.id)
    )
    user_lcs = lc_res.scalars().all()
    for ulc in user_lcs:
        lc = ulc.learning_center
        if lc and lc.group_id:
            groups_to_check.append({
                "group_id": lc.group_id,
                "group_link": lc.group_link or "",
                "name": lc.name,
            })

    # Check membership for each group
    result = []
    for g in groups_to_check:
        joined = await _check_member(g["group_id"], current_user.telegram_id)
        result.append(GroupStatus(
            group_id=g["group_id"],
            group_link=g["group_link"],
            name=g["name"],
            joined=joined,
        ))

    return result


@router.post("/me/finalize", response_model=UserResponse)
async def finalize_registration(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Mark user as fully registered and set name tags in all their groups."""
    current_user.is_registered = True
    await db.commit()
    await db.refresh(current_user)

    # Set name tag in all groups the user belongs to
    tag = _build_tag(current_user)
    tg_id = current_user.telegram_id

    groups_to_tag: list[int] = []
    if settings.TG_GLOBAL_GROUP_ID:
        groups_to_tag.append(settings.TG_GLOBAL_GROUP_ID)
    if settings.TG_OFFICIAL_CHANNEL_ID:
        groups_to_tag.append(settings.TG_OFFICIAL_CHANNEL_ID)

    school_res = await db.execute(
        select(UserSchool).options(selectinload(UserSchool.school))
        .where(UserSchool.user_id == current_user.id)
    )
    user_school = school_res.scalar_one_or_none()
    if user_school and user_school.school and user_school.school.group_id:
        groups_to_tag.append(user_school.school.group_id)

    lc_res = await db.execute(
        select(UserLearningCenter).options(selectinload(UserLearningCenter.learning_center))
        .where(UserLearningCenter.user_id == current_user.id)
    )
    for ulc in lc_res.scalars().all():
        if ulc.learning_center and ulc.learning_center.group_id:
            groups_to_tag.append(ulc.learning_center.group_id)

    for chat_id in groups_to_tag:
        await _set_member_tag(chat_id, tg_id, tag)

    # Trigger AI analysis if bio exists
    if current_user.about:
        try:
            await analyze_and_save(db, current_user.id, current_user.about)
        except Exception:
            pass

    return current_user


@router.post("/me/update-tags", response_model=dict)
async def update_name_tags(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Called from edit profile when name changes — updates tags in all groups."""
    tag = _build_tag(current_user)
    tg_id = current_user.telegram_id

    groups_to_tag: list[int] = []
    if settings.TG_GLOBAL_GROUP_ID:
        groups_to_tag.append(settings.TG_GLOBAL_GROUP_ID)
    if settings.TG_OFFICIAL_CHANNEL_ID:
        groups_to_tag.append(settings.TG_OFFICIAL_CHANNEL_ID)

    school_res = await db.execute(
        select(UserSchool).options(selectinload(UserSchool.school))
        .where(UserSchool.user_id == current_user.id)
    )
    user_school = school_res.scalar_one_or_none()
    if user_school and user_school.school and user_school.school.group_id:
        groups_to_tag.append(user_school.school.group_id)

    lc_res = await db.execute(
        select(UserLearningCenter).options(selectinload(UserLearningCenter.learning_center))
        .where(UserLearningCenter.user_id == current_user.id)
    )
    for ulc in lc_res.scalars().all():
        if ulc.learning_center and ulc.learning_center.group_id:
            groups_to_tag.append(ulc.learning_center.group_id)

    for chat_id in groups_to_tag:
        await _set_member_tag(chat_id, tg_id, tag)

    return {"tag": tag, "updated_in": len(groups_to_tag)}


# ── Discover ───────────────────────────────────────────────────────────────────

@router.get("/discover", response_model=list[UserPublic])
async def discover(
    skill: str | None = None,
    knowledge: str | None = None,
    region_id: int | None = None,
    open_to_work: bool | None = None,
    open_to_volunteering: bool | None = None,
    limit: int = 20,
    offset: int = 0,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = (
        select(User)
        .options(selectinload(User.analysis))
        .where(User.is_deleted == False, User.is_registered == True, User.id != current_user.id)
    )
    if region_id:
        q = q.where(User.region_id == region_id)
    if open_to_work is not None:
        q = q.where(User.open_to_work == open_to_work)
    if open_to_volunteering is not None:
        q = q.where(User.open_to_volunteering == open_to_volunteering)

    q = q.limit(limit).offset(offset)
    result = await db.execute(q)
    users = result.scalars().all()

    if skill or knowledge:
        skill_lower = skill.lower() if skill else None
        knowledge_lower = knowledge.lower() if knowledge else None
        filtered = []
        for u in users:
            if not u.analysis:
                continue
            if skill_lower and skill_lower not in [s.lower() for s in (u.analysis.skills or [])]:
                continue
            if knowledge_lower and knowledge_lower not in [k.lower() for k in (u.analysis.knowledges or [])]:
                continue
            filtered.append(u)
        return filtered

    return users


# ── Public profile ─────────────────────────────────────────────────────────────

@router.get("/{user_id}", response_model=UserPublic)
async def get_user_profile(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(User)
        .options(selectinload(User.analysis))
        .where(User.id == user_id, User.is_deleted == False, User.is_registered == True)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user
