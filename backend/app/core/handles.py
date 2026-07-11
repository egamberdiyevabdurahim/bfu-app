"""Opaque, reversible public handles for profile URLs.

Profile links used to expose the raw sequential user id (/u/123) — enumerable and
unpolished. Now a user's public handle is their @username when they have one, else
a short opaque code derived reversibly from the id (so /u/x7Kp9Qm instead of
/u/123). No DB column needed: the code is a keyed multiplicative permutation of the
id in base62, invertible with a modular inverse. Not cryptographically strong — its
job is to hide the sequential number, not to be a secret.
"""
import string

_ALPHABET = string.digits + string.ascii_lowercase + string.ascii_uppercase  # 62
_BASE = 62
_LEN = 7
_SPACE = _BASE ** _LEN  # ~3.5e12 — vastly larger than the user base
# Odd and not a multiple of 31 ⇒ coprime with 62^7 = 2^7·31^7 ⇒ invertible mod _SPACE.
_MULT = 2043747425
_MULT_INV = pow(_MULT, -1, _SPACE)
# Fixed public offset (NOT secret-derived): the frontend mirrors this exact codec
# to build /u/<code> links locally without an extra round-trip or a `handle` field
# on every list schema, so both sides MUST agree on these three constants. This is
# a number-obfuscation scheme, not a secret — it only hides the sequential id.
# Keep in sync with desktop/lib/handle.js and src/handle.js.
_OFFSET = 987654321987


def _to_base62(n: int) -> str:
    out = []
    for _ in range(_LEN):
        n, r = divmod(n, _BASE)
        out.append(_ALPHABET[r])
    return "".join(reversed(out))


def _from_base62(code: str) -> int | None:
    n = 0
    for ch in code:
        i = _ALPHABET.find(ch)
        if i < 0:
            return None
        n = n * _BASE + i
    return n


def encode_id(user_id: int) -> str:
    """Stable opaque code for a user id."""
    return _to_base62((int(user_id) * _MULT + _OFFSET) % _SPACE)


def decode_handle(code: str) -> int | None:
    """Reverse encode_id; None if `code` isn't a well-formed handle."""
    if not code or len(code) != _LEN:
        return None
    n = _from_base62(code)
    if n is None:
        return None
    uid = ((n - _OFFSET) * _MULT_INV) % _SPACE
    return uid if uid > 0 else None
