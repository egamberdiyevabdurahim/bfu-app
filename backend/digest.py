"""Weekly digest — one-shot script meant for a Railway Cron service.

Run weekly:  python digest.py
What it does:
  • For every registered, non-deleted user with a Telegram id
  • Counts new approved projects + new registered users in the past 7 days
  • Sends a short Telegram digest (best-effort; never aborts the loop)

Schedule on Railway:
  Settings → New Service → Cron job → image/repo = same backend
  Schedule (UTC):  0 9 * * 1   (Mondays 09:00 UTC = 14:00 Tashkent)
  Start command:   python digest.py
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta

from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from app.config import settings
from app.database import AsyncSessionLocal, engine
from app.models.project import Project
from app.models.user import User
from app.services.notify import esc, send_telegram

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("digest")


DIGEST_TEMPLATES = {
    "en": (
        "📬 <b>BFU weekly digest</b>\n"
        "This week: <b>{projects}</b> new project(s), <b>{users}</b> new member(s).\n"
        "{titles}\nOpen the app to explore."
    ),
    "uz": (
        "📬 <b>BFU haftalik xulosa</b>\n"
        "Bu hafta: <b>{projects}</b> ta yangi loyiha, <b>{users}</b> ta yangi a’zo.\n"
        "{titles}\nKo‘rish uchun ilovani oching."
    ),
    "ru": (
        "📬 <b>Еженедельная сводка BFU</b>\n"
        "На этой неделе: <b>{projects}</b> новых проектов, <b>{users}</b> новых участников.\n"
        "{titles}\nОткройте приложение, чтобы посмотреть."
    ),
}


async def _send_for(session, user: User, since: datetime) -> None:
    if not user.telegram_id:
        return
    proj_count = await session.scalar(
        select(func.count(Project.id)).where(
            Project.is_deleted == False,
            Project.is_approved == True,
            Project.created_at >= since,
        )
    ) or 0
    user_count = await session.scalar(
        select(func.count(User.id)).where(
            User.is_deleted == False,
            User.is_registered == True,
            User.created_at >= since,
        )
    ) or 0
    if not proj_count and not user_count:
        return  # nothing new for this person; skip
    titles_rows = (await session.execute(
        select(Project.name).where(
            Project.is_deleted == False,
            Project.is_approved == True,
            Project.created_at >= since,
        ).order_by(Project.created_at.desc()).limit(3)
    )).all()
    titles = "\n".join(f"• {esc(row[0])}" for row in titles_rows)
    tpl = DIGEST_TEMPLATES.get((user.language or "en"), DIGEST_TEMPLATES["en"])
    txt = tpl.format(projects=proj_count, users=user_count, titles=titles or "")
    try:
        await send_telegram(user.telegram_id, txt)
    except Exception as exc:  # never break the cron
        log.warning("digest send failed uid=%s: %s", user.id, exc)


async def main() -> int:
    since = datetime.utcnow() - timedelta(days=7)
    log.info("digest start since=%s", since.isoformat())
    sent = 0
    async with AsyncSessionLocal() as session:
        users = (await session.execute(
            select(User).where(
                User.is_deleted == False,
                User.is_registered == True,
            )
        )).scalars().all()
        log.info("recipients=%d", len(users))
        for u in users:
            try:
                await _send_for(session, u, since)
                sent += 1
            except Exception as exc:
                log.warning("user uid=%s failed: %s", u.id, exc)
            await asyncio.sleep(0.04)  # ~25/sec — Telegram limit
    await engine.dispose()
    log.info("digest done sent_attempts=%d", sent)
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
