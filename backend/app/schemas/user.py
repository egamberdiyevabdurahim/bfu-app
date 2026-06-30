from datetime import datetime

from pydantic import BaseModel


class AnalysisOut(BaseModel):
    skills: list[str] = []
    knowledges: list[str] = []
    interests: list[str] = []
    preparations: list[str] = []
    goals: list[str] = []

    model_config = {"from_attributes": True}


class ProfileProject(BaseModel):
    id: int
    name: str
    type: str
    is_active: bool
    # Founder list uses created_at; member list uses joined_at. Whichever is
    # relevant for the row is placed in `date` so the frontend stays simple.
    date: datetime | None = None

    model_config = {"from_attributes": True}


class ProfileStats(BaseModel):
    projects_founded: int = 0
    projects_joined: int = 0
    applications_accepted: int = 0


class PortfolioLink(BaseModel):
    label: str
    url: str


class UserMini(BaseModel):
    """Lightweight person preview embedded in trust payloads."""
    id: int
    display_name: str
    photo_url: str | None = None

    model_config = {"from_attributes": True}


class EndorsementOut(BaseModel):
    skill: str
    count: int = 0
    endorsed_by_me: bool = False


class VouchOut(BaseModel):
    id: int
    text: str
    author: UserMini | None = None
    created_at: datetime | None = None


class RatingOut(BaseModel):
    average: float | None = None
    count: int = 0


class MutualConnections(BaseModel):
    count: int = 0
    preview: list[UserMini] = []


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
    latitude: float | None = None
    longitude: float | None = None
    is_registered: bool
    checked: bool
    open_to_work: bool
    open_to_volunteering: bool
    display_name: str
    photo_url: str | None = None
    analysis: AnalysisOut | None = None
    created_at: datetime
    role: str
    denied_fields: str | None = None
    denied_note: str | None = None
    currently_building: str | None = None
    currently_building_source: str | None = None  # "manual" | "auto" | None
    portfolio_links: list[PortfolioLink] = []
    founded_projects: list[ProfileProject] = []
    member_projects: list[ProfileProject] = []
    stats: ProfileStats = ProfileStats()
    endorsements: list[EndorsementOut] = []
    vouches: list[VouchOut] = []
    vouch_count: int = 0
    rating: RatingOut = RatingOut()
    mutual_connections: MutualConnections = MutualConnections()

    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    # tg_username and is_registered are intentionally NOT updatable here:
    # tg_username only comes from validated initData (/auth/telegram) or the
    # getChat-verified /me/fetch-tg-username (else users could point chat
    # links at someone else's account); is_registered only via /me/finalize
    # (else referral payoff + admin notify are skipped).
    language: str | None = None
    name: str | None = None
    surname: str | None = None
    gender: str | None = None
    birth_year: int | None = None
    phone_number: str | None = None
    region_id: int | None = None
    about: str | None = None
    open_to_work: bool | None = None
    open_to_volunteering: bool | None = None
    school_id: int | None = None
    learning_center_ids: list[int] | None = None
    latitude: float | None = None
    longitude: float | None = None
    currently_building: str | None = None
    portfolio_links: list[PortfolioLink] | None = None

class UserPublic(BaseModel):
    """Full public profile — shown when clicking on a user."""
    id: int
    telegram_id: int
    tg_username: str | None = None
    role: str
    checked: bool = False
    display_name: str
    photo_url: str | None = None
    badges: list[str] = []
    name: str | None
    surname: str | None
    gender: str | None
    birth_year: int | None
    region_id: int | None
    about: str | None
    open_to_work: bool
    open_to_volunteering: bool
    analysis: AnalysisOut | None = None
    currently_building: str | None = None
    currently_building_source: str | None = None  # "manual" | "auto" | None
    portfolio_links: list[PortfolioLink] = []
    founded_projects: list[ProfileProject] = []
    member_projects: list[ProfileProject] = []
    stats: ProfileStats = ProfileStats()
    endorsements: list[EndorsementOut] = []
    vouches: list[VouchOut] = []
    vouch_count: int = 0
    rating: RatingOut = RatingOut()
    mutual_connections: MutualConnections = MutualConnections()

    model_config = {"from_attributes": True}


class AdminUserOut(BaseModel):
    """User fields exposed to the admin panel. Deliberately excludes
    phone_number so the bulk list endpoint does not leak contact PII."""
    id: int
    telegram_id: int
    tg_username: str | None = None
    name: str | None
    surname: str | None
    role: str
    checked: bool
    is_registered: bool
    is_deleted: bool
    region_id: int | None = None
    denied_fields: str | None = None
    denied_note: str | None = None
    last_seen_at: datetime | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class GroupStatus(BaseModel):
    """Used in check-groups response."""
    group_id: int
    group_link: str
    name: str
    joined: bool
