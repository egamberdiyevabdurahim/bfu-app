"""In-app notification helper. Caller commits."""
from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import Notification


def add_notification(
    db: AsyncSession,
    user_id: int,
    type: str,
    actor_id: int | None = None,
    project_id: int | None = None,
) -> None:
    """Queue an inbox item for `user_id`. Best-effort; never raise."""
    try:
        db.add(Notification(
            user_id=user_id, type=type, actor_id=actor_id, project_id=project_id,
        ))
    except Exception:
        pass
