"""Smoke tests for the money paths — no DB required (pure functions)."""
import os

os.environ.setdefault("ENVIRONMENT", "production")
os.environ.setdefault("BOT_TOKEN", "test:token")
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-ci-only")

from app.core.security import (  # noqa: E402
    create_access_token,
    create_refresh_token,
    decode_token,
    validate_init_data,
)


def test_jwt_roundtrip():
    tok = create_access_token(42)
    payload = decode_token(tok)
    assert payload.get("sub") == "42"
    assert payload.get("type") == "access"


def test_refresh_token_typed():
    payload = decode_token(create_refresh_token(7))
    assert payload.get("type") == "refresh"


def test_decode_garbage_is_empty():
    assert decode_token("not-a-jwt") == {}


def test_initdata_rejected_in_production():
    # No valid hash → must be rejected when ENVIRONMENT != development
    assert validate_init_data("user=%7B%22id%22%3A1%7D&hash=deadbeef") is None
    assert validate_init_data("") is None
