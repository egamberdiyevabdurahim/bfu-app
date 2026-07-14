"""Per-attendee event-time reminders — one-shot Railway Cron job (hourly).

Two independent passes, each sending ONE personal Telegram DM per RSVP and
stamping its OWN idempotency column so the hourly dispatcher never re-sends:

  • T-24h  "starts tomorrow"    → event_rsvps.reminded_at
  • T-1h   "starts in ~1 hour"  → event_rsvps.reminded_1h_at

Both target the EVENT START time, computed as COALESCE(Event.starts_at,
Event.deadline): events with a real start time remind relative to it; older
events that only carry a signup ``deadline`` fall back to it, so their timing is
unchanged (only the copy now says "starts" instead of "closes").

The two windows are DISJOINT so their union is the whole next 24h with no gap
and no overlap:
    T-24h  →  (now + 1h,  now + 24h]
    T-1h   →  (now,       now + 1h ]
Every 'going' RSVP whose start is <24h out therefore gets exactly the reminder
that matches its proximity, and no RSVP ever receives both messages in the same
run. A failed send leaves that pass's stamp NULL, so the next hourly run retries
it — until the start passes out of the window, after which it is correctly
dropped (you can't remind about something that has already started).

Registered in cron_dispatch.py to run EVERY hour; per-row idempotency makes the
wide windows safe hourly and also covers late RSVPs (an RSVP made when the start
is already <1h out still gets its one T-1h reminder on the next pass).

Schedule on Railway (via cron_dispatch.py):  python cron_dispatch.py  (hourly)
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta

from sqlalchemy import func, select, update

from app.config import settings
from app.database import AsyncSessionLocal, engine
from app.models.event import Event
from app.models.event_rsvp import EventRsvp
from app.models.user import User
from app.services.notify import esc, send_telegram

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("rsvp_reminders")

HEADER_24H = {
    "en": "⏰ <b>Reminder</b> — an opportunity you're going to starts tomorrow:",
    "uz": "⏰ <b>Eslatma</b> — siz boradigan imkoniyat ertaga boshlanadi:",
    "ru": "⏰ <b>Напоминание</b> — возможность, на которую вы идёте, начинается завтра:",
}
HEADER_1H = {
    "en": "⏰ <b>Starting soon</b> — an opportunity you're going to starts in ~1 hour:",
    "uz": "⏰ <b>Tez orada boshlanadi</b> — siz boradigan imkoniyat ~1 soatda boshlanadi:",
    "ru": "⏰ <b>Скоро начало</b> — возможность, на которую вы идёте, начнётся примерно через час:",
}
# Localized label for the exact start timestamp line (kept precise so the fuzzy
# "tomorrow" / "~1 hour" headers are always backed by the real time).
STARTS_LINE = {"en": "Starts", "uz": "Boshlanishi", "ru": "Начало"}
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


async def _run_pass(s, now, *, lo, hi, stamp_col, headers,
                    reachable_only: bool = False) -> tuple[int, int]:
    """One reminder pass. Selects 'going' RSVPs whose (coalesced) start time is
    in (lo, hi] and whose ``stamp_col`` is still NULL, DMs each opted-in attendee
    once, and stamps ``stamp_col`` on success (committed per-row so a mid-batch
    crash can't re-send). Returns (candidates, sent).

    ``reachable_only`` adds ``User.can_message == True`` to the query — used by
    the T-1h pass (per spec, "only to can_message users"). The T-24h pass leaves
    it off to preserve its long-standing behaviour of attempting any user with a
    telegram_id and relying on the send result to decide whether to stamp."""
    # COALESCE(starts_at, deadline): remind on the real start when set, else fall
    # back to the signup deadline for legacy events (naive-UTC, like both cols).
    remind_at = func.coalesce(Event.starts_at, Event.deadline)

    conds = [
        EventRsvp.status == "going",
        stamp_col.is_(None),
        Event.is_deleted == False,
        Event.is_approved == True,   # don't remind for moderated-out events
        remind_at.is_not(None),      # event has neither start nor deadline → skip
        remind_at > lo,
        remind_at <= hi,
        User.is_deleted == False,
    ]
    if reachable_only:
        # Only attempt reachable users (avoids futile 403 retries every hour).
        conds.append(User.can_message == True)

    # Select plain COLUMNS (not ORM objects) so the per-row commit below can't
    # trigger async lazy-loads on expired instances.
    rows = (await s.execute(
        select(
            EventRsvp.id, Event.id, Event.title, Event.type, remind_at,
            User.telegram_id, User.language, User.notification_prefs,
        )
        .join(Event, Event.id == EventRsvp.event_id)
        .join(User, User.id == EventRsvp.user_id)
        .where(*conds)
    )).all()

    sent = 0
    for rsvp_id, ev_id, title, ev_type, start_at, tg_id, language, prefs in rows:
        # No chat or muted → skip WITHOUT stamping, so a mid-window unmute (or a
        # later-added telegram_id) still gets its reminder on the next pass.
        if not tg_id or not _push_ok(prefs):
            continue
        lang = language if (language in headers) else "en"
        url = f"https://t.me/{settings.BOT_USERNAME}?startapp=event_{ev_id}"
        text = (
            f"{headers[lang]}\n"
            f"📅 <b>{esc(title)}</b> ({esc(ev_type)})\n"
            f"{STARTS_LINE[lang]} {start_at:%d %b %H:%M}."
        )
        markup = {"inline_keyboard": [[{"text": OPEN_BTN[lang], "url": url}]]}
        if await send_telegram(tg_id, text, reply_markup=markup):
            # Stamp + commit immediately so a crash can't re-send delivered ones
            # (durable exactly-once per send). A failed send leaves the stamp
            # NULL → retried next hour.
            await s.execute(
                update(EventRsvp).where(EventRsvp.id == rsvp_id).values({stamp_col: now})
            )
            await s.commit()
            sent += 1
        await asyncio.sleep(0.04)  # ~25 msg/sec Telegram global cap
    return len(rows), sent


async def main() -> int:
    now = datetime.utcnow()  # naive-UTC, matches Event.starts_at / Event.deadline

    async with AsyncSessionLocal() as s:
        # T-24h "starts tomorrow": window (now+1h, now+24h], stamp reminded_at.
        c24, s24 = await _run_pass(
            s, now,
            lo=now + timedelta(hours=1), hi=now + timedelta(hours=24),
            stamp_col=EventRsvp.reminded_at, headers=HEADER_24H,
        )
        # T-1h "starts in ~1 hour": window (now, now+1h], stamp reminded_1h_at,
        # reachable users only (spec).
        c1, s1 = await _run_pass(
            s, now,
            lo=now, hi=now + timedelta(hours=1),
            stamp_col=EventRsvp.reminded_1h_at, headers=HEADER_1H,
            reachable_only=True,
        )

    log.info(
        "rsvp reminders: T-24h sent=%d/%d, T-1h sent=%d/%d (sent/candidates)",
        s24, c24, s1, c1,
    )
    await engine.dispose()
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
