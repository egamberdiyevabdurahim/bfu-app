"""JWT tokens + Telegram initData validation (Mini App standard)."""
from __future__ import annotations

import hashlib
import hmac
import json
import time
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qsl

from jose import JWTError, jwt

from app.config import settings


# ── JWT ──────────────────────────────────────────────────────────────────────

def _make_token(data: dict, expires_delta: timedelta) -> str:
    payload = data | {"exp": datetime.now(timezone.utc) + expires_delta}
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_access_token(user_id: int) -> str:
    return _make_token(
        {"sub": str(user_id), "type": "access"},
        timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )


def create_refresh_token(user_id: int) -> str:
    return _make_token(
        {"sub": str(user_id), "type": "refresh"},
        timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
    )


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        return {}


# ── Telegram initData ─────────────────────────────────────────────────────────

def validate_init_data(init_data: str) -> dict | None:
    """Validate Telegram WebApp initData. Returns parsed params or None.

    In development mode (ENVIRONMENT=development) the hash check is skipped
    so you can test with a manually constructed initData.
    """
    if not init_data:
        return None

    params = dict(parse_qsl(init_data, keep_blank_values=True))
    received_hash = params.pop("hash", None)

    if settings.is_dev:
        # Skip cryptographic check; still parse the payload
        return params

    if not received_hash or not settings.BOT_TOKEN:
        return None

    data_check_string = "\n".join(f"{k}={v}" for k, v in sorted(params.items()))
    secret_key = hmac.new(
        key=b"WebAppData",
        msg=settings.BOT_TOKEN.encode(),
        digestmod=hashlib.sha256,
    ).digest()
    computed = hmac.new(
        key=secret_key,
        msg=data_check_string.encode(),
        digestmod=hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(computed, received_hash):
        return None

    # Reject stale data (> 24 h)
    auth_date = int(params.get("auth_date", 0))
    if time.time() - auth_date > 86_400:
        return None

    return params


def parse_tg_user(params: dict) -> dict:
    """Extract Telegram user fields from validated initData params."""
    raw = params.get("user", "{}")
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return {}


# ── Telegram Login Widget (desktop web login) ─────────────────────────────────

def validate_login_widget(fields: dict) -> dict | None:
    """Validate Telegram Login Widget auth data (used by the desktop web app).

    Returns the fields (minus `hash`) if the signature is valid and fresh, else
    None. IMPORTANT: the Login Widget derives its secret as sha256(bot_token) —
    which is DIFFERENT from the Mini App initData scheme (HMAC key "WebAppData").
    Dev mode skips the crypto check, mirroring validate_init_data.
    """
    if not fields:
        return None

    received_hash = fields.get("hash")
    data = {k: v for k, v in fields.items() if k != "hash" and v is not None}

    if settings.is_dev:
        return data

    if not received_hash or not settings.BOT_TOKEN:
        return None

    data_check_string = "\n".join(f"{k}={data[k]}" for k in sorted(data))
    secret_key = hashlib.sha256(settings.BOT_TOKEN.encode()).digest()
    computed = hmac.new(
        key=secret_key, msg=data_check_string.encode(), digestmod=hashlib.sha256
    ).hexdigest()

    if not hmac.compare_digest(computed, received_hash):
        return None

    # Reject stale logins (> 24 h) to blunt replay.
    if time.time() - int(data.get("auth_date", 0)) > 86_400:
        return None

    return data
