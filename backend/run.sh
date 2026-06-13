#!/bin/bash

# Start the Telegram Bot in the background
python bot.py &

# Start the FastAPI server in the foreground.
# --proxy-headers + --forwarded-allow-ips='*' so request.url reflects the
# real https scheme behind Railway's edge proxy (X-Forwarded-Proto).
uvicorn app.main:app --host 0.0.0.0 --port $PORT --proxy-headers --forwarded-allow-ips='*'
