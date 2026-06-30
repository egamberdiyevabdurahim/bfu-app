"""Shared async test fixtures for the BFU FastAPI backend.

Strategy
--------
* Env is set BEFORE any `app.*` import so the module-level `settings`
  singleton + the SECRET_KEY production guard see test values.
* The whole suite runs against a single in-memory SQLite database. A
  StaticPool + a single shared aiosqlite connection means every session
  (test fixtures AND the request handlers under test) sees the same data.
* We DO NOT run app/main.py's lifespan (it issues Postgres-only DDL). We
  create the schema ourselves from `Base.metadata` after importing all
  models.
* Auth is provided by overriding `app.core.deps.get_current_user` — far
  more reliable than minting a JWT and round-tripping the bearer scheme,
  and it sidesteps the deny-lock path that inspects `request.url.path`.
* Every outbound Telegram / AI call is monkeypatched to an async no-op so
  the tests never touch the network.
"""
from __future__ import annotations

import os

# ── Env must be set before importing anything under `app` ──────────────────────
# `setdefault` keeps us compatible with tests/test_smoke.py which also pins
# these (it sets ENVIRONMENT=production and asserts prod behaviour). We keep
# production mode here too: auth is handled via a dependency override, and the
# SECRET_KEY prod guard is satisfied because we supply a strong key.
os.environ.setdefault("ENVIRONMENT", "production")
os.environ.setdefault("BOT_TOKEN", "123456:test-token-for-pytest")
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-pytest-suite-only-not-real")
os.environ.setdefault("ANTHROPIC_API_KEY", "")
os.environ.setdefault("ADMIN_GROUP_ID", "0")
os.environ.setdefault("DEVELOPER_GROUP_ID", "0")

import pytest  # noqa: E402
import pytest_asyncio  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy import BigInteger  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine  # noqa: E402
from sqlalchemy.ext.compiler import compiles  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402


# SQLite only auto-assigns rowids to plain `INTEGER PRIMARY KEY` columns. The
# models use `BigInteger` PKs (correct for Postgres), which SQLite renders as
# `BIGINT` — a non-rowid column that stays NULL on insert and trips the NOT NULL
# constraint. Compile BigInteger as INTEGER *for the SQLite dialect only* so
# autoincrement works in tests. This is a test-only shim; production Postgres is
# unaffected.
@compiles(BigInteger, "sqlite")
def _compile_bigint_sqlite(type_, compiler, **kw):  # noqa: ANN001
    return "INTEGER"

# Import the app + its DB pieces. Importing `app.models` registers every table
# on Base.metadata so create_all builds the full schema.
import app.models  # noqa: F401,E402
from app.database import Base, get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.core.deps import get_current_user  # noqa: E402
from app.core.security import create_access_token  # noqa: E402
from app.models.user import User  # noqa: E402


def pytest_configure(config):
    """Set pytest-asyncio defaults from conftest so we don't need a root
    pytest.ini (kept out of scope). `auto` mode means plain `async def test_*`
    are collected without an explicit marker; pinning the fixture loop scope
    silences the deprecation warning and matches the session-scoped engine."""
    config.inicfg.setdefault("asyncio_mode", "auto")
    config.inicfg.setdefault("asyncio_default_fixture_loop_scope", "session")


# ── In-memory SQLite engine (one shared connection for the whole session) ──────
@pytest_asyncio.fixture(scope="session")
async def engine():
    eng = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield eng
    await eng.dispose()


@pytest_asyncio.fixture()
async def session_factory(engine):
    return async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


@pytest_asyncio.fixture()
async def db(session_factory) -> AsyncSession:
    """A session for the test body to seed/inspect rows directly."""
    async with session_factory() as s:
        yield s


@pytest_asyncio.fixture(autouse=True)
async def _clean_tables(engine):
    """Each test starts from an empty DB so ids/state don't leak between tests."""
    yield
    async with engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            await conn.execute(table.delete())


@pytest.fixture(autouse=True)
def _reset_inprocess_throttles():
    """The user router keeps in-process cooldown dicts (AI / intro / interest)
    keyed by user id. Because the DB is wiped and ids are reused between tests,
    a stale entry from a prior test would wrongly 429 the next one. Clear them
    around every test."""
    import app.routers.users as ur

    for name in ("_last_ai", "_last_intro", "_last_interest"):
        d = getattr(ur, name, None)
        if isinstance(d, dict):
            d.clear()
    yield
    for name in ("_last_ai", "_last_intro", "_last_interest"):
        d = getattr(ur, name, None)
        if isinstance(d, dict):
            d.clear()


@pytest_asyncio.fixture(autouse=True)
def _no_network(monkeypatch):
    """Stub every outbound Telegram / AI call so tests never hit the network."""

    async def _noop_send(*args, **kwargs):
        return True

    async def _noop_notify_founder(*args, **kwargs):
        return None

    async def _noop_analyze(*args, **kwargs):
        return {}

    async def _noop_fetch_photo(*args, **kwargs):
        return None

    # send_telegram is imported into several router modules by value, so patch
    # it everywhere it was bound.
    monkeypatch.setattr("app.services.notify.send_telegram", _noop_send, raising=False)
    monkeypatch.setattr("app.routers.users.send_telegram", _noop_send, raising=False)
    monkeypatch.setattr("app.routers.projects.send_telegram", _noop_send, raising=False)
    monkeypatch.setattr("app.routers.projects._notify_founder", _noop_notify_founder, raising=False)
    # AI / Telegram-media helpers used on the user-update path.
    monkeypatch.setattr("app.services.ai.analyze_and_save", _noop_analyze, raising=False)
    monkeypatch.setattr("app.routers.users.analyze_and_save", _noop_analyze, raising=False)
    monkeypatch.setattr(
        "app.services.telegram_media.fetch_photo_file_id", _noop_fetch_photo, raising=False
    )
    yield


@pytest_asyncio.fixture()
async def client(session_factory):
    """Async HTTP client wired to the ASGI app with the test DB injected.

    No auth override is installed here — use `auth_client` (or call
    `as_user`) to authenticate as a specific user.
    """
    async def _override_get_db():
        async with session_factory() as s:
            yield s

    app.dependency_overrides[get_db] = _override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    app.dependency_overrides.pop(get_db, None)
    app.dependency_overrides.pop(get_current_user, None)


# ── User factory + auth helpers ────────────────────────────────────────────────
_tg_counter = {"n": 10_000}


@pytest_asyncio.fixture()
async def make_user(db):
    """Insert a User row directly. Registered by default."""

    async def _make(**overrides) -> User:
        _tg_counter["n"] += 1
        defaults = dict(
            telegram_id=_tg_counter["n"],
            name="Test",
            surname="User",
            language="en",
            is_registered=True,
        )
        defaults.update(overrides)
        user = User(**defaults)
        db.add(user)
        await db.commit()
        await db.refresh(user)
        return user

    return _make


@pytest.fixture()
def as_user(client):
    """Authenticate the shared `client` as `user` via dependency override.

    The override loads the User through the *same* request-scoped session the
    handler uses (it Depends on get_db), exactly like the real
    get_current_user. Returning a User bound to a different session would make
    `db.refresh(current_user)` raise "not persistent within this Session" — a
    test artefact, not an app bug.
    """
    from fastapi import Depends
    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import AsyncSession
    from sqlalchemy.orm import selectinload

    def _as(user: User):
        uid = user.id

        async def _override_current_user(s: AsyncSession = Depends(get_db)):
            res = await s.execute(
                select(User).options(selectinload(User.analysis)).where(User.id == uid)
            )
            return res.scalar_one()

        app.dependency_overrides[get_current_user] = _override_current_user
        return client

    return _as


@pytest.fixture()
def make_token():
    """Mint a real access-token JWT for a user id (alternative auth path)."""

    def _mint(user_id: int) -> str:
        return create_access_token(user_id)

    return _mint
