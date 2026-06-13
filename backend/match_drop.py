"""Monday Match Drop — one-shot script for a Railway Cron service.

Turns the AI match feed into a weekly appointment: every Monday each user
gets a DM with their top-3 fresh matches (by tag overlap), each a deep link
straight to that profile. The matching data + delivery channel already exist;
this just packages them into a ritual.

Schedule on Railway:
  Schedule (UTC):  0 5 * * 1   (Mondays 10:00 Tashkent)
  Start command:   python match_drop.py

Scale note: pairwise scoring is O(recipients × candidates). Fine at current
size; if the community grows past a few thousand active users, switch to a
region-bucketed pass or precomputed tag index.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.config import settings
from app.database import AsyncSessionLocal, engine
from app.models.user import Interest, User
from app.services.notify import esc, send_telegram

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("match_drop")

_CATS = ("skills", "knowledges", "interests", "preparations", "goals")

HEADER = {
    "en": "✨ <b>Your weekly matches</b>\nPeople on BFU who line up with you:",
    "uz": "✨ <b>Haftalik mosliklaringiz</b>\nBFU’da sizga mos odamlar:",
    "ru": "✨ <b>Ваши совпадения недели</b>\nЛюди на BFU, которые вам подходят:",
}
SHARED = {"en": "shared", "uz": "umumiy", "ru": "общих"}
OPEN_BTN = {"en": "👀 Open", "uz": "👀 Ochish", "ru": "👀 Открыть"}


def _tags(analysis) -> set[str]:
    s: set[str] = set()
    if analysis:
        for c in _CATS:
            s.update(x.lower() for x in (getattr(analysis, c, None) or []))
    return s


async def main() -> int:
    async with AsyncSessionLocal() as session:
        people = (await session.execute(
            select(User).options(selectinload(User.analysis)).where(
                User.is_deleted == False, User.is_registered == True,
            )
        )).scalars().all()

        tagmap = {u.id: _tags(u.analysis) for u in people}
        # Don't re-surface people they already pinged.
        pinged_rows = (await session.execute(select(Interest.from_user_id, Interest.to_user_id))).all()
        pinged: dict[int, set[int]] = {}
        for frm, to in pinged_rows:
            pinged.setdefault(frm, set()).add(to)

        sent = 0
        for u in people:
            if not u.telegram_id or not tagmap.get(u.id):
                continue
            mine = tagmap[u.id]
            skip = pinged.get(u.id, set())
            scored = []
            for other in people:
                if other.id == u.id or other.id in skip or not other.telegram_id:
                    continue
                overlap = len(mine & tagmap.get(other.id, set()))
                if overlap:
                    scored.append((overlap, other))
            if not scored:
                continue
            scored.sort(key=lambda t: (t[0], 1 if t[1].checked else 0), reverse=True)
            top = scored[:3]

            lang = (u.language or "en") if (u.language or "en") in HEADER else "en"
            lines = [HEADER[lang]]
            buttons = []
            for overlap, other in top:
                check = " ✓" if other.checked else ""
                lines.append(f"• <b>{esc(other.display_name)}</b>{check} — {overlap} {SHARED[lang]}")
                buttons.append([{
                    "text": f"{OPEN_BTN[lang]} {other.display_name}"[:40],
                    "web_app": {"url": f"{settings.WEBAPP_URL}?startapp=user_{other.id}"},
                }])

            if await send_telegram(u.telegram_id, "\n".join(lines),
                                   reply_markup={"inline_keyboard": buttons}):
                sent += 1
            await asyncio.sleep(0.04)  # ~25/sec Telegram limit

    log.info("match drop: %d recipients, %d sent", len(people), sent)
    await engine.dispose()
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
