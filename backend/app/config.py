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
    WEBAPP_URL: str = "https://grilled-renae-unforeseeably.ngrok-free.dev"
    # Default Telegram groups every user must join
    TG_GLOBAL_GROUP_ID: int = 0
    TG_GLOBAL_GROUP_LINK: str = ""
    TG_OFFICIAL_CHANNEL_ID: int = 0
    TG_OFFICIAL_CHANNEL_LINK: str = ""
    # Notification groups
    ADMIN_GROUP_ID: int = 0
    DEVELOPER_GROUP_ID: int = 0
    BOT_USERNAME: str = "BrightFuturesUzbekistan_bot"

    @property
    def is_dev(self) -> bool:
        return self.ENVIRONMENT == "development"


settings = Settings()

# Fail fast: with the default secret anyone can forge a super-admin JWT.
# A missing/misnamed SECRET_KEY env var must never boot in production.
if not settings.is_dev and settings.SECRET_KEY in ("", "change-me"):
    raise RuntimeError(
        "SECRET_KEY is unset or default in production. "
        "Set a strong SECRET_KEY env var (e.g. python -c "
        '"import secrets; print(secrets.token_urlsafe(48))").'
    )
