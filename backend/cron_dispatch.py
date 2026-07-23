"""Single cron dispatcher — run every 5 min, runs the right jobs by UTC time.

Lets you create ONE Railway Cron service instead of six. Still a separate
service from the web process (honors the "no in-process scheduler" decision).

Railway Cron service:
  Root directory: backend
  Start command:  python cron_dispatch.py
  Schedule (UTC): */5 * * * *    (every 5 minutes)

**rsvp_reminders runs EVERY tick (every 5 min)** so organizer-set reminder
moments fire within ~5 min of their scheduled time — an event whose reminders
land at :30 / :50 past the hour (or a T-1h/T-24h moment) must not wait up to a
full hour. Everything else stays hourly: gated on ``minute < 5`` so the once-a-
day / weekly jobs run exactly once (at the :00 tick of their hour), never 12×.

Job times (UTC):
  every 5 min       → rsvp_reminders (per-attendee event reminders, once each)
  hourly (:00)      → nudges (abandoned + inactive)
  01:00 daily       → db_backup
  04:00 daily       → pulse (founder daily DM)
  06:00 daily       → event_reminders (T-1 deadlines)
  Mon 05:00         → match_drop (weekly matches)
  Mon 09:00         → digest (weekly digest + Viloyat Wars)
"""
from __future__ import annotations

import asyncio
import importlib
import logging
from datetime import datetime

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("cron")


def _due(now: datetime) -> list[str]:
    # Runs EVERY tick (every 5 min) — event reminders need sub-hourly accuracy.
    # rsvp_reminders is exactly-once per (rsvp, moment) via EventRsvp.reminders_sent,
    # so re-running every 5 min never double-sends.
    jobs = ["rsvp_reminders"]
    # Everything else keeps its hourly/daily cadence: only at the :00 tick of the
    # hour (minute < 5) so a 5-min dispatcher can't fire a daily job 12 times.
    if now.minute < 5:
        jobs.append("nudges")
        if now.hour == 1:
            jobs.append("db_backup")
        if now.hour == 4:
            jobs.append("pulse")
        if now.hour == 6:
            jobs.append("event_reminders")
        if now.weekday() == 0 and now.hour == 5:   # Monday
            jobs.append("match_drop")
        if now.weekday() == 0 and now.hour == 9:
            jobs.append("digest")
    return jobs


async def main() -> int:
    now = datetime.utcnow()
    jobs = _due(now)
    log.info("dispatch %sUTC → %s", now.strftime("%a %H:%M "), jobs)
    for name in jobs:
        try:
            mod = importlib.import_module(name)
            await mod.main()
            log.info("job %s ok", name)
        except Exception as exc:
            log.exception("job %s failed: %s", name, exc)
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
