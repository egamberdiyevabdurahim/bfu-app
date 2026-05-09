from pydantic import BaseModel


class TelegramAuthRequest(BaseModel):
    init_data: str


class RefreshRequest(BaseModel):
    refresh_token: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    is_registered: bool
    is_new_user: bool
