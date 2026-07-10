"""WebSocket auth ticket + ConnectionManager unit coverage.

The full socket handshake (origin guard, auth frame, typing fanout) is verified
live — it needs a real WS client + the Telegram webview. Here we pin the two
pieces that are unit-testable: the ticket mint and the in-memory hub."""
import pytest

from app.core.security import decode_token
from app.routers.ws import ConnectionManager

pytestmark = pytest.mark.asyncio


async def test_ws_ticket_is_short_lived_ws_token(make_user, as_user):
    u = await make_user(name="U")
    r = await as_user(u).get("/ws-ticket")
    assert r.status_code == 200, r.text
    body = r.json()
    # In prod api_base_url resolves to wss://<railway>/ws; in the test env
    # (no PUBLIC_API_URL / RAILWAY_PUBLIC_DOMAIN) it's the relative "/ws" — the
    # desktop client falls back to its own known host when the url is relative.
    assert body["ws_url"].endswith("/ws")
    payload = decode_token(body["ticket"])
    assert payload.get("type") == "ws" and int(payload["sub"]) == u.id


async def test_ws_ticket_requires_auth(client):
    # No auth override installed on the bare client → 401/403.
    assert (await client.get("/ws-ticket")).status_code in (401, 403)


class _FakeWS:
    def __init__(self, fail=False):
        self.sent = []
        self.fail = fail

    async def send_json(self, payload):
        if self.fail:
            raise RuntimeError("dead socket")
        self.sent.append(payload)


async def test_manager_routes_and_prunes():
    mgr = ConnectionManager()
    a1, a2, b1 = _FakeWS(), _FakeWS(), _FakeWS()
    await mgr.connect(1, a1)
    await mgr.connect(1, a2)  # user 1 has two tabs
    await mgr.connect(2, b1)

    await mgr.send_to_users([1], {"x": 1})
    assert a1.sent == [{"x": 1}] and a2.sent == [{"x": 1}] and b1.sent == []

    # Only listed users receive; a fanout to nobody is a no-op.
    await mgr.send_to_users([2], {"y": 2})
    assert b1.sent == [{"y": 2}]

    mgr.disconnect(1, a1)
    await mgr.send_to_users([1], {"z": 3})
    assert a1.sent == [{"x": 1}] and a2.sent == [{"x": 1}, {"z": 3}]  # a1 no longer targeted


async def test_manager_prunes_dead_socket():
    mgr = ConnectionManager()
    dead = _FakeWS(fail=True)
    await mgr.connect(5, dead)
    await mgr.send_to_users([5], {"a": 1})  # raises internally → pruned, never propagates
    await mgr.send_to_users([5], {"b": 2})  # dead socket already removed
    assert dead.sent == []
