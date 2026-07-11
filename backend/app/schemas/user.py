from datetime import datetime

from pydantic import BaseModel, Field, field_validator


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


class CollaboratorMini(UserMini):
    shared: int = 0   # how many projects this person shares with the profile owner


class Collaborators(BaseModel):
    count: int = 0
    preview: list[CollaboratorMini] = []


class MentorOut(BaseModel):
    is_mentor: bool = False
    bio: str | None = None
    topics: list[str] = []


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
    # First-login onboarding gate — additive, defaults false so old rows/tests
    # never 500. The desktop /home mounts the onboarding flow while this is false.
    onboarding_completed: bool = False
    display_name: str
    photo_url: str | None = None
    # Real presence (see app.services.presence). Optional/defaulted so nothing 500s.
    is_online: bool = False
    last_seen_at: datetime | None = None
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
    collaborators: Collaborators = Collaborators()
    follower_count: int = 0
    following_count: int = 0
    is_following: bool = False
    mentor: MentorOut = MentorOut()
    dm_privacy: str = "everyone"   # "everyone" | "connections" (own setting)
    who_viewed_consent: bool = True  # False = incognito (don't record/show views)

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
    is_mentor: bool | None = None
    mentor_bio: str | None = None
    mentor_topics: list[str] | None = None
    dm_privacy: str | None = None   # "everyone" | "connections" (validated in update_me)
    who_viewed_consent: bool | None = None

class NotificationPrefsUpdate(BaseModel):
    """PATCH /users/me/notification-prefs body. Every category is optional; only
    the keys the client actually sends (non-None) are merged into the user's
    opt-out blob. Unknown keys are ignored by the endpoint."""
    messages: bool | None = None
    interest: bool | None = None
    applications: bool | None = None
    project_updates: bool | None = None
    bookings: bool | None = None
    events: bool | None = None
    weekly_digest: bool | None = None
    telegram_push: bool | None = None


class RegisterRequest(BaseModel):
    """POST /users/me/register body — web sign-up for a new (unregistered)
    member. Mirrors the fields the Telegram bot collects. On success the
    endpoint flips is_registered=True."""
    name: str = Field(min_length=1, max_length=100)
    surname: str | None = Field(default=None, max_length=100)
    gender: str | None = None  # "male" | "female" | "other"
    birth_year: int | None = Field(default=None, ge=1930, le=2018)
    phone_number: str = Field(min_length=5, max_length=25)
    region_id: int
    language: str | None = None

    @field_validator("gender")
    @classmethod
    def _gender_ok(cls, v):
        if v is None:
            return v
        v = v.strip().lower()
        if v not in {"male", "female", "other"}:
            raise ValueError("gender must be male, female or other")
        return v

    @field_validator("language")
    @classmethod
    def _lang_ok(cls, v):
        if v is None:
            return v
        v = v.strip().lower()[:2]
        return v if v in {"uz", "ru", "en"} else None


class UserPublic(BaseModel):
    """Full public profile — shown when clicking on a user."""
    id: int
    telegram_id: int
    tg_username: str | None = None
    role: str
    checked: bool = False
    display_name: str
    photo_url: str | None = None
    # Real presence (see app.services.presence). Optional/defaulted so nothing 500s.
    is_online: bool = False
    last_seen_at: datetime | None = None
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
    collaborators: Collaborators = Collaborators()
    follower_count: int = 0
    following_count: int = 0
    is_following: bool = False
    mentor: MentorOut = MentorOut()
    match_pct: int | None = None  # 0-100, only set by GET /discover?match=true

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
    banned: bool = False
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


class NotifActor(BaseModel):
    """The person who triggered a notification (avatar + name)."""
    id: int
    display_name: str
    photo_url: str | None = None

    model_config = {"from_attributes": True}


class NotifProject(BaseModel):
    """The project a notification is about."""
    id: int
    name: str
    type: str | None = None

    model_config = {"from_attributes": True}


class NotificationOut(BaseModel):
    """One inbox item. Keeps the original nested `actor`/`project` refs (used
    for the avatar) and adds flat, ready-to-render fields:
      * actor_name — the real display name, or null when there is no actor
        (e.g. "your project was approved"); the frontend renders neutral text.
      * actor_id   — for linking to /u/{id}.
      * link       — a relative href, computed server-side per type, that the
        frontend navigates to when the row is clicked.
    All new fields are optional with defaults so old/partial rows never 500."""
    id: int
    type: str
    is_read: bool = False
    created_at: datetime | None = None
    actor: NotifActor | None = None
    project: NotifProject | None = None
    actor_id: int | None = None
    actor_name: str | None = None
    event_id: int | None = None
    link: str | None = None


class NotificationsPage(BaseModel):
    unread: int = 0
    items: list[NotificationOut] = []


class ProfileViewer(BaseModel):
    """One person who viewed my profile (named, LinkedIn-style)."""
    id: int
    display_name: str
    photo_url: str | None = None
    region: str | None = None
    is_online: bool = False
    viewed_at: datetime | None = None


class ProfileViewersOut(BaseModel):
    """GET /users/me/profile-viewers — total distinct viewers + a recent slice."""
    count: int = 0
    recent: list[ProfileViewer] = []
