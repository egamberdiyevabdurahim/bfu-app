"""Management-approval queue for public Telegram group posts.

Founder's rule: NOTHING is posted to the public group (settings.TG_GLOBAL_GROUP_ID)
automatically. Everything that used to go straight to the public group is instead
queued into a MANAGEMENT chat (settings.TG_MANAGEMENT_GROUP_ID, optionally a
forum-topic thread via TG_MANAGEMENT_TOPIC_ID) with Approve / Reject inline
buttons. Only when a manager taps "Approve" (the ``gp_`` callback in bot.py, which
calls resolve_group_post) does the bot post the queued card to the public group.

If no management group is configured, group distribution is OFF by design:
queue_group_post logs and returns, posting nothing anywhere.

Neither function raises — group distribution must never break the request (or the
cron / bot) that triggered it.
"""
from __future__ import annotations

import logging
from datetime import datetime

from app.config import settings
from app.database import AsyncSessionLocal
from app.models.group_post import PendingGroupPost
from app.services.notify import send_telegram, send_telegram_message

logger = logging.getLogger(__name__)

DEFAULT_BUTTON_TEXT = "🚀 Open in BFU"

# The three normalized actions resolve_group_post accepts. The bot passes
# "approve"/"reject"; the raw callback prefixes are accepted too for robustness.
_APPROVE = {"approve", "gp_ok", "ok"}
_REJECT = {"reject", "gp_no", "no"}


async def queue_group_post(
    text: str, start_param: str, button_text: str = DEFAULT_BUTTON_TEXT
) -> None:
    """Queue a would-be public-group post for management approval instead of
    posting it directly to the public group.

    * If settings.TG_MANAGEMENT_GROUP_ID is falsy: log and RETURN — post NOTHING
      anywhere and store NOTHING (group distribution is OFF until the founder sets
      the management group).
    * Otherwise: insert a pending PendingGroupPost row, then send the management
      group a card showing the pending text with Approve / Reject buttons, and
      store the returned management message_id on the row.

    `text` is expected to already be a composed, HTML-escaped card body. Never
    raises."""
    try:
        if not settings.TG_MANAGEMENT_GROUP_ID:
            logger.info("group post suppressed — no management group configured")
            return

        async with AsyncSessionLocal() as db:
            row = PendingGroupPost(
                text=text,
                start_param=start_param,
                button_text=button_text or DEFAULT_BUTTON_TEXT,
                status="pending",
            )
            db.add(row)
            await db.flush()  # assign row.id before we build callback_data

            markup = {"inline_keyboard": [[
                {"text": "✅ Approve & post", "callback_data": f"gp_ok:{row.id}"},
                {"text": "❌ Reject", "callback_data": f"gp_no:{row.id}"},
            ]]}
            # The body is already-composed HTML; just prepend a light header.
            body = "🕒 <b>Pending group post — approve to publish:</b>\n\n" + text
            mid = await send_telegram_message(
                settings.TG_MANAGEMENT_GROUP_ID, body, reply_markup=markup,
                message_thread_id=settings.TG_MANAGEMENT_TOPIC_ID,
            )
            if mid is not None:
                row.mgmt_message_id = mid
            await db.commit()
    except Exception:  # a queued post must never break its caller
        logger.exception("queue_group_post failed")


async def resolve_group_post(post_id: int, action: str, decider_id: int | None) -> str:
    """Approve or reject a pending group post. The bot's ``gp_`` callback calls
    this after verifying the click came from the management group; it is also the
    unit-testable core of the decision.

    On approve: post row.text to the PUBLIC group (settings.TG_GLOBAL_GROUP_ID)
    with the deep-link button, then mark the row approved. On reject: mark it
    rejected. An already-decided (non-pending) row is a no-op.

    Returns a short status the caller turns into a toast + management-message
    edit: 'posted' | 'rejected' | 'already' | 'not_found' | 'error'. Never
    raises."""
    normalized = (action or "").lower()
    if normalized in _APPROVE:
        approve = True
    elif normalized in _REJECT:
        approve = False
    else:
        return "error"

    try:
        async with AsyncSessionLocal() as db:
            row = await db.get(PendingGroupPost, post_id)
            if row is None:
                return "not_found"
            if row.status != "pending":
                return "already"

            if approve:
                # Post to the PUBLIC group with the same deep-link button the old
                # _broadcast_to_group used. Best-effort: even if the send fails we
                # still record the decision so it can't be re-approved in a loop.
                if settings.TG_GLOBAL_GROUP_ID:
                    url = f"https://t.me/{settings.BOT_USERNAME}?startapp={row.start_param}"
                    await send_telegram(
                        settings.TG_GLOBAL_GROUP_ID, row.text,
                        reply_markup={"inline_keyboard": [[
                            {"text": row.button_text or DEFAULT_BUTTON_TEXT, "url": url},
                        ]]},
                    )
                row.status = "approved"
            else:
                row.status = "rejected"

            row.decided_by = decider_id
            row.decided_at = datetime.utcnow()
            await db.commit()
            return "posted" if approve else "rejected"
    except Exception:
        logger.exception("resolve_group_post failed")
        return "error"
