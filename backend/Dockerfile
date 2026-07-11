# BFU backend image — shared by the api, bot, and cron services (compose picks
# the command). Fonts for the PIL share-cards live in app/assets/fonts (in-repo),
# and Pillow/asyncpg ship manylinux wheels, so slim + pip is enough.
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# postgresql-client gives us pg_isready/psql for healthchecks + one-off ops.
RUN apt-get update && apt-get install -y --no-install-recommends postgresql-client \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

EXPOSE 8000

# Default = the API. compose overrides `command` for the bot + cron services.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", \
     "--proxy-headers", "--forwarded-allow-ips=*"]
