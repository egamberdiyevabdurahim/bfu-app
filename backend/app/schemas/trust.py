from pydantic import BaseModel


class EndorseIn(BaseModel):
    skill: str


class VouchIn(BaseModel):
    text: str


class RatingIn(BaseModel):
    ratee_id: int
    stars: int
    note: str | None = None
