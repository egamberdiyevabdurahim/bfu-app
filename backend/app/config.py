from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str = "postgresql+asyncpg://postgres:password@localhost:5432/bfu_db"
    BOT_TOKEN: str = ""
    DEVELOPER_ID: int = 0
    SECRET_KEY: str = "change-me"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    ANTHROPIC_API_KEY: str = ""
    AI_MODEL: str = "claude-haiku-4-5-20251001"
    CORS_ORIGINS: list[str] = ["http://localhost:5173"]
    ENVIRONMENT: str = "production"
    # Public HTTPS URL of the Mini App — the bot's ONLY "Launch BFU" CTA target.
    # Default is empty so an unset prod env fails loudly at boot (below) instead
    # of silently pointing every user at a dead personal ngrok tunnel.
    WEBAPP_URL: str = ""
    # Default Telegram groups every user must join
    TG_GLOBAL_GROUP_ID: int = 0
    TG_GLOBAL_GROUP_LINK: str = ""
    TG_OFFICIAL_CHANNEL_ID: int = 0
    TG_OFFICIAL_CHANNEL_LINK: str = ""
    # Notification groups
    ADMIN_GROUP_ID: int = 0
    DEVELOPER_GROUP_ID: int = 0
    # Management-approval queue for public-group posts. When set, NOTHING is
    # posted to the public group (TG_GLOBAL_GROUP_ID) automatically — every
    # would-be public-group card is first queued into THIS management group with
    # Approve / Reject buttons, and only posts to the public group after a manager
    # approves it here. The bot MUST be a member/admin of this group. When UNSET
    # (the founder's default), group distribution is OFF: nothing is posted to any
    # group. See app.services.group_moderation.
    TG_MANAGEMENT_GROUP_ID: int | None = None
    # Optional forum-topic thread id inside the management group. If set, pending
    # posts go to that thread (Telegram message_thread_id); otherwise to the
    # group's main feed.
    TG_MANAGEMENT_TOPIC_ID: int | None = None
    BOT_USERNAME: str = "BrightFuturesUzbekistan_bot"
    # Published BFU sticker pack URL (https://t.me/addstickers/<name>). Set once
    # the founder creates the pack via @Stickers (FOUNDER STEP 2). Empty until
    # then → /stickers replies "coming soon".
    STICKER_PACK_URL: str = ""
    # Public HTTPS base of THIS backend. Used to build absolute URLs (e.g. the
    # Story card) that Telegram must fetch over HTTPS. request.base_url is
    # unreliable behind Railway's proxy (reports http://), so prefer this.
    # Railway injects RAILWAY_PUBLIC_DOMAIN automatically; PUBLIC_API_URL can
    # override it explicitly.
    PUBLIC_API_URL: str = ""
    RAILWAY_PUBLIC_DOMAIN: str = ""
    # DB connection pool per PROCESS. The API and the bot each open their own
    # engine, so total live connections = (API pool+overflow) + (bot pool+overflow)
    # + cron. Keep the sum under the Postgres server's max_connections. The bot
    # sets small values via its own env (DB_POOL_SIZE=2 / DB_MAX_OVERFLOW=3).
    DB_POOL_SIZE: int = 15
    DB_MAX_OVERFLOW: int = 15

    @property
    def is_dev(self) -> bool:
        return self.ENVIRONMENT == "development"

    @property
    def api_base_url(self) -> str:
        """Absolute https base for this backend, no trailing slash."""
        if self.PUBLIC_API_URL:
            return self.PUBLIC_API_URL.rstrip("/")
        if self.RAILWAY_PUBLIC_DOMAIN:
            return f"https://{self.RAILWAY_PUBLIC_DOMAIN}"
        return ""


settings = Settings()

# Fail fast: with the default secret anyone can forge a super-admin JWT.
# A missing/misnamed SECRET_KEY env var must never boot in production.
if not settings.is_dev and settings.SECRET_KEY in ("", "change-me"):
    raise RuntimeError(
        "SECRET_KEY is unset or default in production. "
        "Set a strong SECRET_KEY env var (e.g. python -c "
        '"import secrets; print(secrets.token_urlsafe(48))").'
    )

# The bot's only CTA opens WEBAPP_URL — an unset value in prod means a dead
# "Launch BFU" button for every user. Fail at boot rather than ship it broken.
if not settings.is_dev and not settings.WEBAPP_URL:
    raise RuntimeError(
        "WEBAPP_URL is unset in production. Set it to the live Mini App URL "
        "(e.g. https://brightfuturesuzbekistan.uz)."
    )
