from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

# Pool sized for burst load but BOUNDED so the API + bot + cron together stay
# under Postgres's max_connections (esp. self-hosted on DigitalOcean). Defaults
# = 15 + 15 = 30 max per process; the bot overrides to a small pool via env
# (DB_POOL_SIZE / DB_MAX_OVERFLOW). pool_timeout is short so a request that can't
# get a connection fails fast (visible error) instead of hanging up to 30s.
engine = create_async_engine(
    settings.DATABASE_URL, echo=False, pool_pre_ping=True,
    pool_size=settings.DB_POOL_SIZE, max_overflow=settings.DB_MAX_OVERFLOW, pool_timeout=10,
)
AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session
