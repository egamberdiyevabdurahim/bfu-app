"""Real user presence.

A user is "online" if their last heartbeat — stored on ``User.last_seen_at``
(the existing presence column) — is within ``ONLINE_WINDOW`` of now. The
frontend POSTs ``/users/me/heartbeat`` every ~60s while its tab is visible.

``last_seen_at`` is intentionally kept as **naive UTC** to match the rest of
the codebase, which compares against ``datetime.utcnow()`` everywhere
(nudges/pulse/admin/public). Storing tz-aware values would raise
"can't compare offset-naive and offset-aware datetimes" in those existing
queries. ``is_online`` still tolerates an aware value defensively.
"""
from datetime import datetime, timedelta, timezone

# A user counts as "online" if seen within this window.
ONLINE_WINDOW = timedelta(minutes=5)


def is_online(last_seen: datetime | None, *, now: datetime | None = None) -> bool:
    """True iff ``last_seen`` is set and within ``ONLINE_WINDOW`` of ``now``
    (both treated as naive UTC). Never raises on ``None`` or on an accidentally
    tz-aware value."""
    if last_seen is None:
        return False
    if last_seen.tzinfo is not None:
        last_seen = last_seen.astimezone(timezone.utc).replace(tzinfo=None)
    now = now or datetime.utcnow()
    return now - last_seen <= ONLINE_WINDOW
