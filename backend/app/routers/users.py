import json
import time
from datetime import datetime, timedelta

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.core.deps import get_current_user
from app.database import get_db
from app.models.region import LearningCenter, Region, School
from app.models.user import User, UserLearningCenter, UserSchool, Report, Interest, BioTranslation
from app.schemas.user import GroupStatus, UserPublic, UserResponse, UserUpdate
from app.services.ai import analyze_and_save, generate_icebreakers, generate_match_reason, translate_bio_async
from app.services.geo import nearest_region_id
from app.services.notify import esc, send_telegram

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


def _denied_set(user: User) -> set[str]:
    if not user.denied_fields:
        return set()
    try:
        v = json.loads(user.denied_fields)
        return set(v) if isinstance(v, list) else set()
    except Exception:
        return set()


def _write_denied(user: User, fields: set[str]) -> None:
    user.denied_fields = json.dumps(sorted(fields)) if fields else None


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
async def get_me(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Lazy last_seen_at refresh (cheap; throttled to once / 5 min). On the same
    # stale path, backfill the profile photo for users who don't have one yet
    # (existing users won't re-login for up to 7 days), so avatars/cards light
    # up within a session instead of waiting for the next /auth/telegram.
    now = datetime.utcnow()
    if (not current_user.last_seen_at
            or now - current_user.last_seen_at > timedelta(minutes=5)):
        current_user.last_seen_at = now
        if not current_user.photo_file_id and current_user.telegram_id:
            try:
                from app.services.telegram_media import fetch_photo_file_id
                fid = await fetch_photo_file_id(current_user.telegram_id)
                if fid:
                    current_user.photo_file_id = fid
            except Exception:
                pass
        try:
            await db.commit()
        except Exception:
            await db.rollback()
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

    # Auto-detect region from GPS if user has coords but no region.
    if (current_user.region_id is None
            and current_user.latitude is not None
            and current_user.longitude is not None):
        regs = (await db.execute(select(Region).where(Region.is_deleted == False))).scalars().all()
        auto = nearest_region_id(regs, current_user.latitude, current_user.longitude)
        if auto:
            current_user.region_id = auto

    # Deny-fields auto-clear: any flagged field the user just touched in
    # this PATCH is removed from `denied_fields`. When the set is empty
    # we notify admins that this user is back in the review queue.
    denied = _denied_set(current_user)
    if denied:
        touched = set(data.keys())
        if school_id is not None:
            touched.add("school_id")
        if lc_ids is not None:
            touched.add("learning_center_ids")
        if touched & denied:
            denied -= touched
            _write_denied(current_user, denied)
            if not denied and settings.ADMIN_GROUP_ID:
                current_user.denied_note = None
                link = f"https://t.me/{settings.BOT_USERNAME}?startapp=user_{current_user.id}"
                await send_telegram(
                    settings.ADMIN_GROUP_ID,
                    f"✅ <b>Ready for re-review</b>: {esc(current_user.display_name)}\n{link}",
                )

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
    """Return list of required groups and whether the user has joined each.

    Fail-open: any unexpected error returns an empty list so the
    registration flow is never blocked by a transient Telegram or DB
    hiccup (this caused a confusing 'error' on iOS for first-time users)."""
    try:
        return await _check_groups_impl(current_user, db)
    except Exception:
        return []


async def _check_groups_impl(current_user: User, db: AsyncSession):
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
            link = f"https://t.me/{settings.BOT_USERNAME}?startapp=user_{current_user.id}"
            handle = f" (@{current_user.tg_username})" if current_user.tg_username else ""
            await send_telegram(
                settings.ADMIN_GROUP_ID,
                f"✅ <b>New registered user</b>: {esc(current_user.display_name)}{esc(handle)}\n{link}",
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
                rlang = (referrer.language or "en") if (referrer.language or "en") in _REFERRAL_PAYOFF else "en"
                await send_telegram(
                    referrer.telegram_id,
                    _REFERRAL_PAYOFF[rlang].format(count=cnt or 0),
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


@router.get("/me/card", response_model=dict)
async def my_card(
    request: Request,
    current_user: User = Depends(get_current_user),
):
    """Returns the absolute, Telegram-fetchable URL of the user's Story card
    plus their referral link (for the shareToStory widget).

    The card_url MUST be https — Telegram's shareToStory silently refuses
    non-https media. request.base_url reports http:// behind Railway's proxy,
    so prefer the configured public base and force https as a last resort."""
    from app.routers.public import card_sig
    base = settings.api_base_url or str(request.base_url).rstrip("/")
    if base.startswith("http://"):
        base = "https://" + base[len("http://"):]
    return {
        "card_url": f"{base}/public/card.png?u={current_user.id}&sig={card_sig(current_user.id)}",
        "ref_link": f"https://t.me/{settings.BOT_USERNAME}?startapp=ref_{current_user.id}",
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
    period: str = "week",  # "week" | "month" | "all"
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    now = datetime.utcnow()
    since = None
    if period == "week":
        since = now - timedelta(days=7)
    elif period == "month":
        since = now - timedelta(days=30)
    q = (
        select(User.referred_by, func.count(User.id))
        .where(User.referred_by.is_not(None), User.is_registered == True, User.is_deleted == False)
    )
    if since is not None:
        q = q.where(User.created_at >= since)
    rows = (await db.execute(
        q.group_by(User.referred_by).order_by(func.count(User.id).desc()).limit(10)
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
    mq = select(func.count(User.id)).where(
        User.referred_by == current_user.id,
        User.is_registered == True, User.is_deleted == False,
    )
    if since is not None:
        mq = mq.where(User.created_at >= since)
    my = await db.scalar(mq)
    return {"top": top, "my_count": my or 0, "period": period}


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
            f"by {esc(current_user.display_name)}\n{esc((body.reason or '')[:300])}",
        )
    return {"ok": True}


_last_intro: dict[int, float] = {}
_last_interest: dict[tuple[int, int], float] = {}  # (from, to) → ts


_INTEREST_MSG = {
    "en": "💜 <b>{name}</b> is interested in your profile on BFU.",
    "uz": "💜 <b>{name}</b> profilingizga qiziqish bildirdi (BFU).",
    "ru": "💜 <b>{name}</b> заинтересовался(-ась) вашим профилем в BFU.",
}

_REFERRAL_PAYOFF = {
    "en": "🎁 Someone you invited just completed registration!\nYour total invites: <b>{count}</b>. Keep sharing your link!",
    "uz": "🎁 Siz taklif qilgan inson ro‘yxatdan o‘tdi!\nJami takliflaringiz: <b>{count}</b>. Havolangizni ulashishda davom eting!",
    "ru": "🎁 Приглашённый вами человек завершил регистрацию!\nВсего приглашений: <b>{count}</b>. Продолжайте делиться ссылкой!",
}

# Fired to BOTH users when interest is reciprocated.
_MUTUAL_MSG = {
    "en": "🎉 <b>It's a match!</b>\nYou and <b>{name}</b> are both interested. Say hi 👋",
    "uz": "🎉 <b>Mos keldingiz!</b>\nSiz va <b>{name}</b> bir-biringizga qiziqdingiz. Salom yozing 👋",
    "ru": "🎉 <b>Взаимный интерес!</b>\nВы и <b>{name}</b> заинтересованы друг в друге. Напишите 👋",
}


def _connect_buttons(other: User) -> dict:
    """Inline keyboard to reach `other`: a web_app profile button (always
    works) plus a t.me chat button when they have a @username."""
    btns = [{"text": "👀 See profile",
             "web_app": {"url": f"{settings.WEBAPP_URL}?startapp=user_{other.id}"}}]
    if other.tg_username:
        btns.append({"text": "💬 Chat", "url": f"https://t.me/{other.tg_username}"})
    return {"inline_keyboard": [btns]}


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
    txt = f"👋 <b>{esc(current_user.display_name)}</b> wants to connect with you on BFU."
    if current_user.about:
        txt += f"\n\n<i>{esc(current_user.about[:300])}</i>"
    # "Message back" as a url button only when a t.me link exists.
    # tg://openmessage is Android-only (dead button on iOS/Desktop), so for
    # no-username requesters we send a web_app button to their profile —
    # the profile sheet handles chat with platform-aware fallbacks.
    if current_user.tg_username:
        buttons = [{"text": "💬 Message back", "url": f"https://t.me/{current_user.tg_username}"}]
    else:
        buttons = [{"text": "👀 See profile", "web_app": {
            "url": f"{settings.WEBAPP_URL}?startapp=user_{current_user.id}"}}]
    mk = {"inline_keyboard": [buttons]}
    if target.telegram_id:
        await send_telegram(target.telegram_id, txt, reply_markup=mk)
    return {"ok": True, "has_username": bool(current_user.tg_username)}


@router.post("/{user_id}/interest", response_model=dict)
async def soft_interest(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Lightweight 'I'm interested in your profile' ping (no chat infra)."""
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot mark yourself")
    now = time.monotonic()
    key = (current_user.id, user_id)
    if now - _last_interest.get(key, 0.0) < 60 * 60 * 24:
        raise HTTPException(status_code=429, detail="Already pinged in the last 24h")
    # Claim the cooldown slot BEFORE any await so a concurrent double-tap
    # can't slip a second row + duplicate DM through the gap.
    _last_interest[key] = now
    # DB-level 24h guard (survives worker restarts, which wipe the dict).
    recent = await db.scalar(
        select(func.count(Interest.id)).where(
            Interest.from_user_id == current_user.id,
            Interest.to_user_id == user_id,
            Interest.created_at >= datetime.utcnow() - timedelta(hours=24),
        )
    )
    if recent:
        raise HTTPException(status_code=429, detail="Already pinged in the last 24h")
    target = await db.get(User, user_id)
    if not target or target.is_deleted or not target.is_registered:
        raise HTTPException(status_code=404, detail="User not found")
    db.add(Interest(from_user_id=current_user.id, to_user_id=user_id))
    await db.commit()

    # Mutual? Did the target ever express interest in the current user?
    mutual = bool(await db.scalar(
        select(func.count(Interest.id)).where(
            Interest.from_user_id == user_id,
            Interest.to_user_id == current_user.id,
        )
    ))

    if mutual:
        # Celebrate to BOTH sides — this is the conversation-starting moment.
        if target.telegram_id:
            tl = (target.language or "en") if (target.language or "en") in _MUTUAL_MSG else "en"
            await send_telegram(
                target.telegram_id,
                _MUTUAL_MSG[tl].format(name=esc(current_user.display_name)),
                reply_markup=_connect_buttons(current_user),
            )
        if current_user.telegram_id:
            cl = (current_user.language or "en") if (current_user.language or "en") in _MUTUAL_MSG else "en"
            await send_telegram(
                current_user.telegram_id,
                _MUTUAL_MSG[cl].format(name=esc(target.display_name)),
                reply_markup=_connect_buttons(target),
            )
    elif target.telegram_id:
        lang = (target.language or "en") if (target.language or "en") in _INTEREST_MSG else "en"
        await send_telegram(
            target.telegram_id,
            _INTEREST_MSG[lang].format(name=esc(current_user.display_name)),
            reply_markup=_connect_buttons(current_user),
        )
    return {"ok": True, "mutual": mutual}


@router.get("/{user_id}/bio/translate", response_model=dict)
async def translate_bio(
    user_id: int,
    lang: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Translate the target user's bio into `lang` (en/uz/ru) via Claude.
    Result is cached per (user, lang) and invalidated when the source changes."""
    if lang not in {"en", "uz", "ru"}:
        raise HTTPException(status_code=400, detail="Unsupported lang")
    target = await db.get(User, user_id)
    if not target or target.is_deleted or not target.about:
        return {"translated": None}
    import hashlib
    h = hashlib.sha256(target.about.encode()).hexdigest()
    cached = (await db.execute(
        select(BioTranslation).where(
            BioTranslation.user_id == user_id, BioTranslation.lang == lang
        )
    )).scalar_one_or_none()
    if cached and cached.source_hash == h:
        return {"translated": cached.text, "cached": True}
    # Cache miss → a billable Claude call. Gate it behind the per-caller
    # cooldown (same as /me/analyze) so nobody can sweep user_ids × langs and
    # drain the AI budget. Cached hits above stay unthrottled.
    if _ai_on_cooldown(current_user.id):
        raise HTTPException(status_code=429, detail="Please wait a moment before translating again")
    out = await translate_bio_async(target.about, lang)
    if not out:
        return {"translated": None}
    if cached:
        cached.source_hash = h
        cached.text = out
        cached.updated_at = datetime.utcnow()
    else:
        db.add(BioTranslation(user_id=user_id, lang=lang, source_hash=h, text=out))
    await db.commit()
    return {"translated": out, "cached": False}


def _flat_tags(analysis) -> list[str]:
    if not analysis:
        return []
    out: list[str] = []
    for c in ("skills", "knowledges", "interests", "preparations", "goals"):
        out.extend(getattr(analysis, c, None) or [])
    return out


@router.get("/{user_id}/icebreakers", response_model=dict)
async def icebreakers(
    user_id: int,
    lang: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """2-3 Claude-written openers grounded in shared interests, to kill the
    blank-message freeze before opening a chat. Gated by the AI cooldown."""
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot icebreak yourself")
    use_lang = lang if lang in {"en", "uz", "ru"} else (current_user.language or "en")
    target = (await db.execute(
        select(User).options(selectinload(User.analysis))
        .where(User.id == user_id, User.is_deleted == False, User.is_registered == True)
    )).scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    me = (await db.execute(
        select(User).options(selectinload(User.analysis)).where(User.id == current_user.id)
    )).scalar_one()
    if _ai_on_cooldown(current_user.id):
        raise HTTPException(status_code=429, detail="Please wait a moment")
    lines = await generate_icebreakers(
        _flat_tags(me.analysis), _flat_tags(target.analysis),
        target.display_name, use_lang,
    )
    return {"icebreakers": lines}


@router.get("/{user_id}/why-match", response_model=dict)
async def why_match(
    user_id: int,
    lang: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """One-sentence Claude explanation of why this person is worth connecting
    with, grounded in shared interests. Also returns the shared tags (free).
    AI-cooldown gated."""
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot match yourself")
    use_lang = lang if lang in {"en", "uz", "ru"} else (current_user.language or "en")
    target = (await db.execute(
        select(User).options(selectinload(User.analysis))
        .where(User.id == user_id, User.is_deleted == False, User.is_registered == True)
    )).scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    me = (await db.execute(
        select(User).options(selectinload(User.analysis)).where(User.id == current_user.id)
    )).scalar_one()
    my_tags, their_tags = _flat_tags(me.analysis), _flat_tags(target.analysis)
    shared = sorted(set(t.lower() for t in my_tags) & set(t.lower() for t in their_tags))
    if _ai_on_cooldown(current_user.id):
        raise HTTPException(status_code=429, detail="Please wait a moment")
    reason = await generate_match_reason(my_tags, their_tags, target.display_name, use_lang)
    return {"reason": reason, "shared": shared}


# ── Discover ───────────────────────────────────────────────────────────────────

@router.get("/discover", response_model=list[UserPublic])
async def discover(
    skill: str | None = None,
    knowledge: str | None = None,
    region_id: int | None = None,
    open_to_work: bool | None = None,
    open_to_volunteering: bool | None = None,
    match: bool | None = None,
    gender: str | None = None,
    verified: bool | None = None,
    sort: str | None = None,  # "recent" (default) | "verified" | "name"
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
    if gender:
        q = q.where(User.gender == gender)
    if verified:
        q = q.where(User.checked == True)
    if sort == "name":
        q = q.order_by(User.name.asc())
    elif sort == "verified":
        q = q.order_by(User.checked.desc(), User.created_at.desc())
    else:
        q = q.order_by(User.created_at.desc())

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

    if skill or knowledge:
        # The skill/knowledge tags live in a JSON column, so we filter in
        # Python — but over a capped pool fetched BEFORE pagination, then
        # slice. Previously the filter ran AFTER limit/offset, so a chip
        # filter showed "No users found" while matches existed deeper.
        skill_lower = skill.lower() if skill else None
        knowledge_lower = knowledge.lower() if knowledge else None
        pool = (await db.execute(q.limit(300))).scalars().all()
        filtered = []
        for u in pool:
            if not u.analysis:
                continue
            if skill_lower and skill_lower not in [s.lower() for s in (u.analysis.skills or [])]:
                continue
            if knowledge_lower and knowledge_lower not in [k.lower() for k in (u.analysis.knowledges or [])]:
                continue
            filtered.append(u)
        return filtered[offset:offset + limit]

    q = q.limit(limit).offset(offset)
    result = await db.execute(q)
    return result.scalars().all()


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
