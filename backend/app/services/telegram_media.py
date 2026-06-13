"""Fetch Telegram profile photos via the Bot API.

The bot can read profile photos of users who have started it (all Mini App
users have). We store the stable `file_id` on the user at login, then resolve
file_id -> file_path -> bytes on demand (file_path expires, file_id doesn't),
with an in-process TTL cache so Discover doesn't hammer the Telegram API.
"""
from __future__ import annotations

import logging
import time

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

_API = "https://api.telegram.org"

# file_id -> (ts, jpeg_bytes). Bounded + TTL'd. Photos change rarely.
_photo_cache: dict[str, tuple[float, bytes]] = {}
_CACHE_TTL = 6 * 60 * 60  # 6h
_CACHE_MAX = 600


async def fetch_photo_file_id(telegram_id: int) -> str | None:
    """Largest-size file_id of the user's current profile photo, or None."""
    if not settings.BOT_TOKEN or not telegram_id:
        return None
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            r = await client.get(
                f"{_API}/bot{settings.BOT_TOKEN}/getUserProfilePhotos",
                params={"user_id": telegram_id, "limit": 1},
            )
        data = r.json()
        photos = (data.get("result") or {}).get("photos") or []
        if not photos:
            return None
        sizes = photos[0]  # list of PhotoSize, ascending by resolution
        if not sizes:
            return None
        return sizes[-1].get("file_id")  # largest
    except Exception as exc:
        logger.warning("getUserProfilePhotos failed for %s: %s", telegram_id, exc)
        return None


async def download_photo(file_id: str) -> bytes | None:
    """Resolve a file_id to JPEG bytes, cached. Returns None on any failure."""
    if not settings.BOT_TOKEN or not file_id:
        return None
    hit = _photo_cache.get(file_id)
    if hit and time.monotonic() - hit[0] < _CACHE_TTL:
        return hit[1]
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            gf = await client.get(
                f"{_API}/bot{settings.BOT_TOKEN}/getFile",
                params={"file_id": file_id},
            )
            file_path = (gf.json().get("result") or {}).get("file_path")
            if not file_path:
                return None
            resp = await client.get(f"{_API}/file/bot{settings.BOT_TOKEN}/{file_path}")
            if resp.status_code != 200 or not resp.content:
                return None
            blob = resp.content
    except Exception as exc:
        logger.warning("download_photo failed for %s: %s", file_id, exc)
        return None

    # Bound the cache (drop oldest) before inserting.
    if len(_photo_cache) >= _CACHE_MAX:
        oldest = min(_photo_cache, key=lambda k: _photo_cache[k][0])
        _photo_cache.pop(oldest, None)
    _photo_cache[file_id] = (time.monotonic(), blob)
    return blob
