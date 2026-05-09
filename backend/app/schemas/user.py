from datetime import datetime

from pydantic import BaseModel


class AnalysisOut(BaseModel):
    skills: list[str] = []
    knowledges: list[str] = []
    interests: list[str] = []
    preparations: list[str] = []
    goals: list[str] = []

    model_config = {"from_attributes": True}


class UserResponse(BaseModel):
    id: int
    telegram_id: int
    tg_username: str | None
    language: str
    name: str | None
    surname: str | None
    gender: str | None
    birth_year: int | None
    phone_number: str | None
    region_id: int | None
    about: str | None
    is_registered: bool
    checked: bool
    open_to_work: bool
    open_to_volunteering: bool
    display_name: str
    analysis: AnalysisOut | None = None
    created_at: datetime
    role: str

    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    language: str | None = None
    tg_username: str | None = None
    name: str | None = None
    surname: str | None = None
    gender: str | None = None
    birth_year: int | None = None
    phone_number: str | None = None
    region_id: int | None = None
    about: str | None = None
    open_to_work: bool | None = None
    open_to_volunteering: bool | None = None
    is_registered: bool | None = None
    school_id: int | None = None
    learning_center_ids: list[int] | None = None

class UserPublic(BaseModel):
    """Full public profile — shown when clicking on a user."""
    id: int
    telegram_id: int
    tg_username: str | None = None
    role: str
    display_name: str
    name: str | None
    surname: str | None
    gender: str | None
    birth_year: int | None
    region_id: int | None
    about: str | None
    open_to_work: bool
    open_to_volunteering: bool
    analysis: AnalysisOut | None = None

    model_config = {"from_attributes": True}


class GroupStatus(BaseModel):
    """Used in check-groups response."""
    group_id: int
    group_link: str
    name: str
    joined: bool
