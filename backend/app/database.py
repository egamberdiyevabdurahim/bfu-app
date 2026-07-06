from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

# Sized for a sudden traffic spike (e.g. an influencer shoutout driving
# hundreds of concurrent registrations): SQLAlchemy's default (pool_size=5,
# max_overflow=10 = 15 connections) is far too small and causes request
# queuing/timeouts under burst load. pool_timeout is lowered so a request
# that can't get a connection fails fast (visible error) instead of hanging
# up to 30s. Tune pool_size/max_overflow against the Postgres plan's
# max_connections if that changes.
engine = create_async_engine(
    settings.DATABASE_URL, echo=False, pool_pre_ping=True,
    pool_size=20, max_overflow=40, pool_timeout=10,
)
AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session
