"""Signed-URL helpers for public, enumeration-resistant media endpoints
(profile card + avatar). Kept dependency-light (settings only) so both the
routers and the ORM models can import it without cycles."""
from __future__ import annotations

import hashlib
import hmac

from app.config import settings


def _sig(scope: str, user_id: int) -> str:
    return hmac.new(
        settings.SECRET_KEY.encode(), f"{scope}:{user_id}".encode(), hashlib.sha256
    ).hexdigest()[:20]


def card_sig(user_id: int) -> str:
    return _sig("card", user_id)


def avatar_sig(user_id: int) -> str:
    return _sig("avatar", user_id)


def avatar_url(user_id: int, photo_file_id: str | None) -> str | None:
    """Absolute signed avatar URL, or None if the user has no photo."""
    if not photo_file_id:
        return None
    base = settings.api_base_url
    if not base:
        return None
    return f"{base}/public/avatar?u={user_id}&sig={avatar_sig(user_id)}"
