from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import Base, engine
from app.routers import admin, auth, projects, regions, users

# Import all models so Base.metadata knows about every table
import app.models  # noqa: F401


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create all tables that don't exist yet
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        
        from sqlalchemy import text
        
        # [TEMP] Clean up duplicate users and enforce unique telegram_id
        try:
            await conn.execute(text("DELETE FROM users WHERE id NOT IN (SELECT MAX(id) FROM users GROUP BY telegram_id);"))
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
        ]
        for ddl in new_columns:
            try:
                await conn.execute(text(ddl))
            except Exception as e:
                print(f"Column migration notice: {e}")
                
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

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(projects.router)
app.include_router(regions.router)
app.include_router(admin.router)

@app.get("/health")
async def health():
    return {"status": "ok", "env": settings.ENVIRONMENT}

