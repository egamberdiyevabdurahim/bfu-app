import logging
import traceback
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.database import AsyncSessionLocal, Base, engine
from app.routers import admin, auth, events, mentors, messages, partners, projects, public, regions, roles, search, users
from app.services.notify import esc, send_telegram

# Import all models so Base.metadata knows about every table
import app.models  # noqa: F401

log = logging.getLogger("bfu")


@asynccontextmanager
async def lifespan(app: FastAPI):
    from sqlalchemy import text

    # Create all tables that don't exist yet (own transaction).
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Idempotent migrations. CRITICAL: each statement runs in its OWN
    # transaction. Previously all of these shared one engine.begin() block,
    # so the first failed statement aborted the Postgres transaction and
    # every later ALTER silently rolled back ("InFailedSQLTransaction").
    async def _run(label: str, sql: str) -> None:
        try:
            async with engine.begin() as c:
                await c.execute(text(sql))
        except Exception as e:
            log.warning("migration step '%s' skipped: %s", label, e)

    # Unique telegram_id (guarded so we don't rebuild the index every boot).
    await _run("uq_telegram_id",
        "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint "
        "WHERE conname='uq_user_telegram_id') THEN "
        "ALTER TABLE users ADD CONSTRAINT uq_user_telegram_id UNIQUE (telegram_id); "
        "END IF; END $$;")

    migrations = [
        # --- columns (idempotent) ---
        "ALTER TABLE web_login_tokens ADD COLUMN IF NOT EXISTS code VARCHAR(8);",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS tg_username VARCHAR(255);",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'user';",
        "ALTER TABLE schools ADD COLUMN IF NOT EXISTS group_id BIGINT;",
        "ALTER TABLE schools ADD COLUMN IF NOT EXISTS group_link VARCHAR(512);",
        "ALTER TABLE learning_centers ADD COLUMN IF NOT EXISTS group_id BIGINT;",
        "ALTER TABLE learning_centers ADD COLUMN IF NOT EXISTS group_link VARCHAR(512);",
        "ALTER TABLE projects ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT false;",
        "ALTER TABLE schools ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;",
        "ALTER TABLE schools ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;",
        "ALTER TABLE learning_centers ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;",
        "ALTER TABLE learning_centers ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by BIGINT;",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP;",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_nudged_at TIMESTAMP;",
        "ALTER TABLE projects ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT false;",
        "ALTER TABLE projects ADD COLUMN IF NOT EXISTS is_draft BOOLEAN DEFAULT false;",
        "ALTER TABLE projects ADD COLUMN IF NOT EXISTS view_count INTEGER DEFAULT 0;",
        "ALTER TABLE project_applications ADD COLUMN IF NOT EXISTS decided_at TIMESTAMP;",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS banned BOOLEAN DEFAULT false;",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS photo_file_id VARCHAR(255);",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS currently_building TEXT;",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS portfolio_links TEXT;",
        # notifications inbox indexes (table itself created by create_all)
        "CREATE INDEX IF NOT EXISTS ix_notifications_user_id ON notifications (user_id);",
        "CREATE INDEX IF NOT EXISTS ix_notifications_unread ON notifications (user_id, is_read);",
        # partner orgs + event moderation
        "ALTER TABLE events ADD COLUMN IF NOT EXISTS partner_id BIGINT;",
        "ALTER TABLE events ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT true;",
        "CREATE INDEX IF NOT EXISTS ix_events_partner_id ON events (partner_id);",
        # --- indexes on hot filter/FK columns (Postgres doesn't auto-index FKs) ---
        "CREATE INDEX IF NOT EXISTS ix_users_region_id ON users (region_id);",
        "CREATE INDEX IF NOT EXISTS ix_users_referred_by ON users (referred_by);",
        "CREATE INDEX IF NOT EXISTS ix_users_created_at ON users (created_at);",
        # presence: online_now COUNT + City pool ordering both filter/sort by this
        "CREATE INDEX IF NOT EXISTS ix_users_last_seen_at ON users (last_seen_at);",
        "CREATE INDEX IF NOT EXISTS ix_projects_creator_id ON projects (creator_id);",
        "CREATE INDEX IF NOT EXISTS ix_projects_feed ON projects (is_approved, is_draft, is_deleted);",
        "CREATE INDEX IF NOT EXISTS ix_applications_project_id ON project_applications (project_id);",
        "CREATE INDEX IF NOT EXISTS ix_applications_applicant_id ON project_applications (applicant_id);",
        "CREATE INDEX IF NOT EXISTS ix_members_project_id ON project_members (project_id);",
        "CREATE INDEX IF NOT EXISTS ix_members_user_id ON project_members (user_id);",
        # --- dedup then enforce one application per (project, applicant) ---
        "DELETE FROM project_applications a USING project_applications b "
        "WHERE a.id > b.id AND a.project_id = b.project_id AND a.applicant_id = b.applicant_id;",
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_application_project_applicant "
        "ON project_applications (project_id, applicant_id);",
        # --- one-time moderation backfill (fixed cutoff = idempotent) ---
        "UPDATE projects SET is_approved = true "
        "WHERE is_approved = false AND created_at < TIMESTAMP '2026-05-21 00:00:00';",
        # --- Batch B: trust layer indexes (tables created by create_all) ---
        "CREATE INDEX IF NOT EXISTS ix_endorsements_target ON endorsements (target_id);",
        "CREATE INDEX IF NOT EXISTS ix_endorsements_endorser ON endorsements (endorser_id);",
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_endorsement_endorser_target_skill "
        "ON endorsements (endorser_id, target_id, skill);",
        "CREATE INDEX IF NOT EXISTS ix_vouches_target ON vouches (target_id);",
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_vouch_author_target "
        "ON vouches (author_id, target_id);",
        "CREATE INDEX IF NOT EXISTS ix_ratings_ratee ON project_ratings (ratee_id);",
        "CREATE INDEX IF NOT EXISTS ix_ratings_project ON project_ratings (project_id);",
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_rating_project_rater_ratee "
        "ON project_ratings (project_id, rater_id, ratee_id);",
        # --- Batch C: connection columns + indexes (tables via create_all) ---
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_mentor BOOLEAN DEFAULT false;",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS mentor_bio TEXT;",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS mentor_topics TEXT;",
        # First-login onboarding gate (see users.onboarding_completed).
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT false;",
        # Per-user notification preferences (opt-out JSON blob; see
        # users.notification_prefs / app.services.notifications).
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_prefs JSONB NOT NULL DEFAULT '{}'::jsonb;",
        "ALTER TABLE project_applications ADD COLUMN IF NOT EXISTS role VARCHAR(80);",
        # Member role — a founder-set title on an actual teammate (distinct from
        # the OPEN roles above / project_roles). Nullable short string.
        "ALTER TABLE project_members ADD COLUMN IF NOT EXISTS role VARCHAR(80);",
        "CREATE INDEX IF NOT EXISTS ix_follows_follower ON follows (follower_id);",
        "CREATE INDEX IF NOT EXISTS ix_follows_target ON follows (target_type, target_id);",
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_follow_follower_target "
        "ON follows (follower_id, target_type, target_id);",
        "CREATE INDEX IF NOT EXISTS ix_project_updates_project ON project_updates (project_id);",
        "CREATE INDEX IF NOT EXISTS ix_mentor_slots_mentor ON mentor_slots (mentor_id);",
        "CREATE INDEX IF NOT EXISTS ix_mentor_slots_start ON mentor_slots (start_at);",
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_slot_mentor_start "
        "ON mentor_slots (mentor_id, start_at);",
        "CREATE INDEX IF NOT EXISTS ix_bookings_mentor ON bookings (mentor_id);",
        "CREATE INDEX IF NOT EXISTS ix_bookings_mentee ON bookings (mentee_id);",
        "CREATE INDEX IF NOT EXISTS ix_bookings_slot ON bookings (slot_id);",
        "CREATE INDEX IF NOT EXISTS ix_users_is_mentor ON users (is_mentor);",
        # --- Batch D: discovery + org (project_roles table via create_all) ---
        "ALTER TABLE projects ADD COLUMN IF NOT EXISTS group_link VARCHAR(512);",
        "CREATE INDEX IF NOT EXISTS ix_project_roles_project ON project_roles (project_id);",
        "CREATE INDEX IF NOT EXISTS ix_project_roles_open ON project_roles (is_filled);",
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_project_role_project_name "
        "ON project_roles (project_id, name);",
        # --- Batch E: analytics (read-only; index the skill-gap GROUP BY column) ---
        "CREATE INDEX IF NOT EXISTS ix_project_req_skills_skill_name "
        "ON project_req_skills (skill_name);",
        # --- Messaging v1: DMs + project chats + blocks (tables via create_all) ---
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_conversation_dm_key "
        "ON conversations (dm_key);",
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_conversation_project "
        "ON conversations (project_id);",
        "CREATE INDEX IF NOT EXISTS ix_conv_members_conv ON conversation_members (conversation_id);",
        "CREATE INDEX IF NOT EXISTS ix_conv_members_user ON conversation_members (user_id);",
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_conv_member_conv_user "
        "ON conversation_members (conversation_id, user_id);",
        "CREATE INDEX IF NOT EXISTS ix_messages_conversation_id ON messages (conversation_id);",
        "CREATE INDEX IF NOT EXISTS ix_messages_sender_id ON messages (sender_id);",
        "CREATE INDEX IF NOT EXISTS ix_messages_created_at ON messages (created_at);",
        "CREATE INDEX IF NOT EXISTS ix_messages_conv_created ON messages (conversation_id, created_at);",
        "CREATE INDEX IF NOT EXISTS ix_blocks_blocker ON blocks (blocker_id);",
        "CREATE INDEX IF NOT EXISTS ix_blocks_blocked ON blocks (blocked_id);",
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_block_pair ON blocks (blocker_id, blocked_id);",
        # --- Who-viewed-your-profile: named profile views (table via create_all) ---
        "CREATE INDEX IF NOT EXISTS ix_profile_views_viewer ON profile_views (viewer_id);",
        "CREATE INDEX IF NOT EXISTS ix_profile_views_viewed ON profile_views (viewed_id);",
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_profile_view_pair ON profile_views (viewer_id, viewed_id);",
        "CREATE INDEX IF NOT EXISTS ix_profile_views_viewed_updated ON profile_views (viewed_id, updated_at);",
        # --- messaging v2: reply/edit/delete columns (soft-delete keeps history) ---
        "ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_id BIGINT;",
        "ALTER TABLE messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMP;",
        "ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;",
        # --- Privacy: who-can-message-me (everyone | connections) + who-viewed consent ---
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS dm_privacy VARCHAR(20) NOT NULL DEFAULT 'everyone';",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS who_viewed_consent BOOLEAN NOT NULL DEFAULT true;",
        # --- Telegram reachability: can the bot DM this user? (write-access / started bot / send-succeeded) ---
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS can_message BOOLEAN NOT NULL DEFAULT false;",
        # --- Rate-limiter COUNT predicates: composite (actor, created_at) indexes
        #     so the per-write anti-flood counts stay index-only under load. ---
        "CREATE INDEX IF NOT EXISTS ix_reports_reporter_created ON reports (reporter_id, created_at);",
        "CREATE INDEX IF NOT EXISTS ix_interests_from_created ON interests (from_user_id, created_at);",
        "CREATE INDEX IF NOT EXISTS ix_projects_creator_created ON projects (creator_id, created_at);",
        "CREATE INDEX IF NOT EXISTS ix_applications_applicant_created ON project_applications (applicant_id, created_at);",
        "CREATE INDEX IF NOT EXISTS ix_project_updates_author_created ON project_updates (author_id, created_at);",
        "CREATE INDEX IF NOT EXISTS ix_event_rsvps_user_created ON event_rsvps (user_id, created_at);",
        "CREATE INDEX IF NOT EXISTS ix_endorsements_endorser_created ON endorsements (endorser_id, created_at);",
        "CREATE INDEX IF NOT EXISTS ix_vouches_author_created ON vouches (author_id, created_at);",
        # --- Mentorship v2: meeting link + post-session rating (columns on bookings) ---
        "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS meeting_link VARCHAR(500);",
        "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS mentee_rating INTEGER;",
        "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS mentee_rating_note VARCHAR(200);",
        "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS mentee_rated_at TIMESTAMP;",
        "CREATE INDEX IF NOT EXISTS ix_bookings_mentor_rating ON bookings (mentor_id) WHERE mentee_rating IS NOT NULL AND status = 'confirmed';",
        # --- Events RSVP + deadline reminders (event_rsvps table via create_all) ---
        "CREATE INDEX IF NOT EXISTS ix_event_rsvps_event ON event_rsvps (event_id);",
        "CREATE INDEX IF NOT EXISTS ix_event_rsvps_user ON event_rsvps (user_id);",
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_event_rsvp_event_user ON event_rsvps (event_id, user_id);",
        "CREATE INDEX IF NOT EXISTS ix_event_rsvps_reminder ON event_rsvps (reminded_at, status);",
        "ALTER TABLE notifications ADD COLUMN IF NOT EXISTS event_id BIGINT;",
    ]
    for sql in migrations:
        await _run(sql[:40], sql)

    if settings.DEVELOPER_ID:
        await _run("grant_super_admin",
            f"UPDATE users SET role = 'super_admin' WHERE telegram_id = {int(settings.DEVELOPER_ID)};")

    # Seed regions/schools/learning-centers if the DB is empty (idempotent).
    try:
        from seed_db import seed_data
        await seed_data()
    except Exception as e:
        log.warning("Seed-on-startup notice: %s", e)

    yield



app = FastAPI(title="BFU API", version="2.0.0", docs_url="/docs", redoc_url=None, lifespan=lifespan)

origins = settings.CORS_ORIGINS.copy()
if settings.WEBAPP_URL and settings.WEBAPP_URL not in origins:
    origins.append(settings.WEBAPP_URL.rstrip('/'))
# Keep HTTP CORS + the WS Origin allow-list from drifting: fold in the WS origins
# (the live Vercel/Telegram hosts) so cross-origin HTTP calls work too.
from app.routers.ws import WS_ALLOWED_ORIGINS as _WS_ORIGINS  # noqa: E402
for _o in _WS_ORIGINS:
    if _o not in origins:
        origins.append(_o)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

import asyncio as _asyncio
import time as _time
from collections import deque, OrderedDict

_RL_WINDOW = 60
_RL_MAX = 30              # per IP per window for the sensitive unauthenticated auth endpoints
_RL_MAX_KEYS = 20_000    # hard cap: spoofed IPs cannot grow this map without bound (OOM guard)
_RL_PATHS = ("/auth/telegram", "/auth/web-login/start")
# LRU (OrderedDict) so we can evict the oldest keys once past the cap.
_rl_hits: "OrderedDict[str, deque]" = OrderedDict()


def _rl_ip(request: Request) -> str:
    # We are NOT behind Cloudflare (Railway / DigitalOcean), so `cf-connecting-ip`
    # is attacker-controlled — never trust it. X-Forwarded-For's leftmost is the
    # real client as set by Railway's edge / DO's Caddy. It IS spoofable, but the
    # map is bounded below so spoofing can only bypass the limiter (login is still
    # HMAC-verified), never exhaust memory. On DO, run uvicorn with --proxy-headers
    # and this stays correct.
    xff = request.headers.get("x-forwarded-for", "")
    if xff:
        first = xff.split(",")[0].strip()
        if first:
            return first
    return request.client.host if request.client else "unknown"


@app.middleware("http")
async def _rate_limit(request: Request, call_next):
    if request.url.path in _RL_PATHS:
        ip = _rl_ip(request)
        now = _time.monotonic()
        dq = _rl_hits.get(ip)
        if dq is None:
            dq = deque()
            _rl_hits[ip] = dq
            # Bound memory: evict oldest-inserted keys once over the cap.
            while len(_rl_hits) > _RL_MAX_KEYS:
                _rl_hits.popitem(last=False)
        else:
            _rl_hits.move_to_end(ip)
        while dq and now - dq[0] > _RL_WINDOW:
            dq.popleft()
        if len(dq) >= _RL_MAX:
            return JSONResponse(status_code=429, content={"detail": "Too many requests"})
        dq.append(now)
    return await call_next(request)


# Retain fire-and-forget tasks so the event loop can't GC them mid-run.
_bg_tasks: set = set()


def _spawn_bg(coro):
    t = _asyncio.create_task(coro)
    _bg_tasks.add(t)
    t.add_done_callback(_bg_tasks.discard)
    return t


# Dedupe 500-alerts: 1 Telegram ping per (path, error-type) per minute so an
# outage doesn't turn every failing request into an outbound Telegram call.
_err_alert_last: "OrderedDict[str, float]" = OrderedDict()
_ERR_ALERT_WINDOW = 60


app.include_router(auth.router)
app.include_router(users.router)
app.include_router(users.follow_router)
app.include_router(projects.router)
app.include_router(roles.router)
app.include_router(regions.router)
app.include_router(events.router)
app.include_router(partners.router)
app.include_router(public.router)
app.include_router(search.router)
app.include_router(admin.router)
app.include_router(mentors.router)
app.include_router(mentors.booking_router)
app.include_router(messages.router)
from app.routers import ws as ws_router  # noqa: E402
app.include_router(ws_router.router)

@app.exception_handler(Exception)
async def _report_unhandled(request: Request, exc: Exception):
    tb = "".join(traceback.format_exception(type(exc), exc, exc.__traceback__))[-2500:]
    # Persist for the admin "Errors" tab — best-effort, never re-raise.
    try:
        from app.models.user import ErrorLog
        async with AsyncSessionLocal() as session:
            session.add(ErrorLog(
                path=request.url.path[:512],
                method=request.method[:8],
                message=str(exc)[:1000],
                traceback=tb,
            ))
            await session.commit()
    except Exception:
        pass
    if settings.DEVELOPER_GROUP_ID:
        # Fire-and-forget + dedupe so a burst of 500s (e.g. DB pool saturated)
        # can't amplify the outage by awaiting an outbound Telegram call on every
        # failed request. Tracebacks contain '<' (<module>, reprs) → must esc().
        sig = f"{request.url.path}|{type(exc).__name__}"
        now = _time.monotonic()
        last = _err_alert_last.get(sig, 0.0)
        if now - last > _ERR_ALERT_WINDOW:
            _err_alert_last[sig] = now
            _err_alert_last.move_to_end(sig)
            while len(_err_alert_last) > 500:
                _err_alert_last.popitem(last=False)
            _spawn_bg(send_telegram(
                settings.DEVELOPER_GROUP_ID,
                f"🐞 <b>Unhandled error</b>\n<code>{esc(f'{request.method} {request.url.path}')}</code>\n"
                f"<pre>{esc(tb)}</pre>",
            ))
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


@app.get("/health")
async def health():
    return {"status": "ok", "env": settings.ENVIRONMENT}

