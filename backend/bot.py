import asyncio
import logging
import sys

from aiogram import Bot, Dispatcher, types
from aiogram.filters import CommandStart
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo

from app.config import settings

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
