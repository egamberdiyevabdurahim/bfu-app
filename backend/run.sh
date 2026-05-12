#!/bin/bash

# Start the Telegram Bot in the background
python bot.py &

# Start the FastAPI server in the foreground
uvicorn app.main:app --host 0.0.0.0 --port $PORT
