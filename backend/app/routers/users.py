import time

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.core.deps import get_current_user
from app.database import get_db
from app.models.region import LearningCenter, School
from app.models.user import User, UserLearningCenter, UserSchool, Report
from app.schemas.user import GroupStatus, UserPublic, UserResponse, UserUpdate
from app.services.ai import analyze_and_save
from app.services.notify import send_telegram

router = APIRouter(prefix="/users", tags=["users"])

# Per-user AI cooldown (cost control). Single uvicorn worker → in-process is fine.
_AI_COOLDOWN_S = 60
_last_ai: dict[int, float] = {}


def _ai_on_cooldown(uid: int) -> bool:
    now = time.monotonic()
    last = _last_ai.get(uid, 0.0)
    if now - last < _AI_COOLDOWN_S:
        return True
    _last_ai[uid] = now
    return False


class ReferralIn(BaseModel):
    code: int


class ReportIn(BaseModel):
    target_type: str  # "user" | "project"
    target_id: int
    reason: str | None = None


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
    if new_about and new_about != old_about and not _ai_on_cooldown(current_user.id):
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
    if _ai_on_cooldown(current_user.id):
        raise HTTPException(status_code=429, detail="Please wait a moment before re-analyzing")
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
    was_registered = current_user.is_registered
    current_user.is_registered = True
    await db.commit()
    await db.refresh(current_user)

    # Analytics + referral payoff (only on the first time they finish)
    if not was_registered:
        if settings.ADMIN_GROUP_ID:
            await send_telegram(
                settings.ADMIN_GROUP_ID,
                f"✅ <b>New registered user</b>: {current_user.display_name}"
                + (f" (@{current_user.tg_username})" if current_user.tg_username else ""),
            )
        if current_user.referred_by:
            referrer = await db.get(User, current_user.referred_by)
            if referrer and referrer.telegram_id:
                cnt = await db.scalar(
                    select(func.count(User.id)).where(
                        User.referred_by == referrer.id,
                        User.is_registered == True,
                        User.is_deleted == False,
                    )
                )
                await send_telegram(
                    referrer.telegram_id,
                    f"🎁 Someone you invited just completed registration!\n"
                    f"Your total invites: <b>{cnt or 0}</b>. Keep sharing your link!",
                )

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


# ── Invite / referral ──────────────────────────────────────────────────────────

@router.get("/me/invite", response_model=dict)
async def my_invite(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    count = await db.scalar(
        select(func.count(User.id)).where(
            User.referred_by == current_user.id,
            User.is_registered == True,
            User.is_deleted == False,
        )
    )
    return {
        "code": current_user.id,
        "link": f"https://t.me/{settings.BOT_USERNAME}?startapp=ref_{current_user.id}",
        "invited_count": count or 0,
    }


@router.post("/me/referral", response_model=dict)
async def set_referral(
    body: ReferralIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Record who invited this user. Settable once, before finishing
    registration; only a fully-registered invitee counts toward prizes."""
    if current_user.referred_by is not None or current_user.is_registered:
        return {"ok": False, "reason": "already_set"}
    if body.code == current_user.id:
        return {"ok": False, "reason": "self"}
    referrer = await db.get(User, body.code)
    if not referrer or referrer.is_deleted:
        return {"ok": False, "reason": "invalid"}
    current_user.referred_by = body.code
    await db.commit()
    return {"ok": True}


@router.get("/leaderboard", response_model=dict)
async def leaderboard(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(
        select(User.referred_by, func.count(User.id))
        .where(User.referred_by.is_not(None), User.is_registered == True, User.is_deleted == False)
        .group_by(User.referred_by)
        .order_by(func.count(User.id).desc())
        .limit(10)
    )).all()
    ids = [r[0] for r in rows]
    names: dict[int, str] = {}
    if ids:
        for u in (await db.execute(select(User).where(User.id.in_(ids)))).scalars().all():
            names[u.id] = u.display_name
    top = [
        {"rank": i + 1, "name": names.get(rid, f"User #{rid}"),
         "count": c, "is_me": rid == current_user.id}
        for i, (rid, c) in enumerate(rows)
    ]
    my = await db.scalar(
        select(func.count(User.id)).where(
            User.referred_by == current_user.id,
            User.is_registered == True, User.is_deleted == False,
        )
    )
    return {"top": top, "my_count": my or 0}


@router.post("/reports", response_model=dict)
async def create_report(
    body: ReportIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.target_type not in ("user", "project"):
        raise HTTPException(status_code=400, detail="invalid target_type")
    db.add(Report(
        reporter_id=current_user.id, target_type=body.target_type,
        target_id=body.target_id, reason=(body.reason or "")[:1000],
    ))
    await db.commit()
    if settings.ADMIN_GROUP_ID:
        await send_telegram(
            settings.ADMIN_GROUP_ID,
            f"🚩 <b>Report</b>: {body.target_type} #{body.target_id}\n"
            f"by {current_user.display_name}\n{(body.reason or '')[:300]}",
        )
    return {"ok": True}


_last_intro: dict[int, float] = {}


@router.post("/{user_id}/intro", response_model=dict)
async def request_intro(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot intro yourself")
    now = time.monotonic()
    if now - _last_intro.get(current_user.id, 0.0) < 30:
        raise HTTPException(status_code=429, detail="Please wait before sending another intro")
    _last_intro[current_user.id] = now
    target = await db.get(User, user_id)
    if not target or target.is_deleted or not target.is_registered:
        raise HTTPException(status_code=404, detail="User not found")
    txt = f"👋 <b>{current_user.display_name}</b> wants to connect with you on BFU."
    if current_user.about:
        txt += f"\n\n<i>{current_user.about[:300]}</i>"
    mk = None
    if current_user.tg_username:
        mk = {"inline_keyboard": [[{"text": "💬 Message back",
                                    "url": f"https://t.me/{current_user.tg_username}"}]]}
    if target.telegram_id:
        await send_telegram(target.telegram_id, txt, reply_markup=mk)
    return {"ok": True, "has_username": bool(current_user.tg_username)}


# ── Discover ───────────────────────────────────────────────────────────────────

@router.get("/discover", response_model=list[UserPublic])
async def discover(
    skill: str | None = None,
    knowledge: str | None = None,
    region_id: int | None = None,
    open_to_work: bool | None = None,
    open_to_volunteering: bool | None = None,
    match: bool | None = None,
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

    _CATS = ("skills", "knowledges", "interests", "preparations", "goals")

    if match and current_user.analysis:
        def _tags(a):
            s = set()
            for c in _CATS:
                s.update(x.lower() for x in (getattr(a, c, None) or []))
            return s
        my_tags = _tags(current_user.analysis)
        pool = (await db.execute(q.limit(300))).scalars().all()
        ranked = sorted(
            pool,
            key=lambda u: (len(my_tags & _tags(u.analysis)) if u.analysis else 0,
                           1 if u.checked else 0),
            reverse=True,
        )
        return ranked[offset:offset + limit]

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
