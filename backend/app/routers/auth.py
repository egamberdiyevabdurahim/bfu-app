from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    parse_tg_user,
    validate_init_data,
)
from app.database import get_db
from app.models.user import User
from app.schemas.auth import RefreshRequest, TelegramAuthRequest, TokenResponse

router = APIRouter(prefix="/auth", tags=["auth"])

_LANG_MAP = {"uz": "uz", "ru": "ru", "en": "en"}


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

    if is_new:
        lang_code = tg.get("language_code", "en")
        lang = _LANG_MAP.get(lang_code[:2], "en")
        user = User(
            telegram_id=telegram_id,
            name=tg.get("first_name"),
            surname=tg.get("last_name"),
            language=lang,
        )
        db.add(user)
    elif user.is_deleted:
        # Restore deleted user if they come back
        user.is_deleted = False
        db.add(user)

    await db.commit()
    await db.refresh(user)

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
    result = await db.execute(select(User).where(User.id == user_id, User.is_deleted == False))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    return TokenResponse(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
        is_registered=user.is_registered,
        is_new_user=False,
    )
