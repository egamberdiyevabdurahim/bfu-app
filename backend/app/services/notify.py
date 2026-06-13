"""Lightweight fire-and-forget Telegram sender (bot HTTP API)."""
from __future__ import annotations

import html
import logging

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

# All messages are sent with parse_mode=HTML — every user-controlled value
# (names, bios, project titles, report reasons) MUST go through esc() or
# Telegram rejects the whole message on a stray '<' and renders attacker
# markup (e.g. <a href> phishing links) on a valid one.
esc = html.escape


async def send_telegram(
    chat_id: int | str, text: str, reply_markup: dict | None = None
) -> bool:
    """Returns True only when Telegram accepted the message."""
    if not settings.BOT_TOKEN or not chat_id:
        return False
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
            return False
        return True
    except Exception as exc:  # never let a notification break a request
        logger.warning("Telegram notify failed: %s", exc)
        return False
