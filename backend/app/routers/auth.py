import asyncio
import secrets
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.web_login import WebLoginToken

from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    parse_tg_user,
    validate_init_data,
    validate_login_widget,
)
from app.database import AsyncSessionLocal, get_db
from app.models.user import User
from app.schemas.auth import (
    RefreshRequest,
    TelegramAuthRequest,
    TelegramWidgetAuthRequest,
    TokenResponse,
)

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


WEB_LOGIN_TTL = timedelta(minutes=5)


@router.post("/web-login/start")
async def web_login_start(db: AsyncSession = Depends(get_db)):
    """Begin a desktop 'log in via the bot' handshake. Returns a nonce + a
    t.me deep link; the web app opens the link and polls until the user taps
    Start in the bot."""
    nonce = secrets.token_urlsafe(32)
    # 4-char confirmation code (no ambiguous chars) shown in the browser; the bot
    # shows the same code and the user must match it before confirming — this is
    # what blocks the login-CSRF/session-fixation attack.
    code = "".join(secrets.choice("ABCDEFGHJKMNPQRSTUVWXYZ23456789") for _ in range(4))
    db.add(WebLoginToken(nonce=nonce, confirmed=False, code=code))
    await db.commit()
    return {
        "nonce": nonce,
        "code": code,
        "deep_link": f"https://t.me/{settings.BOT_USERNAME}?start=web_{nonce}",
        "expires_in": int(WEB_LOGIN_TTL.total_seconds()),
    }


@router.get("/web-login/poll")
async def web_login_poll(nonce: str, db: AsyncSession = Depends(get_db)):
    """Poll a login handshake. `pending` until the bot confirms; then returns
    the tokens ONCE (single-use) and deletes the row."""
    row = (await db.execute(
        select(WebLoginToken).where(WebLoginToken.nonce == nonce)
    )).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown login token")

    if datetime.utcnow() - row.created_at > WEB_LOGIN_TTL:
        await db.delete(row)
        await db.commit()
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Login token expired")

    if not row.confirmed or not row.user_id:
        return {"status": "pending"}

    user = await db.get(User, row.user_id)
    # Snapshot the flags BEFORE delete+commit expires the instance, so we don't
    # re-query. Unregistered users ARE allowed through now — the web routes them
    # to the sign-up form; only missing/deleted/banned are refused.
    unavailable = user is None or user.is_deleted
    banned = bool(user.banned) if user else False
    is_reg = bool(user.is_registered) if user else False
    uid = user.id if user else None
    await db.delete(row)          # single-use — burn it whatever the outcome
    await db.commit()
    if unavailable:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not available")
    if banned:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account suspended")

    return {
        "status": "ok",
        "access_token": create_access_token(uid),
        "refresh_token": create_refresh_token(uid),
        "token_type": "bearer",
        "is_registered": is_reg,
    }


@router.post("/telegram-widget", response_model=TokenResponse)
async def telegram_widget_auth(body: TelegramWidgetAuthRequest, db: AsyncSession = Depends(get_db)):
    """Desktop web login via the Telegram Login Widget. Verifies the widget
    signature, then issues tokens for an EXISTING registered member (desktop
    login does not onboard — users register in the bot/Mini App first)."""
    data = validate_login_widget(body.model_dump())
    if data is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Telegram login")

    telegram_id = int(data["id"])
    user = (await db.execute(
        select(User).where(User.telegram_id == telegram_id)
    )).scalar_one_or_none()

    if user is None or user.is_deleted or not user.is_registered:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Please register in the Telegram bot first",
        )
    if user.banned:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account suspended")

    tg_username = data.get("username") or None
    if tg_username and user.tg_username != tg_username:
        user.tg_username = tg_username
        await db.commit()

    return TokenResponse(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
        is_registered=True,
        is_new_user=False,
    )


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
