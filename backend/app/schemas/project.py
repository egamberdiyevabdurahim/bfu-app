from datetime import datetime

from pydantic import BaseModel


class ProjectCreate(BaseModel):
    type: str  # "startup" or "volunteering"
    name: str
    goal: str | None = None
    channel: str | None = None
    about: str | None = None
    age_from: int | None = None
    age_to: int | None = None
    gender_req: str | None = None
    is_active: bool = True
    is_hiring: bool = True
    is_draft: bool = False
    req_region_ids: list[int] = []
    req_skills: list[str] = []
    req_knowledges: list[str] = []


class ProjectUpdate(BaseModel):
    name: str | None = None
    goal: str | None = None
    channel: str | None = None
    about: str | None = None
    age_from: int | None = None
    age_to: int | None = None
    gender_req: str | None = None
    is_active: bool | None = None
    is_hiring: bool | None = None
    req_region_ids: list[int] | None = None
    req_skills: list[str] | None = None
    req_knowledges: list[str] | None = None


class ReqRegionOut(BaseModel):
    region_id: int
    model_config = {"from_attributes": True}


class ReqSkillOut(BaseModel):
    skill_name: str
    model_config = {"from_attributes": True}


class ReqKnowledgeOut(BaseModel):
    knowledge_name: str
    model_config = {"from_attributes": True}


class ProjectResponse(BaseModel):
    id: int
    type: str
    creator_id: int
    name: str
    goal: str | None
    channel: str | None
    about: str | None
    age_from: int | None
    age_to: int | None
    gender_req: str | None
    is_active: bool
    is_hiring: bool
    is_deleted: bool
    is_approved: bool = False
    is_pinned: bool = False
    is_draft: bool = False
    pending_applications_count: int = 0
    is_member: bool = False
    is_fit: bool = True
    my_application_status: str | None = None  # null | pending | accepted | declined
    req_regions: list[ReqRegionOut] = []
    req_skills: list[ReqSkillOut] = []
    req_knowledges: list[ReqKnowledgeOut] = []
    members: list["MemberOut"] = []
    member_count: int = 0
    created_at: datetime

    model_config = {"from_attributes": True}


class AdminProjectOut(BaseModel):
    """Project fields exposed to the admin moderation panel."""
    id: int
    type: str
    creator_id: int
    name: str
    is_active: bool
    is_hiring: bool
    is_approved: bool = False
    is_pinned: bool = False
    is_draft: bool = False
    is_deleted: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class MemberOut(BaseModel):
    user_id: int
    joined_at: datetime
    display_name: str = ""
    model_config = {"from_attributes": True}


class ApplicantPublic(BaseModel):
    id: int
    display_name: str
    gender: str | None
    birth_year: int | None
    region_id: int | None
    about: str | None
    open_to_work: bool
    open_to_volunteering: bool
    model_config = {"from_attributes": True}


class ApplicationOut(BaseModel):
    id: int
    project_id: int
    project_name: str
    project_type: str
    status: str
    created_at: datetime
    applicant: ApplicantPublic
    model_config = {"from_attributes": True}
