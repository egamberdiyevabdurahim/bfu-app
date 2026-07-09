"""Per-attendee RSVP deadline reminders — one-shot Railway Cron job.

For each user who RSVP'd 'going' to an event whose deadline is within the next
~24h and who hasn't been reminded yet, send ONE personal Telegram reminder, then
stamp event_rsvps.reminded_at so it never re-sends (exactly-once per RSVP,
regardless of how often the dispatcher runs).

This is the PERSONAL counterpart to event_reminders.py (which posts a single
T-1 reminder to the group). Registered in cron_dispatch.py to run EVERY hour;
per-row idempotency (reminded_at) makes the wide 24h window safe hourly and also
covers late RSVPs (an RSVP made when the deadline is already <24h out still gets
exactly one reminder on the next pass).

Schedule on Railway (via cron_dispatch.py):
  Start command:   python cron_dispatch.py   (hourly; dispatches this job)
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta

from sqlalchemy import select, update

from app.config import settings
from app.database import AsyncSessionLocal, engine
from app.models.event import Event
from app.models.event_rsvp import EventRsvp
from app.models.user import User
from app.services.notify import esc, send_telegram

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("rsvp_reminders")

HEADER = {
    "en": "⏰ <b>Reminder</b> — an opportunity you're going to closes soon:",
    "uz": "⏰ <b>Eslatma</b> — siz boradigan imkoniyat tez orada yopiladi:",
    "ru": "⏰ <b>Напоминание</b> — возможность, на которую вы идёте, скоро закроется:",
}
OPEN_BTN = {"en": "🚀 Open in BFU", "uz": "🚀 BFU'da ochish", "ru": "🚀 Открыть в BFU"}


def _push_ok(prefs: dict | None) -> bool:
    """Replicates should_push_telegram for an event_reminder (→ 'events' category)
    without needing a live User ORM object, so we can select plain columns and
    commit per-row without ORM-expiry pitfalls. Opt-out: absent key = enabled."""
    p = prefs or {}
    try:
        return bool(p.get("telegram_push", True)) and bool(p.get("events", True))
    except Exception:
        return True


async def main() -> int:
    now = datetime.utcnow()
    hi = now + timedelta(hours=24)  # naive-UTC, matches Event.deadline

    candidates = sent = 0
    async with AsyncSessionLocal() as s:
        # Select plain COLUMNS (not ORM objects) so a per-row commit below can't
        # trigger async lazy-loads on expired instances.
        rows = (await s.execute(
            select(
                EventRsvp.id, Event.id, Event.title, Event.type, Event.deadline,
                User.telegram_id, User.language, User.notification_prefs,
            )
            .join(Event, Event.id == EventRsvp.event_id)
            .join(User, User.id == EventRsvp.user_id)
            .where(
                EventRsvp.status == "going",
                EventRsvp.reminded_at.is_(None),
                Event.is_deleted == False,
                Event.is_approved == True,   # don't remind for moderated-out events
                Event.deadline.is_not(None),
                Event.deadline >= now,       # not already closed
                Event.deadline <= hi,        # within the next 24h
                User.is_deleted == False,
            )
        )).all()
        candidates = len(rows)

        for rsvp_id, ev_id, title, ev_type, deadline, tg_id, language, prefs in rows:
            # No chat or muted → skip WITHOUT stamping, so a mid-window unmute
            # (or a later-added telegram_id) still gets a reminder next hour.
            if not tg_id or not _push_ok(prefs):
                continue
            lang = language if (language in HEADER) else "en"
            url = f"https://t.me/{settings.BOT_USERNAME}?startapp=event_{ev_id}"
            text = (
                f"{HEADER[lang]}\n"
                f"📅 <b>{esc(title)}</b> ({esc(ev_type)})\n"
                f"Closes {deadline:%d %b %H:%M}."
            )
            markup = {"inline_keyboard": [[{"text": OPEN_BTN[lang], "url": url}]]}
            if await send_telegram(tg_id, text, reply_markup=markup):
                # Stamp + commit immediately so a mid-batch crash can't re-send
                # the ones already delivered (durable exactly-once per send).
                await s.execute(
                    update(EventRsvp).where(EventRsvp.id == rsvp_id).values(reminded_at=now)
                )
                await s.commit()
                sent += 1
            await asyncio.sleep(0.04)  # ~25 msg/sec Telegram global cap

    log.info("rsvp reminders: %d candidates, %d sent", candidates, sent)
    await engine.dispose()
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
