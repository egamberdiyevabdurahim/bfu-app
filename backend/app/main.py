import traceback
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.database import AsyncSessionLocal, Base, engine
from app.routers import admin, auth, events, projects, public, regions, users
from app.services.notify import esc, send_telegram

# Import all models so Base.metadata knows about every table
import app.models  # noqa: F401


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create all tables that don't exist yet
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        
        from sqlalchemy import text
        
        # Enforce unique telegram_id (idempotent, non-destructive). The old
        # boot-time "DELETE duplicate users" was removed — the constraint
        # prevents dupes, so the destructive sweep is no longer needed.
        try:
            await conn.execute(text("ALTER TABLE users DROP CONSTRAINT IF EXISTS uq_user_telegram_id;"))
            await conn.execute(text("ALTER TABLE users ADD CONSTRAINT uq_user_telegram_id UNIQUE (telegram_id);"))
        except Exception as e:
            print(f"Lifespan DB setup notice (unique): {e}")

        # Add new nullable columns that may not exist yet (safe, idempotent)
        new_columns = [
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
        ]
        for ddl in new_columns:
            try:
                await conn.execute(text(ddl))
            except Exception as e:
                print(f"Column migration notice: {e}")

        # One-time moderation backfill: grandfather every project that
        # existed before the approval gate shipped, so enabling moderation
        # doesn't hide current content. Fixed cutoff = idempotent.
        try:
            await conn.execute(text(
                "UPDATE projects SET is_approved = true "
                "WHERE is_approved = false AND created_at < TIMESTAMP '2026-05-21 00:00:00';"
            ))
        except Exception as e:
            print(f"Moderation backfill notice: {e}")
                
        # Grant super_admin to DEVELOPER_ID
        if settings.DEVELOPER_ID:
            try:
                await conn.execute(text(f"UPDATE users SET role = 'super_admin' WHERE telegram_id = {settings.DEVELOPER_ID};"))
            except Exception as e:
                print(f"Auto-admin assignment notice: {e}")

    # Seed regions/schools/learning-centers if the DB is empty (idempotent).
    # Without this, the registration "location" step has nothing to pick.
    try:
        from seed_db import seed_data
        await seed_data()
    except Exception as e:
        print(f"Seed-on-startup notice: {e}")

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
app.include_router(projects.router)
app.include_router(regions.router)
app.include_router(events.router)
app.include_router(public.router)
app.include_router(admin.router)

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

