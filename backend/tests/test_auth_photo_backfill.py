"""Scale-readiness hardening for /auth/telegram: the profile-photo refresh
must not be an inline blocking call on the hot login/registration path (every
registration AND every login hits this). `_backfill_photo` is the backgrounded
helper (fired via asyncio.create_task) — test it directly since /auth/telegram
itself can't be exercised in this suite without valid Telegram initData.
"""
import pytest

from app.routers.auth import _backfill_photo

pytestmark = pytest.mark.asyncio


async def test_backfill_photo_writes_via_its_own_session(make_user, db, monkeypatch, session_factory):
    async def fake_fetch(tg_id):
        return "FILE_ID_123"

    monkeypatch.setattr("app.services.telegram_media.fetch_photo_file_id", fake_fetch)
    monkeypatch.setattr("app.routers.auth.AsyncSessionLocal", session_factory)

    user = await make_user(name="Me", telegram_id=777001, photo_file_id=None)
    await _backfill_photo(user.id, 777001)

    # _backfill_photo committed via its OWN session (session_factory), so
    # check with a FRESH session too rather than the `db` fixture's
    # identity-mapped (now-stale) object.
    async with session_factory() as check_db:
        refreshed = await check_db.get(type(user), user.id)
        assert refreshed.photo_file_id == "FILE_ID_123"


async def test_backfill_photo_noop_when_telegram_returns_nothing(make_user, db, monkeypatch, session_factory):
    async def fake_fetch(tg_id):
        return None

    monkeypatch.setattr("app.services.telegram_media.fetch_photo_file_id", fake_fetch)
    monkeypatch.setattr("app.routers.auth.AsyncSessionLocal", session_factory)

    user = await make_user(name="Me", telegram_id=777002, photo_file_id=None)
    await _backfill_photo(user.id, 777002)

    refreshed = await db.get(type(user), user.id)
    assert refreshed.photo_file_id is None


async def test_backfill_photo_swallows_errors(monkeypatch, session_factory):
    """Must never raise — it's fired via create_task with no one awaiting it,
    so an unhandled exception would surface as an unretrieved-task error."""
    async def boom(tg_id):
        raise RuntimeError("Telegram API down")

    monkeypatch.setattr("app.services.telegram_media.fetch_photo_file_id", boom)
    monkeypatch.setattr("app.routers.auth.AsyncSessionLocal", session_factory)

    await _backfill_photo(999999, 777003)  # must not raise
