"""'Who wrote' Telegram ping: when a DM recipient is OFFLINE, the bot pings them.
Gated by reachability (can_message), their notification prefs, online-status, and
a per-conversation debounce so a burst of messages is one ping, not a flood."""
import pytest

from app.routers import messages as M
from app.routers.ws import manager

pytestmark = pytest.mark.asyncio


@pytest.fixture(autouse=True)
def _spy_push(monkeypatch):
    """Record every bot ping instead of firing it, and start each test with a
    clean debounce table + everyone treated as offline."""
    calls = []
    monkeypatch.setattr(M, "notify_background",
                        lambda chat_id, text, reply_markup=None: calls.append((chat_id, text)))
    M._last_msg_push.clear()
    monkeypatch.setattr(manager, "is_online", lambda uid: False)
    return calls


async def test_pings_offline_reachable_recipient(make_user, db, _spy_push):
    sender = await make_user(name="Sana")
    rcpt = await make_user(name="Bob", can_message=True)
    await M._push_message_dm(db, {rcpt.id}, sender, conversation_id=101)
    assert len(_spy_push) == 1
    assert _spy_push[0][0] == rcpt.telegram_id


async def test_skips_unreachable_recipient(make_user, db, _spy_push):
    sender = await make_user(name="Sana")
    rcpt = await make_user(name="Gone", can_message=False)   # never granted write access
    await M._push_message_dm(db, {rcpt.id}, sender, conversation_id=102)
    assert _spy_push == []


async def test_skips_online_recipient(make_user, db, _spy_push, monkeypatch):
    sender = await make_user(name="Sana")
    rcpt = await make_user(name="Live", can_message=True)
    monkeypatch.setattr(manager, "is_online", lambda uid: True)  # in the app → got WS fanout
    await M._push_message_dm(db, {rcpt.id}, sender, conversation_id=103)
    assert _spy_push == []


async def test_skips_when_messages_muted(make_user, db, _spy_push):
    sender = await make_user(name="Sana")
    rcpt = await make_user(name="Muted", can_message=True,
                           notification_prefs={"messages": False})
    await M._push_message_dm(db, {rcpt.id}, sender, conversation_id=104)
    assert _spy_push == []


async def test_skips_when_telegram_push_master_off(make_user, db, _spy_push):
    sender = await make_user(name="Sana")
    rcpt = await make_user(name="NoPush", can_message=True,
                           notification_prefs={"telegram_push": False})
    await M._push_message_dm(db, {rcpt.id}, sender, conversation_id=105)
    assert _spy_push == []


async def test_debounced_per_conversation(make_user, db, _spy_push):
    sender = await make_user(name="Sana")
    rcpt = await make_user(name="Bursty", can_message=True)
    await M._push_message_dm(db, {rcpt.id}, sender, conversation_id=106)
    await M._push_message_dm(db, {rcpt.id}, sender, conversation_id=106)  # burst
    assert len(_spy_push) == 1  # second suppressed by the 15-min debounce
