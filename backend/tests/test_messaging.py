"""Messaging v1: DM find-or-create, send/fetch, membership 403, block gate,
rate-limit 429, project team chat, read receipts, and message notifications."""
import pytest

pytestmark = pytest.mark.asyncio


async def _mk_project(db, creator_id, name, *, is_active=True, is_draft=False, is_deleted=False):
    from app.models.project import Project
    p = Project(type="startup", creator_id=creator_id, name=name, is_active=is_active,
                is_draft=is_draft, is_deleted=is_deleted, is_approved=True)
    db.add(p)
    await db.commit()
    await db.refresh(p)
    return p


async def _add_member(db, project_id, user_id):
    from app.models.project import ProjectMember
    db.add(ProjectMember(project_id=project_id, user_id=user_id))
    await db.commit()


# ── DM find-or-create ────────────────────────────────────────────────────────

async def test_dm_find_or_create_idempotent(make_user, as_user, db):
    me = await make_user(name="Me")
    other = await make_user(name="Other")
    c = as_user(me)

    r1 = await c.post(f"/conversations/dm/{other.id}")
    assert r1.status_code == 200, r1.text
    cid1 = r1.json()["id"]

    # Same pair again → same conversation, no duplicate.
    r2 = await c.post(f"/conversations/dm/{other.id}")
    assert r2.status_code == 200
    assert r2.json()["id"] == cid1

    # And from the OTHER side → still the same conversation (deterministic key).
    c2 = as_user(other)
    r3 = await c2.post(f"/conversations/dm/{me.id}")
    assert r3.status_code == 200
    assert r3.json()["id"] == cid1

    from app.models.messaging import Conversation
    rows = (await db.execute(Conversation.__table__.select())).all()
    assert len(rows) == 1


async def test_dm_self_and_missing(make_user, as_user, db):
    me = await make_user(name="Me")
    c = as_user(me)
    assert (await c.post(f"/conversations/dm/{me.id}")).status_code == 400
    assert (await c.post("/conversations/dm/999999")).status_code == 404


# ── Send + fetch ─────────────────────────────────────────────────────────────

async def test_send_and_fetch(make_user, as_user, db):
    me = await make_user(name="Me")
    other = await make_user(name="Other")
    c = as_user(me)
    cid = (await c.post(f"/conversations/dm/{other.id}")).json()["id"]

    r = await c.post(f"/conversations/{cid}/messages", json={"body": "  hey there  "})
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["body"] == "hey there"  # trimmed
    assert body["sender_id"] == me.id
    assert body["sender"]["display_name"]

    # The other party fetches — sees the message oldest-first with sender hydrated.
    c2 = as_user(other)
    got = await c2.get(f"/conversations/{cid}/messages")
    assert got.status_code == 200
    msgs = got.json()["messages"]
    assert len(msgs) == 1
    assert msgs[0]["body"] == "hey there"
    assert msgs[0]["sender"]["id"] == me.id


async def test_send_empty_and_too_long(make_user, as_user, db):
    me = await make_user(name="Me")
    other = await make_user(name="Other")
    c = as_user(me)
    cid = (await c.post(f"/conversations/dm/{other.id}")).json()["id"]
    assert (await c.post(f"/conversations/{cid}/messages", json={"body": "   "})).status_code == 400
    big = "x" * 4001
    assert (await c.post(f"/conversations/{cid}/messages", json={"body": big})).status_code == 400


async def test_non_member_cannot_read_or_send(make_user, as_user, db):
    me = await make_user(name="Me")
    other = await make_user(name="Other")
    intruder = await make_user(name="Intruder")
    c = as_user(me)
    cid = (await c.post(f"/conversations/dm/{other.id}")).json()["id"]

    ci = as_user(intruder)
    assert (await ci.get(f"/conversations/{cid}/messages")).status_code == 403
    assert (await ci.post(f"/conversations/{cid}/messages", json={"body": "hi"})).status_code == 403


# ── Block ────────────────────────────────────────────────────────────────────

async def test_block_prevents_dm_create(make_user, as_user, db):
    me = await make_user(name="Me")
    other = await make_user(name="Other")
    c = as_user(me)
    # me blocks other
    assert (await c.post(f"/users/{other.id}/block")).status_code == 200
    # me can't open a DM with them
    assert (await c.post(f"/conversations/dm/{other.id}")).status_code == 400
    # ...and the block is symmetric: other can't open a DM with me either
    c2 = as_user(other)
    assert (await c2.post(f"/conversations/dm/{me.id}")).status_code == 400


async def test_block_after_conversation_prevents_send(make_user, as_user, db):
    me = await make_user(name="Me")
    other = await make_user(name="Other")
    c = as_user(me)
    cid = (await c.post(f"/conversations/dm/{other.id}")).json()["id"]
    # First message fine.
    assert (await c.post(f"/conversations/{cid}/messages", json={"body": "hi"})).status_code == 201
    # other blocks me → my next send is 403.
    c2 = as_user(other)
    assert (await c2.post(f"/users/{me.id}/block")).status_code == 200
    c = as_user(me)
    assert (await c.post(f"/conversations/{cid}/messages", json={"body": "again"})).status_code == 403
    # Unblock restores sending.
    c2 = as_user(other)
    assert (await c2.request("DELETE", f"/users/{me.id}/block")).status_code == 204
    c = as_user(me)
    assert (await c.post(f"/conversations/{cid}/messages", json={"body": "ok now"})).status_code == 201


# ── Rate limit ───────────────────────────────────────────────────────────────

async def test_rate_limit_429(make_user, as_user, db):
    me = await make_user(name="Me")
    other = await make_user(name="Other")
    c = as_user(me)
    cid = (await c.post(f"/conversations/dm/{other.id}")).json()["id"]
    # 20 sends allowed within the window; the 21st is throttled.
    for i in range(20):
        r = await c.post(f"/conversations/{cid}/messages", json={"body": f"m{i}"})
        assert r.status_code == 201, r.text
    r = await c.post(f"/conversations/{cid}/messages", json={"body": "over"})
    assert r.status_code == 429


# ── Read receipts ────────────────────────────────────────────────────────────

async def test_read_updates_last_read_and_unread(make_user, as_user, db):
    me = await make_user(name="Me")
    other = await make_user(name="Other")
    c = as_user(me)
    cid = (await c.post(f"/conversations/dm/{other.id}")).json()["id"]
    await c.post(f"/conversations/{cid}/messages", json={"body": "one"})
    await c.post(f"/conversations/{cid}/messages", json={"body": "two"})

    # Other has 2 unread.
    c2 = as_user(other)
    assert (await c2.get("/conversations/unread-count")).json()["unread"] == 2
    convs = (await c2.get("/conversations")).json()
    assert convs[0]["unread"] == 2
    assert convs[0]["other"]["id"] == me.id
    assert convs[0]["last_message"]["body"] == "two"

    # Mark read → unread clears + last_read_at is set.
    r = await c2.post(f"/conversations/{cid}/read")
    assert r.status_code == 200
    assert (await c2.get("/conversations/unread-count")).json()["unread"] == 0

    from app.models.messaging import ConversationMember
    row = (await db.execute(
        ConversationMember.__table__.select().where(
            (ConversationMember.conversation_id == cid)
            & (ConversationMember.user_id == other.id)
        )
    )).first()
    assert row.last_read_at is not None

    # The sender never counts their own messages as unread.
    assert (await c.get("/conversations/unread-count")).json()["unread"] == 0


# ── Message creates a notification ───────────────────────────────────────────

async def test_message_creates_notification(make_user, as_user, db):
    me = await make_user(name="Me")
    other = await make_user(name="Other")
    c = as_user(me)
    cid = (await c.post(f"/conversations/dm/{other.id}")).json()["id"]
    await c.post(f"/conversations/{cid}/messages", json={"body": "ping"})

    from app.models.user import Notification
    notes = (await db.execute(
        Notification.__table__.select().where(Notification.type == "message")
    )).all()
    mine = [n for n in notes if n.user_id == other.id]
    assert len(mine) == 1
    # project_id carries the conversation id → link resolves to /messages?c={id}.
    assert mine[0].project_id == cid
    assert mine[0].actor_id == me.id

    # The inbox renders it as a message row with a /messages link and NO project.
    c2 = as_user(other)
    inbox = (await c2.get("/users/me/notifications")).json()
    msg_items = [it for it in inbox["items"] if it["type"] == "message"]
    assert len(msg_items) == 1
    assert msg_items[0]["link"] == f"/messages?c={cid}"
    assert msg_items[0]["project"] is None


# ── Project team chat ────────────────────────────────────────────────────────

async def test_project_conversation_membership(make_user, as_user, db):
    founder = await make_user(name="Founder")
    member = await make_user(name="Member")
    outsider = await make_user(name="Outsider")
    p = await _mk_project(db, founder.id, "Proj")
    await _add_member(db, p.id, member.id)

    # Founder opens the team chat → creates it.
    cf = as_user(founder)
    r = await cf.get(f"/projects/{p.id}/conversation")
    assert r.status_code == 200, r.text
    cid = r.json()["id"]

    # Member is a participant → same conversation.
    cm = as_user(member)
    r2 = await cm.get(f"/projects/{p.id}/conversation")
    assert r2.status_code == 200
    assert r2.json()["id"] == cid

    # Outsider is refused.
    co = as_user(outsider)
    assert (await co.get(f"/projects/{p.id}/conversation")).status_code == 403

    # Member posts; founder sees it + gets a notification. (Re-assert the auth
    # override before each call — as_user mutates one shared client.)
    cm = as_user(member)
    assert (await cm.post(f"/conversations/{cid}/messages", json={"body": "team hi"})).status_code == 201
    cf = as_user(founder)
    got = await cf.get(f"/conversations/{cid}/messages")
    assert got.status_code == 200
    assert got.json()["messages"][0]["body"] == "team hi"

    from app.models.user import Notification
    notes = (await db.execute(
        Notification.__table__.select().where(Notification.type == "message")
    )).all()
    # Founder notified; the sender (member) is not.
    assert any(n.user_id == founder.id for n in notes)
    assert not any(n.user_id == member.id for n in notes)

    # The project conversation shows up in the founder's list with a project ref.
    convs = (await cf.get("/conversations")).json()
    proj_conv = next(cv for cv in convs if cv["id"] == cid)
    assert proj_conv["kind"] == "project"
    assert proj_conv["project"]["id"] == p.id


async def test_project_conversation_syncs_late_joiner(make_user, as_user, db):
    founder = await make_user(name="Founder")
    latecomer = await make_user(name="Late")
    p = await _mk_project(db, founder.id, "Proj")

    cf = as_user(founder)
    cid = (await cf.get(f"/projects/{p.id}/conversation")).json()["id"]

    # Someone joins the project AFTER the chat was created.
    await _add_member(db, p.id, latecomer.id)
    cl = as_user(latecomer)
    r = await cl.get(f"/projects/{p.id}/conversation")
    assert r.status_code == 200
    assert r.json()["id"] == cid
    # Now a member → can post.
    assert (await cl.post(f"/conversations/{cid}/messages", json={"body": "joined"})).status_code == 201


# ── Report ───────────────────────────────────────────────────────────────────

async def test_report_message(make_user, as_user, db):
    me = await make_user(name="Me")
    other = await make_user(name="Other")
    c = as_user(me)
    cid = (await c.post(f"/conversations/dm/{other.id}")).json()["id"]
    mid = (await c.post(f"/conversations/{cid}/messages", json={"body": "spam"})).json()["id"]

    c2 = as_user(other)
    r = await c2.post(f"/messages/{mid}/report", json={"reason": "spam"})
    assert r.status_code == 200, r.text

    from app.models.user import Report
    reps = (await db.execute(
        Report.__table__.select().where(Report.target_type == "message")
    )).all()
    assert len(reps) == 1
    assert reps[0].target_id == mid
    assert reps[0].reporter_id == other.id

    # A non-member can't report into a conversation they aren't in.
    intruder = await make_user(name="Intruder")
    ci = as_user(intruder)
    assert (await ci.post(f"/messages/{mid}/report")).status_code == 403
