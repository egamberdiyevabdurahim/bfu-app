import asyncio
import logging
import sys

from aiogram import Bot, Dispatcher, F, types
from aiogram.filters import Command, CommandStart
from aiogram.types import (
    InlineKeyboardButton, InlineKeyboardMarkup, InlineQuery,
    InlineQueryResultArticle, InputTextMessageContent, WebAppInfo,
)
from sqlalchemy import or_, select

from app.config import settings
from app.database import AsyncSessionLocal
from app.models.project import Project
from app.models.user import PendingLocation, User

# Initialize Bot and Dispatcher
bot = Bot(token=settings.BOT_TOKEN)
dp = Dispatcher()

_START = {
    "en": {
        "btn": "🚀 Launch BFU",
        "msg": (
            "Welcome to Bright Futures Uzbekistan! 🇺🇿\n\n"
            "Click the button below to launch the app, find co-founders, "
            "and discover volunteering opportunities."
        ),
    },
    "uz": {
        "btn": "🚀 BFU’ni ochish",
        "msg": (
            "Bright Futures Uzbekistan’ga xush kelibsiz! 🇺🇿\n\n"
            "Ilovani ochish, hammuassis topish va volontyorlik "
            "imkoniyatlarini kashf etish uchun quyidagi tugmani bosing."
        ),
    },
    "ru": {
        "btn": "🚀 Открыть BFU",
        "msg": (
            "Добро пожаловать в Bright Futures Uzbekistan! 🇺🇿\n\n"
            "Нажмите кнопку ниже, чтобы открыть приложение, найти "
            "сооснователей и волонтёрские возможности."
        ),
    },
}


def _lang_of(message: types.Message) -> str:
    code = (message.from_user.language_code or "en")[:2].lower()
    return code if code in _START else "en"


@dp.message(CommandStart())
async def command_start_handler(message: types.Message) -> None:
    """
    This handler receives messages with `/start` command
    and sends a message with a WebApp button.
    """
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

    await message.answer(tr["msg"], reply_markup=markup)


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
        else:
            session.add(PendingLocation(telegram_id=tg_id, latitude=lat, longitude=lng))
        await session.commit()
    lang = _lang_of(message)
    await message.answer(_LOC.get(lang, _LOC["en"]).format(lat=lat, lng=lng))


async def main() -> None:
    logging.basicConfig(level=logging.INFO, stream=sys.stdout)
    if not settings.BOT_TOKEN:
        logging.error("BOT_TOKEN is not set in .env")
        return
        
    logging.info("Starting Telegram Bot launcher...")
    await dp.start_polling(bot)

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except (KeyboardInterrupt, SystemExit):
        logging.info("Bot stopped.")
