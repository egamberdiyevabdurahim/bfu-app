"""Batch F: one-page PDF resume generation + the /users/me/resume endpoint."""
import pytest

pytestmark = pytest.mark.asyncio


def _sample_extras():
    return {
        "currently_building": "Solar microgrid for rural schools",
        "currently_building_source": "manual",
        "portfolio_links": [
            {"label": "GitHub", "url": "https://github.com/aziz"},
            {"label": "Site", "url": "https://aziz.dev"},
        ],
        "founded_projects": [
            {"id": 1, "name": "Solar Farm", "type": "startup", "is_active": True, "date": None},
            {"id": 2, "name": "Old Co", "type": "startup", "is_active": False, "date": None},
        ],
        "member_projects": [
            {"id": 3, "name": "EcoTeam", "type": "volunteering", "is_active": True, "date": None},
        ],
        "stats": {"projects_founded": 2, "projects_joined": 1, "applications_accepted": 1},
    }


def _sample_trust():
    return {
        "endorsements": [{"skill": "React", "count": 3, "endorsed_by_me": False},
                         {"skill": "Python", "count": 1, "endorsed_by_me": False}],
        "vouches": [{"id": 1, "text": "Ships fast and reliable.",
                     "author": {"id": 9, "display_name": "Dilnoza"}, "created_at": None}],
        "vouch_count": 1,
        "rating": {"average": 4.5, "count": 2},
        "mutual_connections": {"count": 0, "preview": []},
    }


def test_render_resume_pdf_basic():
    from app.services.resume import render_resume_pdf
    pdf = render_resume_pdf(
        name="Aziz Karimov", meta="Tashkent · 22 y/o · Verified",
        public_url="https://app.bfu.uz/u/7", about="Builder of useful things.",
        skills=["React", "Python", "Figma"], other_tags=["Climate", "Hardware"],
        extras=_sample_extras(), trust=_sample_trust(),
    )
    assert isinstance(pdf, (bytes, bytearray))
    assert pdf[:5] == b"%PDF-"          # valid PDF magic
    assert len(pdf) > 1000              # non-trivial, real content


def test_render_resume_pdf_empty_profile():
    """A brand-new member with nothing filled still yields a valid one-pager."""
    from app.services.resume import render_resume_pdf
    empty_extras = {
        "currently_building": None, "currently_building_source": None,
        "portfolio_links": [], "founded_projects": [], "member_projects": [],
        "stats": {"projects_founded": 0, "projects_joined": 0, "applications_accepted": 0},
    }
    empty_trust = {"endorsements": [], "vouches": [], "vouch_count": 0,
                   "rating": {"average": None, "count": 0},
                   "mutual_connections": {"count": 0, "preview": []}}
    pdf = render_resume_pdf(
        name="New Member", meta="", public_url="https://app.bfu.uz/u/1",
        about=None, skills=[], other_tags=[], extras=empty_extras, trust=empty_trust,
    )
    assert pdf[:5] == b"%PDF-"
    assert len(pdf) > 800


def test_render_resume_pdf_non_latin_does_not_raise():
    """Cyrillic / emoji must not crash the core-font PDF — best-effort encode."""
    from app.services.resume import render_resume_pdf
    pdf = render_resume_pdf(
        name="Азиз Каримов 🚀", meta="Тошкент", public_url="https://app.bfu.uz/u/7",
        about="Строю полезные вещи. 🔧", skills=["React"], other_tags=[],
        extras=_sample_extras(), trust=_sample_trust(),
    )
    assert pdf[:5] == b"%PDF-"
