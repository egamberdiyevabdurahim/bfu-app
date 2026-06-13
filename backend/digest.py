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
from app.models.region import Region
from app.models.user import Interest, User
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


_INTEREST_RECAP = {
    "en": "\n💜 <b>{n}</b> {ppl} showed interest in your profile this week.",
    "uz": "\n💜 Bu hafta <b>{n}</b> kishi profilingizga qiziqdi.",
    "ru": "\n💜 На этой неделе <b>{n}</b> {ppl} заинтересовались вашим профилем.",
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
    # Real "people interested in you" recap from the Interest table.
    interest_count = await session.scalar(
        select(func.count(Interest.id)).where(
            Interest.to_user_id == user.id,
            Interest.created_at >= since,
        )
    ) or 0
    if not proj_count and not user_count and not interest_count:
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
    if interest_count:
        lang = (user.language or "en") if (user.language or "en") in _INTEREST_RECAP else "en"
        ppl = "person" if interest_count == 1 else "people"
        txt += _INTEREST_RECAP[lang].format(n=interest_count, ppl=ppl)
    ok = await send_telegram(user.telegram_id, txt)
    if not ok:
        log.warning("digest send dropped uid=%s", user.id)


async def _viloyat_wars(session, since: datetime) -> None:
    """Region-vs-region invite race → a weekly post in the official channel.
    Regional pride is free marketing. Ranks regions by invites that converted
    to full registrations in the past week."""
    if not settings.TG_OFFICIAL_CHANNEL_ID:
        return
    rows = (await session.execute(
        select(Region.name_uz, func.count(User.id))
        .join(User, User.region_id == Region.id)
        .where(User.referred_by.is_not(None), User.is_registered == True,
               User.is_deleted == False, User.created_at >= since)
        .group_by(Region.name_uz)
        .order_by(func.count(User.id).desc())
        .limit(5)
    )).all()
    rows = [(name, c) for name, c in rows if c]
    if not rows:
        return
    medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣"]
    lines = ["🏆 <b>Viloyatlar bahsi — shu hafta</b>", "Eng ko‘p yangi a’zo taklif qilgan viloyatlar:"]
    for i, (name, c) in enumerate(rows):
        lines.append(f"{medals[i]} <b>{esc(name)}</b> — {c}")
    lines.append("\nViloyatingiz uchun do‘stlaringizni taklif qiling! 🚀")
    await send_telegram(settings.TG_OFFICIAL_CHANNEL_ID, "\n".join(lines))


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
        try:
            await _viloyat_wars(session, since)
        except Exception as exc:
            log.warning("viloyat wars failed: %s", exc)
    await engine.dispose()
    log.info("digest done sent_attempts=%d", sent)
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
