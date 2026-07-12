"""push_event(): the shared gate for per-notification Telegram pushes (bookings,
project updates, new followers). Fires only for reachable, opted-in users;
localizes by language; attaches a deep-link button."""
import pytest

from app.services import notify as N

pytestmark = pytest.mark.asyncio

TEXT = {"en": "hi {name}", "uz": "salom {name}", "ru": "privet {name}"}
BTN = {"en": "Open", "uz": "Ochish", "ru": "Otkr"}


@pytest.fixture
def spy(monkeypatch):
    calls = []
    monkeypatch.setattr(N, "notify_background",
                        lambda chat_id, text, reply_markup=None: calls.append((chat_id, text, reply_markup)))
    return calls


async def test_fires_for_reachable_optedin(make_user, spy):
    u = await make_user(can_message=True, language="uz")
    N.push_event(u, "new_follower", TEXT, fmt={"name": "Bob"}, url="https://x", btn_by_lang=BTN)
    assert len(spy) == 1
    assert spy[0][0] == u.telegram_id
    assert spy[0][1] == "salom Bob"                                   # localized to uz
    assert spy[0][2]["inline_keyboard"][0][0]["text"] == "Ochish"     # uz button
    assert spy[0][2]["inline_keyboard"][0][0]["web_app"]["url"] == "https://x"


async def test_skips_unreachable(make_user, spy):
    u = await make_user(can_message=False, language="en")
    N.push_event(u, "new_follower", TEXT, fmt={"name": "Bob"})
    assert spy == []


async def test_skips_when_telegram_push_master_off(make_user, spy):
    u = await make_user(can_message=True, notification_prefs={"telegram_push": False})
    N.push_event(u, "booking_confirmed", TEXT, fmt={"name": "B"})
    assert spy == []


async def test_skips_when_category_muted(make_user, spy):
    # booking_* maps to the "bookings" pref category.
    u = await make_user(can_message=True, notification_prefs={"bookings": False})
    N.push_event(u, "booking_declined", TEXT, fmt={"name": "B"})
    assert spy == []


async def test_unknown_language_falls_back_to_en(make_user, spy):
    u = await make_user(can_message=True, language="fr")
    N.push_event(u, "project_update", TEXT, fmt={"name": "Z"})
    assert spy[0][1] == "hi Z"


async def test_no_button_when_url_absent(make_user, spy):
    u = await make_user(can_message=True, language="en")
    N.push_event(u, "new_follower", TEXT, fmt={"name": "Q"})
    assert spy[0][2] is None
