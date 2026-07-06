"""Registration-notice batching: queue_registration_notice() must collapse a
burst of registrations into ONE periodic digest message instead of one
Telegram call per registration (a single admin chat can only take ~20
msgs/minute — a burst blows through that and Telegram silently drops the
rest, per send_telegram's own behavior on a non-2xx response).
"""
import asyncio

import pytest

from app.services import notify

pytestmark = pytest.mark.asyncio


@pytest.fixture(autouse=True)
def _reset_batching_state():
    notify._registration_count = 0
    notify._flush_task = None
    yield
    if notify._flush_task and not notify._flush_task.done():
        notify._flush_task.cancel()
    notify._registration_count = 0
    notify._flush_task = None


async def test_queue_registration_notice_returns_immediately(monkeypatch):
    """The caller must never await a real Telegram round-trip."""
    calls = []

    async def slow_send(chat_id, text, reply_markup=None):
        await asyncio.sleep(5)  # would time a test out if awaited inline
        calls.append((chat_id, text))
        return True

    monkeypatch.setattr(notify, "send_telegram", slow_send)
    monkeypatch.setattr(notify, "REGISTRATION_FLUSH_INTERVAL_S", 0.05)
    notify.queue_registration_notice()  # must not block
    assert calls == []  # the slow send hasn't run yet — proves it's backgrounded


async def test_burst_of_registrations_collapses_to_one_message(monkeypatch):
    calls = []

    async def fake_send(chat_id, text, reply_markup=None):
        calls.append((chat_id, text))
        return True

    monkeypatch.setattr(notify, "send_telegram", fake_send)
    monkeypatch.setattr(notify, "REGISTRATION_FLUSH_INTERVAL_S", 0.05)
    monkeypatch.setattr(notify.settings, "ADMIN_GROUP_ID", -100123)

    for _ in range(37):
        notify.queue_registration_notice()

    await asyncio.sleep(0.15)  # let the flush loop fire once

    assert len(calls) == 1
    chat_id, text = calls[0]
    assert chat_id == -100123
    assert "37" in text


async def test_flush_loop_stops_when_idle_and_restarts_on_next_call(monkeypatch):
    calls = []

    async def fake_send(chat_id, text, reply_markup=None):
        calls.append(text)
        return True

    monkeypatch.setattr(notify, "send_telegram", fake_send)
    monkeypatch.setattr(notify, "REGISTRATION_FLUSH_INTERVAL_S", 0.05)
    monkeypatch.setattr(notify.settings, "ADMIN_GROUP_ID", -100123)

    notify.queue_registration_notice()
    await asyncio.sleep(0.15)
    assert len(calls) == 1
    first_task = notify._flush_task
    assert first_task.done()  # loop exits itself once idle

    notify.queue_registration_notice()
    assert notify._flush_task is not first_task  # a fresh loop was started
    await asyncio.sleep(0.15)
    assert len(calls) == 2
