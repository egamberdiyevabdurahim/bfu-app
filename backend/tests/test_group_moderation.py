"""Management-approval queue for public-group posts (app.services.group_moderation).

Contract points under test:
  * queue_group_post with NO management group  -> posts NOTHING, stores NOTHING
  * queue_group_post with a management group    -> stores a pending row + "sends"
    the card to the management id (message_id captured on the row)
  * resolve_group_post approve -> posts to the public group + marks approved
  * resolve_group_post reject  -> marks rejected, no public post
  * resolve_group_post on an already-decided row -> no-op ("already")
  * resolve_group_post on a missing row / bad action -> "not_found" / "error"

The service opens its OWN AsyncSessionLocal — point it at the suite's in-memory
SQLite factory (same pattern as test_event_ai). Telegram sends are patched to
capturing fakes.
"""
import pytest
from sqlalchemy import select

from app.services import group_moderation as gm
from app.models.group_post import PendingGroupPost

pytestmark = pytest.mark.asyncio


async def _all_posts(session_factory):
    async with session_factory() as s:
        return (await s.execute(select(PendingGroupPost))).scalars().all()


# ── queue_group_post ──────────────────────────────────────────────────────────

async def test_queue_no_management_group_posts_and_stores_nothing(
    monkeypatch, session_factory
):
    monkeypatch.setattr(gm, "AsyncSessionLocal", session_factory)
    monkeypatch.setattr(gm.settings, "TG_MANAGEMENT_GROUP_ID", None)

    calls = []

    async def _fake_send_message(*a, **k):
        calls.append((a, k))
        return 999

    monkeypatch.setattr(gm, "send_telegram_message", _fake_send_message)

    await gm.queue_group_post("hello card", "project_1")

    assert calls == []                       # nothing sent anywhere
    assert await _all_posts(session_factory) == []   # nothing stored


async def test_queue_with_management_group_stores_pending_and_sends(
    monkeypatch, session_factory
):
    monkeypatch.setattr(gm, "AsyncSessionLocal", session_factory)
    monkeypatch.setattr(gm.settings, "TG_MANAGEMENT_GROUP_ID", 555)
    monkeypatch.setattr(gm.settings, "TG_MANAGEMENT_TOPIC_ID", None)

    calls = []

    async def _fake_send_message(chat_id, text, reply_markup=None, message_thread_id=None):
        calls.append({"chat_id": chat_id, "text": text,
                      "reply_markup": reply_markup, "thread": message_thread_id})
        return 4242

    monkeypatch.setattr(gm, "send_telegram_message", _fake_send_message)

    await gm.queue_group_post("card body", "event_9", button_text="Go")

    # sent exactly once, to the management group
    assert len(calls) == 1
    assert calls[0]["chat_id"] == 555
    assert "card body" in calls[0]["text"]
    assert calls[0]["thread"] is None

    rows = await _all_posts(session_factory)
    assert len(rows) == 1
    row = rows[0]
    assert row.status == "pending"
    assert row.start_param == "event_9"
    assert row.button_text == "Go"
    assert row.mgmt_message_id == 4242

    # inline buttons carry the row id in callback_data
    kb = calls[0]["reply_markup"]["inline_keyboard"][0]
    assert kb[0]["callback_data"] == f"gp_ok:{row.id}"
    assert kb[1]["callback_data"] == f"gp_no:{row.id}"


async def test_queue_uses_management_topic_thread_when_set(monkeypatch, session_factory):
    monkeypatch.setattr(gm, "AsyncSessionLocal", session_factory)
    monkeypatch.setattr(gm.settings, "TG_MANAGEMENT_GROUP_ID", 555)
    monkeypatch.setattr(gm.settings, "TG_MANAGEMENT_TOPIC_ID", 77)

    seen = {}

    async def _fake_send_message(chat_id, text, reply_markup=None, message_thread_id=None):
        seen["thread"] = message_thread_id
        return 1

    monkeypatch.setattr(gm, "send_telegram_message", _fake_send_message)

    await gm.queue_group_post("body", "project_2")
    assert seen["thread"] == 77


# ── resolve_group_post ────────────────────────────────────────────────────────

async def _seed(db, **overrides) -> int:
    defaults = dict(text="the card", start_param="project_5",
                    button_text="Open", status="pending")
    defaults.update(overrides)
    row = PendingGroupPost(**defaults)
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row.id


async def test_resolve_approve_posts_to_public_group_and_marks_approved(
    monkeypatch, session_factory, db
):
    monkeypatch.setattr(gm, "AsyncSessionLocal", session_factory)
    monkeypatch.setattr(gm.settings, "TG_GLOBAL_GROUP_ID", 777)

    sends = []

    async def _fake_send(chat_id, text, reply_markup=None):
        sends.append({"chat_id": chat_id, "text": text, "reply_markup": reply_markup})
        return True

    monkeypatch.setattr(gm, "send_telegram", _fake_send)

    post_id = await _seed(db)
    result = await gm.resolve_group_post(post_id, "approve", 111)
    assert result == "posted"

    # posted to the PUBLIC group with the deep-link button
    assert len(sends) == 1
    assert sends[0]["chat_id"] == 777
    assert sends[0]["text"] == "the card"
    btn = sends[0]["reply_markup"]["inline_keyboard"][0][0]
    assert btn["text"] == "Open"
    assert "startapp=project_5" in btn["url"]

    async with session_factory() as s:
        row = await s.get(PendingGroupPost, post_id)
        assert row.status == "approved"
        assert row.decided_by == 111
        assert row.decided_at is not None


async def test_resolve_reject_marks_rejected_with_no_public_post(
    monkeypatch, session_factory, db
):
    monkeypatch.setattr(gm, "AsyncSessionLocal", session_factory)
    monkeypatch.setattr(gm.settings, "TG_GLOBAL_GROUP_ID", 777)

    sends = []

    async def _fake_send(*a, **k):
        sends.append((a, k))
        return True

    monkeypatch.setattr(gm, "send_telegram", _fake_send)

    post_id = await _seed(db, start_param="event_2")
    result = await gm.resolve_group_post(post_id, "reject", 222)
    assert result == "rejected"
    assert sends == []   # nothing posted to the public group

    async with session_factory() as s:
        row = await s.get(PendingGroupPost, post_id)
        assert row.status == "rejected"
        assert row.decided_by == 222
        assert row.decided_at is not None


async def test_resolve_already_decided_is_noop(monkeypatch, session_factory, db):
    monkeypatch.setattr(gm, "AsyncSessionLocal", session_factory)
    monkeypatch.setattr(gm.settings, "TG_GLOBAL_GROUP_ID", 777)

    sends = []

    async def _fake_send(*a, **k):
        sends.append((a, k))
        return True

    monkeypatch.setattr(gm, "send_telegram", _fake_send)

    post_id = await _seed(db, status="approved", decided_by=5)
    result = await gm.resolve_group_post(post_id, "approve", 999)
    assert result == "already"
    assert sends == []   # no second public post

    async with session_factory() as s:
        row = await s.get(PendingGroupPost, post_id)
        assert row.decided_by == 5   # untouched


async def test_resolve_not_found(monkeypatch, session_factory):
    monkeypatch.setattr(gm, "AsyncSessionLocal", session_factory)
    result = await gm.resolve_group_post(999_999, "approve", 1)
    assert result == "not_found"


async def test_resolve_invalid_action_is_error(monkeypatch, session_factory, db):
    monkeypatch.setattr(gm, "AsyncSessionLocal", session_factory)
    post_id = await _seed(db, start_param="event_3")
    result = await gm.resolve_group_post(post_id, "bogus", 1)
    assert result == "error"

    async with session_factory() as s:
        row = await s.get(PendingGroupPost, post_id)
        assert row.status == "pending"   # unchanged
