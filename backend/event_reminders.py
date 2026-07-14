"""Event start reminders — one-shot script for a Railway Cron service.

QUEUES a "starts tomorrow" reminder for management approval for every event
whose START falls ~24h out. The reminder targets the event START time, computed
as COALESCE(Event.starts_at, Event.deadline): events with a real start time
remind relative to it; legacy events that only carry a signup ``deadline`` fall
back to it unchanged. Run daily so each event is reminded once — the daily
cadence + the 24h-wide window give one queued post per event without a stamp
column.

Founder's rule (see app.services.group_moderation): nothing is posted to a
public group automatically. Instead of the old direct fan-out to the region's
school/LC groups + the global group, each reminder is now queued into the
management group; a manager approves it there and the bot then posts it to the
public group. If no management group is configured, nothing is posted at all.

Schedule on Railway:
  Schedule (UTC):  0 6 * * *   (11:00 Tashkent)
  Start command:   python event_reminders.py
"""
from __future__ import annotations

import asyncio
import html
import logging
from datetime import datetime, timedelta

from sqlalchemy import func, select

from app.database import AsyncSessionLocal, engine
from app.models.event import Event
from app.services.group_moderation import queue_group_post

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("event_reminders")


async def main() -> int:
    now = datetime.utcnow()
    # Events whose START is between 12h and 36h away → "tomorrow" window.
    # A daily run hits each event's T-1 exactly once.
    lo, hi = now + timedelta(hours=12), now + timedelta(hours=36)
    # Remind on the real start when set, else fall back to the signup deadline.
    remind_at = func.coalesce(Event.starts_at, Event.deadline)

    queued = 0
    async with AsyncSessionLocal() as s:
        events = (await s.execute(
            select(Event).where(
                Event.is_deleted == False,
                remind_at.is_not(None),
                remind_at >= lo,
                remind_at <= hi,
            )
        )).scalars().all()

    # Queue each reminder for management approval (its own session; safe outside
    # the read session above). queue_group_post no-ops when no management group
    # is set, so this posts nothing until the founder configures the queue.
    for e in events:
        start_at = e.starts_at or e.deadline
        text = (
            f"⏰ <b>Starts tomorrow</b>\n"
            f"📅 {html.escape(e.title)} ({html.escape(e.type)})\n"
            f"Starts {start_at + timedelta(hours=5):%d %b %H:%M}."
        )
        await queue_group_post(text, f"event_{e.id}")
        queued += 1

    log.info("event reminders: %d events queued for approval", queued)
    await engine.dispose()
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
