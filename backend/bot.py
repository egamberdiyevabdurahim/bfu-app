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

@dp.message(CommandStart())
async def command_start_handler(message: types.Message) -> None:
    """
    This handler receives messages with `/start` command
    and sends a message with a WebApp button.
    """
    webapp_url = getattr(settings, "WEBAPP_URL", "https://your-mini-app.telegram.app")
    
    markup = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="🚀 Launch BFU",
                    web_app=WebAppInfo(url=webapp_url)
                )
            ]
        ]
    )
    
    await message.answer(
        "Welcome to Bright Futures Uzbekistan! 🇺🇿\n\n"
        "Click the button below to launch the app, find co-founders, and discover volunteering opportunities.",
        reply_markup=markup
    )

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
