"""In-app messaging: 1:1 DMs + project team chats, with block + report +
rate-limiting.

All endpoints are authed via get_current_user. Routes live at the app root
(no shared prefix) so the block/report paths (/users/{id}/block,
/messages/{id}/report, /projects/{id}/conversation) read naturally without
colliding with the existing users/projects routers (distinct method+path).
"""
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import and_, delete, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.deps import get_current_user
from app.database import get_db
from app.models.messaging import Block, Conversation, ConversationMember, Message
from app.models.project import Project, ProjectMember
from app.models.user import Report, User
from app.schemas.messaging import (
    ConversationOut,
    ConversationRef,
    EditMessageIn,
    MessageOut,
    MessagesPage,
    ReportMessageIn,
    SendMessageIn,
    UnreadCount,
)
from app.services.notifications import add_notification
from app.services.notify import esc, send_telegram
from app.services.ratelimit import rate_limit

router = APIRouter(tags=["messages"])

# Message content + rate-limit knobs (founder's explicit anti-spam ask).
MAX_BODY = 4000
RL_WINDOW_S = 60
RL_MAX = 20  # >20 messages / 60s → 429


def _dm_key(a: int, b: int) -> str:
    lo, hi = (a, b) if a <= b else (b, a)
    return f"{lo}:{hi}"


def _person_dict(u: User | None) -> dict | None:
    if u is None:
        return None
    return {
        "id": u.id,
        "display_name": u.display_name or f"User #{u.id}",
        "photo_url": u.photo_url,
        "is_online": bool(u.is_online),
    }


def _sender_dict(u: User | None) -> dict | None:
    if u is None:
        return None
    return {
        "id": u.id,
        "display_name": u.display_name or f"User #{u.id}",
        "photo_url": u.photo_url,
    }


def _reply_preview(rm: "Message | None", senders: dict) -> dict | None:
    """Compact quote of the replied-to message (empty body if it was deleted)."""
    if rm is None:
        return None
    su = senders.get(rm.sender_id)
    body = "" if rm.deleted_at else (rm.body or "")
    return {"id": rm.id, "body": body[:120], "sender_name": (su.display_name if su else None)}


def _message_out(m: "Message", senders: dict, reply_map: dict) -> dict:
    """Serialize a Message → MessageOut (soft-deleted → empty body + deleted flag)."""
    deleted = m.deleted_at is not None
    return {
        "id": m.id,
        "conversation_id": m.conversation_id,
        "sender_id": m.sender_id,
        "body": "" if deleted else m.body,
        "created_at": m.created_at,
        "sender": _sender_dict(senders.get(m.sender_id)),
        "reply_to": _reply_preview(reply_map.get(m.reply_to_id) if m.reply_to_id else None, senders),
        "edited": m.edited_at is not None,
        "deleted": deleted,
    }


async def _blocked_between(db: AsyncSession, a: int, b: int) -> bool:
    """True if either user has blocked the other."""
    n = await db.scalar(
        select(func.count(Block.id)).where(
            or_(
                and_(Block.blocker_id == a, Block.blocked_id == b),
                and_(Block.blocker_id == b, Block.blocked_id == a),
            )
        )
    )
    return bool(n)


async def _my_member_row(db: AsyncSession, conv_id: int, uid: int) -> ConversationMember | None:
    return (await db.execute(
        select(ConversationMember).where(
            ConversationMember.conversation_id == conv_id,
            ConversationMember.user_id == uid,
        )
    )).scalar_one_or_none()


async def _other_dm_user_id(db: AsyncSession, conv_id: int, me: int) -> int | None:
    """The single other member of a DM conversation (None if not a DM/degenerate)."""
    return await db.scalar(
        select(ConversationMember.user_id).where(
            ConversationMember.conversation_id == conv_id,
            ConversationMember.user_id != me,
        ).limit(1)
    )


# ── Conversation list ──────────────────────────────────────────────────────────

@router.get("/conversations", response_model=list[ConversationOut])
async def list_conversations(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """The caller's conversations, ordered by most-recent activity. Batched to
    avoid N+1: one query each for my membership rows, the conversations, the DM
    other-members, their users, the projects, the latest message per
    conversation, and the per-conversation unread counts."""
    me = current_user.id
    my_rows = (await db.execute(
        select(ConversationMember).where(ConversationMember.user_id == me)
    )).scalars().all()
    conv_ids = [r.conversation_id for r in my_rows]
    if not conv_ids:
        return []

    convs = (await db.execute(
        select(Conversation).where(Conversation.id.in_(conv_ids))
    )).scalars().all()
    conv_by_id = {c.id: c for c in convs}

    # DM other-member ids (per conversation).
    other_rows = (await db.execute(
        select(ConversationMember.conversation_id, ConversationMember.user_id)
        .where(ConversationMember.conversation_id.in_(conv_ids),
               ConversationMember.user_id != me)
    )).all()
    dm_other = {}   # conv_id -> other user_id (first seen; DMs have exactly one)
    for cid, uid in other_rows:
        dm_other.setdefault(cid, uid)

    # Hydrate the "other" users + the projects.
    user_ids = set(dm_other.values())
    users_by_id = {}
    if user_ids:
        for u in (await db.execute(select(User).where(User.id.in_(user_ids)))).scalars().all():
            users_by_id[u.id] = u
    proj_ids = {c.project_id for c in convs if c.project_id}
    projects_by_id = {}
    if proj_ids:
        for p in (await db.execute(select(Project).where(Project.id.in_(proj_ids)))).scalars().all():
            projects_by_id[p.id] = p

    # Latest message per conversation (max id → load those rows).
    last_id_rows = (await db.execute(
        select(Message.conversation_id, func.max(Message.id))
        .where(Message.conversation_id.in_(conv_ids))
        .group_by(Message.conversation_id)
    )).all()
    last_ids = [mid for _, mid in last_id_rows]
    last_by_conv = {}
    if last_ids:
        for m in (await db.execute(select(Message).where(Message.id.in_(last_ids)))).scalars().all():
            last_by_conv[m.conversation_id] = m

    # Unread per conversation in ONE query: join my membership row for the
    # per-conversation last_read_at cutoff, count messages from others after it.
    CM = ConversationMember
    unread_rows = (await db.execute(
        select(Message.conversation_id, func.count(Message.id))
        .join(CM, and_(CM.conversation_id == Message.conversation_id, CM.user_id == me))
        .where(
            Message.conversation_id.in_(conv_ids),
            Message.sender_id != me,
            or_(CM.last_read_at.is_(None), Message.created_at > CM.last_read_at),
        )
        .group_by(Message.conversation_id)
    )).all()
    unread_by_conv = {cid: int(n) for cid, n in unread_rows}

    out = []
    for cid in conv_ids:
        c = conv_by_id.get(cid)
        if not c:
            continue
        last = last_by_conv.get(cid)
        item = {
            "id": c.id,
            "kind": c.kind,
            "other": None,
            "project": None,
            "last_message": None,
            "unread": unread_by_conv.get(cid, 0),
        }
        if c.kind == "dm":
            item["other"] = _person_dict(users_by_id.get(dm_other.get(cid)))
        elif c.kind == "project" and c.project_id in projects_by_id:
            p = projects_by_id[c.project_id]
            item["project"] = {"id": p.id, "name": p.name}
        if last:
            item["last_message"] = {
                "body": last.body,
                "created_at": last.created_at,
                "sender_id": last.sender_id,
            }
        out.append((c, last, item))

    # Sort by last activity: last message time, else the conversation's own
    # created_at. Newest first.
    def _activity(triple):
        c, last, _ = triple
        return (last.created_at if last else None) or c.created_at or datetime.min
    out.sort(key=_activity, reverse=True)
    return [item for _, _, item in out]


@router.get("/conversations/unread-count", response_model=UnreadCount)
async def conversations_unread_count(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Total unread messages across all the caller's conversations — polled by
    the sidebar to drive the Messages badge."""
    me = current_user.id
    CM = ConversationMember
    total = await db.scalar(
        select(func.count(Message.id))
        .join(CM, and_(CM.conversation_id == Message.conversation_id, CM.user_id == me))
        .where(
            Message.sender_id != me,
            or_(CM.last_read_at.is_(None), Message.created_at > CM.last_read_at),
        )
    ) or 0
    return {"unread": int(total)}


# ── DM find-or-create ────────────────────────────────────────────────────────

@router.post("/conversations/dm/{user_id}", response_model=ConversationRef)
async def dm_conversation(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Find-or-create the 1:1 conversation between me and `user_id`. Deterministic
    (keyed on the sorted id pair) so repeated calls never create duplicates.
    400 for self or when a block exists either way; 404 for a missing user."""
    me = current_user.id
    if user_id == me:
        raise HTTPException(status_code=400, detail="Cannot message yourself")
    target = await db.get(User, user_id)
    if not target or target.is_deleted or not target.is_registered:
        raise HTTPException(status_code=404, detail="User not found")
    if await _blocked_between(db, me, user_id):
        raise HTTPException(status_code=400, detail="Messaging is unavailable with this user")

    key = _dm_key(me, user_id)
    existing = (await db.execute(
        select(Conversation).where(Conversation.dm_key == key)
    )).scalar_one_or_none()
    if existing:
        return {"id": existing.id}

    conv = Conversation(kind="dm", dm_key=key)
    db.add(conv)
    try:
        await db.flush()
        db.add(ConversationMember(conversation_id=conv.id, user_id=me))
        db.add(ConversationMember(conversation_id=conv.id, user_id=user_id))
        await db.commit()
    except IntegrityError:
        # Concurrent create raced past the SELECT; the unique dm_key caught it.
        await db.rollback()
        again = (await db.execute(
            select(Conversation).where(Conversation.dm_key == key)
        )).scalar_one_or_none()
        if again:
            return {"id": again.id}
        raise HTTPException(status_code=500, detail="Could not open conversation")
    return {"id": conv.id}


# ── Project team chat find-or-create ─────────────────────────────────────────

async def _project_team_ids(db: AsyncSession, project: Project) -> set[int]:
    ids = set((await db.execute(
        select(ProjectMember.user_id).where(ProjectMember.project_id == project.id)
    )).scalars().all())
    ids.add(project.creator_id)
    return ids


@router.get("/projects/{project_id}/conversation", response_model=ConversationRef)
async def project_conversation(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Find-or-create the project's team conversation. 403 unless the caller is
    on the team (creator or accepted member). Syncs the current team into the
    conversation membership on each call so later joiners can post/receive."""
    project = (await db.execute(
        select(Project).where(Project.id == project_id, Project.is_deleted == False)
    )).scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    team = await _project_team_ids(db, project)
    if current_user.id not in team:
        raise HTTPException(status_code=403, detail="Not on this team")

    conv = (await db.execute(
        select(Conversation).where(
            Conversation.kind == "project", Conversation.project_id == project_id
        )
    )).scalar_one_or_none()
    if not conv:
        conv = Conversation(kind="project", project_id=project_id)
        db.add(conv)
        try:
            await db.flush()
            for uid in team:
                db.add(ConversationMember(conversation_id=conv.id, user_id=uid))
            await db.commit()
        except IntegrityError:
            await db.rollback()
            conv = (await db.execute(
                select(Conversation).where(
                    Conversation.kind == "project", Conversation.project_id == project_id
                )
            )).scalar_one_or_none()
            if not conv:
                raise HTTPException(status_code=500, detail="Could not open team chat")
    else:
        # Sync: add any team members not yet in the conversation.
        present = set((await db.execute(
            select(ConversationMember.user_id).where(
                ConversationMember.conversation_id == conv.id
            )
        )).scalars().all())
        missing = team - present
        if missing:
            for uid in missing:
                db.add(ConversationMember(conversation_id=conv.id, user_id=uid))
            try:
                await db.commit()
            except IntegrityError:
                await db.rollback()
    return {"id": conv.id}


# ── Conversation members (who joined + when) ─────────────────────────────────

@router.get("/conversations/{conversation_id}/members", response_model=dict)
async def conversation_members(
    conversation_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Roster for the thread's context header. For a PROJECT team chat: each
    member with their joined_at (the creator's is the project's created_at) +
    role + is_creator, chronological — so the app can show "X joined the team ·
    <date>". For a DM: both members + the conversation's started_at. Member-only."""
    me = current_user.id
    if not await _my_member_row(db, conversation_id, me):
        raise HTTPException(status_code=403, detail="Not a member of this conversation")
    conv = await db.get(Conversation, conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Per-member last_read_at — drives read receipts ("seen" / "seen by N").
    read_by_uid = {
        uid: lr for uid, lr in (await db.execute(
            select(ConversationMember.user_id, ConversationMember.last_read_at)
            .where(ConversationMember.conversation_id == conversation_id)
        )).all()
    }

    if conv.kind == "project" and conv.project_id:
        project = await db.get(Project, conv.project_id)
        mem_rows = (await db.execute(
            select(ProjectMember).where(ProjectMember.project_id == conv.project_id)
        )).scalars().all()
        member_by_uid = {m.user_id: m for m in mem_rows}
        creator_id = project.creator_id if project else None
        uids = set(member_by_uid.keys())
        if creator_id:
            uids.add(creator_id)
        users_map = {}
        if uids:
            for u in (await db.execute(select(User).where(User.id.in_(uids)))).scalars().all():
                users_map[u.id] = u
        out = []
        for uid in uids:
            u = users_map.get(uid)
            if not u:
                continue
            is_creator = uid == creator_id
            m = member_by_uid.get(uid)
            joined = (project.created_at if (is_creator and project) else (m.joined_at if m else None))
            out.append({
                "id": u.id,
                "display_name": u.display_name or f"User #{u.id}",
                "photo_url": u.photo_url,
                "joined_at": joined,
                "role": (m.role if m else None),
                "is_creator": is_creator,
                "last_read_at": read_by_uid.get(uid),
            })
        out.sort(key=lambda x: (x["joined_at"] or datetime.min))
        return {
            "kind": "project",
            "members": out,
            "started_at": (project.created_at if project else conv.created_at),
        }

    # DM: both participants + when the conversation started.
    rows = (await db.execute(
        select(ConversationMember).where(ConversationMember.conversation_id == conversation_id)
    )).scalars().all()
    uids = [r.user_id for r in rows]
    users_map = {}
    if uids:
        for u in (await db.execute(select(User).where(User.id.in_(uids)))).scalars().all():
            users_map[u.id] = u
    members = [
        {"id": u.id, "display_name": u.display_name or f"User #{u.id}", "photo_url": u.photo_url,
         "last_read_at": read_by_uid.get(u.id)}
        for u in users_map.values()
    ]
    # Whether *I* have blocked the other person — so the thread rehydrates the
    # blocked composer on reopen instead of only discovering it on a failed send.
    other_id = next((r.user_id for r in rows if r.user_id != me), None)
    i_blocked = False
    if other_id is not None:
        i_blocked = bool(await db.scalar(
            select(func.count(Block.id)).where(Block.blocker_id == me, Block.blocked_id == other_id)
        ))
    return {"kind": "dm", "members": members, "started_at": conv.created_at, "blocked": i_blocked}


# ── Messages: read + send ────────────────────────────────────────────────────

@router.get("/conversations/{conversation_id}/messages", response_model=MessagesPage)
async def list_messages(
    conversation_id: int,
    before: int | None = None,
    limit: int = 30,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Messages in a conversation, oldest-first. Paginate backwards with
    `before` (a message id): returns up to `limit` messages older than it.
    403 if the caller is not a member."""
    me = current_user.id
    if not await _my_member_row(db, conversation_id, me):
        raise HTTPException(status_code=403, detail="Not a member of this conversation")

    limit = max(1, min(int(limit or 30), 100))
    q = select(Message).where(Message.conversation_id == conversation_id)
    if before:
        q = q.where(Message.id < before)
    # Newest-first slice of `limit + 1` (the extra row tells us if more exist),
    # then reverse to oldest-first for display.
    rows = (await db.execute(
        q.order_by(Message.id.desc()).limit(limit + 1)
    )).scalars().all()
    has_more = len(rows) > limit
    rows = rows[:limit]
    rows = list(reversed(rows))

    # Hydrate reply targets referenced by these messages (one query).
    reply_ids = {m.reply_to_id for m in rows if m.reply_to_id}
    reply_map = {}
    if reply_ids:
        for rm in (await db.execute(select(Message).where(Message.id.in_(reply_ids)))).scalars().all():
            reply_map[rm.id] = rm

    sender_ids = {m.sender_id for m in rows} | {rm.sender_id for rm in reply_map.values()}
    senders = {}
    if sender_ids:
        for u in (await db.execute(select(User).where(User.id.in_(sender_ids)))).scalars().all():
            senders[u.id] = u
    return {
        "messages": [_message_out(m, senders, reply_map) for m in rows],
        "has_more": has_more,
    }


@router.post("/conversations/{conversation_id}/messages", response_model=MessageOut,
             status_code=status.HTTP_201_CREATED)
async def send_message(
    conversation_id: int,
    body: SendMessageIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Append a message. Member-only (403 otherwise). 400 on empty/too-long
    body. 429 if the sender sent >20 messages in the last 60s. 403 if a block
    exists between the two DM participants. Notifies the other member(s) and
    returns the created message."""
    me = current_user.id
    if not await _my_member_row(db, conversation_id, me):
        raise HTTPException(status_code=403, detail="Not a member of this conversation")

    text = (body.body or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Message is empty")
    if len(text) > MAX_BODY:
        raise HTTPException(status_code=400, detail=f"Message too long (max {MAX_BODY})")

    conv = await db.get(Conversation, conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Block gate for DMs.
    other_id = None
    if conv.kind == "dm":
        other_id = await _other_dm_user_id(db, conversation_id, me)
        if other_id is not None and await _blocked_between(db, me, other_id):
            raise HTTPException(status_code=403, detail="Messaging is unavailable with this user")

    # Rate limit: authoritative DB count of my recent sends (survives restarts).
    since = datetime.utcnow() - timedelta(seconds=RL_WINDOW_S)
    recent = await db.scalar(
        select(func.count(Message.id)).where(
            Message.sender_id == me, Message.created_at >= since
        )
    ) or 0
    if recent >= RL_MAX:
        raise HTTPException(status_code=429, detail="You're sending messages too fast — slow down.")

    # Optional reply target — must be a message in THIS conversation.
    reply_to_id = None
    if body.reply_to_id:
        rt = await db.get(Message, body.reply_to_id)
        if rt and rt.conversation_id == conversation_id:
            reply_to_id = rt.id

    msg = Message(conversation_id=conversation_id, sender_id=me, body=text, reply_to_id=reply_to_id)
    db.add(msg)
    await db.flush()

    # Notify every OTHER member. project_id carries the conversation id so the
    # notification link resolves to /messages?c={id} (see users._notif_link);
    # the notif inbox skips project-hydration for type == "message".
    recipients = set((await db.execute(
        select(ConversationMember.user_id).where(
            ConversationMember.conversation_id == conversation_id,
            ConversationMember.user_id != me,
        )
    )).scalars().all())
    for rid in recipients:
        add_notification(db, rid, "message", actor_id=me, project_id=conversation_id)

    await db.commit()
    await db.refresh(msg)
    reply_map = {}
    senders = {current_user.id: current_user}
    if reply_to_id:
        rt = await db.get(Message, reply_to_id)
        if rt:
            reply_map[rt.id] = rt
            if rt.sender_id not in senders:
                su = await db.get(User, rt.sender_id)
                if su:
                    senders[rt.sender_id] = su
    return _message_out(msg, senders, reply_map)


@router.patch("/conversations/{conversation_id}/messages/{message_id}", response_model=MessageOut)
async def edit_message(
    conversation_id: int,
    message_id: int,
    body: EditMessageIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Edit your own message (sender-only, not deleted). Sets body + edited_at."""
    me = current_user.id
    msg = await db.get(Message, message_id)
    if not msg or msg.conversation_id != conversation_id:
        raise HTTPException(status_code=404, detail="Message not found")
    if msg.sender_id != me:
        raise HTTPException(status_code=403, detail="You can only edit your own messages")
    if msg.deleted_at is not None:
        raise HTTPException(status_code=400, detail="Message was deleted")
    text = (body.body or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Message is empty")
    if len(text) > MAX_BODY:
        raise HTTPException(status_code=400, detail=f"Message too long (max {MAX_BODY})")
    msg.body = text
    msg.edited_at = datetime.utcnow()
    await db.commit()
    await db.refresh(msg)
    reply_map = {}
    senders = {current_user.id: current_user}
    if msg.reply_to_id:
        rt = await db.get(Message, msg.reply_to_id)
        if rt:
            reply_map[rt.id] = rt
            su = await db.get(User, rt.sender_id)
            if su:
                senders[rt.sender_id] = su
    return _message_out(msg, senders, reply_map)


@router.delete("/conversations/{conversation_id}/messages/{message_id}", response_model=dict)
async def delete_message(
    conversation_id: int,
    message_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Soft-delete your own message (sender-only). Keeps the row; the body is
    hidden and the message renders as 'deleted' so replies/threads stay intact."""
    msg = await db.get(Message, message_id)
    if not msg or msg.conversation_id != conversation_id:
        raise HTTPException(status_code=404, detail="Message not found")
    if msg.sender_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only delete your own messages")
    if msg.deleted_at is None:
        msg.deleted_at = datetime.utcnow()
        await db.commit()
    return {"ok": True, "id": message_id}


@router.post("/conversations/{conversation_id}/read", response_model=dict)
async def mark_read(
    conversation_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Set my last_read_at = now for this conversation. 403 if not a member."""
    row = await _my_member_row(db, conversation_id, current_user.id)
    if not row:
        raise HTTPException(status_code=403, detail="Not a member of this conversation")
    row.last_read_at = datetime.utcnow()
    await db.commit()
    return {"ok": True}


# ── Block / unblock ──────────────────────────────────────────────────────────

@router.get("/messages/blocked", response_model=list[dict])
async def blocked_users(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """People I've blocked — for the Settings 'Blocked users' list (unblock reuses
    DELETE /users/{id}/block)."""
    ids = (await db.execute(
        select(Block.blocked_id).where(Block.blocker_id == current_user.id)
    )).scalars().all()
    if not ids:
        return []
    people = (await db.execute(select(User).where(User.id.in_(ids)))).scalars().all()
    return [
        {"id": u.id, "display_name": u.display_name or f"User #{u.id}", "photo_url": u.photo_url}
        for u in people
    ]


@router.post("/users/{user_id}/block", response_model=dict)
async def block_user(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Block `user_id` (idempotent). Blocks are one-directional rows but a block
    in EITHER direction stops DMs between the pair."""
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot block yourself")
    target = await db.get(User, user_id)
    if not target or target.is_deleted:
        raise HTTPException(status_code=404, detail="User not found")
    existing = (await db.execute(
        select(Block).where(
            Block.blocker_id == current_user.id, Block.blocked_id == user_id
        )
    )).scalar_one_or_none()
    if not existing:
        db.add(Block(blocker_id=current_user.id, blocked_id=user_id))
        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
    return {"ok": True, "blocked": True}


@router.delete("/users/{user_id}/block", status_code=status.HTTP_204_NO_CONTENT)
async def unblock_user(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove my block on `user_id` (idempotent — 204 even if not blocked)."""
    await db.execute(
        delete(Block).where(
            Block.blocker_id == current_user.id, Block.blocked_id == user_id
        )
    )
    await db.commit()


# ── Report a message ─────────────────────────────────────────────────────────

@router.post("/messages/{message_id}/report", response_model=dict)
async def report_message(
    message_id: int,
    body: ReportMessageIn | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """File a report on a message (reuses the generic Report table the admin
    /reports panel lists). Member-only so people can't probe arbitrary ids."""
    msg = await db.get(Message, message_id)
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    if not await _my_member_row(db, msg.conversation_id, current_user.id):
        raise HTTPException(status_code=403, detail="Not a member of this conversation")
    # Anti-flood: shared report budget (also spans POST /users/reports). Kept
    # generous — a victim's reporting legitimately spikes during a harassment wave.
    await rate_limit(db, current_user.id, "report", 30, 3600)    # 30 / hour
    await rate_limit(db, current_user.id, "report", 100, 86400)  # 100 / day
    reason = ((body.reason if body else None) or "")[:1000]
    db.add(Report(
        reporter_id=current_user.id, target_type="message",
        target_id=message_id, reason=reason,
    ))
    await db.commit()
    if settings.ADMIN_GROUP_ID:
        await send_telegram(
            settings.ADMIN_GROUP_ID,
            f"🚩 <b>Message report</b>: message #{message_id}\n"
            f"by {esc(current_user.display_name)}\n{esc(reason[:300])}",
        )
    return {"ok": True}
