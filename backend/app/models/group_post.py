"""A would-be public-group post held for MANAGEMENT approval.

The founder's rule: nothing is posted to the public Telegram group
automatically. Everything that used to go straight to the public group is
instead queued as one of these rows and shown in the management group with
Approve / Reject buttons. Only on Approve does the bot post row.text to the
public group and stamp decided_by / decided_at.

status is pending | approved | rejected. See app.services.group_moderation
(queue_group_post / resolve_group_post) and the ``gp_`` callback in bot.py.
The table is created by Base.metadata.create_all in the app lifespan — no ALTER
needed — because this model is imported in app.models.__init__.
"""
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class PendingGroupPost(Base):
    __tablename__ = "pending_group_posts"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    # The already-composed (HTML-escaped) card body the caller wanted to publish.
    text: Mapped[str] = mapped_column(Text, nullable=False)
    # Mini App deep-link start parameter (e.g. "project_42" / "event_7").
    start_param: Mapped[str] = mapped_column(String(128), nullable=False)
    # Label of the deep-link button on the public post. Nullable → default in the
    # moderation service.
    button_text: Mapped[str | None] = mapped_column(String(64), nullable=True)
    status: Mapped[str] = mapped_column(
        String(12), default="pending", server_default="pending", nullable=False
    )  # pending | approved | rejected
    # message_id of the card sent to the management group (so the bot can edit it
    # on a decision).
    mgmt_message_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    # Telegram id of the manager who approved/rejected + when.
    decided_by: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
