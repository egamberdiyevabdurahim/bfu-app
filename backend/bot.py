import asyncio
import html
import logging
import sys

from datetime import datetime, timedelta

from aiogram import Bot, Dispatcher, F, types
from aiogram.filters import Command, CommandObject, CommandStart
from aiogram.types import (
    InlineKeyboardButton, InlineKeyboardMarkup, InlineQuery,
    InlineQueryResultArticle, InputTextMessageContent, WebAppInfo,
)
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError

from app.config import settings
from app.database import AsyncSessionLocal
from app.models.project import Project
from app.models.user import PendingLocation, User

# Fail fast with a clear message if the token is missing — otherwise aiogram's
# Bot() raises a cryptic validation error at import (the old main() guard was
# dead code because construction already crashed).
if not settings.BOT_TOKEN:
    logging.basicConfig(level=logging.INFO, stream=sys.stdout)
    logging.error("BOT_TOKEN is not set — cannot start the bot.")
    sys.exit(1)

# Initialize Bot and Dispatcher
bot = Bot(token=settings.BOT_TOKEN)
dp = Dispatcher()


@dp.error()
async def _on_bot_error(event: types.ErrorEvent):
    """A single failing handler must NOT kill the polling loop. Log + swallow so
    the bot keeps serving everyone else (blocked-user 403s, DB blips, etc.)."""
    upd = getattr(event.update, "update_id", "?")
    logging.exception("Bot handler error on update %s: %s", upd, event.exception)
    return True

# /start is where most people meet BFU for the first time — so it leads with the
# ONE sentence that says what this is, then offers exactly ONE action. (Before, it
# was a generic welcome that listed features and left people asking "what is this?")
# Sent with parse_mode=HTML — keep the markup to the <b> headline.
_START = {
    "en": {
        "btn": "🔎 See your city",
        "msg": (
            "<b>Find a team for your project. Find a project to join.</b>\n\n"
            "BFU is where young people across Uzbekistan find each other "
            "and build together. 🇺🇿\n\n"
            "See who's building in your city 👇"
        ),
    },
    "uz": {
        "btn": "🔎 Shahringni ko‘r",
        "msg": (
            "<b>Loyihangga jamoa top. Jamoaga loyiha top.</b>\n\n"
            "BFU — O‘zbekiston yoshlari bir-birini topib, birga loyiha "
            "quradigan joy. 🇺🇿\n\n"
            "Shahringda kim nima qurayotganini ko‘r 👇"
        ),
    },
    "ru": {
        "btn": "🔎 Посмотреть свой город",
        "msg": (
            "<b>Найди команду для своего проекта. Найди проект для себя.</b>\n\n"
            "BFU — место, где молодёжь Узбекистана находит друг друга "
            "и создаёт проекты вместе. 🇺🇿\n\n"
            "Посмотри, кто и что строит в твоём городе 👇"
        ),
    },
}


def _lang_of(message: types.Message) -> str:
    code = (message.from_user.language_code or "en")[:2].lower()
    return code if code in _START else "en"


async def _handle_web_login(message: types.Message, nonce: str) -> None:
    """Confirm a desktop 'log in via the bot' handshake. The tapper's Telegram
    id identifies them. Registered members are logged straight in; a brand-new /
    unregistered visitor is ALSO confirmed (find-or-create an unregistered shell)
    so they can finish registration on the web — the web app routes them to the
    sign-up form when it sees is_registered=false."""
    from app.models.web_login import WebLoginToken

    tg_id = message.from_user.id
    is_reg = False
    async with AsyncSessionLocal() as db:
        row = (await db.execute(
            select(WebLoginToken).where(WebLoginToken.nonce == nonce)
        )).scalar_one_or_none()
        if row is None or datetime.utcnow() - row.created_at > timedelta(minutes=5):
            await message.answer("⚠️ This login link has expired. Please try again from the website.")
            return
        user = (await db.execute(
            select(User).where(User.telegram_id == tg_id)
        )).scalar_one_or_none()
        if user is not None and getattr(user, "banned", False):
            await message.answer("Your account is suspended.")
            return
        if user is None:
            # First-ever visit — create an unregistered shell so the web can
            # onboard them. Mirrors /auth/telegram's new-user creation.
            user = User(
                telegram_id=tg_id,
                name=message.from_user.first_name,
                surname=message.from_user.last_name,
                language=_lang_of(message),
                tg_username=message.from_user.username or None,
            )
            db.add(user)
            try:
                await db.flush()
            except IntegrityError:
                # A concurrent /auth/telegram (or a double tap) created this
                # telegram_id first — reload both rows in the reset session
                # instead of stranding the login with a 500.
                await db.rollback()
                row = (await db.execute(
                    select(WebLoginToken).where(WebLoginToken.nonce == nonce)
                )).scalar_one_or_none()
                user = (await db.execute(
                    select(User).where(User.telegram_id == tg_id)
                )).scalar_one_or_none()
                if row is None or user is None:
                    await message.answer("⚠️ Login failed — please try again from the website.")
                    return
        elif user.is_deleted:
            user.is_deleted = False
        row.user_id = user.id  # remember who tapped — but DON'T confirm yet
        code = row.code or "----"
        await db.commit()
    # Require explicit, INFORMED confirmation with a matching code. This defeats
    # the login-CSRF: a phished victim who never opened the website sees no
    # matching code on any screen, so they tap Cancel.
    kb = InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text="✅ Confirm login", callback_data=f"wl:ok:{nonce}"),
        InlineKeyboardButton(text="❌ Cancel", callback_data=f"wl:no:{nonce}"),
    ]])
    await message.answer(
        "🔐 <b>Confirm web login</b>\n\n"
        "Only continue if you just opened the BFU website and it shows this code:\n\n"
        f"<code>{code}</code>\n\n"
        "If you didn't open the website, tap Cancel.",
        parse_mode="HTML", reply_markup=kb,
    )


@dp.callback_query(F.data.startswith("wl:"))
async def _web_login_confirm(cb: types.CallbackQuery) -> None:
    """Finalize (or cancel) a web-login handshake. Only the person who tapped the
    link may confirm, and only via this explicit button — never on the tap alone."""
    from app.models.web_login import WebLoginToken
    try:
        _, action, nonce = cb.data.split(":", 2)
    except ValueError:
        await cb.answer()
        return
    async with AsyncSessionLocal() as db:
        row = (await db.execute(
            select(WebLoginToken).where(WebLoginToken.nonce == nonce)
        )).scalar_one_or_none()
        if row is None or datetime.utcnow() - row.created_at > timedelta(minutes=5):
            await cb.answer("This login has expired.", show_alert=True)
            try:
                await cb.message.edit_text("⚠️ This login link expired. Try again from the website.")
            except Exception:
                pass
            return
        # Defence in depth: only the recorded tapper may confirm.
        if row.user_id is not None:
            u = await db.get(User, row.user_id)
            if u is None or not cb.from_user or u.telegram_id != cb.from_user.id:
                await cb.answer("This isn't your login.", show_alert=True)
                return
        if action == "ok":
            row.confirmed = True
            await db.commit()
            await cb.answer("Confirmed ✅")
            try:
                await cb.message.edit_text("✅ Logged in. Head back to your browser.")
            except Exception:
                pass
        else:
            await db.delete(row)
            await db.commit()
            await cb.answer("Cancelled")
            try:
                await cb.message.edit_text("❌ Login cancelled.")
            except Exception:
                pass


@dp.callback_query(F.data.startswith("gp_"))
async def _group_post_decision(cb: types.CallbackQuery) -> None:
    """Approve / Reject a pending PUBLIC-group post from the MANAGEMENT group.

    Security: only honored when the click comes from settings.TG_MANAGEMENT_GROUP_ID
    — so only the management group can approve a post. On approve the bot posts the
    queued card to the public group (via resolve_group_post); on reject it's
    dropped. The management card is edited to record the decision and its buttons
    removed. Wrapped so a bad click never crashes the polling loop."""
    try:
        # Gate: only the management group may decide.
        chat = cb.message.chat if cb.message else None
        if chat is None or chat.id != settings.TG_MANAGEMENT_GROUP_ID:
            await cb.answer("Not allowed", show_alert=True)
            return

        try:
            key, sid = (cb.data or "").split(":", 1)
            post_id = int(sid)
        except (ValueError, AttributeError):
            await cb.answer()
            return

        action = "approve" if key == "gp_ok" else "reject"
        decider = cb.from_user.id if cb.from_user else None
        name = (cb.from_user.full_name if cb.from_user else None) or "a manager"

        from app.services.group_moderation import resolve_group_post
        result = await resolve_group_post(post_id, action, decider)

        if result == "already":
            await cb.answer("Already handled")
            return
        if result == "not_found":
            await cb.answer("Post not found", show_alert=True)
            return
        if result == "error":
            await cb.answer("Something went wrong", show_alert=True)
            return

        if result == "posted":
            new_text = f"✅ Approved &amp; posted by {html.escape(name)}"
            toast = "Posted ✅"
        else:  # "rejected"
            new_text = f"❌ Rejected by {html.escape(name)}"
            toast = "Rejected"
        # Reflect the decision on the management card + drop the buttons. Falls
        # back to just removing the keyboard if the text edit fails.
        try:
            await cb.message.edit_text(new_text, parse_mode="HTML")
        except Exception:
            try:
                await cb.message.edit_reply_markup(reply_markup=None)
            except Exception:
                pass
        await cb.answer(toast)
    except Exception:
        logging.exception("group-post decision failed")
        try:
            await cb.answer()
        except Exception:
            pass


@dp.callback_query(F.data.startswith("ev:"))
async def _event_rsvp_intent(cb: types.CallbackQuery) -> None:
    """Attendee tapped ✅ Boraman / ❌ Borolmayman on an event reminder → flip their
    EventRsvp.lead_status to coming / cant_come (feeds the partner funnel). The
    reminder's buttons stay, so they can switch their mind on any reminder.
    Idempotent + best-effort; a bad tap never crashes the polling loop."""
    try:
        from app.models.event_rsvp import EventRsvp
        try:
            _, action, sid = (cb.data or "").split(":", 2)
            ev_id = int(sid)
        except (ValueError, AttributeError):
            await cb.answer()
            return
        if action not in ("coming", "cant"):
            await cb.answer()
            return
        new_status = "coming" if action == "coming" else "cant_come"
        tg_id = cb.from_user.id if cb.from_user else None
        if not tg_id:
            await cb.answer()
            return
        lang = "en"
        async with AsyncSessionLocal() as db:
            u = (await db.execute(
                select(User).where(User.telegram_id == tg_id)
            )).scalar_one_or_none()
            if u is None:
                await cb.answer("Register in BFU first.", show_alert=True)
                return
            if u.language in ("en", "uz", "ru"):
                lang = u.language
            row = (await db.execute(select(EventRsvp).where(
                EventRsvp.event_id == ev_id, EventRsvp.user_id == u.id,
            ))).scalar_one_or_none()
            if row is None:
                await cb.answer(
                    {"en": "You're not registered for this event.",
                     "uz": "Siz bu tadbirga ro'yxatdan o'tmagansiz.",
                     "ru": "Вы не зарегистрированы на это мероприятие."}.get(lang, "Not registered"),
                    show_alert=True,
                )
                return
            row.lead_status = new_status
            await db.commit()
        toasts = {
            "coming": {"en": "Great — see you there! ✅", "uz": "Zo'r — kutamiz! ✅",
                       "ru": "Отлично — ждём вас! ✅"},
            "cant_come": {"en": "Noted — thanks for letting us know.",
                          "uz": "Qabul qilindi — bildirganingiz uchun rahmat.",
                          "ru": "Принято — спасибо, что сообщили."},
        }[new_status]
        await cb.answer(toasts.get(lang, toasts["en"]))
    except Exception:
        logging.exception("event rsvp intent failed")
        try:
            await cb.answer()
        except Exception:
            pass


@dp.message(CommandStart())
async def command_start_handler(message: types.Message, command: CommandObject) -> None:
    """
    This handler receives messages with `/start` command
    and sends a message with a WebApp button. A `web_<nonce>` deep-link payload
    instead confirms a desktop web-login handshake.
    """
    payload = (command.args or "").strip()
    if payload.startswith("web_"):
        await _handle_web_login(message, payload[len("web_"):])
        return

    # Reaching /start proves the bot CAN DM this user — flip their reachability
    # flag so admin nudges know it. Best-effort: never let it break /start.
    try:
        async with AsyncSessionLocal() as db:
            u = (await db.execute(
                select(User).where(User.telegram_id == message.from_user.id)
            )).scalar_one_or_none()
            if u is not None and not u.can_message:
                u.can_message = True
                await db.commit()
    except Exception:
        pass

    webapp_url = getattr(settings, "WEBAPP_URL", "https://your-mini-app.telegram.app")
    tr = _START[_lang_of(message)]

    markup = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text=tr["btn"],
                    web_app=WebAppInfo(url=webapp_url)
                )
            ]
        ]
    )

    await message.answer(tr["msg"], parse_mode="HTML", reply_markup=markup)


@dp.message(Command("me"))
async def command_me_handler(message: types.Message) -> None:
    """`/me` — shortcut that just opens the Mini App."""
    webapp_url = getattr(settings, "WEBAPP_URL", "https://your-mini-app.telegram.app")
    tr = _START[_lang_of(message)]
    markup = InlineKeyboardMarkup(
        inline_keyboard=[[InlineKeyboardButton(text=tr["btn"], web_app=WebAppInfo(url=webapp_url))]]
    )
    await message.answer("👤", reply_markup=markup)


def _deep(param: str) -> str:
    """Telegram deep link into the Mini App with a start parameter."""
    return f"https://t.me/{settings.BOT_USERNAME}?startapp={param}"


async def build_inline_results(query: str, tg_user_id: int, db) -> list:
    """Inline-mode results for `query`. Returns InlineQueryResultArticle objects.

    Pulled out of the handler so it is unit-testable without the polling loop.
    - Non-empty query: ILIKE on approved/non-draft/non-deleted project name+about.
    - Empty query: the typist's own profile link (if they're a BFU user) + recent
      approved projects.
    """
    q = (query or "").strip()
    results: list = []

    # On an empty query, lead with the typist's own shareable profile link.
    if not q:
        me = (await db.execute(
            select(User).where(User.telegram_id == tg_user_id,
                               User.is_deleted == False, User.is_registered == True)
        )).scalar_one_or_none()
        if me is not None:
            link = _deep(f"user_{me.id}")
            results.append(InlineQueryResultArticle(
                id=f"me_{me.id}",
                title="📇 Share my BFU profile",
                description="Send a link to your Bright Futures profile",
                url=link,
                input_message_content=InputTextMessageContent(
                    message_text=f"My Bright Futures Uzbekistan profile 👉 {link}",
                    disable_web_page_preview=False,
                ),
            ))

    stmt = (
        select(Project)
        .where(Project.is_approved == True, Project.is_draft == False,
               Project.is_deleted == False)
        .order_by(Project.created_at.desc())
        .limit(12)
    )
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(Project.name.ilike(like), Project.about.ilike(like)))

    projects = (await db.execute(stmt)).scalars().all()
    for p in projects:
        link = _deep(f"project_{p.id}")
        teaser = (p.about or "").strip().replace("\n", " ")
        if len(teaser) > 120:
            teaser = teaser[:117] + "…"
        kind = "Startup" if p.type == "startup" else "Volunteering"
        results.append(InlineQueryResultArticle(
            id=f"proj_{p.id}",
            title=p.name,
            description=(teaser or kind),
            url=link,
            input_message_content=InputTextMessageContent(
                message_text=(f"🚀 {p.name}\n{teaser}\n\nOpen on BFU 👉 {link}"
                              if teaser else f"🚀 {p.name}\n\nOpen on BFU 👉 {link}"),
                disable_web_page_preview=False,
            ),
        ))
    return results


@dp.inline_query()
async def inline_query_handler(query: InlineQuery) -> None:
    """`@BrightFuturesUzbekistan_bot <text>` in any chat → shareable project /
    profile cards that deep-link into the Mini App.

    Requires inline mode enabled in BotFather (FOUNDER STEP 1)."""
    async with AsyncSessionLocal() as session:
        results = await build_inline_results(query.query, query.from_user.id, session)
    # is_personal: results include the typist's own profile → never cross-cache.
    await query.answer(results, cache_time=15, is_personal=True)


_STICKERS = {
    "en": {
        "btn": "🎨 Get our stickers",
        "soon": "Our sticker pack is coming soon! 🎨",
    },
    "uz": {
        "btn": "🎨 Stikerlarni olish",
        "soon": "Stiker to‘plamimiz tez orada! 🎨",
    },
    "ru": {
        "btn": "🎨 Получить стикеры",
        "soon": "Наш стикерпак скоро появится! 🎨",
    },
}


@dp.message(Command("stickers"))
async def command_stickers_handler(message: types.Message) -> None:
    """`/stickers` — link to the BFU sticker pack (FOUNDER STEP 2 supplies it).
    Until STICKER_PACK_URL is set, reply a friendly 'coming soon'."""
    lang = _lang_of(message)
    tr = _STICKERS.get(lang, _STICKERS["en"])
    url = (settings.STICKER_PACK_URL or "").strip()
    if not url:
        await message.answer(tr["soon"])
        return
    markup = InlineKeyboardMarkup(
        inline_keyboard=[[InlineKeyboardButton(text=tr["btn"], url=url)]]
    )
    await message.answer(tr["btn"], reply_markup=markup)


_LOC = {
    "en": "📍 Location saved: {lat}, {lng}\nOpen the web admin → Locations → Add/Edit → “Use my Telegram location”.",
    "uz": "📍 Joylashuv saqlandi: {lat}, {lng}\nVeb-admin → Joylashuvlar → Qo‘shish/Tahrirlash → “Telegram joylashuvimdan foydalanish”.",
    "ru": "📍 Локация сохранена: {lat}, {lng}\nВеб-админка → Локации → Добавить/Изменить → «Использовать мою локацию из Telegram».",
}


@dp.message(F.location)
async def location_handler(message: types.Message) -> None:
    """An admin shares a location → store it so the web admin can apply it
    to a school / learning center."""
    tg_id = message.from_user.id
    lat = message.location.latitude
    lng = message.location.longitude
    async with AsyncSessionLocal() as session:
        res = await session.execute(select(User).where(User.telegram_id == tg_id))
        user = res.scalar_one_or_none()
        if not user or user.role not in ("admin", "super_admin"):
            return  # only admins can pin school/LC positions
        loc = await session.get(PendingLocation, tg_id)
        if loc:
            loc.latitude = lat
            loc.longitude = lng
            await session.commit()
        else:
            session.add(PendingLocation(telegram_id=tg_id, latitude=lat, longitude=lng))
            try:
                await session.commit()
            except IntegrityError:
                # Concurrent share racing the PK — reload and update instead.
                await session.rollback()
                loc = await session.get(PendingLocation, tg_id)
                if loc:
                    loc.latitude = lat
                    loc.longitude = lng
                    await session.commit()
    lang = _lang_of(message)
    await message.answer(_LOC.get(lang, _LOC["en"]).format(lat=lat, lng=lng))


async def main() -> None:
    logging.basicConfig(level=logging.INFO, stream=sys.stdout)
    logging.info("Starting Telegram Bot launcher...")
    # Supervise polling: a transient network error / Telegram outage must not
    # permanently kill the bot. Restart with a short backoff (KeyboardInterrupt
    # / SystemExit still exit cleanly).
    while True:
        try:
            await dp.start_polling(bot)
        except (KeyboardInterrupt, SystemExit):
            raise
        except Exception:
            logging.exception("Polling crashed — restarting in 5s")
            await asyncio.sleep(5)

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except (KeyboardInterrupt, SystemExit):
        logging.info("Bot stopped.")
