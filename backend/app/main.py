import logging
import traceback
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.database import AsyncSessionLocal, Base, engine
from app.routers import admin, auth, events, mentors, partners, projects, public, regions, search, users
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
        "ALTER TABLE project_applications ADD COLUMN IF NOT EXISTS role VARCHAR(80);",
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

import time as _time
from collections import deque

_RL_WINDOW = 60
_RL_MAX = 30  # per IP per window for sensitive auth endpoints
_rl_hits: dict[str, deque] = {}


@app.middleware("http")
async def _rate_limit(request: Request, call_next):
    if request.url.path == "/auth/telegram":
        ip = (request.headers.get("cf-connecting-ip")
              or request.headers.get("x-forwarded-for", "").split(",")[0].strip()
              or (request.client.host if request.client else "unknown"))
        now = _time.monotonic()
        dq = _rl_hits.setdefault(ip, deque())
        while dq and now - dq[0] > _RL_WINDOW:
            dq.popleft()
        if len(dq) >= _RL_MAX:
            return JSONResponse(status_code=429, content={"detail": "Too many requests"})
        dq.append(now)
    return await call_next(request)


app.include_router(auth.router)
app.include_router(users.router)
app.include_router(users.follow_router)
app.include_router(projects.router)
app.include_router(regions.router)
app.include_router(events.router)
app.include_router(partners.router)
app.include_router(public.router)
app.include_router(search.router)
app.include_router(admin.router)
app.include_router(mentors.router)
app.include_router(mentors.booking_router)

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
        # Tracebacks routinely contain '<' (<module>, <lambda>, object reprs);
        # Telegram rejects unescaped angle brackets even inside <pre>.
        await send_telegram(
            settings.DEVELOPER_GROUP_ID,
            f"🐞 <b>Unhandled error</b>\n<code>{esc(f'{request.method} {request.url.path}')}</code>\n"
            f"<pre>{esc(tb)}</pre>",
        )
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


@app.get("/health")
async def health():
    return {"status": "ok", "env": settings.ENVIRONMENT}

