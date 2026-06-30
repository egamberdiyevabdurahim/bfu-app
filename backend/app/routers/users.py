import json
import time
from datetime import datetime, timedelta

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.core.deps import get_current_user
from app.database import get_db
from app.models.region import LearningCenter, Region, School
from app.models.user import User, UserLearningCenter, UserSchool, Report, Interest, BioTranslation, Notification
from app.models.project import Project, ProjectMember, ProjectApplication
from app.models.trust import Endorsement, Vouch, ProjectRating
from app.models.connection import Follow
from app.services.notifications import add_notification
from app.schemas.user import GroupStatus, UserPublic, UserResponse, UserUpdate
from app.schemas.trust import EndorseIn, VouchIn
from app.schemas.connection import FollowIn
from app.services.ai import analyze_and_save, generate_icebreakers, generate_match_reason, improve_text, translate_bio_async
from app.services.geo import nearest_region_id
from app.services.notify import esc, send_telegram

router = APIRouter(prefix="/users", tags=["users"])
# Follow endpoints live at the app root (/follow), not under /users — a
# separate router with no prefix, included alongside `router` in main.py.
follow_router = APIRouter(tags=["follow"])

# Per-user, per-action AI cooldown (cost control). Single uvicorn worker →
# in-process is fine. Keyed by (uid, action) so distinct AI features don't
# block each other — e.g. tapping "icebreakers" right after "analyze" no longer
# trips a shared timer. Each action has its own short window.
_AI_COOLDOWN_S = 20
_last_ai: dict[tuple[int, str], float] = {}


def _ai_on_cooldown(uid: int, action: str = "default") -> bool:
    now = time.monotonic()
    key = (uid, action)
    last = _last_ai.get(key)  # None = never → not on cooldown (don't compare
    # against a 0.0 sentinel, which is < now and falsely trips right after boot)
    if last is not None and now - last < _AI_COOLDOWN_S:
        return True
    _last_ai[key] = now
    return False


class ReferralIn(BaseModel):
    code: int


class ReportIn(BaseModel):
    target_type: str  # "user" | "project"
    target_id: int
    reason: str | None = None


def _denied_set(user: User) -> set[str]:
    if not user.denied_fields:
        return set()
    try:
        v = json.loads(user.denied_fields)
        return set(v) if isinstance(v, list) else set()
    except Exception:
        return set()


def _write_denied(user: User, fields: set[str]) -> None:
    user.denied_fields = json.dumps(sorted(fields)) if fields else None


def _sanitize_portfolio(raw) -> list[dict]:
    """Coerce arbitrary input into at most 5 valid {label,url} entries.
    Drops non-dicts, blank label/url, non-http(s) URLs; caps label at 40 chars."""
    if not isinstance(raw, list):
        return []
    out: list[dict] = []
    for item in raw:
        if len(out) >= 5:
            break
        if not isinstance(item, dict):
            continue
        label = str(item.get("label", "")).strip()[:40]
        url = str(item.get("url", "")).strip()
        if not label or not url:
            continue
        if not (url.startswith("http://") or url.startswith("https://")):
            continue
        out.append({"label": label, "url": url})
    return out


# Fields populated by `_profile_extras` after the base model_validate, not by
# direct ORM attribute access. Several share a name with a raw ORM column of a
# different shape (e.g. `User.portfolio_links` is TEXT/None, while the schema
# field is `list[PortfolioLink]`), so eagerly reading them via `from_attributes`
# fails validation before `_profile_extras` gets a chance to overwrite them.
_PROFILE_EXTRAS_FIELDS = {
    "currently_building", "currently_building_source", "portfolio_links",
    "founded_projects", "member_projects", "stats",
    "endorsements", "vouches", "vouch_count", "rating", "mutual_connections",
    "mentor", "follower_count", "following_count", "is_following",
}


def _validate_from_user(schema_cls, user: User):
    """`schema_cls.model_validate(user, from_attributes=True)`, but skipping
    the profile-extras fields (see `_PROFILE_EXTRAS_FIELDS`) so their schema
    defaults are used instead of failing on the mismatched/absent ORM attrs."""
    data = {
        name: getattr(user, name, None)
        for name in schema_cls.model_fields
        if name not in _PROFILE_EXTRAS_FIELDS
    }
    return schema_cls.model_validate(data)


async def _profile_extras(db: AsyncSession, user: User) -> dict:
    """Derive the rich-profile payload for `user` from existing project tables.
    Returns a plain dict the endpoints attach to the response schema."""
    import json

    # Founded (exclude drafts + soft-deleted), newest first.
    founded = (await db.execute(
        select(Project)
        .where(Project.creator_id == user.id,
               Project.is_draft == False, Project.is_deleted == False)
        .order_by(Project.created_at.desc())
    )).scalars().all()

    # Joined = member of a project they did NOT found (exclude drafts/deleted).
    joined_rows = (await db.execute(
        select(Project, ProjectMember.joined_at)
        .join(ProjectMember, ProjectMember.project_id == Project.id)
        .where(ProjectMember.user_id == user.id,
               Project.creator_id != user.id,
               Project.is_draft == False, Project.is_deleted == False)
        .order_by(ProjectMember.joined_at.desc())
    )).all()

    accepted = await db.scalar(
        select(func.count(ProjectApplication.id)).where(
            ProjectApplication.applicant_id == user.id,
            ProjectApplication.status == "accepted",
        )
    ) or 0

    founded_projects = [
        {"id": p.id, "name": p.name, "type": p.type, "is_active": p.is_active,
         "date": p.created_at}
        for p in founded
    ]
    member_projects = [
        {"id": p.id, "name": p.name, "type": p.type, "is_active": p.is_active,
         "date": joined_at}
        for (p, joined_at) in joined_rows
    ]

    # currently_building: manual wins, else latest active founded project name.
    manual = (user.currently_building or "").strip()
    if manual:
        cb, src = manual, "manual"
    else:
        active = next((p for p in founded if p.is_active), None)
        cb, src = (active.name, "auto") if active else (None, None)

    try:
        portfolio = _sanitize_portfolio(json.loads(user.portfolio_links)) if user.portfolio_links else []
    except Exception:
        portfolio = []

    return {
        "currently_building": cb,
        "currently_building_source": src,
        "portfolio_links": portfolio,
        "founded_projects": founded_projects,
        "member_projects": member_projects,
        "stats": {
            "projects_founded": len(founded_projects),
            "projects_joined": len(member_projects),
            "applications_accepted": accepted,
        },
    }


def _mentor_dict(user: User) -> dict:
    """The mentor sub-object derived from the user's columns."""
    topics = []
    if user.mentor_topics:
        try:
            topics = [str(t).strip() for t in json.loads(user.mentor_topics) if str(t).strip()]
        except Exception:
            topics = []
    return {
        "is_mentor": bool(user.is_mentor),
        "bio": (user.mentor_bio or None) if user.is_mentor else None,
        "topics": topics if user.is_mentor else [],
    }


async def _connection_extras(db: AsyncSession, user: User, viewer: User | None) -> dict:
    """Follow counts + viewer's is_following + the mentor sub-object for `user`."""
    follower_count = await db.scalar(
        select(func.count(Follow.id)).where(
            Follow.target_type == "user", Follow.target_id == user.id
        )
    ) or 0
    following_count = await db.scalar(
        select(func.count(Follow.id)).where(Follow.follower_id == user.id)
    ) or 0
    is_following = False
    if viewer is not None and viewer.id != user.id:
        is_following = bool(await db.scalar(
            select(func.count(Follow.id)).where(
                Follow.follower_id == viewer.id,
                Follow.target_type == "user",
                Follow.target_id == user.id,
            )
        ))
    return {
        "follower_count": int(follower_count),
        "following_count": int(following_count),
        "is_following": is_following,
        "mentor": _mentor_dict(user),
    }


async def _connection_ids(db: AsyncSession, uid: int) -> set[int]:
    """The set of member ids `uid` is connected to: mutual-interest peers
    UNION people who share a (non-draft/non-deleted) project with `uid`."""
    i_like = set((await db.execute(
        select(Interest.to_user_id).where(Interest.from_user_id == uid)
    )).scalars().all())
    like_me = set((await db.execute(
        select(Interest.from_user_id).where(Interest.to_user_id == uid)
    )).scalars().all())
    mutual = i_like & like_me

    # Projects uid belongs to (as member OR founder), excluding draft/deleted.
    my_proj = set((await db.execute(
        select(ProjectMember.project_id)
        .join(Project, Project.id == ProjectMember.project_id)
        .where(ProjectMember.user_id == uid,
               Project.is_draft == False, Project.is_deleted == False)
    )).scalars().all())
    my_proj |= set((await db.execute(
        select(Project.id).where(Project.creator_id == uid,
                                 Project.is_draft == False, Project.is_deleted == False)
    )).scalars().all())

    co_ids: set[int] = set()
    if my_proj:
        # Co-members of those projects.
        co_ids |= set((await db.execute(
            select(ProjectMember.user_id).where(ProjectMember.project_id.in_(my_proj))
        )).scalars().all())
        # Founders of those projects.
        co_ids |= set((await db.execute(
            select(Project.creator_id).where(Project.id.in_(my_proj))
        )).scalars().all())

    out = mutual | co_ids
    out.discard(uid)
    return out


async def _trust_extras(db: AsyncSession, user: User, viewer: User | None) -> dict:
    """Derive the peer-trust payload for `user`, relative to `viewer` (for the
    viewer-specific `endorsed_by_me` + mutual-connection overlap)."""
    viewer_id = viewer.id if viewer else None

    # ── Endorsements: count per skill + whether the viewer endorsed it. ──
    rows = (await db.execute(
        select(Endorsement.skill, Endorsement.endorser_id)
        .where(Endorsement.target_id == user.id)
    )).all()
    counts: dict[str, int] = {}
    mine: set[str] = set()
    for skill, endorser_id in rows:
        counts[skill] = counts.get(skill, 0) + 1
        if viewer_id is not None and endorser_id == viewer_id:
            mine.add(skill)
    endorsements = [
        {"skill": s, "count": c, "endorsed_by_me": s in mine}
        for s, c in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0].lower()))
    ]

    # ── Vouches (newest first, cap 20) with author preview. ──
    vrows = (await db.execute(
        select(Vouch).where(Vouch.target_id == user.id)
        .order_by(Vouch.created_at.desc()).limit(20)
    )).scalars().all()
    vouch_count = await db.scalar(
        select(func.count(Vouch.id)).where(Vouch.target_id == user.id)
    ) or 0
    author_ids = {v.author_id for v in vrows}
    authors: dict[int, dict] = {}
    if author_ids:
        for u in (await db.execute(select(User).where(User.id.in_(author_ids)))).scalars().all():
            authors[u.id] = {"id": u.id, "display_name": u.display_name, "photo_url": u.photo_url}
    vouches = [
        {"id": v.id, "text": v.text, "author": authors.get(v.author_id),
         "created_at": v.created_at}
        for v in vrows
    ]

    # ── Rating aggregate over all ratings where this user is the ratee. ──
    avg = await db.scalar(
        select(func.avg(ProjectRating.stars)).where(ProjectRating.ratee_id == user.id)
    )
    rcount = await db.scalar(
        select(func.count(ProjectRating.id)).where(ProjectRating.ratee_id == user.id)
    ) or 0
    rating = {"average": round(float(avg), 1) if avg is not None else None, "count": int(rcount)}

    # ── Mutual connections: overlap of viewer's + target's connection sets. ──
    mutual = {"count": 0, "preview": []}
    if viewer_id is not None and viewer_id != user.id:
        v_conn = await _connection_ids(db, viewer_id)
        t_conn = await _connection_ids(db, user.id)
        overlap = (v_conn & t_conn) - {viewer_id, user.id}
        if overlap:
            preview_ids = sorted(overlap)[:8]
            people = (await db.execute(
                select(User).where(User.id.in_(preview_ids),
                                   User.is_deleted == False, User.is_registered == True)
            )).scalars().all()
            mutual = {
                "count": len(overlap),
                "preview": [
                    {"id": u.id, "display_name": u.display_name, "photo_url": u.photo_url}
                    for u in people
                ],
            }

    # REPUTATION SEAM: when the reputation model is decided, compute it here as a
    # pure function of (endorsements, vouch_count, rating, mutual) and add it to
    # the returned dict (+ a `reputation` field on the schema). Deferred for now.
    return {
        "endorsements": endorsements,
        "vouches": vouches,
        "vouch_count": int(vouch_count),
        "rating": rating,
        "mutual_connections": mutual,
    }


# ── Helper: set Telegram name tag ─────────────────────────────────────────────

async def _set_member_tag(chat_id: int, user_id: int, tag: str) -> None:
    """Call Telegram setChatMemberTag for the user in a group."""
    if not chat_id or not settings.BOT_TOKEN:
        return
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            await client.post(
                f"https://api.telegram.org/bot{settings.BOT_TOKEN}/setChatMemberTag",
                json={"chat_id": chat_id, "user_id": user_id, "tag": tag[:16]},
            )
    except Exception:
        pass  # Non-critical


async def _check_member(chat_id: int, user_id: int) -> bool:
    """Check if a user is a member of a Telegram group."""
    if not chat_id or not settings.BOT_TOKEN:
        return False
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            res = await client.post(
                f"https://api.telegram.org/bot{settings.BOT_TOKEN}/getChatMember",
                json={"chat_id": chat_id, "user_id": user_id},
            )
            data = res.json()
            status = data.get("result", {}).get("status", "")
            return status in ("member", "administrator", "creator")
    except Exception:
        return False


def _build_tag(user: User) -> str:
    name = (user.name or "").strip().capitalize()
    initial = (user.surname or "")[:1].upper()
    return f"{name}. {initial}" if initial else name


# ── Current user ──────────────────────────────────────────────────────────────

@router.get("/me", response_model=UserResponse)
async def get_me(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Lazy last_seen_at refresh (cheap; throttled to once / 5 min). On the same
    # stale path, backfill the profile photo for users who don't have one yet
    # (existing users won't re-login for up to 7 days), so avatars/cards light
    # up within a session instead of waiting for the next /auth/telegram.
    now = datetime.utcnow()
    if (not current_user.last_seen_at
            or now - current_user.last_seen_at > timedelta(minutes=5)):
        current_user.last_seen_at = now
        if not current_user.photo_file_id and current_user.telegram_id:
            try:
                from app.services.telegram_media import fetch_photo_file_id
                fid = await fetch_photo_file_id(current_user.telegram_id)
                if fid:
                    current_user.photo_file_id = fid
            except Exception:
                pass
        try:
            await db.commit()
        except Exception:
            await db.rollback()
    out = _validate_from_user(UserResponse, current_user)
    extras = await _profile_extras(db, current_user)
    for k, v in extras.items():
        setattr(out, k, v)
    trust = await _trust_extras(db, current_user, current_user)
    for k, v in trust.items():
        setattr(out, k, v)
    conn = await _connection_extras(db, current_user, current_user)
    for k, v in conn.items():
        setattr(out, k, v)
    return out


@router.get("/me/notifications", response_model=dict)
async def my_notifications(
    limit: int = 30,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Inbox: recent notifications with actor + project hydrated. Text is
    rendered client-side (localized) from type/actor/project."""
    rows = (await db.execute(
        select(Notification).where(Notification.user_id == current_user.id)
        .order_by(Notification.id.desc()).limit(min(limit, 100))
    )).scalars().all()

    actor_ids = {n.actor_id for n in rows if n.actor_id}
    proj_ids = {n.project_id for n in rows if n.project_id}
    actors = {}
    if actor_ids:
        from app.routers.public import avatar_url  # signed url helper
        for u in (await db.execute(select(User).where(User.id.in_(actor_ids)))).scalars().all():
            actors[u.id] = {"id": u.id, "display_name": u.display_name,
                            "photo_url": u.photo_url}
    projects_map = {}
    if proj_ids:
        from app.models.project import Project
        for p in (await db.execute(select(Project).where(Project.id.in_(proj_ids)))).scalars().all():
            projects_map[p.id] = {"id": p.id, "name": p.name, "type": p.type}

    unread = await db.scalar(
        select(func.count(Notification.id)).where(
            Notification.user_id == current_user.id, Notification.is_read == False
        )
    ) or 0
    return {
        "unread": unread,
        "items": [
            {"id": n.id, "type": n.type, "is_read": n.is_read,
             "created_at": n.created_at.isoformat() if n.created_at else None,
             "actor": actors.get(n.actor_id), "project": projects_map.get(n.project_id)}
            for n in rows
        ],
    }


@router.get("/me/notifications/unread-count", response_model=dict)
async def unread_count(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    n = await db.scalar(
        select(func.count(Notification.id)).where(
            Notification.user_id == current_user.id, Notification.is_read == False
        )
    ) or 0
    return {"unread": n}


@router.get("/me/connections", response_model=list[UserPublic])
async def my_connections(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """People I have a MUTUAL interest with (both pinged each other)."""
    i_like = set((await db.execute(
        select(Interest.to_user_id).where(Interest.from_user_id == current_user.id)
    )).scalars().all())
    like_me = set((await db.execute(
        select(Interest.from_user_id).where(Interest.to_user_id == current_user.id)
    )).scalars().all())
    mutual_ids = i_like & like_me
    if not mutual_ids:
        return []
    users = (await db.execute(
        select(User).options(selectinload(User.analysis)).where(
            User.id.in_(mutual_ids), User.is_deleted == False, User.is_registered == True
        )
    )).scalars().all()
    return users


@router.get("/me/following", response_model=dict)
async def my_following(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Who/what the caller follows: user previews + project previews."""
    rows = (await db.execute(
        select(Follow).where(Follow.follower_id == current_user.id)
    )).scalars().all()
    user_ids = [r.target_id for r in rows if r.target_type == "user"]
    proj_ids = [r.target_id for r in rows if r.target_type == "project"]

    users_out = []
    if user_ids:
        people = (await db.execute(
            select(User).where(User.id.in_(user_ids),
                               User.is_deleted == False, User.is_registered == True)
        )).scalars().all()
        users_out = [{"id": u.id, "display_name": u.display_name, "photo_url": u.photo_url}
                     for u in people]
    projects_out = []
    if proj_ids:
        from app.models.project import Project
        projs = (await db.execute(
            select(Project).where(Project.id.in_(proj_ids), Project.is_deleted == False)
        )).scalars().all()
        projects_out = [{"id": p.id, "name": p.name, "type": p.type} for p in projs]
    return {"users": users_out, "projects": projects_out}


class CoachBody(BaseModel):
    kind: str  # "bio" | "project"
    text: str


@router.post("/me/coach", response_model=dict)
async def ai_coach(
    body: CoachBody,
    current_user: User = Depends(get_current_user),
):
    """AI writing coach — polish a bio or project description draft. Returns the
    improved text for the user to accept/edit. AI-cooldown gated."""
    if body.kind not in ("bio", "project"):
        raise HTTPException(status_code=400, detail="invalid kind")
    if not (body.text or "").strip():
        raise HTTPException(status_code=400, detail="empty text")
    if _ai_on_cooldown(current_user.id, "improve"):
        raise HTTPException(status_code=429, detail="Please wait a moment")
    improved = await improve_text(body.kind, body.text, current_user.language or "en")
    return {"improved": improved}


@router.post("/me/notifications/read", response_model=dict)
async def mark_notifications_read(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Mark all of the caller's notifications read."""
    await db.execute(
        update(Notification).where(
            Notification.user_id == current_user.id, Notification.is_read == False
        ).values(is_read=True)
    )
    await db.commit()
    return {"ok": True}


@router.patch("/me", response_model=UserResponse)
async def update_me(
    body: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    data = body.model_dump(exclude_none=True)

    school_id = data.pop("school_id", None)
    lc_ids = data.pop("learning_center_ids", None)
    old_about = current_user.about

    import json
    if "currently_building" in data:
        cb = (data.pop("currently_building") or "").strip()[:140]
        current_user.currently_building = cb or None
    if "portfolio_links" in data:
        raw = data.pop("portfolio_links")
        # body.model_dump turned PortfolioLink models into dicts already.
        clean = _sanitize_portfolio(raw)
        current_user.portfolio_links = json.dumps(clean) if clean else None
    if "is_mentor" in data:
        current_user.is_mentor = bool(data.pop("is_mentor"))
    if "mentor_bio" in data:
        mb = (data.pop("mentor_bio") or "").strip()[:400]
        current_user.mentor_bio = mb or None
    if "mentor_topics" in data:
        raw = data.pop("mentor_topics") or []
        clean = []
        for t in raw[:6]:
            s = str(t).strip()[:40]
            if s:
                clean.append(s)
        current_user.mentor_topics = json.dumps(clean) if clean else None

    for field, value in data.items():
        setattr(current_user, field, value)

    # Auto-detect region from GPS if user has coords but no region.
    if (current_user.region_id is None
            and current_user.latitude is not None
            and current_user.longitude is not None):
        regs = (await db.execute(select(Region).where(Region.is_deleted == False))).scalars().all()
        auto = nearest_region_id(regs, current_user.latitude, current_user.longitude)
        if auto:
            current_user.region_id = auto

    # Deny-fields auto-clear: any flagged field the user just touched in
    # this PATCH is removed from `denied_fields`. When the set is empty
    # we notify admins that this user is back in the review queue.
    denied = _denied_set(current_user)
    if denied:
        touched = set(data.keys())
        if school_id is not None:
            touched.add("school_id")
        if lc_ids is not None:
            touched.add("learning_center_ids")
        if touched & denied:
            denied -= touched
            _write_denied(current_user, denied)
            if not denied and settings.ADMIN_GROUP_ID:
                current_user.denied_note = None
                link = f"https://t.me/{settings.BOT_USERNAME}?startapp=user_{current_user.id}"
                await send_telegram(
                    settings.ADMIN_GROUP_ID,
                    f"✅ <b>Ready for re-review</b>: {esc(current_user.display_name)}\n{link}",
                )

    if school_id is not None:
        existing = await db.execute(
            select(UserSchool).where(UserSchool.user_id == current_user.id)
        )
        row = existing.scalar_one_or_none()
        if row:
            row.school_id = school_id
        else:
            db.add(UserSchool(user_id=current_user.id, school_id=school_id))

    if lc_ids is not None:
        from sqlalchemy import delete
        await db.execute(
            delete(UserLearningCenter).where(UserLearningCenter.user_id == current_user.id)
        )
        for lc_id in lc_ids:
            db.add(UserLearningCenter(user_id=current_user.id, learning_center_id=lc_id))

    await db.commit()
    await db.refresh(current_user)

    # Auto-reanalyze if bio changed
    new_about = current_user.about
    if new_about and new_about != old_about and not _ai_on_cooldown(current_user.id, "analyze"):
        try:
            await analyze_and_save(db, current_user.id, new_about)
        except Exception:
            pass

    out = _validate_from_user(UserResponse, current_user)
    extras = await _profile_extras(db, current_user)
    for k, v in extras.items():
        setattr(out, k, v)
    conn = await _connection_extras(db, current_user, current_user)
    for k, v in conn.items():
        setattr(out, k, v)
    return out


@router.post("/me/analyze", response_model=dict)
async def analyze_bio(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not current_user.about:
        raise HTTPException(status_code=400, detail="about field is empty")
    if _ai_on_cooldown(current_user.id, "analyze"):
        raise HTTPException(status_code=429, detail="Please wait a moment before re-analyzing")
    tags = await analyze_and_save(db, current_user.id, current_user.about)
    return tags


@router.post("/me/fetch-tg-username", response_model=dict)
async def fetch_tg_username(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Fetch the user's Telegram username directly from the Telegram API."""
    if not current_user.telegram_id or not settings.BOT_TOKEN:
        raise HTTPException(status_code=400, detail="Cannot fetch username")
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            res = await client.post(
                f"https://api.telegram.org/bot{settings.BOT_TOKEN}/getChat",
                json={"chat_id": current_user.telegram_id},
            )
            data = res.json()
            username = data.get("result", {}).get("username")
            if username:
                current_user.tg_username = username
                await db.commit()
                return {"tg_username": username}
            return {"tg_username": None}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/me/groups", response_model=list[GroupStatus])
async def check_groups(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return list of required groups and whether the user has joined each.

    Fail-open: any unexpected error returns an empty list so the
    registration flow is never blocked by a transient Telegram or DB
    hiccup (this caused a confusing 'error' on iOS for first-time users)."""
    try:
        return await _check_groups_impl(current_user, db)
    except Exception:
        return []


async def _check_groups_impl(current_user: User, db: AsyncSession):
    groups_to_check: list[dict] = []

    # Default groups from config
    if settings.TG_GLOBAL_GROUP_ID:
        groups_to_check.append({
            "group_id": settings.TG_GLOBAL_GROUP_ID,
            "group_link": settings.TG_GLOBAL_GROUP_LINK,
            "name": "Global Community",
        })
    if settings.TG_OFFICIAL_CHANNEL_ID:
        groups_to_check.append({
            "group_id": settings.TG_OFFICIAL_CHANNEL_ID,
            "group_link": settings.TG_OFFICIAL_CHANNEL_LINK,
            "name": "Official Channel",
        })

    # User's school group
    school_res = await db.execute(
        select(UserSchool).options(selectinload(UserSchool.school))
        .where(UserSchool.user_id == current_user.id)
    )
    user_school = school_res.scalar_one_or_none()
    if user_school and user_school.school and user_school.school.group_id:
        groups_to_check.append({
            "group_id": user_school.school.group_id,
            "group_link": user_school.school.group_link or "",
            "name": user_school.school.name,
        })

    # User's LC groups
    lc_res = await db.execute(
        select(UserLearningCenter).options(selectinload(UserLearningCenter.learning_center))
        .where(UserLearningCenter.user_id == current_user.id)
    )
    user_lcs = lc_res.scalars().all()
    for ulc in user_lcs:
        lc = ulc.learning_center
        if lc and lc.group_id:
            groups_to_check.append({
                "group_id": lc.group_id,
                "group_link": lc.group_link or "",
                "name": lc.name,
            })

    # Check membership for each group
    result = []
    for g in groups_to_check:
        joined = await _check_member(g["group_id"], current_user.telegram_id)
        result.append(GroupStatus(
            group_id=g["group_id"],
            group_link=g["group_link"],
            name=g["name"],
            joined=joined,
        ))

    return result


@router.post("/me/finalize", response_model=UserResponse)
async def finalize_registration(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Mark user as fully registered and set name tags in all their groups."""
    was_registered = current_user.is_registered
    current_user.is_registered = True
    await db.commit()
    await db.refresh(current_user)

    # Analytics + referral payoff (only on the first time they finish)
    if not was_registered:
        if settings.ADMIN_GROUP_ID:
            link = f"https://t.me/{settings.BOT_USERNAME}?startapp=user_{current_user.id}"
            handle = f" (@{current_user.tg_username})" if current_user.tg_username else ""
            await send_telegram(
                settings.ADMIN_GROUP_ID,
                f"✅ <b>New registered user</b>: {esc(current_user.display_name)}{esc(handle)}\n{link}",
            )
        if current_user.referred_by:
            referrer = await db.get(User, current_user.referred_by)
            if referrer and referrer.telegram_id:
                cnt = await db.scalar(
                    select(func.count(User.id)).where(
                        User.referred_by == referrer.id,
                        User.is_registered == True,
                        User.is_deleted == False,
                    )
                )
                rlang = (referrer.language or "en") if (referrer.language or "en") in _REFERRAL_PAYOFF else "en"
                await send_telegram(
                    referrer.telegram_id,
                    _REFERRAL_PAYOFF[rlang].format(count=cnt or 0),
                )

    # Set name tag in all groups the user belongs to
    tag = _build_tag(current_user)
    tg_id = current_user.telegram_id

    groups_to_tag: list[int] = []
    if settings.TG_GLOBAL_GROUP_ID:
        groups_to_tag.append(settings.TG_GLOBAL_GROUP_ID)
    if settings.TG_OFFICIAL_CHANNEL_ID:
        groups_to_tag.append(settings.TG_OFFICIAL_CHANNEL_ID)

    school_res = await db.execute(
        select(UserSchool).options(selectinload(UserSchool.school))
        .where(UserSchool.user_id == current_user.id)
    )
    user_school = school_res.scalar_one_or_none()
    if user_school and user_school.school and user_school.school.group_id:
        groups_to_tag.append(user_school.school.group_id)

    lc_res = await db.execute(
        select(UserLearningCenter).options(selectinload(UserLearningCenter.learning_center))
        .where(UserLearningCenter.user_id == current_user.id)
    )
    for ulc in lc_res.scalars().all():
        if ulc.learning_center and ulc.learning_center.group_id:
            groups_to_tag.append(ulc.learning_center.group_id)

    for chat_id in groups_to_tag:
        await _set_member_tag(chat_id, tg_id, tag)

    # Trigger AI analysis if bio exists
    if current_user.about:
        try:
            await analyze_and_save(db, current_user.id, current_user.about)
        except Exception:
            pass

    return current_user


@router.post("/me/update-tags", response_model=dict)
async def update_name_tags(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Called from edit profile when name changes — updates tags in all groups."""
    tag = _build_tag(current_user)
    tg_id = current_user.telegram_id

    groups_to_tag: list[int] = []
    if settings.TG_GLOBAL_GROUP_ID:
        groups_to_tag.append(settings.TG_GLOBAL_GROUP_ID)
    if settings.TG_OFFICIAL_CHANNEL_ID:
        groups_to_tag.append(settings.TG_OFFICIAL_CHANNEL_ID)

    school_res = await db.execute(
        select(UserSchool).options(selectinload(UserSchool.school))
        .where(UserSchool.user_id == current_user.id)
    )
    user_school = school_res.scalar_one_or_none()
    if user_school and user_school.school and user_school.school.group_id:
        groups_to_tag.append(user_school.school.group_id)

    lc_res = await db.execute(
        select(UserLearningCenter).options(selectinload(UserLearningCenter.learning_center))
        .where(UserLearningCenter.user_id == current_user.id)
    )
    for ulc in lc_res.scalars().all():
        if ulc.learning_center and ulc.learning_center.group_id:
            groups_to_tag.append(ulc.learning_center.group_id)

    for chat_id in groups_to_tag:
        await _set_member_tag(chat_id, tg_id, tag)

    return {"tag": tag, "updated_in": len(groups_to_tag)}


# ── Invite / referral ──────────────────────────────────────────────────────────

@router.get("/me/invite", response_model=dict)
async def my_invite(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    count = await db.scalar(
        select(func.count(User.id)).where(
            User.referred_by == current_user.id,
            User.is_registered == True,
            User.is_deleted == False,
        )
    )
    return {
        "code": current_user.id,
        "link": f"https://t.me/{settings.BOT_USERNAME}?startapp=ref_{current_user.id}",
        "invited_count": count or 0,
    }


@router.get("/me/card", response_model=dict)
async def my_card(
    request: Request,
    current_user: User = Depends(get_current_user),
):
    """Returns the absolute, Telegram-fetchable URL of the user's Story card
    plus their referral link (for the shareToStory widget).

    The card_url MUST be https — Telegram's shareToStory silently refuses
    non-https media. request.base_url reports http:// behind Railway's proxy,
    so prefer the configured public base and force https as a last resort."""
    from app.routers.public import card_sig
    base = settings.api_base_url or str(request.base_url).rstrip("/")
    if base.startswith("http://"):
        base = "https://" + base[len("http://"):]
    return {
        "card_url": f"{base}/public/card.png?u={current_user.id}&sig={card_sig(current_user.id)}",
        "ref_link": f"https://t.me/{settings.BOT_USERNAME}?startapp=ref_{current_user.id}",
    }


@router.post("/me/referral", response_model=dict)
async def set_referral(
    body: ReferralIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Record who invited this user. Settable once, before finishing
    registration; only a fully-registered invitee counts toward prizes."""
    if current_user.referred_by is not None or current_user.is_registered:
        return {"ok": False, "reason": "already_set"}
    if body.code == current_user.id:
        return {"ok": False, "reason": "self"}
    referrer = await db.get(User, body.code)
    if not referrer or referrer.is_deleted:
        return {"ok": False, "reason": "invalid"}
    current_user.referred_by = body.code
    await db.commit()
    return {"ok": True}


@router.get("/leaderboard", response_model=dict)
async def leaderboard(
    period: str = "week",  # "week" | "month" | "all"
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    now = datetime.utcnow()
    since = None
    if period == "week":
        since = now - timedelta(days=7)
    elif period == "month":
        since = now - timedelta(days=30)
    q = (
        select(User.referred_by, func.count(User.id))
        .where(User.referred_by.is_not(None), User.is_registered == True, User.is_deleted == False)
    )
    if since is not None:
        q = q.where(User.created_at >= since)
    rows = (await db.execute(
        q.group_by(User.referred_by).order_by(func.count(User.id).desc()).limit(10)
    )).all()
    ids = [r[0] for r in rows]
    names: dict[int, str] = {}
    if ids:
        for u in (await db.execute(select(User).where(User.id.in_(ids)))).scalars().all():
            names[u.id] = u.display_name
    top = [
        {"rank": i + 1, "name": names.get(rid, f"User #{rid}"),
         "count": c, "is_me": rid == current_user.id}
        for i, (rid, c) in enumerate(rows)
    ]
    mq = select(func.count(User.id)).where(
        User.referred_by == current_user.id,
        User.is_registered == True, User.is_deleted == False,
    )
    if since is not None:
        mq = mq.where(User.created_at >= since)
    my = await db.scalar(mq)
    return {"top": top, "my_count": my or 0, "period": period}


@router.post("/reports", response_model=dict)
async def create_report(
    body: ReportIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.target_type not in ("user", "project"):
        raise HTTPException(status_code=400, detail="invalid target_type")
    db.add(Report(
        reporter_id=current_user.id, target_type=body.target_type,
        target_id=body.target_id, reason=(body.reason or "")[:1000],
    ))
    await db.commit()
    if settings.ADMIN_GROUP_ID:
        await send_telegram(
            settings.ADMIN_GROUP_ID,
            f"🚩 <b>Report</b>: {body.target_type} #{body.target_id}\n"
            f"by {esc(current_user.display_name)}\n{esc((body.reason or '')[:300])}",
        )
    return {"ok": True}


_last_intro: dict[int, float] = {}
_last_interest: dict[tuple[int, int], float] = {}  # (from, to) → ts


_INTEREST_MSG = {
    "en": "💜 <b>{name}</b> is interested in your profile on BFU.",
    "uz": "💜 <b>{name}</b> profilingizga qiziqish bildirdi (BFU).",
    "ru": "💜 <b>{name}</b> заинтересовался(-ась) вашим профилем в BFU.",
}

_REFERRAL_PAYOFF = {
    "en": "🎁 Someone you invited just completed registration!\nYour total invites: <b>{count}</b>. Keep sharing your link!",
    "uz": "🎁 Siz taklif qilgan inson ro‘yxatdan o‘tdi!\nJami takliflaringiz: <b>{count}</b>. Havolangizni ulashishda davom eting!",
    "ru": "🎁 Приглашённый вами человек завершил регистрацию!\nВсего приглашений: <b>{count}</b>. Продолжайте делиться ссылкой!",
}

# Fired to BOTH users when interest is reciprocated.
_MUTUAL_MSG = {
    "en": "🎉 <b>It's a match!</b>\nYou and <b>{name}</b> are both interested. Say hi 👋",
    "uz": "🎉 <b>Mos keldingiz!</b>\nSiz va <b>{name}</b> bir-biringizga qiziqdingiz. Salom yozing 👋",
    "ru": "🎉 <b>Взаимный интерес!</b>\nВы и <b>{name}</b> заинтересованы друг в друге. Напишите 👋",
}


def _connect_buttons(other: User) -> dict:
    """Inline keyboard to reach `other`: a web_app profile button (always
    works) plus a t.me chat button when they have a @username."""
    btns = [{"text": "👀 See profile",
             "web_app": {"url": f"{settings.WEBAPP_URL}?startapp=user_{other.id}"}}]
    if other.tg_username:
        btns.append({"text": "💬 Chat", "url": f"https://t.me/{other.tg_username}"})
    return {"inline_keyboard": [btns]}


@router.post("/{user_id}/intro", response_model=dict)
async def request_intro(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot intro yourself")
    now = time.monotonic()
    _li = _last_intro.get(current_user.id)
    if _li is not None and now - _li < 30:
        raise HTTPException(status_code=429, detail="Please wait before sending another intro")
    _last_intro[current_user.id] = now
    target = await db.get(User, user_id)
    if not target or target.is_deleted or not target.is_registered:
        raise HTTPException(status_code=404, detail="User not found")
    txt = f"👋 <b>{esc(current_user.display_name)}</b> wants to connect with you on BFU."
    if current_user.about:
        txt += f"\n\n<i>{esc(current_user.about[:300])}</i>"
    # "Message back" as a url button only when a t.me link exists.
    # tg://openmessage is Android-only (dead button on iOS/Desktop), so for
    # no-username requesters we send a web_app button to their profile —
    # the profile sheet handles chat with platform-aware fallbacks.
    if current_user.tg_username:
        buttons = [{"text": "💬 Message back", "url": f"https://t.me/{current_user.tg_username}"}]
    else:
        buttons = [{"text": "👀 See profile", "web_app": {
            "url": f"{settings.WEBAPP_URL}?startapp=user_{current_user.id}"}}]
    mk = {"inline_keyboard": [buttons]}
    add_notification(db, user_id, "intro", actor_id=current_user.id)
    await db.commit()
    if target.telegram_id:
        await send_telegram(target.telegram_id, txt, reply_markup=mk)
    return {"ok": True, "has_username": bool(current_user.tg_username)}


@router.post("/{user_id}/interest", response_model=dict)
async def soft_interest(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Lightweight 'I'm interested in your profile' ping (no chat infra)."""
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot mark yourself")
    now = time.monotonic()
    key = (current_user.id, user_id)
    # In-process gate (None = never; do NOT use a 0.0 sentinel, which is < now
    # and would falsely 429 the first-ever ping while the worker is up <24h).
    # Claimed synchronously BEFORE any await so a concurrent double-tap can't
    # slip a second row + duplicate DM through.
    last = _last_interest.get(key)
    if last is not None and now - last < 60 * 60 * 24:
        raise HTTPException(status_code=429, detail="Already pinged in the last 24h")
    _last_interest[key] = now
    # Authoritative 24h guard via the DB (survives worker restarts).
    recent = await db.scalar(
        select(func.count(Interest.id)).where(
            Interest.from_user_id == current_user.id,
            Interest.to_user_id == user_id,
            Interest.created_at >= datetime.utcnow() - timedelta(hours=24),
        )
    )
    if recent:
        raise HTTPException(status_code=429, detail="Already pinged in the last 24h")
    target = await db.get(User, user_id)
    if not target or target.is_deleted or not target.is_registered:
        raise HTTPException(status_code=404, detail="User not found")
    db.add(Interest(from_user_id=current_user.id, to_user_id=user_id))

    # Mutual? Did the target ever express interest in the current user?
    mutual = bool(await db.scalar(
        select(func.count(Interest.id)).where(
            Interest.from_user_id == user_id,
            Interest.to_user_id == current_user.id,
        )
    ))

    # Inbox items: a mutual match notifies both; otherwise just the target.
    if mutual:
        add_notification(db, user_id, "mutual", actor_id=current_user.id)
        add_notification(db, current_user.id, "mutual", actor_id=user_id)
    else:
        add_notification(db, user_id, "interest", actor_id=current_user.id)
    await db.commit()

    if mutual:
        # Celebrate to BOTH sides — this is the conversation-starting moment.
        if target.telegram_id:
            tl = (target.language or "en") if (target.language or "en") in _MUTUAL_MSG else "en"
            await send_telegram(
                target.telegram_id,
                _MUTUAL_MSG[tl].format(name=esc(current_user.display_name)),
                reply_markup=_connect_buttons(current_user),
            )
        if current_user.telegram_id:
            cl = (current_user.language or "en") if (current_user.language or "en") in _MUTUAL_MSG else "en"
            await send_telegram(
                current_user.telegram_id,
                _MUTUAL_MSG[cl].format(name=esc(target.display_name)),
                reply_markup=_connect_buttons(target),
            )
    elif target.telegram_id:
        lang = (target.language or "en") if (target.language or "en") in _INTEREST_MSG else "en"
        await send_telegram(
            target.telegram_id,
            _INTEREST_MSG[lang].format(name=esc(current_user.display_name)),
            reply_markup=_connect_buttons(current_user),
        )
    return {"ok": True, "mutual": mutual}


# ── Follow (app-root /follow; see follow_router above) ─────────────────────────

@follow_router.post("/follow", response_model=dict)
async def follow(
    body: FollowIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Follow a user or a project (idempotent). Following a user notifies them;
    following a project does not (would spam the founder)."""
    if body.target_type not in ("user", "project"):
        raise HTTPException(status_code=422, detail="target_type must be 'user' or 'project'")

    if body.target_type == "user":
        if body.target_id == current_user.id:
            raise HTTPException(status_code=400, detail="Cannot follow yourself")
        target = await db.get(User, body.target_id)
        if not target or target.is_deleted or not target.is_registered:
            raise HTTPException(status_code=404, detail="User not found")
    else:
        from app.models.project import Project
        proj = await db.get(Project, body.target_id)
        if not proj or proj.is_deleted or proj.is_draft:
            raise HTTPException(status_code=404, detail="Project not found")

    existing = (await db.execute(
        select(Follow).where(
            Follow.follower_id == current_user.id,
            Follow.target_type == body.target_type,
            Follow.target_id == body.target_id,
        )
    )).scalar_one_or_none()
    if not existing:
        db.add(Follow(follower_id=current_user.id, target_type=body.target_type,
                      target_id=body.target_id))
        if body.target_type == "user":
            add_notification(db, body.target_id, "new_follower", actor_id=current_user.id)
        try:
            await db.commit()
        except Exception:
            # Concurrent double-follow raced past the check; unique index caught
            # it. Same idempotent outcome.
            await db.rollback()

    count = await db.scalar(
        select(func.count(Follow.id)).where(
            Follow.target_type == body.target_type, Follow.target_id == body.target_id
        )
    ) or 0
    return {"ok": True, "following": True, "follower_count": int(count)}


@follow_router.delete("/follow", status_code=204)
async def unfollow(
    body: FollowIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove a follow (idempotent — 204 even if not following)."""
    from sqlalchemy import delete as _delete
    await db.execute(
        _delete(Follow).where(
            Follow.follower_id == current_user.id,
            Follow.target_type == body.target_type,
            Follow.target_id == body.target_id,
        )
    )
    await db.commit()


@router.post("/{user_id}/endorse", response_model=dict)
async def endorse_skill(
    user_id: int,
    body: EndorseIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Toggle an endorsement of `skill` on user `user_id`. The skill must be in
    the target's analysis.skills. Returns the new state + count for that skill."""
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot endorse yourself")
    skill = (body.skill or "").strip()
    if not skill:
        raise HTTPException(status_code=400, detail="skill required")
    target = (await db.execute(
        select(User).options(selectinload(User.analysis))
        .where(User.id == user_id, User.is_deleted == False, User.is_registered == True)
    )).scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    valid = {s.lower() for s in ((target.analysis.skills if target.analysis else None) or [])}
    if skill.lower() not in valid:
        raise HTTPException(status_code=422, detail="Skill not on this profile")

    existing = (await db.execute(
        select(Endorsement).where(
            Endorsement.endorser_id == current_user.id,
            Endorsement.target_id == user_id,
            Endorsement.skill == skill,
        )
    )).scalar_one_or_none()
    if existing:
        await db.delete(existing)
        endorsed = False
    else:
        db.add(Endorsement(endorser_id=current_user.id, target_id=user_id, skill=skill))
        endorsed = True
    await db.commit()

    count = await db.scalar(
        select(func.count(Endorsement.id)).where(
            Endorsement.target_id == user_id, Endorsement.skill == skill
        )
    ) or 0
    return {"ok": True, "endorsed": endorsed, "count": int(count)}


@router.post("/{user_id}/vouch", response_model=dict)
async def vouch_for(
    user_id: int,
    body: VouchIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create or update the caller's short testimonial for user `user_id`."""
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot vouch for yourself")
    text = (body.text or "").strip()[:280]
    if not text:
        raise HTTPException(status_code=400, detail="text required")
    target = await db.get(User, user_id)
    if not target or target.is_deleted or not target.is_registered:
        raise HTTPException(status_code=404, detail="User not found")

    existing = (await db.execute(
        select(Vouch).where(Vouch.author_id == current_user.id, Vouch.target_id == user_id)
    )).scalar_one_or_none()
    if existing:
        existing.text = text
        existing.updated_at = datetime.utcnow()
        vid = existing.id
    else:
        v = Vouch(author_id=current_user.id, target_id=user_id, text=text)
        db.add(v)
        await db.flush()
        vid = v.id
    await db.commit()
    return {"ok": True, "id": vid}


@router.delete("/{user_id}/vouch", status_code=status.HTTP_204_NO_CONTENT)
async def delete_vouch(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove the caller's vouch for user `user_id`."""
    existing = (await db.execute(
        select(Vouch).where(Vouch.author_id == current_user.id, Vouch.target_id == user_id)
    )).scalar_one_or_none()
    if not existing:
        raise HTTPException(status_code=404, detail="No vouch to delete")
    await db.delete(existing)
    await db.commit()


@router.get("/{user_id}/bio/translate", response_model=dict)
async def translate_bio(
    user_id: int,
    lang: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Translate the target user's bio into `lang` (en/uz/ru) via Claude.
    Result is cached per (user, lang) and invalidated when the source changes."""
    if lang not in {"en", "uz", "ru"}:
        raise HTTPException(status_code=400, detail="Unsupported lang")
    target = await db.get(User, user_id)
    if not target or target.is_deleted or not target.about:
        return {"translated": None}
    import hashlib
    h = hashlib.sha256(target.about.encode()).hexdigest()
    cached = (await db.execute(
        select(BioTranslation).where(
            BioTranslation.user_id == user_id, BioTranslation.lang == lang
        )
    )).scalar_one_or_none()
    if cached and cached.source_hash == h:
        return {"translated": cached.text, "cached": True}
    # Cache miss → a billable Claude call. Gate it behind the per-caller
    # cooldown (same as /me/analyze) so nobody can sweep user_ids × langs and
    # drain the AI budget. Cached hits above stay unthrottled.
    if _ai_on_cooldown(current_user.id, "translate"):
        raise HTTPException(status_code=429, detail="Please wait a moment before translating again")
    out = await translate_bio_async(target.about, lang)
    if not out:
        return {"translated": None}
    if cached:
        cached.source_hash = h
        cached.text = out
        cached.updated_at = datetime.utcnow()
    else:
        db.add(BioTranslation(user_id=user_id, lang=lang, source_hash=h, text=out))
    await db.commit()
    return {"translated": out, "cached": False}


def _flat_tags(analysis) -> list[str]:
    if not analysis:
        return []
    out: list[str] = []
    for c in ("skills", "knowledges", "interests", "preparations", "goals"):
        out.extend(getattr(analysis, c, None) or [])
    return out


@router.get("/{user_id}/icebreakers", response_model=dict)
async def icebreakers(
    user_id: int,
    lang: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """2-3 Claude-written openers grounded in shared interests, to kill the
    blank-message freeze before opening a chat. Gated by the AI cooldown."""
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot icebreak yourself")
    use_lang = lang if lang in {"en", "uz", "ru"} else (current_user.language or "en")
    target = (await db.execute(
        select(User).options(selectinload(User.analysis))
        .where(User.id == user_id, User.is_deleted == False, User.is_registered == True)
    )).scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    me = (await db.execute(
        select(User).options(selectinload(User.analysis)).where(User.id == current_user.id)
    )).scalar_one()
    if _ai_on_cooldown(current_user.id, "icebreakers"):
        raise HTTPException(status_code=429, detail="Please wait a moment")
    lines = await generate_icebreakers(
        _flat_tags(me.analysis), _flat_tags(target.analysis),
        target.display_name, use_lang,
    )
    return {"icebreakers": lines}


@router.get("/{user_id}/why-match", response_model=dict)
async def why_match(
    user_id: int,
    lang: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """One-sentence Claude explanation of why this person is worth connecting
    with, grounded in shared interests. Also returns the shared tags (free).
    AI-cooldown gated."""
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot match yourself")
    use_lang = lang if lang in {"en", "uz", "ru"} else (current_user.language or "en")
    target = (await db.execute(
        select(User).options(selectinload(User.analysis))
        .where(User.id == user_id, User.is_deleted == False, User.is_registered == True)
    )).scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    me = (await db.execute(
        select(User).options(selectinload(User.analysis)).where(User.id == current_user.id)
    )).scalar_one()
    my_tags, their_tags = _flat_tags(me.analysis), _flat_tags(target.analysis)
    shared = sorted(set(t.lower() for t in my_tags) & set(t.lower() for t in their_tags))
    if _ai_on_cooldown(current_user.id, "whymatch"):
        raise HTTPException(status_code=429, detail="Please wait a moment")
    reason = await generate_match_reason(my_tags, their_tags, target.display_name, use_lang)
    return {"reason": reason, "shared": shared}


# ── Discover ───────────────────────────────────────────────────────────────────

@router.get("/discover", response_model=list[UserPublic])
async def discover(
    skill: str | None = None,
    knowledge: str | None = None,
    region_id: int | None = None,
    open_to_work: bool | None = None,
    open_to_volunteering: bool | None = None,
    match: bool | None = None,
    gender: str | None = None,
    verified: bool | None = None,
    sort: str | None = None,  # "recent" (default) | "verified" | "name"
    limit: int = 20,
    offset: int = 0,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = (
        select(User)
        .options(selectinload(User.analysis))
        .where(User.is_deleted == False, User.is_registered == True, User.id != current_user.id)
    )
    if region_id:
        q = q.where(User.region_id == region_id)
    if open_to_work is not None:
        q = q.where(User.open_to_work == open_to_work)
    if open_to_volunteering is not None:
        q = q.where(User.open_to_volunteering == open_to_volunteering)
    if gender:
        q = q.where(User.gender == gender)
    if verified:
        q = q.where(User.checked == True)
    if sort == "name":
        q = q.order_by(User.name.asc())
    elif sort == "verified":
        q = q.order_by(User.checked.desc(), User.created_at.desc())
    else:
        q = q.order_by(User.created_at.desc())

    _CATS = ("skills", "knowledges", "interests", "preparations", "goals")

    if match and current_user.analysis:
        def _tags(a):
            s = set()
            for c in _CATS:
                s.update(x.lower() for x in (getattr(a, c, None) or []))
            return s
        my_tags = _tags(current_user.analysis)
        pool = (await db.execute(q.limit(300))).scalars().all()
        ranked = sorted(
            pool,
            key=lambda u: (len(my_tags & _tags(u.analysis)) if u.analysis else 0,
                           1 if u.checked else 0),
            reverse=True,
        )
        return ranked[offset:offset + limit]

    if skill or knowledge:
        # The skill/knowledge tags live in a JSON column, so we filter in
        # Python — but over a capped pool fetched BEFORE pagination, then
        # slice. Previously the filter ran AFTER limit/offset, so a chip
        # filter showed "No users found" while matches existed deeper.
        skill_lower = skill.lower() if skill else None
        knowledge_lower = knowledge.lower() if knowledge else None
        pool = (await db.execute(q.limit(300))).scalars().all()
        filtered = []
        for u in pool:
            if not u.analysis:
                continue
            if skill_lower and skill_lower not in [s.lower() for s in (u.analysis.skills or [])]:
                continue
            if knowledge_lower and knowledge_lower not in [k.lower() for k in (u.analysis.knowledges or [])]:
                continue
            filtered.append(u)
        return filtered[offset:offset + limit]

    q = q.limit(limit).offset(offset)
    result = await db.execute(q)
    return result.scalars().all()


# ── Public profile ─────────────────────────────────────────────────────────────

@router.get("/{user_id}", response_model=UserPublic)
async def get_user_profile(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(User)
        .options(selectinload(User.analysis))
        .where(User.id == user_id, User.is_deleted == False, User.is_registered == True)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    # Inject the richer invite-based badge (one query, only on profile view).
    invited = await db.scalar(
        select(func.count(User.id)).where(
            User.referred_by == user_id, User.is_registered == True, User.is_deleted == False
        )
    ) or 0
    out = _validate_from_user(UserPublic, user)
    if invited >= 3 and "connector" not in out.badges:
        out.badges = out.badges + ["connector"]
    extras = await _profile_extras(db, user)
    for k, v in extras.items():
        setattr(out, k, v)
    trust = await _trust_extras(db, user, current_user)
    for k, v in trust.items():
        setattr(out, k, v)
    conn = await _connection_extras(db, user, current_user)
    for k, v in conn.items():
        setattr(out, k, v)
    return out
