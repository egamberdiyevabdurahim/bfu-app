"""Short-lived one-time tokens for the desktop 'log in via the bot' flow.

The web app creates a row (unconfirmed) and opens a t.me deep link carrying the
nonce. When the user taps Start, the bot resolves who they are and marks the
row confirmed for that user_id. The web app polls until confirmed, then trades
the (single-use) token for a JWT. Rows are short-lived (5 min) and deleted on
successful poll or expiry."""
from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class WebLoginToken(Base):
    __tablename__ = "web_login_tokens"

    nonce: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    confirmed: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
