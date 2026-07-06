#!/bin/bash

# Optionally run the Telegram bot in-process alongside the API (the current,
# default behavior). Set RUN_BOT_INLINE=false once the bot runs as its OWN
# Railway service (see run-bot.sh) so the API container no longer shares CPU
# and the DB connection pool with the bot's polling loop, and so a crash in
# one can't silently take down the other.
#
# CUTOVER (do this OFF-PEAK, never during a traffic spike — expect a few
# seconds of bot downtime): only ONE bot.py may poll Telegram at a time (a
# second getUpdates poller gets a 409 Conflict), so bring up the dedicated
# bot service and set RUN_BOT_INLINE=false on this web service together —
# never leave both polling at once.
if [ "${RUN_BOT_INLINE:-true}" != "false" ]; then
  python bot.py &
fi

# Start the FastAPI server in the foreground.
# --proxy-headers + --forwarded-allow-ips='*' so request.url reflects the
# real https scheme behind Railway's edge proxy (X-Forwarded-Proto).
uvicorn app.main:app --host 0.0.0.0 --port $PORT --proxy-headers --forwarded-allow-ips='*'
