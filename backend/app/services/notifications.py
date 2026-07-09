"""In-app notification helper + per-user notification preferences.

Preferences use an OPT-OUT model: a key absent from ``user.notification_prefs``
means the category is ENABLED, so the empty ``{}`` every existing user carries
keeps all notifications on. Only a stored ``false`` turns something off.

In-app inbox writes (``add_notification``) are NEVER gated by prefs — only the
outbound Telegram push and the weekly digest are. This keeps inbox history
complete even when a user has muted their Telegram pushes.
"""
from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import Notification


# Every tunable notification category. All default to True (enabled).
# ``telegram_push`` is the MASTER switch: when off, ALL personal Telegram
# pushes are suppressed (the in-app inbox is still written).
NOTIF_PREF_KEYS = (
    "messages", "interest", "applications", "project_updates",
    "bookings", "events", "weekly_digest", "telegram_push",
)

# Notification ``type`` → the preference key that gates its outbound push.
# Unknown/absent types map to None, meaning "always push".
TYPE_TO_PREF = {
    "interest": "interest",
    "mutual": "interest",
    "intro": "interest",
    "new_follower": "interest",
    "message": "messages",
    "application": "applications",
    "accepted": "applications",
    "declined": "applications",
    "project_update": "project_updates",
    "rate_prompt": "project_updates",
    "removed_from_project": "project_updates",
    "booking_request": "bookings",
    "booking_confirmed": "bookings",
    "booking_declined": "bookings",
    "event_rsvp": "events",
    "event_reminder": "events",
}


def pref_enabled(user, key: str) -> bool:
    """Whether notification category ``key`` is enabled for ``user``.

    Opt-out: an absent key (or a null/invalid prefs blob) reads as enabled.
    Defensive — never raises."""
    try:
        prefs = user.notification_prefs or {}
        return bool(prefs.get(key, True))
    except Exception:
        return True


def effective_prefs(user) -> dict:
    """The full ``{key: bool}`` map for every category, resolving defaults."""
    return {k: pref_enabled(user, k) for k in NOTIF_PREF_KEYS}


def should_push_telegram(user, notif_type: str | None) -> bool:
    """Whether a personal Telegram push of ``notif_type`` may be sent to ``user``.

    Returns False when the master ``telegram_push`` switch is off; otherwise, if
    the type maps to a category, returns that category's enabled state; unknown
    types always push. Defensive — never raises (a failure falls back to sending
    so an existing push is never silently lost)."""
    try:
        if not pref_enabled(user, "telegram_push"):
            return False
        key = TYPE_TO_PREF.get(notif_type)
        if key is None:
            return True
        return pref_enabled(user, key)
    except Exception:
        return True


def add_notification(
    db: AsyncSession,
    user_id: int,
    type: str,
    actor_id: int | None = None,
    project_id: int | None = None,
    event_id: int | None = None,
) -> None:
    """Queue an inbox item for `user_id`. Best-effort; never raise."""
    try:
        db.add(Notification(
            user_id=user_id, type=type, actor_id=actor_id,
            project_id=project_id, event_id=event_id,
        ))
    except Exception:
        pass
