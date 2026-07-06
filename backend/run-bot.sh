#!/bin/bash

# Dedicated Telegram-bot entrypoint for its OWN Railway service.
#
# Run the bot in the FOREGROUND so Railway supervises it and restarts it on
# crash — unlike the old `python bot.py &` background process in run.sh, which
# run.sh never noticed if it died (the container stayed alive on uvicorn while
# the bot was silently gone).
#
# To split the bot out (do OFF-PEAK — see the cutover note in run.sh):
#   1. Create a SECOND Railway service from this same repo (root dir: backend/),
#      sharing the SAME environment variables (BOT_TOKEN, DATABASE_URL, etc.).
#   2. Set that service's start command to:  sh run-bot.sh
#   3. Set RUN_BOT_INLINE=false on the existing web (API) service.
#   Steps 2 and 3 must land together so exactly one bot.py instance polls
#   Telegram at any moment (two pollers on one token => 409 Conflict).
python bot.py
