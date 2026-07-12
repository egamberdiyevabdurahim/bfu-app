"""Real-time WebSocket hub: new-message push + typing indicators.

One endpoint `wss://<host>/ws`, dialed DIRECTLY by both apps (Vercel rewrites and
the desktop BFF proxy can't tunnel a long-lived socket). In-memory hub keyed by
user id — coherent because run.sh starts ONE uvicorn process (single event loop).
Redis pub/sub is the documented multi-instance upgrade (not built).

Auth: browsers can't set an Authorization header on `new WebSocket`, so the first
frame carries the token — `{"type":"auth","token":"<jwt>"}`. The Mini App sends its
readable access JWT; the desktop (httpOnly cookie, unreadable by JS) first fetches
a short-lived ticket from GET /ws-ticket and sends that. Both decode via the same
HS256 secret.

Broadcast is BEST-EFFORT and never load-bearing: send_message's HTTP response is the
source of truth, so a socket failure must never turn a good send into a 500.
"""
from __future__ import annotations

import asyncio
import time
from typing import Iterable

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from sqlalchemy import and_, func, or_, select

from app.config import settings
from app.core.deps import get_current_user
from app.core.security import _make_token, decode_token
from app.database import AsyncSessionLocal
from app.models.messaging import Block, Conversation, ConversationMember
from app.models.user import User
from datetime import timedelta

router = APIRouter(tags=["ws"])

# Shared with main.py's CORS list — a browser sends NO preflight for a WebSocket
# and Starlette's CORSMiddleware only wraps the HTTP scope, so the handshake is
# unguarded unless we check Origin ourselves.
WS_ALLOWED_ORIGINS = {
    "https://bfu-app.vercel.app",
    "https://bfu-desktop.vercel.app",
    "https://web.telegram.org",
    "http://localhost:5173",
    "http://localhost:3000",
}
if settings.WEBAPP_URL:
    WS_ALLOWED_ORIGINS.add(settings.WEBAPP_URL.rstrip("/"))

# One credential must not be able to open unbounded sockets: each socket is a live
# coroutine + a fanout multiplier (every broadcast to a user hits ALL their
# sockets). Cap per user; the (N+1)th connection evicts the oldest.
_MAX_SOCKETS_PER_USER = 8

# Per-user server-side typing throttle: WS frames have no DB rate limit (the
# 20/60s guard is HTTP-only), so cap typing work (incl. the membership DB query)
# to ~1 / 2.5s per user. Declared before ConnectionManager so disconnect/prune
# can reclaim entries when a user's last socket goes away.
_last_typing: dict[int, float] = {}
_TYPING_MIN_INTERVAL = 2.5


class ConnectionManager:
    """user_id → set of live sockets (a user may have several tabs/devices)."""

    def __init__(self) -> None:
        self._by_user: dict[int, set[WebSocket]] = {}

    async def connect(self, uid: int, ws: WebSocket) -> None:
        s = self._by_user.setdefault(uid, set())
        # Bound sockets per user — evict the oldest beyond the cap.
        while len(s) >= _MAX_SOCKETS_PER_USER:
            victim = next(iter(s))
            s.discard(victim)
            try:
                await victim.close(code=1008)
            except Exception:
                pass
        s.add(ws)

    def _drop(self, uid: int, ws: WebSocket) -> None:
        """Remove one socket; reclaim the user's slot + typing entry when empty."""
        s = self._by_user.get(uid)
        if s is None:
            return
        s.discard(ws)
        if not s:
            self._by_user.pop(uid, None)
            _last_typing.pop(uid, None)

    def disconnect(self, uid: int, ws: WebSocket) -> None:
        self._drop(uid, ws)

    def is_online(self, uid: int) -> bool:
        """True when the user has at least one live socket — i.e. they're in the
        app right now and already got the WS fanout, so an offline-only Telegram
        push should skip them."""
        return bool(self._by_user.get(uid))

    async def send_to_users(self, uids: Iterable[int], payload: dict) -> None:
        # Carry each target's uid so a failed send prunes the RIGHT user's set
        # (O(dead), not O(users)) and can reclaim an emptied key.
        targets = [(uid, ws) for uid in set(uids) for ws in self._by_user.get(uid, ())]
        if not targets:
            return
        results = await asyncio.gather(
            *(ws.send_json(payload) for _, ws in targets), return_exceptions=True
        )
        for (uid, ws), res in zip(targets, results):
            if isinstance(res, Exception):
                self._drop(uid, ws)


manager = ConnectionManager()


async def _load_ws_user(token: str) -> User | None:
    payload = decode_token(token or "")
    sub = payload.get("sub")
    if not sub or payload.get("type") not in ("access", "ws"):
        return None
    async with AsyncSessionLocal() as db:
        return (await db.execute(
            select(User).where(
                User.id == int(sub),
                User.is_deleted == False,  # noqa: E712
                User.banned == False,      # noqa: E712 — a mid-session ban revokes the socket
            )
        )).scalar_one_or_none()


async def _conv(conv_id: int) -> tuple[str | None, set[int]]:
    """(kind, member_ids) for a conversation — kind is None if it doesn't exist."""
    async with AsyncSessionLocal() as db:
        kind = (await db.execute(
            select(Conversation.kind).where(Conversation.id == conv_id)
        )).scalar_one_or_none()
        if kind is None:
            return None, set()
        members = set((await db.execute(
            select(ConversationMember.user_id).where(
                ConversationMember.conversation_id == conv_id
            )
        )).scalars().all())
        return kind, members


async def _blocked_between(a: int, b: int) -> bool:
    """True if either user has blocked the other (mirrors messages.py)."""
    async with AsyncSessionLocal() as db:
        n = await db.scalar(
            select(func.count(Block.id)).where(
                or_(
                    and_(Block.blocker_id == a, Block.blocked_id == b),
                    and_(Block.blocker_id == b, Block.blocked_id == a),
                )
            )
        )
        return bool(n)


@router.get("/ws-ticket")
async def ws_ticket(current_user: User = Depends(get_current_user)):
    """Short-lived WS auth ticket for clients that can't send their token in the
    first frame (the desktop, whose token is an httpOnly cookie). Returns the ws
    url too, so the desktop needs no new client env."""
    ticket = _make_token({"sub": str(current_user.id), "type": "ws"}, timedelta(seconds=60))
    return {"ticket": ticket, "ws_url": settings.api_base_url.replace("https://", "wss://").replace("http://", "ws://") + "/ws"}


@router.websocket("/ws")
async def ws_endpoint(websocket: WebSocket):
    # 1. Origin guard (CORS doesn't cover WS). A missing Origin (non-browser
    #    client) is allowed through — auth below is the real gate.
    origin = websocket.headers.get("origin")
    if origin and origin not in WS_ALLOWED_ORIGINS:
        await websocket.close(code=1008)
        return
    await websocket.accept()

    # 2. Auth via the first frame {type:"auth", token}. Bounded wait so an
    #    unauthenticated socket can't hang a slot open.
    try:
        first = await asyncio.wait_for(websocket.receive_json(), timeout=10)
    except Exception:
        await websocket.close(code=1008)
        return
    if not isinstance(first, dict) or first.get("type") != "auth":
        await websocket.close(code=1008)
        return
    user = await _load_ws_user(first.get("token"))
    if user is None:
        await websocket.close(code=1008)
        return
    uid = user.id

    await manager.connect(uid, websocket)
    try:
        await websocket.send_json({"type": "ready"})
        while True:
            data = await websocket.receive_json()
            if not isinstance(data, dict):
                continue
            kind = data.get("type")
            if kind == "ping":
                await websocket.send_json({"type": "pong"})
            elif kind == "typing":
                cid = data.get("conversation_id")
                if not isinstance(cid, int):
                    continue
                now = time.monotonic()
                if now - _last_typing.get(uid, 0.0) < _TYPING_MIN_INTERVAL:
                    continue
                # Stamp the throttle BEFORE the DB query so a flood of frames for
                # conversations the user ISN'T in is still capped to 1 query/2.5s.
                _last_typing[uid] = now
                conv_kind, members = await _conv(cid)
                if uid not in members:
                    continue  # must be a member of the conversation to signal
                recipients = members - {uid}
                # Don't leak typing/presence across a DM block boundary.
                if conv_kind == "dm" and len(recipients) == 1:
                    other = next(iter(recipients))
                    if await _blocked_between(uid, other):
                        continue
                await manager.send_to_users(
                    recipients,
                    {"type": "typing", "conversation_id": cid,
                     "user_id": uid, "sender_name": user.display_name},
                )
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        manager.disconnect(uid, websocket)
