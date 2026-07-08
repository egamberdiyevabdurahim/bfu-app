from datetime import datetime

from pydantic import BaseModel


class ChatPerson(BaseModel):
    """The other party in a DM (avatar + name + presence dot)."""
    id: int
    display_name: str
    photo_url: str | None = None
    is_online: bool = False


class ChatProject(BaseModel):
    """The project a team chat belongs to."""
    id: int
    name: str


class LastMessage(BaseModel):
    body: str
    created_at: datetime | None = None
    sender_id: int


class ConversationOut(BaseModel):
    id: int
    kind: str  # "dm" | "project"
    other: ChatPerson | None = None       # set for kind == "dm"
    project: ChatProject | None = None    # set for kind == "project"
    last_message: LastMessage | None = None
    unread: int = 0


class MessageSender(BaseModel):
    id: int
    display_name: str
    photo_url: str | None = None


class ReplyPreview(BaseModel):
    """The message a message is replying to (compact quote)."""
    id: int
    body: str
    sender_name: str | None = None


class MessageOut(BaseModel):
    id: int
    conversation_id: int
    sender_id: int
    body: str
    created_at: datetime | None = None
    sender: MessageSender | None = None
    reply_to: ReplyPreview | None = None
    edited: bool = False
    deleted: bool = False


class MessagesPage(BaseModel):
    messages: list[MessageOut] = []
    has_more: bool = False


class SendMessageIn(BaseModel):
    body: str
    reply_to_id: int | None = None


class EditMessageIn(BaseModel):
    body: str


class ReportMessageIn(BaseModel):
    reason: str | None = None


class ConversationRef(BaseModel):
    """Minimal find-or-create response: just the conversation id to open."""
    id: int


class UnreadCount(BaseModel):
    unread: int = 0
