"""Lightweight fire-and-forget Telegram sender (bot HTTP API)."""
from __future__ import annotations

import logging

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


async def send_telegram(chat_id: int | str, text: str, reply_markup: dict | None = None) -> None:
    if not settings.BOT_TOKEN or not chat_id:
        return
    payload: dict = {"chat_id": chat_id, "text": text, "parse_mode": "HTML",
                     "disable_web_page_preview": True}
    if reply_markup:
        payload["reply_markup"] = reply_markup
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            await client.post(
                f"https://api.telegram.org/bot{settings.BOT_TOKEN}/sendMessage",
                json=payload,
            )
    except Exception as exc:  # never let a notification break a request
        logger.warning("Telegram notify failed: %s", exc)
