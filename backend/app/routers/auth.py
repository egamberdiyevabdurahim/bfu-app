import asyncio

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    parse_tg_user,
    validate_init_data,
)
from app.database import AsyncSessionLocal, get_db
from app.models.user import User
from app.schemas.auth import RefreshRequest, TelegramAuthRequest, TokenResponse

router = APIRouter(prefix="/auth", tags=["auth"])

_LANG_MAP = {"uz": "uz", "ru": "ru", "en": "en"}


async def _backfill_photo(uid: int, tg_id: int) -> None:
    """Best-effort profile-photo refresh, run via asyncio.create_task so it
    never blocks the caller. Opens its own session since the caller's
    request-scoped `db` may already be closed by the time this runs."""
    try:
        from app.services.telegram_media import fetch_photo_file_id
        fid = await fetch_photo_file_id(tg_id)
        if not fid:
            return
        async with AsyncSessionLocal() as bg_db:
            u = await bg_db.get(User, uid)
            if u and u.photo_file_id != fid:
                u.photo_file_id = fid
                await bg_db.commit()
    except Exception:
        pass


@router.post("/telegram", response_model=TokenResponse)
async def telegram_auth(body: TelegramAuthRequest, db: AsyncSession = Depends(get_db)):
    params = validate_init_data(body.init_data)
    if params is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid initData")

    tg = parse_tg_user(params)
    telegram_id = tg.get("id")
    if not telegram_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing user in initData")

    # Check for existing user (including deleted ones to prevent duplicate telegram_id errors)
    result = await db.execute(
        select(User).where(User.telegram_id == telegram_id)
    )
    user = result.scalar_one_or_none()
    is_new = user is None

    tg_username = tg.get("username") or None

    if is_new:
        lang_code = tg.get("language_code", "en")
        lang = _LANG_MAP.get(lang_code[:2], "en")
        user = User(
            telegram_id=telegram_id,
            name=tg.get("first_name"),
            surname=tg.get("last_name"),
            language=lang,
            tg_username=tg_username,
        )
        db.add(user)
    elif user.banned:
        # Admin-banned: do NOT auto-restore. Without this check a banned
        # user is silently reinstated just by reopening the Mini App.
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account suspended")
    elif user.is_deleted:
        # Restore deleted user if they come back
        user.is_deleted = False
        db.add(user)

    # Keep the Telegram @username fresh on every login (if the user has one)
    if tg_username and user.tg_username != tg_username:
        user.tg_username = tg_username
        db.add(user)

    try:
        await db.commit()
    except IntegrityError:
        # Telegram Mini Apps commonly fire auth twice on cold start; two
        # concurrent first-logins both insert and the loser hits the unique
        # telegram_id constraint. Recover by re-selecting the winner's row.
        await db.rollback()
        user = (await db.execute(
            select(User).where(User.telegram_id == telegram_id)
        )).scalar_one()
        if user.banned:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account suspended")
        is_new = False
    await db.refresh(user)

    # Refresh the profile-photo file_id on login. Backgrounded: this endpoint
    # is hit by EVERY registration and EVERY login, so a slow/rate-limited
    # Telegram API call here must never add latency to the auth response
    # (exactly the request path a registration spike hammers). Runs with its
    # own session/commit since `db` (this request's session) will likely
    # already be closed by the time it completes.
    asyncio.create_task(_backfill_photo(user.id, telegram_id))

    return TokenResponse(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
        is_registered=user.is_registered,
        is_new_user=is_new,
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh(body: RefreshRequest, db: AsyncSession = Depends(get_db)):
    payload = decode_token(body.refresh_token)
    if not payload.get("sub") or payload.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    user_id = int(payload["sub"])
    result = await db.execute(
        select(User).where(
            User.id == user_id, User.is_deleted == False, User.banned == False
        )
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    return TokenResponse(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
        is_registered=user.is_registered,
        is_new_user=False,
    )
