"""Scale-readiness hardening: a burst of DIFFERENT new users (a registration
spike) each get their own fresh per-user AI cooldown — nothing previously
capped how many concurrent Anthropic calls the process makes in aggregate.
_AI_SEMAPHORE (via _create_message) must cap that process-wide.
"""
import asyncio

import pytest

from app.services import ai

pytestmark = pytest.mark.asyncio


class _TrackingClient:
    """Fake Anthropic client: records the maximum number of calls that were
    ever in-flight at the same time."""

    def __init__(self):
        self.in_flight = 0
        self.max_in_flight = 0
        self.messages = self

    async def create(self, **kwargs):
        self.in_flight += 1
        self.max_in_flight = max(self.max_in_flight, self.in_flight)
        await asyncio.sleep(0.05)  # hold the "slot" long enough for overlap
        self.in_flight -= 1

        class _Block:
            type = "text"
            text = '{"skills": [], "knowledges": [], "interests": [], "preparations": [], "goals": []}'

        class _Resp:
            content = [_Block()]

        return _Resp()


async def test_concurrent_ai_calls_are_capped_by_the_semaphore(monkeypatch):
    tracker = _TrackingClient()
    monkeypatch.setattr(ai, "_get_client", lambda: tracker)
    monkeypatch.setattr(ai, "_AI_SEMAPHORE", asyncio.Semaphore(2))
    monkeypatch.setattr(ai.settings, "ANTHROPIC_API_KEY", "fake-key-for-test")

    await asyncio.gather(*[ai.analyze_about_async("I love Python and design.") for _ in range(10)])

    assert tracker.max_in_flight <= 2


async def test_ai_calls_all_still_complete_under_the_cap(monkeypatch):
    """The cap must throttle, not drop, requests — every call still resolves."""
    tracker = _TrackingClient()
    monkeypatch.setattr(ai, "_get_client", lambda: tracker)
    monkeypatch.setattr(ai, "_AI_SEMAPHORE", asyncio.Semaphore(2))
    monkeypatch.setattr(ai.settings, "ANTHROPIC_API_KEY", "fake-key-for-test")

    results = await asyncio.gather(*[ai.analyze_about_async("I build things.") for _ in range(6)])
    assert len(results) == 6
    assert all(isinstance(r, dict) for r in results)
