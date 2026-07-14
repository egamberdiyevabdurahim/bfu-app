"""Targeted 'new opportunity' push — a service function the events flow calls
when an event is published.

``push_new_event(event_id)`` opens its OWN AsyncSession, finds every registered,
reachable user the event is relevant to (its region — or everyone, for a global
event), and sends each a short localized Telegram DM with a Mini-App button.

SINGLE-CALL CONTRACT (important): the caller invokes this EXACTLY ONCE per event
— once on create for an admin (already-approved) event, and once on the
unapproved→approved transition for a partner submission. Because of that it
keeps NO per-user dedup state of its own; calling it twice for the same event
would DM everyone twice. Fire it fire-and-forget (``asyncio.create_task``) from
the router so it never adds latency to the create/approve response.
"""
from __future__ import annotations

import asyncio
import logging

from sqlalchemy import select

from app.config import settings
from app.database import AsyncSessionLocal
from app.models.event import Event
from app.models.user import User
from app.services.notifications import should_push_telegram
from app.services.notify import esc, push_event

log = logging.getLogger("event_distribution")

# The push is routed through the "events" preference category so a user who
# muted event notifications is respected. ``event_reminder`` is the notif type
# that maps to that category (see notifications.TYPE_TO_PREF); we reuse it here
# rather than add a new mapping in a file other agents also touch.
_NOTIF_TYPE = "event_reminder"

_NEW_EVENT_TEXT = {
    "en": "🆕 <b>New opportunity on BFU</b>\n"
          "📅 <b>{title}</b> ({type})\n"
          "Tap to see the details and register.",
    "uz": "🆕 <b>BFU'da yangi imkoniyat</b>\n"
          "📅 <b>{title}</b> ({type})\n"
          "Batafsil ma'lumot va ro'yxatdan o'tish uchun bosing.",
    "ru": "🆕 <b>Новая возможность в BFU</b>\n"
          "📅 <b>{title}</b> ({type})\n"
          "Нажмите, чтобы узнать детали и зарегистрироваться.",
}
_OPEN_BTN = {"en": "🚀 Open in BFU", "uz": "🚀 BFU'da ochish", "ru": "🚀 Открыть в BFU"}


async def push_new_event(event_id: int) -> int:
    """DM every relevant, reachable user about a newly published event.

    Returns the number of pushes DISPATCHED (push_event is fire-and-forget, so
    this counts users that passed every gate and were queued for send, not
    Telegram-confirmed deliveries). Never raises — a failure is logged and the
    partial count is returned."""
    sent = 0
    try:
        async with AsyncSessionLocal() as s:
            event = await s.get(Event, event_id)
            # Nothing to announce for a deleted or still-unapproved event.
            if not event or event.is_deleted or not event.is_approved:
                return 0

            q = select(User).where(
                User.is_deleted == False,
                User.banned == False,
                User.is_registered == True,
                User.telegram_id.is_not(None),
                # Only DM users the bot can actually reach (story-link users who
                # never granted write access can't be messaged — see can_message).
                User.can_message == True,
            )
            # region_id NULL → global event → everyone; otherwise only users
            # whose region matches. (Region-less users are excluded from a
            # region-specific event, which is the intended targeting.)
            if event.region_id is not None:
                q = q.where(User.region_id == event.region_id)

            users = (await s.execute(q)).scalars().all()

            fmt = {"title": esc(event.title), "type": esc(event.type)}
            for u in users:
                # Respect the per-user "events" mute. push_event re-checks this
                # internally; we mirror it here so the returned count is truthful
                # and we don't waste a pacing tick on a muted user.
                if not should_push_telegram(u, _NOTIF_TYPE):
                    continue
                push_event(
                    u, _NOTIF_TYPE, _NEW_EVENT_TEXT, fmt=fmt,
                    url=settings.WEBAPP_URL or None, btn_by_lang=_OPEN_BTN,
                )
                sent += 1
                # Pace task creation to ~20/s so a big region blast stays under
                # Telegram's global send cap (push_event dispatches each send on
                # the event loop via notify_background).
                await asyncio.sleep(0.05)
    except Exception:
        log.exception("push_new_event(%s) failed after %d pushes", event_id, sent)
    return sent
