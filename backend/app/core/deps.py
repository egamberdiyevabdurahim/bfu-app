from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_token
from app.database import get_db
from app.models.user import User

bearer = HTTPBearer()


# Paths a "denied" user is still allowed to hit — they can only see/fix
# their own profile + auth. Everything else returns 403 until they
# correct the flagged fields.
_DENIED_ALLOWED = {
    ("GET", "/users/me"),
    ("PATCH", "/users/me"),
    ("GET", "/users/me/groups"),
    ("GET", "/users/me/invite"),
    ("POST", "/users/me/referral"),
    ("POST", "/users/me/finalize"),
    ("POST", "/users/me/analyze"),
    ("POST", "/users/me/update-tags"),
    ("POST", "/users/me/fetch-tg-username"),
    ("GET", "/regions"),
}


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    db: AsyncSession = Depends(get_db),
) -> User:
    payload = decode_token(credentials.credentials)
    user_id = payload.get("sub")

    if not user_id or payload.get("type") != "access":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    from sqlalchemy.orm import selectinload

    result = await db.execute(
        select(User).options(selectinload(User.analysis)).where(User.id == int(user_id), User.is_deleted == False)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    # Deny lock: if admin flagged fields needing correction, only self-edit allowed.
    if user.denied_fields:
        key = (request.method.upper(), request.url.path)
        # Allow region sub-paths
        if key not in _DENIED_ALLOWED and not request.url.path.startswith("/regions/"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="profile_locked",
            )

    return user

async def get_admin_user(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role not in ("admin", "super_admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return current_user

async def get_super_admin_user(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != "super_admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Super admin access required")
    return current_user
