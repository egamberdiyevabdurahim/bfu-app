"""Append-only admin audit log helper."""
import json as _json

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import AuditLog


async def log_action(
    db: AsyncSession,
    admin_id: int,
    action: str,
    target_type: str | None = None,
    target_id: int | None = None,
    details: dict | None = None,
) -> None:
    """Best-effort: caller commits. Never raise."""
    try:
        db.add(AuditLog(
            admin_id=admin_id,
            action=action[:64],
            target_type=target_type[:32] if target_type else None,
            target_id=target_id,
            details=_json.dumps(details)[:5000] if details else None,
        ))
    except Exception:
        pass
