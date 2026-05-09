from pydantic import BaseModel


class RegionOut(BaseModel):
    id: int
    name_uz: str
    name_en: str
    name_ru: str

    model_config = {"from_attributes": True}


class LearningCenterOut(BaseModel):
    id: int
    name: str
    region_id: int
    parent_id: int | None
    is_branch: bool
    group_id: int | None = None
    group_link: str | None = None

    model_config = {"from_attributes": True}


class SchoolOut(BaseModel):
    id: int
    name: str
    region_id: int
    group_id: int | None = None
    group_link: str | None = None

    model_config = {"from_attributes": True}
