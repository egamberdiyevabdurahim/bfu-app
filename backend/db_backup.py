"""Daily DB snapshot → ZIP → Telegram dev group.

JSON-dumps every table via SQLAlchemy (no `pg_dump` binary needed in the
container), zips them, and uploads the file via Telegram sendDocument.

Cron schedule (UTC):  30 1 * * *    (daily 01:30 UTC = 06:30 Tashkent)
Start command       :  python db_backup.py

Env required:  BOT_TOKEN, DEVELOPER_GROUP_ID (already set in Railway).
"""
from __future__ import annotations

import asyncio
import io
import json
import logging
import os
import zipfile
from datetime import datetime, date

import httpx
from sqlalchemy import select

from app.config import settings
from app.database import AsyncSessionLocal, Base, engine
import app.models  # noqa — register all models on Base.metadata

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("db_backup")


def _serialize(v):
    if isinstance(v, (datetime, date)):
        return v.isoformat()
    return v


async def dump_to_zip() -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        async with AsyncSessionLocal() as session:
            for table in Base.metadata.sorted_tables:
                rows = (await session.execute(select(table))).all()
                payload = [
                    {col.name: _serialize(row._mapping[col]) for col in table.columns}
                    for row in rows
                ]
                zf.writestr(f"{table.name}.json", json.dumps(payload, ensure_ascii=False, indent=2))
                log.info("dumped %s rows=%d", table.name, len(payload))
    return buf.getvalue()


async def upload(token: str, chat_id: int, name: str, blob: bytes) -> None:
    files = {"document": (name, blob, "application/zip")}
    data = {"chat_id": str(chat_id),
            "caption": f"📦 BFU DB snapshot {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}"}
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(
            f"https://api.telegram.org/bot{token}/sendDocument",
            data=data, files=files,
        )
        if r.status_code >= 400:
            log.error("Telegram upload failed: %s %s", r.status_code, r.text[:500])
        else:
            log.info("uploaded ok")


async def main() -> int:
    if not settings.BOT_TOKEN or not settings.DEVELOPER_GROUP_ID:
        log.error("BOT_TOKEN or DEVELOPER_GROUP_ID missing — aborting backup.")
        return 1
    blob = await dump_to_zip()
    name = f"bfu_db_{datetime.utcnow().strftime('%Y%m%d_%H%M')}.zip"
    await upload(settings.BOT_TOKEN, settings.DEVELOPER_GROUP_ID, name, blob)
    await engine.dispose()
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
