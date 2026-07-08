"""Response schemas for GET /search (global command-palette search)."""
from __future__ import annotations

from pydantic import BaseModel


class SearchPerson(BaseModel):
    id: int
    name: str | None = None
    display_name: str = ""
    photo_url: str | None = None
    region: str | None = None          # localized region name (viewer's language)
    region_id: int | None = None
    is_online: bool = False
    checked: bool = False


class SearchProject(BaseModel):
    id: int
    name: str
    goal: str | None = None
    type: str
    is_hiring: bool = False


class SearchEvent(BaseModel):
    id: int
    title: str
    type: str | None = None
    deadline: str | None = None


class SearchResults(BaseModel):
    """Grouped global-search payload.

    ``people`` + ``projects`` are the primary contract consumed by the desktop
    command palette. ``users`` (an alias of ``people``) and ``events`` are kept
    for the existing Telegram Mini App search modal, which reads ``res.users`` /
    ``res.events`` and would break if either key were absent. All fields default
    to empty lists so the shape is stable even on an empty query.
    """
    people: list[SearchPerson] = []
    users: list[SearchPerson] = []
    projects: list[SearchProject] = []
    events: list[SearchEvent] = []
