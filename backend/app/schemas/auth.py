from pydantic import BaseModel


class TelegramAuthRequest(BaseModel):
    init_data: str


class TelegramWidgetAuthRequest(BaseModel):
    """Fields returned by the Telegram Login Widget (desktop web login)."""
    id: int
    first_name: str | None = None
    last_name: str | None = None
    username: str | None = None
    photo_url: str | None = None
    auth_date: int
    hash: str


class RefreshRequest(BaseModel):
    refresh_token: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    is_registered: bool
    is_new_user: bool
