"""Founder daily pulse — one-shot script for a Railway Cron service.

Sends Abdurahim a single morning DM with the numbers that matter, so he
stops learning about problems from the noisy per-event admin group.

Reports (last 24h unless noted):
  • DAU (users seen in the last 24h)        • new registrations
  • projects awaiting approval (queue)      • unresolved reports
  • unhandled errors (grouped by path)      • total members / verified

Schedule on Railway:
  Settings → New Service → Cron job → same backend repo/image
  Schedule (UTC):  0 4 * * *   (09:00 Tashkent)
  Start command:   python pulse.py

Sends to DEVELOPER_GROUP_ID (falls back to ADMIN_GROUP_ID).
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta

from sqlalchemy import func, select

from app.config import settings
from app.database import AsyncSessionLocal, engine
from app.models.project import Project
from app.models.user import ErrorLog, Report, User

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("pulse")


async def main() -> int:
    chat_id = settings.DEVELOPER_GROUP_ID or settings.ADMIN_GROUP_ID
    if not chat_id:
        log.warning("no DEVELOPER_GROUP_ID/ADMIN_GROUP_ID set; skipping pulse")
        return 0

    now = datetime.utcnow()
    day_ago = now - timedelta(hours=24)

    async with AsyncSessionLocal() as s:
        dau = await s.scalar(select(func.count(User.id)).where(
            User.last_seen_at >= day_ago, User.is_deleted == False)) or 0
        new_users = await s.scalar(select(func.count(User.id)).where(
            User.created_at >= day_ago, User.is_registered == True,
            User.is_deleted == False)) or 0
        total_members = await s.scalar(select(func.count(User.id)).where(
            User.is_registered == True, User.is_deleted == False)) or 0
        verified = await s.scalar(select(func.count(User.id)).where(
            User.is_registered == True, User.is_deleted == False,
            User.checked == True)) or 0
        queue = await s.scalar(select(func.count(Project.id)).where(
            Project.is_approved == False, Project.is_draft == False,
            Project.is_deleted == False)) or 0
        open_reports = await s.scalar(select(func.count(Report.id)).where(
            Report.resolved == False)) or 0

        err_rows = (await s.execute(
            select(ErrorLog.path, func.count(ErrorLog.id))
            .where(ErrorLog.created_at >= day_ago)
            .group_by(ErrorLog.path)
            .order_by(func.count(ErrorLog.id).desc())
            .limit(5)
        )).all()
        err_total = sum(c for _, c in err_rows)

    lines = [
        "🩺 <b>BFU daily pulse</b>",
        f"👥 DAU (24h): <b>{dau}</b>",
        f"🆕 New registrations: <b>{new_users}</b>",
        f"📊 Members: <b>{total_members}</b> ({verified} verified)",
        f"🗂 Approval queue: <b>{queue}</b>",
        f"🚩 Open reports: <b>{open_reports}</b>",
        f"🐞 Errors (24h): <b>{err_total}</b>",
    ]
    if err_rows:
        import html
        top = " · ".join(f"{html.escape(p or '?')}×{c}" for p, c in err_rows)
        lines.append(f"   <i>{top}</i>")

    # Import here so a notify failure can't stop the metric queries above.
    from app.services.notify import send_telegram
    ok = await send_telegram(chat_id, "\n".join(lines))
    log.info("pulse sent=%s dau=%d queue=%d reports=%d errors=%d",
             ok, dau, queue, open_reports, err_total)
    await engine.dispose()
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
