from datetime import datetime

from pydantic import BaseModel

from app.schemas.user import UserMini


class FollowIn(BaseModel):
    target_type: str   # "user" | "project"
    target_id: int


class ProjectUpdateIn(BaseModel):
    text: str


class ProjectUpdateOut(BaseModel):
    id: int
    text: str
    author: UserMini | None = None
    created_at: datetime | None = None


class SlotIn(BaseModel):
    start_at: datetime


class SlotOut(BaseModel):
    id: int
    start_at: datetime
    status: str
    duration_min: int = 15


class BookingIn(BaseModel):
    slot_id: int
    note: str | None = None


class BookingActionIn(BaseModel):
    action: str   # confirm | decline | cancel


class BookingOut(BaseModel):
    id: int
    slot_id: int
    status: str
    note: str | None = None
    start_at: datetime | None = None
    other: UserMini | None = None       # the other party (mentor for mentee view, vice-versa)
    created_at: datetime | None = None


class MentorCard(BaseModel):
    id: int
    display_name: str
    photo_url: str | None = None
    bio: str | None = None
    topics: list[str] = []
    open_slots: int = 0
