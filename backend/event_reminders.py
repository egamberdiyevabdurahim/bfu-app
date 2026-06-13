"""Event deadline reminders — one-shot script for a Railway Cron service.

Posts a "deadline tomorrow" reminder to the global Telegram group (and the
relevant region's school/LC groups, if the event is region-specific) for every
event whose deadline falls ~24h out. Run daily so each event is reminded once.

Schedule on Railway:
  Schedule (UTC):  0 6 * * *   (11:00 Tashkent)
  Start command:   python event_reminders.py
"""
from __future__ import annotations

import asyncio
import html
import logging
from datetime import datetime, timedelta

from sqlalchemy import select

from app.config import settings
from app.database import AsyncSessionLocal, engine
from app.models.event import Event
from app.models.region import LearningCenter, School
from app.services.notify import send_telegram

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("event_reminders")


async def main() -> int:
    now = datetime.utcnow()
    # Events whose deadline is between 12h and 36h away → "tomorrow" window.
    # A daily run hits each event's T-1 exactly once.
    lo, hi = now + timedelta(hours=12), now + timedelta(hours=36)

    sent = 0
    async with AsyncSessionLocal() as s:
        events = (await s.execute(
            select(Event).where(
                Event.is_deleted == False,
                Event.deadline.is_not(None),
                Event.deadline >= lo,
                Event.deadline <= hi,
            )
        )).scalars().all()

        for e in events:
            url = f"https://t.me/{settings.BOT_USERNAME}?startapp=event_{e.id}"
            text = (
                f"⏰ <b>Deadline tomorrow</b>\n"
                f"📅 {html.escape(e.title)} ({html.escape(e.type)})\n"
                f"Closes {e.deadline:%d %b %H:%M}."
            )
            markup = {"inline_keyboard": [[{"text": "🚀 Open in BFU", "url": url}]]}

            # Region-specific events go to that region's school/LC groups;
            # otherwise to the global group.
            targets: list[int] = []
            if e.region_id:
                for model in (School, LearningCenter):
                    rows = (await s.execute(
                        select(model.group_id).where(
                            model.region_id == e.region_id,
                            model.group_id.is_not(None),
                        )
                    )).scalars().all()
                    targets.extend(g for g in rows if g)
            if not targets and settings.TG_GLOBAL_GROUP_ID:
                targets = [settings.TG_GLOBAL_GROUP_ID]

            for chat_id in set(targets):
                if await send_telegram(chat_id, text, reply_markup=markup):
                    sent += 1
                await asyncio.sleep(0.05)

    log.info("event reminders: %d events, %d messages sent", len(events), sent)
    await engine.dispose()
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
