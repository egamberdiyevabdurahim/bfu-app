import asyncio
import logging
import sys

from aiogram import Bot, Dispatcher, F, types
from aiogram.filters import Command, CommandStart
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo
from sqlalchemy import select

from app.config import settings
from app.database import AsyncSessionLocal
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
