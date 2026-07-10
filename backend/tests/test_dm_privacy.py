"""Who-can-message-me privacy (dm_privacy: everyone | connections)."""
import pytest

pytestmark = pytest.mark.asyncio


async def _connect(as_user, a, b):
    """Make a and b mutual-interest connections."""
    assert (await as_user(a).post(f"/users/{b.id}/interest")).status_code in (200, 201)
    assert (await as_user(b).post(f"/users/{a.id}/interest")).status_code in (200, 201)


async def test_default_everyone_allows_cold_dm(make_user, as_user):
    a = await make_user(name="A")
    b = await make_user(name="B")
    r = await as_user(a).post(f"/conversations/dm/{b.id}")
    assert r.status_code == 200, r.text  # default dm_privacy=everyone


async def test_connections_only_blocks_non_connection_open(make_user, as_user):
    a = await make_user(name="A")
    b = await make_user(name="B")
    assert (await as_user(b).patch("/users/me", json={"dm_privacy": "connections"})).status_code == 200
    r = await as_user(a).post(f"/conversations/dm/{b.id}")  # A not connected to B
    assert r.status_code == 400
    assert r.json()["detail"]  # frontend rides the existing 400 "can't message" path


async def test_connections_only_allows_a_connection(make_user, as_user):
    a = await make_user(name="A")
    b = await make_user(name="B")
    await as_user(b).patch("/users/me", json={"dm_privacy": "connections"})
    await _connect(as_user, a, b)
    r = await as_user(a).post(f"/conversations/dm/{b.id}")
    assert r.status_code == 200, r.text


async def test_send_gate_bites_existing_thread_after_tightening(make_user, as_user):
    a = await make_user(name="A")
    b = await make_user(name="B")
    # Thread opened while B was open to everyone.
    conv_id = (await as_user(a).post(f"/conversations/dm/{b.id}")).json()["id"]
    assert (await as_user(a).post(f"/conversations/{conv_id}/messages", json={"body": "hi"})).status_code in (200, 201)
    # B tightens to connections-only; A is not a connection.
    await as_user(b).patch("/users/me", json={"dm_privacy": "connections"})
    r = await as_user(a).post(f"/conversations/{conv_id}/messages", json={"body": "again"})
    assert r.status_code == 403  # send now blocked even on the existing thread


async def test_connections_only_initiator_can_receive_replies(make_user, as_user):
    # A (connections-only) cold-opens a DM to B and speaks first; B — not A's
    # connection — must still be able to reply (a reply is never gated).
    a = await make_user(name="A")
    b = await make_user(name="B")
    await as_user(a).patch("/users/me", json={"dm_privacy": "connections"})
    conv = (await as_user(a).post(f"/conversations/dm/{b.id}")).json()["id"]
    assert (await as_user(a).post(f"/conversations/{conv}/messages", json={"body": "hi"})).status_code in (200, 201)
    r = await as_user(b).post(f"/conversations/{conv}/messages", json={"body": "hey"})
    assert r.status_code in (200, 201), r.text  # A spoke first → B may answer


async def test_block_outranks_privacy(make_user, as_user):
    a = await make_user(name="A")
    b = await make_user(name="B")
    # B open to everyone but blocks A → open still 400 (block wins).
    assert (await as_user(b).post(f"/users/{a.id}/block")).status_code in (200, 204)
    r = await as_user(a).post(f"/conversations/dm/{b.id}")
    assert r.status_code == 400


async def test_invalid_dm_privacy_clamps_to_everyone(make_user, as_user):
    b = await make_user(name="B")
    r = await as_user(b).patch("/users/me", json={"dm_privacy": "nonsense"})
    assert r.status_code == 200
    assert r.json()["dm_privacy"] == "everyone"
