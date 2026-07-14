from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy import select, func, delete
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.deps import get_admin_user, get_super_admin_user
from app.database import get_db, AsyncSessionLocal
import asyncio
import csv
import io
import json
from typing import Any
from app.models.user import User, PendingLocation, Report, ErrorLog, AuditLog
from app.services.notify import esc, send_telegram, send_telegram_result
from app.services.audit import log_action
from app.services.event_forms import (
    answer_to_text, has_form, normalize_schema, validate_schema,
)
from app.models.project import Project, ProjectMember, ProjectReqSkill
from app.models.user_analysis import UserAnalysis
from app.models.region import Region, School, LearningCenter
from app.models.event import Event
from app.models.event_rsvp import EventRsvp
from app.models.partner import Partner

# These two live in sibling service modules written in parallel. Degrade to a
# no-op if they haven't landed yet so this router (and the whole test suite)
# imports regardless of build order — the real modules override on deploy.
try:
    from app.services.event_distribution import push_new_event
except ImportError:  # pragma: no cover - only until the service agent lands it
    async def push_new_event(event_id: int) -> int:  # type: ignore[misc]
        return 0
try:
    from app.services.event_ai import generate_event_report
except ImportError:  # pragma: no cover - only until the service agent lands it
    async def generate_event_report(event_id: int) -> dict:  # type: ignore[misc]
        return {"summary": "", "response_count": 0, "generated_at": None}
from datetime import datetime, timedelta
from app.schemas.event import FormResponseOut
from app.schemas.user import AdminUserOut
from app.schemas.project import AdminProjectOut
from pydantic import BaseModel

router = APIRouter(prefix="/admin", tags=["admin"])


async def _broadcast_to_group(text: str, start_param: str) -> None:
    """Post a card with a deep-link button into the global Telegram group.
    Approval/new-event become distribution: the app feeds the groups, the
    groups feed the app. Best-effort — never raises into the request."""
    if not settings.TG_GLOBAL_GROUP_ID:
        return
    url = f"https://t.me/{settings.BOT_USERNAME}?startapp={start_param}"
    await send_telegram(
        settings.TG_GLOBAL_GROUP_ID, text,
        reply_markup={"inline_keyboard": [[{"text": "🚀 Open in BFU", "url": url}]]},
    )


class BroadcastBody(BaseModel):
    text: str
    region_id: int | None = None
    verified_only: bool = False
    dry_run: bool = False


def _broadcast_query(body: BroadcastBody):
    q = select(User).where(
        User.is_deleted == False, User.banned == False,
        User.is_registered == True, User.telegram_id.is_not(None),
    )
    if body.region_id:
        q = q.where(User.region_id == body.region_id)
    if body.verified_only:
        q = q.where(User.checked == True)
    return q


async def _run_broadcast(recipients: list[tuple[int, str]], text: str, admin_id: int) -> None:
    """Background sender. recipients = [(telegram_id, lang), ...]. Paces at
    ~25/s (Telegram limit) and DMs the initiator a summary at the end."""
    body_html = esc(text)
    sent = 0
    cta = {"inline_keyboard": [[{"text": "🚀 Open BFU",
            "web_app": {"url": settings.WEBAPP_URL}}]]}
    for tg_id, _lang in recipients:
        if await send_telegram(tg_id, body_html, reply_markup=cta):
            sent += 1
        await asyncio.sleep(0.04)
    # Report completion to the initiator (best effort).
    try:
        async with AsyncSessionLocal() as s:
            admin = await s.get(User, admin_id)
            if admin and admin.telegram_id:
                await send_telegram(
                    admin.telegram_id,
                    f"📣 Broadcast finished: delivered to <b>{sent}</b> / {len(recipients)} members.",
                )
    except Exception:
        pass


@router.post("/broadcast")
async def broadcast(
    body: BroadcastBody,
    super_admin: User = Depends(get_super_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Super-admin announcement to all (optionally filtered) members.
    Two-step: call with dry_run=true to get the recipient count, then again
    with dry_run=false to actually send (runs in the background, paced)."""
    text = (body.text or "").strip()
    if not text:
        raise HTTPException(400, "Message is empty")
    if len(text) > 3500:
        raise HTTPException(400, "Message too long (max 3500 chars)")

    if body.dry_run:
        count = await db.scalar(
            select(func.count()).select_from(_broadcast_query(body).subquery())
        ) or 0
        return {"dry_run": True, "count": count}

    rows = (await db.execute(_broadcast_query(body))).scalars().all()
    recipients = [(u.telegram_id, u.language or "en") for u in rows if u.telegram_id]
    await log_action(db, super_admin.id, "broadcast", None, None,
                     {"count": len(recipients), "region_id": body.region_id,
                      "verified_only": body.verified_only})
    await db.commit()
    # Fire-and-forget so the request returns immediately (10k msgs ≈ minutes).
    asyncio.create_task(_run_broadcast(recipients, text, super_admin.id))
    return {"queued": len(recipients)}


class StatsOut(BaseModel):
    users: int
    projects: int
    regions: int
    schools: int
    learning_centers: int

class UpdateGroupConfig(BaseModel):
    group_id: int | None = None
    group_link: str | None = None
    name: str | None = None
    region_id: int | None = None
    latitude: float | None = None
    longitude: float | None = None

class CreateLocation(BaseModel):
    name: str
    region_id: int
    group_id: int | None = None
    group_link: str | None = None
    latitude: float | None = None
    longitude: float | None = None

class UpdateRoleConfig(BaseModel):
    role: str


DENIABLE_FIELDS = {"name", "surname", "phone_number", "about", "birth_year", "gender", "tg_username"}


class DenyBody(BaseModel):
    fields: list[str]
    note: str | None = None


_DENY_NOTIFY = {
    "en": "⚠️ Your BFU profile needs corrections in: <b>{fields}</b>.\n\n{note}\n\nTap below to fix it.",
    "uz": "⚠️ Profilingizda quyidagi maydonlarni to‘g‘rilash kerak: <b>{fields}</b>.\n\n{note}\n\nTuzatish uchun tugmani bosing.",
    "ru": "⚠️ В вашем профиле нужно исправить: <b>{fields}</b>.\n\n{note}\n\nНажмите, чтобы исправить.",
}
_VERIFY_NOTIFY = {
    "en": "✅ Your BFU profile has been verified. Welcome!",
    "uz": "✅ Profilingiz tasdiqlandi. Xush kelibsiz!",
    "ru": "✅ Ваш профиль подтверждён. Добро пожаловать!",
}

# ── Stats ────────────────────────────────────────────────────────────────────

@router.get("/stats", response_model=StatsOut)
async def get_stats(
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    users = await db.scalar(select(func.count(User.id)))
    projects = await db.scalar(select(func.count(Project.id)))
    regions = await db.scalar(select(func.count(Region.id)))
    schools = await db.scalar(select(func.count(School.id)))
    lcs = await db.scalar(select(func.count(LearningCenter.id)))
    
    return StatsOut(
        users=users or 0,
        projects=projects or 0,
        regions=regions or 0,
        schools=schools or 0,
        learning_centers=lcs or 0,
    )

# ── Analytics (read-only aggregates) ──────────────────────────────────────────

@router.get("/analytics/retention", response_model=dict)
async def analytics_retention(
    active_days: int = Query(30),
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Cohort retention: registered users grouped by signup month (created_at),
    with how many are still 'active' (last_seen_at within `active_days` of now).
    Month bucketing is done in Python so prod (Postgres) and tests (SQLite) match.
    Newest month first; up to 24 months then an 'older' rollup."""
    active_days = max(1, min(int(active_days), 365))
    now = datetime.utcnow()
    cutoff = now - timedelta(days=active_days)

    rows = (await db.execute(
        select(User.created_at, User.last_seen_at).where(
            User.is_registered == True, User.is_deleted == False,
            User.created_at.is_not(None),
        )
    )).all()

    # month "YYYY-MM" -> [total, active]
    buckets: dict[str, list[int]] = {}
    for created_at, last_seen_at in rows:
        key = created_at.strftime("%Y-%m")
        b = buckets.setdefault(key, [0, 0])
        b[0] += 1
        if last_seen_at is not None and last_seen_at >= cutoff:
            b[1] += 1

    months_desc = sorted(buckets.keys(), reverse=True)
    recent = months_desc[:24]
    older = months_desc[24:]

    cohorts = []
    for m in recent:
        total, active = buckets[m]
        pct = round(active / total * 100) if total else 0
        cohorts.append({"month": m, "total": total, "active": active,
                        "retention_pct": pct})
    if older:
        o_total = sum(buckets[m][0] for m in older)
        o_active = sum(buckets[m][1] for m in older)
        cohorts.append({
            "month": "older", "total": o_total, "active": o_active,
            "retention_pct": round(o_active / o_total * 100) if o_total else 0,
        })

    return {"active_days": active_days, "cohorts": cohorts}


@router.get("/analytics/regions", response_model=dict)
async def analytics_regions(
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Region heatmap: members + projects + open (active+hiring) projects per
    viloyat. Projects are attributed to the creator's region (mirrors the public
    /regions logic). Auth-gated admin data view — not the cached public version."""
    regions = (await db.execute(
        select(Region).where(Region.is_deleted == False).order_by(Region.id)
    )).scalars().all()

    # members per region — one grouped query
    member_rows = (await db.execute(
        select(User.region_id, func.count(User.id))
        .where(User.is_registered == True, User.is_deleted == False,
               User.region_id.is_not(None))
        .group_by(User.region_id)
    )).all()
    members_by_region = {rid: int(cnt) for rid, cnt in member_rows}

    # live projects per creator-region (approved, non-draft, non-deleted)
    proj_rows = (await db.execute(
        select(User.region_id, func.count(Project.id))
        .join(Project, Project.creator_id == User.id)
        .where(Project.is_deleted == False, Project.is_approved == True,
               Project.is_draft == False, User.region_id.is_not(None))
        .group_by(User.region_id)
    )).all()
    projects_by_region = {rid: int(cnt) for rid, cnt in proj_rows}

    # of those, the ones that are active AND hiring (open capacity proxy)
    open_rows = (await db.execute(
        select(User.region_id, func.count(Project.id))
        .join(Project, Project.creator_id == User.id)
        .where(Project.is_deleted == False, Project.is_approved == True,
               Project.is_draft == False, Project.is_active == True,
               Project.is_hiring == True, User.region_id.is_not(None))
        .group_by(User.region_id)
    )).all()
    open_by_region = {rid: int(cnt) for rid, cnt in open_rows}

    out = []
    for r in regions:
        out.append({
            "id": r.id, "name_en": r.name_en, "name_uz": r.name_uz, "name_ru": r.name_ru,
            "members": members_by_region.get(r.id, 0),
            "projects": projects_by_region.get(r.id, 0),
            "open_projects": open_by_region.get(r.id, 0),
        })
    out.sort(key=lambda x: (-x["members"], x["id"]))

    totals = {
        "members": sum(x["members"] for x in out),
        "projects": sum(x["projects"] for x in out),
        "open_projects": sum(x["open_projects"] for x in out),
    }
    return {"totals": totals, "regions": out}


@router.get("/analytics/skill-gap", response_model=dict)
async def analytics_skill_gap(
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Demand vs supply per skill. Demand = distinct LIVE projects (approved,
    non-draft, non-deleted) requiring the skill. Supply = distinct registered,
    non-deleted members whose analysis.skills lists it. Case-insensitive; the
    canonical display casing is the most common original. Sorted by gap desc."""

    # ── Demand: GROUP BY skill_name over live projects. ──
    demand_rows = (await db.execute(
        select(ProjectReqSkill.skill_name, func.count(ProjectReqSkill.project_id))
        .join(Project, Project.id == ProjectReqSkill.project_id)
        .where(Project.is_deleted == False, Project.is_approved == True,
               Project.is_draft == False)
        .group_by(ProjectReqSkill.skill_name)
    )).all()

    # ── Supply: tally analysis.skills JSON in Python (portable across DBs). ──
    supply_rows = (await db.execute(
        select(UserAnalysis.skills)
        .join(User, User.id == UserAnalysis.user_id)
        .where(User.is_registered == True, User.is_deleted == False)
    )).all()

    # Canonical-casing map: lower -> {"display": original, "votes": Counter}
    from collections import Counter
    display_votes: dict[str, Counter] = {}
    demand: dict[str, int] = {}
    supply: dict[str, int] = {}

    def _note(raw: str) -> str | None:
        s = (raw or "").strip()
        if not s:
            return None
        key = s.lower()
        display_votes.setdefault(key, Counter())[s] += 1
        return key

    for name, cnt in demand_rows:
        key = _note(name)
        if key is None:
            continue
        demand[key] = demand.get(key, 0) + int(cnt)

    for (skills,) in supply_rows:
        for raw in (skills or []):
            key = _note(raw)
            if key is None:
                continue
            supply[key] = supply.get(key, 0) + 1  # one member contributes 1 per skill

    out = []
    for key in set(demand) | set(supply):
        # canonical display = most common original casing, ties alphabetical
        votes = display_votes.get(key)
        display = (min(sorted(votes.items()), key=lambda kv: (-kv[1], kv[0]))[0]
                   if votes else key)
        d = demand.get(key, 0)
        s = supply.get(key, 0)
        out.append({"skill": display, "demand": d, "supply": s, "gap": d - s})

    out.sort(key=lambda r: (-r["gap"], -r["demand"], r["skill"].lower()))
    out = out[:100]
    return {"skills": out}

# ── Users ────────────────────────────────────────────────────────────────────

@router.get("/users", response_model=list[AdminUserOut])
async def list_users(
    skip: int = 0, limit: int = 50,
    search: str | None = None,
    status: str | None = None,  # all(default) | registered | pending | deleted | banned
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """List users for the admin panel. `status` narrows by lifecycle state so
    pending shells (started sign-up, never finished — NOT in Discover) don't get
    mistaken for live members. Every AdminUserOut carries is_registered /
    is_deleted / banned so the UI can badge each row."""
    limit = max(1, min(limit, 200))
    skip = max(0, skip)
    q = select(User).order_by(User.id.desc())
    if search:
        search_term = f"%{search}%"
        q = q.where(User.name.ilike(search_term) | User.surname.ilike(search_term) | User.tg_username.ilike(search_term))
    if status == "registered":
        q = q.where(User.is_registered == True, User.is_deleted == False)  # noqa: E712 — exactly what Discover shows
    elif status == "pending":
        q = q.where(User.is_registered == False, User.is_deleted == False)  # noqa: E712
    elif status == "deleted":
        q = q.where(User.is_deleted == True)  # noqa: E712
    elif status == "banned":
        q = q.where(User.banned == True)  # noqa: E712

    q = q.offset(skip).limit(limit)
    res = await db.execute(q)
    return res.scalars().all()


@router.get("/users/{user_id}/full", response_model=dict)
async def user_full(
    user_id: int,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """EVERY column of one user for the admin panel's "Show all fields" reveal —
    including fields the list view hides (phone, flags, timestamps, denied_note,
    raw ids). Admin-gated; returns a flat {field: value} map (JSON-encoded)."""
    from sqlalchemy import inspect as sa_inspect
    from fastapi.encoders import jsonable_encoder
    u = await db.get(User, user_id)
    if not u:
        raise HTTPException(404, "User not found")
    data = {c.key: getattr(u, c.key) for c in sa_inspect(User).mapper.column_attrs}
    return jsonable_encoder(data)


# Localized "you started the bot but never finished sign-up — do it in the app"
# nudge. web_app button opens the Mini App, where an unregistered user lands on
# the registration flow.
_REG_NUDGE = {
    "uz": ("Assalomu alaykum! 👋\n\nSiz BFU botini <b>ishga tushirdingiz</b>, lekin "
           "ro‘yxatdan o‘tishni yakunlamadingiz. Ilovada profilingizni to‘ldiring — "
           "shundan so‘ng loyihalar, hammuassislar, mentorlar va imkoniyatlar siz uchun "
           "ochiladi 👇", "🚀 Ro‘yxatdan o‘tishni yakunlash"),
    "ru": ("Здравствуйте! 👋\n\nВы <b>запустили</b> бота BFU, но не завершили регистрацию. "
           "Заполните профиль в приложении — и вам откроются проекты, со-основатели, "
           "менторы и возможности 👇", "🚀 Завершить регистрацию"),
    "en": ("Hi! 👋\n\nYou <b>started</b> the BFU bot but didn’t finish registering. "
           "Complete your profile in the app — then projects, co-founders, mentors and "
           "opportunities open up for you 👇", "🚀 Finish registration"),
}


@router.post("/users/{user_id}/nudge-register")
async def nudge_register(
    user_id: int,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """DM a user a 'finish your registration' nudge with a button that opens the
    Mini App (where an unregistered user is routed to the sign-up flow). For the
    people who /start-ed the bot but never completed sign-up."""
    u = await db.get(User, user_id)
    if not u:
        raise HTTPException(404, "User not found")
    if not u.telegram_id:
        raise HTTPException(400, "User has no Telegram id to message")
    res = await _send_reg_nudge(u)
    # Self-healing reachability: a delivered nudge proves the bot can DM them;
    # an "unreachable" rejection (403/blocked) proves it can't. A transient
    # failure (429/5xx/timeout) leaves the flag untouched.
    if res.ok and not u.can_message:
        u.can_message = True
    elif res.unreachable and u.can_message:
        u.can_message = False
    await log_action(db, admin.id, "user.nudge_register", "user", user_id,
                     {"ok": res.ok, "status": res.status})
    await db.commit()
    reason = None
    if not res.ok:
        reason = "unreachable" if res.unreachable else "error"
    return {"ok": res.ok, "reason": reason, "can_message": u.can_message}


async def _send_reg_nudge(u: User):
    """Send the localized 'finish registration' DM to one user, returning the
    detailed SendResult. Shared by the single- and bulk-nudge endpoints."""
    lang = (u.language or "uz") if (u.language or "uz") in _REG_NUDGE else "uz"
    text, btn = _REG_NUDGE[lang]
    return await send_telegram_result(u.telegram_id, text, reply_markup={"inline_keyboard": [[
        {"text": btn, "web_app": {"url": settings.WEBAPP_URL}},
    ]]})


@router.post("/users/nudge-all-pending")
async def nudge_all_pending(
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Bulk 'finish registration' reminder to EVERY reachable pending user (not
    just the current admin page). Telegram forbids DMing users who never started
    the bot / granted write access, so we only target can_message=True rows and
    report how many were skipped as unreachable. Reachability flags self-heal
    from each send outcome. Rate-limited spacing keeps us under Telegram flood."""
    rows = (await db.execute(
        select(User).where(
            User.is_registered.is_(False),
            User.is_deleted.is_(False),
            User.banned.is_(False),
            User.telegram_id.isnot(None),
        )
    )).scalars().all()
    reachable = [u for u in rows if u.can_message]
    unreachable = len(rows) - len(reachable)
    sent = 0
    failed = 0
    for u in reachable:
        res = await _send_reg_nudge(u)
        if res.ok:
            sent += 1
        else:
            failed += 1
            if res.unreachable:
                u.can_message = False  # self-heal: they blocked / never really opened
        await asyncio.sleep(0.05)  # ~20 msg/s, well under Telegram's flood limit
    await log_action(db, admin.id, "user.nudge_all_pending", "user", None,
                     {"pending": len(rows), "sent": sent, "failed": failed,
                      "unreachable_skipped": unreachable})
    await db.commit()
    return {"pending": len(rows), "sent": sent, "failed": failed,
            "unreachable_skipped": unreachable}

def _guard_privileged_target(actor: User, target: User) -> None:
    """A regular admin must not moderate a super-admin (the founder). Only another
    super-admin can. Blocks a rogue/compromised admin from banning the owner."""
    if target.role == "super_admin" and actor.role != "super_admin":
        raise HTTPException(status_code=403, detail="Cannot act on a super-admin")


@router.patch("/users/{user_id}/toggle-check")
async def toggle_user_check(
    user_id: int,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    _guard_privileged_target(admin, user)
    user.checked = not user.checked
    await log_action(db, admin.id, "user.toggle_check", "user", user_id, {"checked": user.checked})
    await db.commit()
    return {"checked": user.checked}

@router.post("/users/{user_id}/deny")
async def deny_user_fields(
    user_id: int,
    body: DenyBody,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    bad = [f for f in body.fields if f not in DENIABLE_FIELDS]
    if bad:
        raise HTTPException(400, f"Cannot deny: {bad}")
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    _guard_privileged_target(admin, user)
    user.denied_fields = json.dumps(sorted(set(body.fields)))
    user.denied_note = (body.note or "")[:500] or None
    user.checked = False
    await log_action(db, admin.id, "user.deny", "user", user_id, {"fields": body.fields})
    await db.commit()
    if user.telegram_id:
        lang = (user.language or "en") if (user.language or "en") in _DENY_NOTIFY else "en"
        await send_telegram(
            user.telegram_id,
            _DENY_NOTIFY[lang].format(fields=", ".join(body.fields), note=esc(user.denied_note or "")),
            reply_markup={"inline_keyboard": [[{
                "text": "✏️ Open BFU", "web_app": {"url": settings.WEBAPP_URL},
            }]]},
        )
    return {"detail": "denied", "fields": body.fields}


@router.post("/users/{user_id}/verify")
async def verify_user(
    user_id: int,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    user.checked = True
    user.denied_fields = None
    user.denied_note = None
    await log_action(db, admin.id, "user.verify", "user", user_id)
    await db.commit()
    if user.telegram_id:
        lang = (user.language or "en") if (user.language or "en") in _VERIFY_NOTIFY else "en"
        await send_telegram(user.telegram_id, _VERIFY_NOTIFY[lang])
    return {"detail": "verified"}


@router.get("/errors")
async def list_errors(
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(select(ErrorLog).order_by(ErrorLog.id.desc()).limit(50))
    return [
        {"id": e.id, "path": e.path, "method": e.method, "message": e.message,
         "created_at": e.created_at}
        for e in res.scalars().all()
    ]


@router.patch("/projects/{project_id}/pin")
async def pin_project(
    project_id: int,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    p = await db.get(Project, project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    p.is_pinned = not p.is_pinned
    await log_action(db, admin.id, "project.pin", "project", project_id, {"is_pinned": p.is_pinned})
    await db.commit()
    return {"is_pinned": p.is_pinned}


@router.patch("/users/{user_id}/role")
async def update_user_role(
    user_id: int,
    body: UpdateRoleConfig,
    super_admin: User = Depends(get_super_admin_user),
    db: AsyncSession = Depends(get_db)
):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    if body.role not in ("user", "admin", "super_admin"):
        raise HTTPException(400, "Invalid role")
    user.role = body.role
    await log_action(db, super_admin.id, "user.role", "user", user_id, {"role": body.role})
    await db.commit()
    return {"role": user.role}

@router.delete("/users/{user_id}")
async def soft_delete_user(
    user_id: int,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    _guard_privileged_target(admin, user)
    user.is_deleted = True
    # Admin removal is a ban: without this flag /auth/telegram auto-restores
    # the user the next time they open the Mini App.
    user.banned = True
    await log_action(db, admin.id, "user.ban", "user", user_id)
    await db.commit()
    return {"detail": "User banned"}


@router.post("/users/{user_id}/restore")
async def restore_user(
    user_id: int,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    user.banned = False
    user.is_deleted = False
    await log_action(db, admin.id, "user.restore", "user", user_id)
    await db.commit()
    return {"detail": "User restored"}

@router.delete("/users/{user_id}/hard")
async def hard_delete_user(
    user_id: int,
    super_admin: User = Depends(get_super_admin_user),
    db: AsyncSession = Depends(get_db)
):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    # Refuse if the user owns projects: creator_id is NOT NULL, so a bare
    # ORM delete would try to null it and 500 with IntegrityError. Ban
    # (soft-delete) instead, or remove their projects first.
    owns = await db.scalar(
        select(func.count(Project.id)).where(Project.creator_id == user_id)
    )
    if owns:
        raise HTTPException(
            409,
            "User owns projects — ban them instead, or delete their projects first.",
        )
    await log_action(db, super_admin.id, "user.hard_delete", "user", user_id)
    await db.delete(user)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(409, "User still referenced by other records; ban instead.")
    return {"detail": "User hard deleted"}

# The partner lead-pipeline stages a registrant can be advanced through. The
# admin PATCH endpoint is the single validation gate (422 on anything else).
LEAD_STATUSES = {"registered", "showed", "scored", "called", "enrolled", "no_show"}

# Retain fire-and-forget event-push tasks so the loop can't GC them mid-run.
_event_push_tasks: set = set()


def _fire_event_push(event_id: int) -> None:
    """Bot-DM matching users about a newly live event. Fire-and-forget: the
    service opens its own session and never raises, so the request never waits
    on (or fails because of) the fan-out."""
    t = asyncio.create_task(push_new_event(event_id))
    _event_push_tasks.add(t)
    t.add_done_callback(_event_push_tasks.discard)


class EventBody(BaseModel):
    # type/title are optional at the schema level so a PATCH can send *only*
    # form_schema; POST /admin/events enforces both below (400 otherwise).
    type: str | None = None
    title: str | None = None
    description: str | None = None
    link: str | None = None
    cover_url: str | None = None
    deadline: datetime | None = None       # signup cutoff
    starts_at: datetime | None = None      # when the event actually happens
    region_id: int | None = None
    partner_id: int | None = None
    # The registration form's question list (see app.services.event_forms).
    # null/[] = no form → plain one-click RSVP.
    form_schema: list[dict] | None = None


class EventOut(BaseModel):
    id: int
    type: str
    title: str
    description: str | None = None
    link: str | None = None
    cover_url: str | None = None
    deadline: datetime | None = None
    starts_at: datetime | None = None
    region_id: int | None = None
    partner_id: int | None = None
    is_approved: bool = True
    is_deleted: bool
    form_schema: list[dict] | None = None
    has_form: bool = False
    model_config = {"from_attributes": True}


class ResponseUpdateBody(BaseModel):
    """Admin edit to one registrant's lead pipeline row."""
    lead_status: str | None = None
    score: int | None = None


def _checked_schema(raw: Any) -> list[dict] | None:
    """Validate an admin-supplied question list with the ONE rulebook
    (app.services.event_forms) and return the normalized blob to store.
    422s with {question_key: reason} so the panel can point at the bad row."""
    errors = validate_schema(raw)
    if errors:
        raise HTTPException(
            status_code=422,
            detail={"message": "Invalid form_schema", "errors": errors},
        )
    return normalize_schema(raw)


@router.get("/events", response_model=list[EventOut])
async def admin_list_events(admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    # Pending (partner-submitted) events float to the top for the queue.
    # Exclude soft-deleted rows (mirrors every sibling admin list endpoint) —
    # otherwise a deleted event resurrects on the next refresh.
    res = await db.execute(
        select(Event).where(Event.is_deleted == False)
        .order_by(Event.is_approved.asc(), Event.id.desc()).limit(200)
    )
    return res.scalars().all()


@router.patch("/events/{event_id}/approve", response_model=EventOut)
async def admin_approve_event(event_id: int, admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    e = await db.get(Event, event_id)
    if not e:
        raise HTTPException(404, "Event not found")
    was = e.is_approved
    e.is_approved = True
    await log_action(db, admin.id, "event.approve", "event", event_id)
    await db.commit(); await db.refresh(e)
    if not was:
        # Only the false→true transition: an already-approved event isn't
        # re-pushed. Targeted DM fan-out + the global-group card fire once here.
        _fire_event_push(e.id)
        deadline = f"\n⏰ {e.deadline:%d %b %Y}" if e.deadline else ""
        await _broadcast_to_group(
            f"📅 <b>New {esc(e.type)}</b>: {esc(e.title)}"
            + (f"\n{esc((e.description or '')[:200])}" if e.description else "") + deadline,
            f"event_{e.id}",
        )
    return e


@router.post("/events", response_model=EventOut, status_code=status.HTTP_201_CREATED)
async def admin_create_event(body: EventBody, admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    if not body.title or not body.title.strip():
        raise HTTPException(400, "Title required")
    if not body.type or not body.type.strip():
        raise HTTPException(400, "Type required")
    e = Event(
        type=body.type, title=body.title.strip(), description=body.description,
        link=body.link, cover_url=body.cover_url, deadline=body.deadline,
        starts_at=body.starts_at,
        region_id=body.region_id, created_by=admin.id,
        partner_id=body.partner_id, is_approved=True,
        form_schema=_checked_schema(body.form_schema),
    )
    db.add(e); await db.commit(); await db.refresh(e)
    # Targeted DM fan-out to matching users (fires exactly once, on create).
    _fire_event_push(e.id)
    # Announce the new event to the global group with a deep link.
    deadline = f"\n⏰ {e.deadline:%d %b %Y}" if e.deadline else ""
    await _broadcast_to_group(
        f"📅 <b>New {esc(e.type)}</b>: {esc(e.title)}"
        + (f"\n{esc((e.description or '')[:200])}" if e.description else "")
        + deadline,
        f"event_{e.id}",
    )
    return e


# ── Partner organisations ─────────────────────────────────────────────────────

class PartnerBody(BaseModel):
    name: str
    about: str | None = None
    website: str | None = None
    logo_url: str | None = None
    region_id: int | None = None
    owner_user_id: int | None = None
    verified: bool = True


class PartnerOut(BaseModel):
    id: int
    name: str
    about: str | None = None
    website: str | None = None
    logo_url: str | None = None
    region_id: int | None = None
    owner_user_id: int | None = None
    verified: bool
    is_deleted: bool
    model_config = {"from_attributes": True}


@router.get("/partners", response_model=list[PartnerOut])
async def admin_list_partners(admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    res = await db.execute(
        select(Partner).where(Partner.is_deleted == False).order_by(Partner.id.desc())
    )
    return res.scalars().all()


@router.post("/partners", response_model=PartnerOut, status_code=status.HTTP_201_CREATED)
async def admin_create_partner(body: PartnerBody, admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    if not body.name.strip():
        raise HTTPException(400, "Name required")
    p = Partner(
        name=body.name.strip(), about=body.about, website=body.website,
        logo_url=body.logo_url, region_id=body.region_id,
        owner_user_id=body.owner_user_id, verified=body.verified,
    )
    db.add(p)
    await log_action(db, admin.id, "partner.create", "partner", None, {"name": body.name})
    await db.commit(); await db.refresh(p)
    return p


@router.patch("/partners/{partner_id}", response_model=PartnerOut)
async def admin_update_partner(partner_id: int, body: PartnerBody, admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    p = await db.get(Partner, partner_id)
    if not p or p.is_deleted:
        raise HTTPException(404, "Partner not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(p, k, v)
    await db.commit(); await db.refresh(p)
    return p


@router.delete("/partners/{partner_id}")
async def admin_delete_partner(partner_id: int, admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    p = await db.get(Partner, partner_id)
    if not p:
        raise HTTPException(404, "Partner not found")
    p.is_deleted = True
    await log_action(db, admin.id, "partner.delete", "partner", partner_id)
    await db.commit()
    return {"detail": "Partner deleted"}


@router.patch("/events/{event_id}", response_model=EventOut)
async def admin_update_event(event_id: int, body: EventBody,
                              admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    e = await db.get(Event, event_id)
    if not e: raise HTTPException(404, "Event not found")
    patch = body.model_dump(exclude_unset=True)
    # The founder edits the questions here — they are data, so a form change is
    # a PATCH, never a deploy. Validated by the same rulebook the RSVP path uses.
    if "form_schema" in patch:
        patch["form_schema"] = _checked_schema(patch["form_schema"])
    for k, v in patch.items():
        setattr(e, k, v)
    await db.commit(); await db.refresh(e)
    return e


@router.get("/events/{event_id}/responses", response_model=list[FormResponseOut])
async def admin_event_responses(
    event_id: int,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Everyone who registered for this event, with their form answers."""
    e = await db.get(Event, event_id)
    if not e:
        raise HTTPException(404, "Event not found")
    rows = await _event_responses(db, event_id)
    return [
        FormResponseOut(
            user_id=u.id, display_name=u.display_name, tg_username=u.tg_username,
            phone_number=u.phone_number, submitted_at=r.created_at, answers=r.answers,
            lead_status=r.lead_status, score=r.score,
        )
        for r, u in rows
    ]


async def _event_responses(db: AsyncSession, event_id: int) -> list[tuple[EventRsvp, User]]:
    """(rsvp, user) pairs for the 'going' registrations, oldest first."""
    return list((await db.execute(
        select(EventRsvp, User)
        .join(User, User.id == EventRsvp.user_id)
        .where(EventRsvp.event_id == event_id, EventRsvp.status == "going")
        .order_by(EventRsvp.created_at.asc(), EventRsvp.id.asc())
    )).all())


@router.get("/events/{event_id}/responses.csv")
async def admin_event_responses_csv(
    event_id: int,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """The same table as a spreadsheet: one column per question (header = the
    question's LABEL, in schema order). UTF-8 **with BOM** so Excel renders
    Uzbek/Cyrillic text instead of mojibake."""
    e = await db.get(Event, event_id)
    if not e:
        raise HTTPException(404, "Event not found")
    schema = e.form_schema if has_form(e.form_schema) else []
    rows = await _event_responses(db, event_id)

    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\r\n")
    w.writerow(
        ["user_id", "name", "username", "phone", "submitted_at", "lead_status", "score"]
        + [q.get("label", q.get("key", "")) for q in schema]
    )
    for r, u in rows:
        answers = r.answers or {}
        w.writerow(
            [
                u.id,
                u.display_name,
                f"@{u.tg_username}" if u.tg_username else "",
                u.phone_number or "",
                r.created_at.isoformat(sep=" ", timespec="seconds") if r.created_at else "",
                r.lead_status,
                "" if r.score is None else r.score,
            ]
            + [answer_to_text(answers.get(q.get("key"))) for q in schema]
        )

    body = "﻿" + buf.getvalue()   # BOM first -> Excel-safe UTF-8
    filename = f"event-{event_id}-responses.csv"
    return Response(
        content=body.encode("utf-8"),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.patch("/events/{event_id}/responses/{user_id}", response_model=FormResponseOut)
async def admin_update_event_response(
    event_id: int,
    user_id: int,
    body: ResponseUpdateBody,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Advance one registrant through the partner lead pipeline (lead_status)
    and/or record a number for them (score). Both fields are optional — a PATCH
    can set just one. An unknown lead_status is a 422 and writes nothing."""
    row = (await db.execute(select(EventRsvp).where(
        EventRsvp.event_id == event_id, EventRsvp.user_id == user_id,
    ))).scalar_one_or_none()
    if not row:
        raise HTTPException(404, "Registration not found")
    patch = body.model_dump(exclude_unset=True)
    if "lead_status" in patch and patch["lead_status"] is not None:
        if patch["lead_status"] not in LEAD_STATUSES:
            raise HTTPException(
                status_code=422,
                detail={"message": "Invalid lead_status",
                        "allowed": sorted(LEAD_STATUSES)},
            )
        row.lead_status = patch["lead_status"]
    if "score" in patch:
        row.score = patch["score"]
    await log_action(db, admin.id, "event.response.update", "event", event_id,
                     {"user_id": user_id, **patch})
    await db.commit()
    u = await db.get(User, user_id)
    return FormResponseOut(
        user_id=user_id, display_name=u.display_name if u else str(user_id),
        tg_username=u.tg_username if u else None,
        phone_number=u.phone_number if u else None,
        submitted_at=row.created_at, answers=row.answers,
        lead_status=row.lead_status, score=row.score,
    )


@router.get("/events/{event_id}/ai-report")
async def admin_event_ai_report(
    event_id: int,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """One-tap AI summary of every registration's answers. The service opens its
    own session, makes at most one Claude call, and never raises (plain
    aggregate when there's no key / no responses)."""
    e = await db.get(Event, event_id)
    if not e:
        raise HTTPException(404, "Event not found")
    return await generate_event_report(event_id)


@router.delete("/events/{event_id}")
async def admin_delete_event(event_id: int, admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    e = await db.get(Event, event_id)
    if not e: raise HTTPException(404, "Event not found")
    e.is_deleted = True
    await db.commit()
    return {"detail": "Event deleted"}


class ReportOut(BaseModel):
    id: int
    reporter_id: int
    target_type: str
    target_id: int
    reason: str | None = None
    resolved: bool
    model_config = {"from_attributes": True}


@router.get("/reports", response_model=list[ReportOut])
async def list_reports(
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(select(Report).order_by(Report.id.desc()).limit(100))
    return res.scalars().all()


@router.patch("/reports/{report_id}/resolve")
async def resolve_report(
    report_id: int,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    r = await db.get(Report, report_id)
    if not r:
        raise HTTPException(404, "Report not found")
    r.resolved = not r.resolved
    await log_action(db, admin.id, "report.resolve", "report", report_id, {"resolved": r.resolved})
    await db.commit()
    return {"resolved": r.resolved}


# ── Projects ─────────────────────────────────────────────────────────────────

@router.get("/projects", response_model=list[AdminProjectOut])
async def list_projects(
    skip: int = 0, limit: int = 50,
    search: str | None = None,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    q = select(Project).order_by(Project.id.desc())
    if search:
        q = q.where(Project.name.ilike(f"%{search}%"))
    
    q = q.offset(skip).limit(limit)
    res = await db.execute(q)
    return res.scalars().all()

@router.patch("/projects/{project_id}/approve")
async def approve_project(
    project_id: int,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    p = await db.get(Project, project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    was_approved = p.is_approved
    p.is_approved = not p.is_approved
    await log_action(db, admin.id, "project.approve", "project", project_id, {"is_approved": p.is_approved})
    await db.commit()
    # On first approval, announce it to the global group with a deep link.
    if p.is_approved and not was_approved:
        kind = "Startup" if p.type == "startup" else "Volunteer project"
        await _broadcast_to_group(
            f"✨ <b>New {kind}</b>\n<b>{esc(p.name)}</b>"
            + (f"\n{esc((p.goal or '')[:160])}" if p.goal else ""),
            f"project_{p.id}",
        )
    return {"is_approved": p.is_approved}

@router.delete("/projects/{project_id}")
async def soft_delete_project(
    project_id: int,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    p = await db.get(Project, project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    p.is_deleted = True
    await log_action(db, admin.id, "project.delete", "project", project_id)
    await db.commit()
    return {"detail": "Project soft deleted"}

@router.delete("/projects/{project_id}/hard")
async def hard_delete_project(
    project_id: int,
    super_admin: User = Depends(get_super_admin_user),
    db: AsyncSession = Depends(get_db)
):
    p = await db.get(Project, project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    await log_action(db, super_admin.id, "project.hard_delete", "project", project_id)
    await db.delete(p)
    await db.commit()
    return {"detail": "Project hard deleted"}

# ── Locations ────────────────────────────────────────────────────────────────

class RegionOut(BaseModel):
    id: int
    name_en: str
    name_uz: str
    name_ru: str
    model_config = {"from_attributes": True}

class PlaceOut(BaseModel):
    id: int
    name: str
    region_id: int
    group_id: int | None = None
    group_link: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    model_config = {"from_attributes": True}


@router.get("/my-bot-location", response_model=dict)
async def my_bot_location(
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    """The most recent location this admin shared with the Telegram bot."""
    loc = await db.get(PendingLocation, admin.telegram_id)
    if not loc:
        return {"latitude": None, "longitude": None}
    return {"latitude": loc.latitude, "longitude": loc.longitude}


@router.get("/regions", response_model=list[RegionOut])
async def list_regions(admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(Region).where(Region.is_deleted == False).order_by(Region.id))
    return res.scalars().all()

@router.get("/schools", response_model=list[PlaceOut])
async def list_schools(admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(School).where(School.is_deleted == False).order_by(School.id))
    return res.scalars().all()

@router.post("/schools", status_code=status.HTTP_201_CREATED)
async def create_school(
    body: CreateLocation,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    name = body.name.strip()
    if not name:
        raise HTTPException(400, "Name cannot be empty")
    if not await db.get(Region, body.region_id):
        raise HTTPException(400, "Region not found")
    s = School(
        name=name, region_id=body.region_id,
        group_id=body.group_id, group_link=body.group_link,
        latitude=body.latitude, longitude=body.longitude,
    )
    db.add(s)
    await db.commit()
    await db.refresh(s)
    return s

@router.patch("/schools/{school_id}")
async def update_school(
    school_id: int,
    body: UpdateGroupConfig,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    s = await db.get(School, school_id)
    if not s:
        raise HTTPException(404, "School not found")
    # Use model_fields_set so an explicitly-sent null CLEARS the column (unlink a
    # Telegram group / remove a map pin); an absent field is left untouched.
    fset = body.model_fields_set
    if "group_id" in fset:
        s.group_id = body.group_id
    if "group_link" in fset:
        s.group_link = body.group_link
    if body.name is not None:
        name = body.name.strip()
        if not name:
            raise HTTPException(400, "Name cannot be empty")
        s.name = name
    if body.region_id is not None:
        if not await db.get(Region, body.region_id):
            raise HTTPException(400, "Region not found")
        s.region_id = body.region_id
    if "latitude" in fset:
        s.latitude = body.latitude
    if "longitude" in fset:
        s.longitude = body.longitude
    await db.commit()
    return s

@router.delete("/schools/{school_id}")
async def delete_school(
    school_id: int,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    s = await db.get(School, school_id)
    if not s:
        raise HTTPException(404, "School not found")
    s.is_deleted = True
    await db.commit()
    return {"detail": "School deleted"}

@router.get("/learning-centers", response_model=list[PlaceOut])
async def list_lcs(admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(LearningCenter).where(LearningCenter.is_deleted == False).order_by(LearningCenter.id))
    return res.scalars().all()

@router.post("/learning-centers", status_code=status.HTTP_201_CREATED)
async def create_lc(
    body: CreateLocation,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    name = body.name.strip()
    if not name:
        raise HTTPException(400, "Name cannot be empty")
    if not await db.get(Region, body.region_id):
        raise HTTPException(400, "Region not found")
    lc = LearningCenter(
        name=name, region_id=body.region_id,
        group_id=body.group_id, group_link=body.group_link,
        latitude=body.latitude, longitude=body.longitude,
    )
    db.add(lc)
    await db.commit()
    await db.refresh(lc)
    return lc

@router.patch("/learning-centers/{lc_id}")
async def update_lc(
    lc_id: int,
    body: UpdateGroupConfig,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    lc = await db.get(LearningCenter, lc_id)
    if not lc:
        raise HTTPException(404, "Learning Center not found")
    # Honor explicit nulls (clear the column) via model_fields_set; absent = untouched.
    fset = body.model_fields_set
    if "group_id" in fset:
        lc.group_id = body.group_id
    if "group_link" in fset:
        lc.group_link = body.group_link
    if body.name is not None:
        name = body.name.strip()
        if not name:
            raise HTTPException(400, "Name cannot be empty")
        lc.name = name
    if body.region_id is not None:
        if not await db.get(Region, body.region_id):
            raise HTTPException(400, "Region not found")
        lc.region_id = body.region_id
    if "latitude" in fset:
        lc.latitude = body.latitude
    if "longitude" in fset:
        lc.longitude = body.longitude
    await db.commit()
    return lc

@router.delete("/learning-centers/{lc_id}")
async def delete_lc(
    lc_id: int,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db)
):
    lc = await db.get(LearningCenter, lc_id)
    if not lc:
        raise HTTPException(404, "Learning Center not found")
    lc.is_deleted = True
    await db.commit()
    return {"detail": "Learning Center deleted"}


# ── Audit + Export ─────────────────────────────────────────────────────────────

@router.get("/audit")
async def list_audit(
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(select(AuditLog).order_by(AuditLog.id.desc()).limit(200))
    return [
        {"id": a.id, "admin_id": a.admin_id, "action": a.action,
         "target_type": a.target_type, "target_id": a.target_id,
         "details": a.details, "created_at": a.created_at}
        for a in res.scalars().all()
    ]


@router.get("/export/users.json")
async def export_users(
    admin: User = Depends(get_super_admin_user),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(select(User).where(User.is_deleted == False))
    return [
        {c.name: getattr(u, c.name) for c in User.__table__.columns}
        for u in res.scalars().all()
    ]


@router.get("/export/projects.json")
async def export_projects(
    admin: User = Depends(get_super_admin_user),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(select(Project).where(Project.is_deleted == False))
    return [
        {c.name: getattr(p, c.name) for c in Project.__table__.columns}
        for p in res.scalars().all()
    ]
