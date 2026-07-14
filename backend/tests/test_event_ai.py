"""generate_event_report(): AI digest of an event's form responses.

Contract points under test:
  * 0 responses  -> no AI call, response_count 0, friendly message
  * no API key   -> plain self-computed aggregate (counts + distributions)
  * AI configured -> EXACTLY ONE Claude call, summary returned
  * over the char cap -> samples + sets sampled=True
  * AI call blows up -> degrades to the aggregate (never raises)
  * DB blows up   -> returns {error, response_count} (never raises)
"""
import pytest

from app.services import ai, event_ai
from app.models.event import Event
from app.models.event_rsvp import EventRsvp

pytestmark = pytest.mark.asyncio


SCHEMA = [
    {"key": "name", "label": "Ism", "type": "text", "required": True},
    {"key": "spent", "label": "Sarflangan pul", "type": "number"},
    {
        "key": "competitor",
        "label": "Qaysi markazda o'qigansiz?",
        "type": "choice",
        "options": ["Inter Nation", "Yo'q"],
    },
]


class _FakeResp:
    def __init__(self, text):
        class _Block:
            type = "text"

        b = _Block()
        b.text = text
        self.content = [b]


@pytest.fixture
def use_test_db(monkeypatch, session_factory):
    """generate_event_report opens its OWN AsyncSessionLocal — point that at the
    in-memory SQLite session factory the rest of the suite uses."""
    monkeypatch.setattr(event_ai, "AsyncSessionLocal", session_factory)


async def _seed_event(db, form_schema=SCHEMA):
    ev = Event(type="meetup", title="SAT Mock", form_schema=form_schema)
    db.add(ev)
    await db.commit()
    await db.refresh(ev)
    return ev


async def _seed_rsvp(db, event_id, user_id, status="going", answers=None):
    r = EventRsvp(event_id=event_id, user_id=user_id, status=status, answers=answers)
    db.add(r)
    await db.commit()
    return r


async def test_zero_responses_no_ai_call(use_test_db, db, make_user, monkeypatch):
    ev = await _seed_event(db)
    called = {"n": 0}

    async def _spy(**kw):
        called["n"] += 1
        return _FakeResp("x")

    monkeypatch.setattr(ai, "_create_message", _spy)
    monkeypatch.setattr(event_ai.settings, "ANTHROPIC_API_KEY", "key")

    out = await event_ai.generate_event_report(ev.id)
    assert out["response_count"] == 0
    assert called["n"] == 0  # no AI call when nobody answered
    assert "summary" in out and out["summary"]
    assert "generated_at" in out


async def test_rsvp_without_answers_is_not_a_response(use_test_db, db, make_user, monkeypatch):
    ev = await _seed_event(db)
    u = await make_user()
    await _seed_rsvp(db, ev.id, u.id, status="interested", answers=None)
    monkeypatch.setattr(event_ai.settings, "ANTHROPIC_API_KEY", "")  # no key
    out = await event_ai.generate_event_report(ev.id)
    assert out["response_count"] == 0


async def test_no_api_key_plain_aggregate(use_test_db, db, make_user, monkeypatch):
    ev = await _seed_event(db)
    u1 = await make_user()
    u2 = await make_user()
    await _seed_rsvp(db, ev.id, u1.id, "going",
                     {"name": "Ali", "spent": "500000", "competitor": "Inter Nation"})
    await _seed_rsvp(db, ev.id, u2.id, "interested",
                     {"name": "Vali", "spent": "500000", "competitor": "Inter Nation"})
    monkeypatch.setattr(event_ai.settings, "ANTHROPIC_API_KEY", "")

    out = await event_ai.generate_event_report(ev.id)
    assert out["response_count"] == 2
    s = out["summary"]
    assert "AI sozlanmagan" in s               # notes AI is off
    assert "Inter Nation: 2" in s              # choice distribution
    assert "500000: 2" in s                    # number distribution


async def test_ai_configured_single_call(use_test_db, db, make_user, monkeypatch):
    ev = await _seed_event(db)
    u = await make_user()
    await _seed_rsvp(db, ev.id, u.id, "going",
                     {"name": "Ali", "spent": "300000", "competitor": "Inter Nation"})

    calls = {"n": 0, "content": None, "model": None}

    async def _spy(**kw):
        calls["n"] += 1
        calls["content"] = kw["messages"][0]["content"]
        calls["model"] = kw["model"]
        return _FakeResp("Xulosa: og'riqli nuqta narx.")

    monkeypatch.setattr(ai, "_create_message", _spy)
    monkeypatch.setattr(event_ai.settings, "ANTHROPIC_API_KEY", "key")

    out = await event_ai.generate_event_report(ev.id)
    assert calls["n"] == 1                       # EXACTLY one Claude call
    assert calls["model"] == event_ai.settings.AI_MODEL
    assert out["response_count"] == 1
    assert out["summary"] == "Xulosa: og'riqli nuqta narx."
    assert "sampled" not in out
    # the answers were actually handed to the model
    assert "Inter Nation" in calls["content"]
    assert "holat: going" in calls["content"]


async def test_sampling_when_over_cap(use_test_db, db, make_user, monkeypatch):
    ev = await _seed_event(db)
    big = "x" * 2000
    for _ in range(5):
        u = await make_user()
        await _seed_rsvp(db, ev.id, u.id, "going", {"name": big})

    monkeypatch.setattr(event_ai, "MAX_INPUT_CHARS", 3000)  # force a truncation

    async def _spy(**kw):
        return _FakeResp("ok")

    monkeypatch.setattr(ai, "_create_message", _spy)
    monkeypatch.setattr(event_ai.settings, "ANTHROPIC_API_KEY", "key")

    out = await event_ai.generate_event_report(ev.id)
    assert out["response_count"] == 5
    assert out.get("sampled") is True
    assert "namuna" in out["summary"]            # notes it is a sample


async def test_ai_failure_degrades_to_aggregate(use_test_db, db, make_user, monkeypatch):
    ev = await _seed_event(db)
    u = await make_user()
    await _seed_rsvp(db, ev.id, u.id, "going",
                     {"name": "Ali", "competitor": "Inter Nation"})

    async def _boom(**kw):
        raise RuntimeError("anthropic down")

    monkeypatch.setattr(ai, "_create_message", _boom)
    monkeypatch.setattr(event_ai.settings, "ANTHROPIC_API_KEY", "key")

    out = await event_ai.generate_event_report(ev.id)
    assert out["response_count"] == 1
    assert "error" not in out                    # degrade, not error
    assert "Inter Nation: 1" in out["summary"]   # fell back to the aggregate


async def test_missing_event_is_graceful(use_test_db, db, monkeypatch):
    monkeypatch.setattr(event_ai.settings, "ANTHROPIC_API_KEY", "")
    out = await event_ai.generate_event_report(999999)
    assert out["response_count"] == 0
    assert "summary" in out


async def test_never_raises_on_db_failure(use_test_db, db, monkeypatch):
    class _Boom:
        def __call__(self):
            raise RuntimeError("db exploded")

    monkeypatch.setattr(event_ai, "AsyncSessionLocal", _Boom())
    out = await event_ai.generate_event_report(1)
    assert out == {"error": "report_failed", "response_count": 0}
