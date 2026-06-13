"""Hourly nudges — Railway Cron service.

Sends two flavours of bot DM (each user gets one nudge max in each track):
  • abandoned-registration   — created 18–48h ago, not yet finished
  • inactive-user            — was registered, last_seen_at > 14 days

Cron schedule (UTC):  0 * * * *      (top of every hour)
Start command       :  python nudges.py
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta

from sqlalchemy import select

from app.config import settings
from app.database import AsyncSessionLocal, engine
from app.models.user import User
from app.services.notify import send_telegram

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("nudges")


ABANDONED = {
    "en": "👋 You started signing up to BFU — want to finish? It takes ~1 minute.",
    "uz": "👋 BFU ro‘yxatdan o‘tishni boshlagansiz — yakunlaymizmi? Bir daqiqada bo‘ladi.",
    "ru": "👋 Вы начали регистрацию в BFU — закончим? Это ~1 минута.",
}
INACTIVE = {
    "en": "📬 BFU misses you! New projects and people have arrived this week — take a look.",
    "uz": "📬 BFU sizni sog‘indi! Bu hafta yangi loyihalar va odamlar qo‘shildi — bir ko‘ring.",
    "ru": "📬 BFU соскучился! На этой неделе появились новые проекты и люди — загляните.",
}


def _btn() -> dict:
    return {"inline_keyboard": [[{"text": "🚀 Open BFU", "web_app": {"url": settings.WEBAPP_URL}}]]}


async def _nudge_abandoned(session, now: datetime) -> int:
    """Users created 18–48h ago, not registered, never nudged."""
    earliest = now - timedelta(hours=48)
    latest = now - timedelta(hours=18)
    rows = (await session.execute(
        select(User).where(
            User.is_deleted == False,
            User.is_registered == False,
            User.last_nudged_at.is_(None),
            User.created_at >= earliest,
            User.created_at <= latest,
            User.telegram_id.is_not(None),
        )
    )).scalars().all()
    sent = 0
    for u in rows:
        lang = (u.language or "en") if (u.language or "en") in ABANDONED else "en"
        # Only consume the one-shot nudge if Telegram actually accepted it —
        # send_telegram returns False on 400/403/429 instead of raising.
        ok = await send_telegram(u.telegram_id, ABANDONED[lang], reply_markup=_btn())
        if ok:
            u.last_nudged_at = now
            sent += 1
        await asyncio.sleep(0.05)
    await session.commit()
    log.info("abandoned sent=%d (pool=%d)", sent, len(rows))
    return sent


async def _nudge_inactive(session, now: datetime) -> int:
    """Registered users idle > 14 days; re-nudge at most once per 30 days."""
    threshold = now - timedelta(days=14)
    renudge = now - timedelta(days=30)
    rows = (await session.execute(
        select(User).where(
            User.is_deleted == False,
            User.is_registered == True,
            User.last_seen_at.is_not(None),
            User.last_seen_at < threshold,
            ((User.last_nudged_at.is_(None)) | (User.last_nudged_at < renudge)),
            User.telegram_id.is_not(None),
        ).limit(500)
    )).scalars().all()
    sent = 0
    for u in rows:
        lang = (u.language or "en") if (u.language or "en") in INACTIVE else "en"
        ok = await send_telegram(u.telegram_id, INACTIVE[lang], reply_markup=_btn())
        if ok:
            u.last_nudged_at = now
            sent += 1
        await asyncio.sleep(0.05)
    await session.commit()
    log.info("inactive sent=%d (pool=%d)", sent, len(rows))
    return sent


async def main() -> int:
    now = datetime.utcnow()
    log.info("nudges start at=%s", now.isoformat())
    async with AsyncSessionLocal() as session:
        await _nudge_abandoned(session, now)
        await _nudge_inactive(session, now)
    await engine.dispose()
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
