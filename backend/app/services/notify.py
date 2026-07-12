"""Lightweight fire-and-forget Telegram sender (bot HTTP API)."""
from __future__ import annotations

import asyncio
import html
import logging
from typing import NamedTuple

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


class SendResult(NamedTuple):
    ok: bool                 # Telegram accepted the message
    status: int | None       # HTTP status from Telegram (None = never sent / exception)
    unreachable: bool        # Telegram says this user can't be DMed (vs. a transient error)


# Telegram error descriptions that mean "the bot may not message this user" —
# distinct from transient failures (429 flood, 5xx, timeout) which must NOT be
# treated as a permanent reachability verdict.
_UNREACHABLE_HINTS = (
    "bot can't initiate conversation",
    "bot was blocked by the user",
    "user is deactivated",
    "chat not found",
    "bot can't send messages to bots",
    "have no rights to send",
)


def _is_unreachable(status_code: int, body: str) -> bool:
    low = (body or "").lower()
    if any(h in low for h in _UNREACHABLE_HINTS):
        return True
    # A bare 403 without a recognized hint is still a permission problem.
    return status_code == 403

# All messages are sent with parse_mode=HTML — every user-controlled value
# (names, bios, project titles, report reasons) MUST go through esc() or
# Telegram rejects the whole message on a stray '<' and renders attacker
# markup (e.g. <a href> phishing links) on a valid one.
esc = html.escape


async def send_telegram_result(
    chat_id: int | str, text: str, reply_markup: dict | None = None
) -> SendResult:
    """Send a bot DM and report the outcome in detail. `unreachable` is True only
    when Telegram says the bot may not message this user (403 / blocked / never
    started) — never for a transient 429/5xx/timeout — so callers can safely
    record a per-user reachability verdict."""
    if not settings.BOT_TOKEN or not chat_id:
        return SendResult(False, None, False)
    payload: dict = {"chat_id": chat_id, "text": text, "parse_mode": "HTML",
                     "disable_web_page_preview": True}
    if reply_markup:
        payload["reply_markup"] = reply_markup
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            r = await client.post(
                f"https://api.telegram.org/bot{settings.BOT_TOKEN}/sendMessage",
                json=payload,
            )
        if r.status_code >= 400:
            logger.warning(
                "Telegram notify rejected (%s) chat=%s: %s",
                r.status_code, chat_id, r.text[:300],
            )
            return SendResult(False, r.status_code, _is_unreachable(r.status_code, r.text))
        return SendResult(True, r.status_code, False)
    except Exception as exc:  # never let a notification break a request
        logger.warning("Telegram notify failed: %s", exc)
        return SendResult(False, None, False)


async def send_telegram(
    chat_id: int | str, text: str, reply_markup: dict | None = None
) -> bool:
    """Returns True only when Telegram accepted the message. Thin bool wrapper
    over send_telegram_result for the many callers that don't need the detail."""
    return (await send_telegram_result(chat_id, text, reply_markup)).ok


def notify_background(chat_id: int | str, text: str, reply_markup: dict | None = None) -> None:
    """Fire-and-forget a Telegram message — schedules it and returns
    immediately, so a slow/rate-limited Telegram API call never adds latency
    to the caller's HTTP response (and never holds its DB connection open).
    Use this at any request-path call site instead of `await send_telegram`."""
    asyncio.create_task(send_telegram(chat_id, text, reply_markup))


# ── Registration-notice batching ────────────────────────────────────────────
# A single admin-group chat can only receive ~20 Telegram messages/minute. A
# registration burst (e.g. an influencer shoutout) blows through that almost
# immediately if we send one message per registration — the rest are
# rejected by Telegram and (per send_telegram above) silently dropped,
# costing the founder visibility into exactly the spike they want to watch.
# Instead, count registrations and flush ONE digest message per interval.
_registration_count = 0
_flush_task: asyncio.Task | None = None
REGISTRATION_FLUSH_INTERVAL_S = 60


async def _flush_registration_notice() -> None:
    global _registration_count
    while True:
        await asyncio.sleep(REGISTRATION_FLUSH_INTERVAL_S)
        count, _registration_count = _registration_count, 0
        if count <= 0:
            return  # nothing new since the last flush — stop; next call restarts it
        if settings.ADMIN_GROUP_ID:
            suffix = "user" if count == 1 else "users"
            await send_telegram(
                settings.ADMIN_GROUP_ID,
                f"✅ <b>{count} new registered {suffix}</b> in the last {REGISTRATION_FLUSH_INTERVAL_S}s",
            )


def queue_registration_notice() -> None:
    """Call once per new registration instead of sending an admin message
    directly. Batches into a periodic digest (see module docstring above)."""
    global _registration_count, _flush_task
    _registration_count += 1
    if _flush_task is None or _flush_task.done():
        _flush_task = asyncio.create_task(_flush_registration_notice())
