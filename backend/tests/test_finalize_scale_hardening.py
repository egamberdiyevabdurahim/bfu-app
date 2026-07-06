"""Scale-readiness hardening for POST /users/me/finalize (registration-spike
audit): the admin ping, referrer payoff, group tagging, and AI analysis must
all be backgrounded — none may block the HTTP response or hold the request's
DB connection open, since this endpoint is what EVERY new user hits, and a
burst of registrations (e.g. an influencer shoutout) is exactly when Telegram/
AI-provider latency would otherwise pile up on the request path.
"""
import asyncio

import pytest

import app.routers.users as ur
from app.models.user import User

pytestmark = pytest.mark.asyncio


async def test_finalize_queues_a_batched_admin_notice_not_a_direct_send(make_user, as_user, db, monkeypatch):
    calls = []
    monkeypatch.setattr(ur, "queue_registration_notice", lambda: calls.append("queued"))

    me = await make_user(name="Me", is_registered=False)
    c = as_user(me)
    res = await c.post("/users/me/finalize")
    assert res.status_code == 200, res.text
    assert calls == ["queued"]


async def test_finalize_referrer_payoff_is_backgrounded_not_awaited(make_user, as_user, db, monkeypatch):
    captured = {}

    def fake_notify_background(chat_id, text, reply_markup=None):
        captured["chat_id"] = chat_id
        captured["text"] = text

    monkeypatch.setattr(ur, "notify_background", fake_notify_background)
    monkeypatch.setattr(ur, "queue_registration_notice", lambda: None)

    referrer = await make_user(name="Referrer", telegram_id=555001)
    me = await make_user(name="Me", is_registered=False, referred_by=referrer.id)
    c = as_user(me)
    res = await c.post("/users/me/finalize")
    assert res.status_code == 200, res.text
    assert captured.get("chat_id") == 555001
    assert captured.get("text")


async def test_finalize_ai_analysis_runs_in_background_with_its_own_session(make_user, as_user, db, monkeypatch, session_factory):
    """The background _analyze() task must not reuse the request's `db` — it
    opens its own session via AsyncSessionLocal, which in prod points at the
    real engine but must be pointed at the test engine here (mirroring the
    same pattern used for bot.py's inline-mode background session)."""
    from app.models.user_analysis import UserAnalysis

    async def fake_analyze_and_save(session, user_id, text):
        session.add(UserAnalysis(user_id=user_id, skills=["React"], knowledges=[],
                                  interests=[], preparations=[], goals=[]))
        await session.commit()
        return {"skills": ["React"]}

    monkeypatch.setattr(ur, "analyze_and_save", fake_analyze_and_save)
    monkeypatch.setattr(ur, "queue_registration_notice", lambda: None)
    monkeypatch.setattr(ur, "AsyncSessionLocal", session_factory)

    me = await make_user(name="Me", is_registered=False, about="I love building things.")
    c = as_user(me)
    res = await c.post("/users/me/finalize")
    assert res.status_code == 200, res.text

    for _ in range(20):
        await asyncio.sleep(0.02)
        row = (await db.execute(
            __import__("sqlalchemy").select(UserAnalysis).where(UserAnalysis.user_id == me.id)
        )).scalar_one_or_none()
        if row is not None:
            break
    assert row is not None
    assert row.skills == ["React"]


async def test_finalize_group_tagging_is_backgrounded(make_user, as_user, db, monkeypatch):
    tagged = []

    async def fake_set_member_tag(chat_id, user_id, tag):
        tagged.append((chat_id, user_id, tag))

    monkeypatch.setattr(ur, "_set_member_tag", fake_set_member_tag)
    monkeypatch.setattr(ur, "queue_registration_notice", lambda: None)
    monkeypatch.setattr(ur.settings, "TG_GLOBAL_GROUP_ID", -100999)

    me = await make_user(name="Me", is_registered=False)
    c = as_user(me)
    res = await c.post("/users/me/finalize")
    assert res.status_code == 200, res.text

    for _ in range(20):
        await asyncio.sleep(0.02)
        if tagged:
            break
    assert tagged and tagged[0][0] == -100999
