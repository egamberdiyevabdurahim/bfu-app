"""Per-attendee event reminders — one-shot Railway Cron job (hourly).

Two reminder MODES, mutually exclusive per event:

  A) ORGANIZER-SET custom times (Event.reminder_times = [ISO, …]): every 'going'
     attendee is DMed at each of those moments. Each (rsvp, reminder_time) fires
     exactly once — the time's ISO string is appended to EventRsvp.reminders_sent
     on a successful send. This is the mode the event editor drives.

  B) LEGACY auto windows (event has NO reminder_times): the original two passes,
     targeting COALESCE(starts_at, deadline):
       • T-24h  "starts tomorrow"    → event_rsvps.reminded_at
       • T-1h   "starts in ~1 hour"  → event_rsvps.reminded_1h_at
     An event with custom times is EXCLUDED from these passes, so it never gets
     both the custom and the auto reminders.

Every reminder DM now carries the RSVP-intent buttons ✅ Boraman / ❌ Borolmayman
(callback_data ev:coming:{id} / ev:cant:{id}, handled by the bot process, which
flips EventRsvp.lead_status to coming / cant_come) plus a "🚀 Open in BFU" button.

Per-row idempotency (a stamp / reminders_sent entry written + committed right after
each successful send) makes the wide hourly windows safe and durable: a failed send
leaves no stamp so the next hour retries, and a mid-batch crash can never re-send an
already-delivered reminder.

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
# Header for an organizer-set custom reminder (no fuzzy "tomorrow"/"1 hour" claim —
# the precise start line below carries the real time).
HEADER_CUSTOM = {
    "en": "⏰ <b>Reminder</b> — an event you're going to:",
    "uz": "⏰ <b>Eslatma</b> — siz boradigan tadbir:",
    "ru": "⏰ <b>Напоминание</b> — мероприятие, на которое вы идёте:",
}
STARTS_LINE = {"en": "Starts", "uz": "Boshlanishi", "ru": "Начало"}
OPEN_BTN = {"en": "🚀 Open in BFU", "uz": "🚀 BFU'da ochish", "ru": "🚀 BFU'da ochish"}
# RSVP-intent buttons shown on EVERY reminder. Tapping flips the attendee's
# lead_status (coming / cant_come) — handled by the bot's ev: callback.
COMING_BTN = {"en": "✅ I'll come", "uz": "✅ Boraman", "ru": "✅ Приду"}
CANT_BTN = {"en": "❌ Can't come", "uz": "❌ Borolmayman", "ru": "❌ Не смогу"}


def _push_ok(prefs: dict | None) -> bool:
    """Replicates should_push_telegram for an event_reminder (→ 'events' category)
    without needing a live User ORM object, so we can select plain columns and
    commit per-row without ORM-expiry pitfalls. Opt-out: absent key = enabled."""
    p = prefs or {}
    try:
        return bool(p.get("telegram_push", True)) and bool(p.get("events", True))
    except Exception:
        return True


def _reminder_markup(lang: str, ev_id: int) -> dict:
    """The reminder DM keyboard: ✅Boraman / ❌Borolmayman (bot ev: callbacks) +
    a deep-link to open the event in BFU."""
    url = f"https://t.me/{settings.BOT_USERNAME}?startapp=event_{ev_id}"
    return {
        "inline_keyboard": [
            [
                {"text": COMING_BTN[lang], "callback_data": f"ev:coming:{ev_id}"},
                {"text": CANT_BTN[lang], "callback_data": f"ev:cant:{ev_id}"},
            ],
            [{"text": OPEN_BTN[lang], "url": url}],
        ]
    }


def _body(lang: str, header: dict, title: str, ev_type: str, start_at) -> str:
    line = ""
    if start_at is not None:
        # start_at is naive-UTC; +5h → Tashkent wall-clock.
        line = f"\n{STARTS_LINE[lang]} {start_at + timedelta(hours=5):%d %b %H:%M}."
    return f"{header[lang]}\n📅 <b>{esc(title)}</b> ({esc(ev_type)}){line}"


# ─────────────────────────── legacy auto windows (mode B) ────────────────────
async def _run_pass(s, now, *, lo, hi, stamp_col, headers,
                    reachable_only: bool = False) -> tuple[int, int]:
    """One legacy reminder pass (mode B). Selects 'going' RSVPs of events WITHOUT
    organizer-set reminder_times whose COALESCE(starts_at, deadline) is in (lo, hi]
    and whose ``stamp_col`` is NULL; DMs each opted-in attendee once and stamps
    ``stamp_col`` on success (committed per-row). Returns (candidates, sent)."""
    remind_at = func.coalesce(Event.starts_at, Event.deadline)

    conds = [
        EventRsvp.status == "going",
        stamp_col.is_(None),
        Event.is_deleted == False,
        Event.is_approved == True,
        # Mode B only: events that DON'T carry custom reminder times. (The
        # normalizer stores NULL — never [] — for "no custom times", so IS NULL is
        # exact and cross-DB safe: Postgres JSONB + SQLite JSON in tests.)
        Event.reminder_times.is_(None),
        remind_at.is_not(None),
        remind_at > lo,
        remind_at <= hi,
        User.is_deleted == False,
    ]
    if reachable_only:
        conds.append(User.can_message == True)

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
        if not tg_id or not _push_ok(prefs):
            continue
        lang = language if (language in headers) else "en"
        text = _body(lang, headers, title, ev_type, start_at)
        if await send_telegram(tg_id, text, reply_markup=_reminder_markup(lang, ev_id)):
            await s.execute(
                update(EventRsvp).where(EventRsvp.id == rsvp_id).values({stamp_col: now})
            )
            await s.commit()
            sent += 1
        await asyncio.sleep(0.04)
    return len(rows), sent


# ─────────────────────── organizer-set custom times (mode A) ─────────────────
def _parse_iso(v: str) -> datetime | None:
    try:
        return datetime.fromisoformat(str(v).replace("Z", "+00:00")).replace(tzinfo=None)
    except (ValueError, TypeError):
        return None


async def _run_custom_pass(s, now) -> tuple[int, int]:
    """Mode A: for every 'going' RSVP of an event that HAS reminder_times, send any
    reminder whose moment has arrived (in the last 24h, so an ancient time isn't
    fired) and isn't already in the RSVP's reminders_sent. Each successful send
    appends that reminder's ISO string to reminders_sent + commits (exactly-once)."""
    floor = now - timedelta(hours=24)  # don't fire reminders more than a day stale

    rows = (await s.execute(
        select(
            EventRsvp.id, EventRsvp.reminders_sent,
            Event.id, Event.title, Event.type,
            func.coalesce(Event.starts_at, Event.deadline),
            Event.reminder_times,
            User.telegram_id, User.language, User.notification_prefs,
        )
        .join(Event, Event.id == EventRsvp.event_id)
        .join(User, User.id == EventRsvp.user_id)
        .where(
            EventRsvp.status == "going",
            Event.is_deleted == False,
            Event.is_approved == True,
            Event.reminder_times.is_not(None),  # mode A: has custom times (never [])
            User.is_deleted == False,
        )
    )).all()

    candidates = sent = 0
    for (rsvp_id, sent_list, ev_id, title, ev_type, start_at,
         reminder_times, tg_id, language, prefs) in rows:
        already = set(sent_list or [])
        # Due, not-yet-sent, not stale — in the event's declared order.
        due = [
            iso for iso in (reminder_times or [])
            if iso not in already
            and (dt := _parse_iso(iso)) is not None
            and floor < dt <= now
        ]
        if not due:
            continue
        candidates += 1
        if not tg_id or not _push_ok(prefs):
            continue
        lang = language if (language in HEADER_CUSTOM) else "en"
        text = _body(lang, HEADER_CUSTOM, title, ev_type, start_at)
        # Send at most one DM per run per RSVP even if several times came due at
        # once (rare); mark ALL the due ones sent so they don't re-fire next hour.
        if await send_telegram(tg_id, text, reply_markup=_reminder_markup(lang, ev_id)):
            new_sent = sorted(already | set(due))
            await s.execute(
                update(EventRsvp).where(EventRsvp.id == rsvp_id)
                .values({EventRsvp.reminders_sent: new_sent})
            )
            await s.commit()
            sent += 1
        await asyncio.sleep(0.04)
    return candidates, sent


async def main() -> int:
    now = datetime.utcnow()  # naive-UTC, matches Event.starts_at / Event.deadline

    async with AsyncSessionLocal() as s:
        cc, sc = await _run_custom_pass(s, now)
        c24, s24 = await _run_pass(
            s, now,
            lo=now + timedelta(hours=1), hi=now + timedelta(hours=24),
            stamp_col=EventRsvp.reminded_at, headers=HEADER_24H,
        )
        c1, s1 = await _run_pass(
            s, now,
            lo=now, hi=now + timedelta(hours=1),
            stamp_col=EventRsvp.reminded_1h_at, headers=HEADER_1H,
            reachable_only=True,
        )

    log.info(
        "rsvp reminders: custom sent=%d/%d, T-24h sent=%d/%d, T-1h sent=%d/%d (sent/candidates)",
        sc, cc, s24, c24, s1, c1,
    )
    await engine.dispose()
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
