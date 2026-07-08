"""Notification preferences: the /users/me/notification-prefs GET + PATCH
endpoints (opt-out model) and the pure helpers that gate outbound pushes."""
from types import SimpleNamespace

from app.services.notifications import (
    NOTIF_PREF_KEYS,
    effective_prefs,
    pref_enabled,
    should_push_telegram,
)

# No module-level asyncio marker: conftest runs pytest-asyncio in `auto` mode,
# so the async endpoint tests are collected automatically while the sync helper
# tests below stay plain (an explicit asyncio mark on a sync test warns).


# ── Endpoints ──────────────────────────────────────────────────────────────────

async def test_get_defaults_all_true_for_fresh_user(make_user, as_user):
    """A brand-new user has an empty {} blob → every category resolves to True
    (opt-out: absent key == enabled)."""
    me = await make_user(name="Fresh")
    c = as_user(me)
    res = await c.get("/users/me/notification-prefs")
    assert res.status_code == 200, res.text
    prefs = res.json()["prefs"]
    assert set(prefs.keys()) == set(NOTIF_PREF_KEYS)
    assert all(prefs[k] is True for k in NOTIF_PREF_KEYS)


async def test_patch_persists_and_other_keys_stay_true(make_user, as_user, db):
    """PATCH {messages, telegram_push} = false persists; a follow-up GET reflects
    it and every other category stays enabled. Only `false` values are stored."""
    me = await make_user(name="Opter")
    c = as_user(me)

    r1 = await c.patch(
        "/users/me/notification-prefs",
        json={"messages": False, "telegram_push": False},
    )
    assert r1.status_code == 200, r1.text
    prefs = r1.json()["prefs"]
    assert prefs["messages"] is False
    assert prefs["telegram_push"] is False
    # Untouched categories remain enabled.
    for k in ("interest", "applications", "project_updates", "bookings", "weekly_digest"):
        assert prefs[k] is True

    # GET reflects the same after a round-trip.
    r2 = await c.get("/users/me/notification-prefs")
    assert r2.json()["prefs"]["messages"] is False
    assert r2.json()["prefs"]["telegram_push"] is False

    # Persisted opt-out blob holds ONLY the two false keys (opt-out storage).
    await db.refresh(me)
    assert me.notification_prefs == {"messages": False, "telegram_push": False}


async def test_patch_merges_without_clobbering(make_user, as_user, db):
    """A second PATCH merges into the stored blob rather than replacing it, and
    a category can be flipped back on (stored True)."""
    me = await make_user(name="Merger")
    c = as_user(me)

    await c.patch("/users/me/notification-prefs", json={"messages": False})
    r = await c.patch("/users/me/notification-prefs", json={"bookings": False})
    prefs = r.json()["prefs"]
    assert prefs["messages"] is False
    assert prefs["bookings"] is False

    # Re-enable messages — the key is kept (True), bookings stays false.
    r2 = await c.patch("/users/me/notification-prefs", json={"messages": True})
    assert r2.json()["prefs"]["messages"] is True
    await db.refresh(me)
    assert me.notification_prefs.get("messages") is True
    assert me.notification_prefs.get("bookings") is False


async def test_patch_unknown_key_is_ignored(make_user, as_user, db):
    """An unknown key is silently ignored — no error, not stored, and the known
    key in the same body still applies."""
    me = await make_user(name="Unknown")
    c = as_user(me)

    r = await c.patch(
        "/users/me/notification-prefs",
        json={"totally_made_up": False, "interest": False},
    )
    assert r.status_code == 200, r.text
    prefs = r.json()["prefs"]
    assert set(prefs.keys()) == set(NOTIF_PREF_KEYS)  # no stray key surfaced
    assert prefs["interest"] is False

    await db.refresh(me)
    assert "totally_made_up" not in me.notification_prefs


# ── Pure helpers ───────────────────────────────────────────────────────────────

def test_pref_enabled_opt_out_semantics():
    """Absent key / null blob → enabled; an explicit false → disabled."""
    assert pref_enabled(SimpleNamespace(notification_prefs={}), "messages") is True
    assert pref_enabled(SimpleNamespace(notification_prefs=None), "messages") is True
    assert pref_enabled(SimpleNamespace(notification_prefs={"messages": False}), "messages") is False
    assert pref_enabled(SimpleNamespace(notification_prefs={"messages": True}), "messages") is True


def test_effective_prefs_covers_all_keys():
    user = SimpleNamespace(notification_prefs={"messages": False})
    prefs = effective_prefs(user)
    assert set(prefs.keys()) == set(NOTIF_PREF_KEYS)
    assert prefs["messages"] is False
    assert prefs["interest"] is True


def test_should_push_master_off_suppresses_everything():
    """telegram_push=false ⇒ False regardless of type (including unknown)."""
    user = SimpleNamespace(notification_prefs={"telegram_push": False})
    assert should_push_telegram(user, "message") is False
    assert should_push_telegram(user, "interest") is False
    assert should_push_telegram(user, "booking_request") is False
    assert should_push_telegram(user, "some_unknown_type") is False


def test_should_push_category_off_only_blocks_that_category():
    """A single muted category blocks its own types but not others; unknown
    types still push when the master is on."""
    user = SimpleNamespace(notification_prefs={"messages": False})
    assert should_push_telegram(user, "message") is False
    # interest/booking categories are still on.
    assert should_push_telegram(user, "interest") is True
    assert should_push_telegram(user, "booking_request") is True
    # Unknown type → always push.
    assert should_push_telegram(user, "some_unknown_type") is True


def test_should_push_defaults_all_on_for_empty_blob():
    user = SimpleNamespace(notification_prefs={})
    assert should_push_telegram(user, "message") is True
    assert should_push_telegram(user, "mutual") is True
    assert should_push_telegram(user, None) is True
