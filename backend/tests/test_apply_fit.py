"""Server-side enforcement of a project's REQUIREMENTS on POST /projects/{id}/apply.

The Mini App greys out Apply when the project payload says `is_fit: false`, the
desktop app never checked at all, and the backend used to accept every
application regardless — so any requirement a founder set (age_from / age_to /
gender_req / required regions) could be bypassed by applying from the web.

The fit rule now lives in ONE place — `app.routers.projects.user_fits_project` —
and is called both by the payload builders (which ship `is_fit`) and by the
apply guard, so the advisory flag and the enforced gate cannot drift apart.

Fit rule (a requirement only bites when the founder actually set it):
  * gender_req unset or "Any"       → nobody blocked on gender
  * age_from and age_to both unset  → nobody blocked on age
  * no required regions             → nobody blocked on region
  * MISSING user field vs a requirement that IS set → blocked (403). Matches what
    the Mini App's `is_fit` has always computed, so the button and the server agree.
"""
import datetime as dt

import pytest

pytestmark = pytest.mark.asyncio

_THIS_YEAR = dt.datetime.now().year


async def _mk_region(db, name="Tashkent"):
    from app.models.region import Region

    r = Region(name_uz=name, name_en=name, name_ru=name)
    db.add(r)
    await db.commit()
    await db.refresh(r)
    return r


async def _mk_project(db, creator_id, name="Req Project", req_region_ids=(), **reqs):
    """A live, hiring, approved project with optional requirements."""
    from app.models.project import Project, ProjectReqRegion

    p = Project(
        type="startup", creator_id=creator_id, name=name, is_active=True,
        is_hiring=True, is_draft=False, is_deleted=False, is_approved=True,
        **reqs,
    )
    db.add(p)
    await db.commit()
    await db.refresh(p)
    for rid in req_region_ids:
        db.add(ProjectReqRegion(project_id=p.id, region_id=rid))
    if req_region_ids:
        await db.commit()
    return p


# ── Happy path + no-requirements ───────────────────────────────────────────────

async def test_fitting_applicant_still_allowed(make_user, as_user, db):
    """A user who meets every requirement applies exactly as before → 201."""
    region = await _mk_region(db)
    founder = await make_user(name="Founder")
    me = await make_user(
        name="Fits", gender="Male", birth_year=_THIS_YEAR - 20, region_id=region.id,
    )
    p = await _mk_project(
        db, founder.id, req_region_ids=[region.id],
        age_from=18, age_to=25, gender_req="Male",
    )

    c = as_user(me)
    r = await c.post(f"/projects/{p.id}/apply")
    assert r.status_code in (200, 201), r.text
    assert r.json()["status"] == "pending"


async def test_no_requirements_set_allows_anyone(make_user, as_user, db):
    """Unset requirements (all None / no region rows) must never block — even a
    user with no gender, no birth_year and no region gets in."""
    founder = await make_user(name="Founder")
    me = await make_user(name="Blank")  # gender/birth_year/region_id all NULL
    p = await _mk_project(db, founder.id)  # age_from/age_to/gender_req all None

    c = as_user(me)
    r = await c.post(f"/projects/{p.id}/apply")
    assert r.status_code in (200, 201), r.text


async def test_gender_req_any_allows_anyone(make_user, as_user, db):
    """gender_req == "Any" is the founder saying 'no gender requirement'."""
    founder = await make_user(name="Founder")
    me = await make_user(name="NoGender")  # gender is NULL
    p = await _mk_project(db, founder.id, gender_req="Any")

    c = as_user(me)
    r = await c.post(f"/projects/{p.id}/apply")
    assert r.status_code in (200, 201), r.text


# ── Each requirement, violated → 403 ───────────────────────────────────────────

async def test_too_young_rejected(make_user, as_user, db):
    founder = await make_user(name="Founder")
    me = await make_user(name="Young", birth_year=_THIS_YEAR - 15)  # age 15 < 18
    p = await _mk_project(db, founder.id, age_from=18, age_to=30)

    c = as_user(me)
    r = await c.post(f"/projects/{p.id}/apply")
    assert r.status_code == 403, r.text
    assert "requirements" in r.json()["detail"].lower()


async def test_too_old_rejected(make_user, as_user, db):
    founder = await make_user(name="Founder")
    me = await make_user(name="Old", birth_year=_THIS_YEAR - 40)  # age 40 > 30
    p = await _mk_project(db, founder.id, age_from=18, age_to=30)

    c = as_user(me)
    r = await c.post(f"/projects/{p.id}/apply")
    assert r.status_code == 403, r.text


async def test_age_boundaries_are_inclusive(make_user, as_user, db):
    """age == age_from and age == age_to both FIT (the payload rule is
    `age < age_from` / `age > age_to`), so the boundary must not 403."""
    founder = await make_user(name="Founder")
    lower = await make_user(name="Lower", birth_year=_THIS_YEAR - 18)
    upper = await make_user(name="Upper", birth_year=_THIS_YEAR - 30)
    p1 = await _mk_project(db, founder.id, name="P1", age_from=18, age_to=30)
    p2 = await _mk_project(db, founder.id, name="P2", age_from=18, age_to=30)

    r = await as_user(lower).post(f"/projects/{p1.id}/apply")
    assert r.status_code in (200, 201), r.text
    r = await as_user(upper).post(f"/projects/{p2.id}/apply")
    assert r.status_code in (200, 201), r.text


async def test_wrong_gender_rejected(make_user, as_user, db):
    founder = await make_user(name="Founder")
    me = await make_user(name="Male", gender="Male")
    p = await _mk_project(db, founder.id, gender_req="Female")

    c = as_user(me)
    r = await c.post(f"/projects/{p.id}/apply")
    assert r.status_code == 403, r.text


async def test_wrong_region_rejected(make_user, as_user, db):
    required = await _mk_region(db, "Tashkent")
    other = await _mk_region(db, "Namangan")
    founder = await make_user(name="Founder")
    me = await make_user(name="Elsewhere", region_id=other.id)
    p = await _mk_project(db, founder.id, req_region_ids=[required.id])

    c = as_user(me)
    r = await c.post(f"/projects/{p.id}/apply")
    assert r.status_code == 403, r.text


async def test_any_of_several_required_regions_fits(make_user, as_user, db):
    """req_regions is an OR-list: being in ONE of them is enough."""
    r1 = await _mk_region(db, "Tashkent")
    r2 = await _mk_region(db, "Namangan")
    founder = await make_user(name="Founder")
    me = await make_user(name="Second", region_id=r2.id)
    p = await _mk_project(db, founder.id, req_region_ids=[r1.id, r2.id])

    c = as_user(me)
    r = await c.post(f"/projects/{p.id}/apply")
    assert r.status_code in (200, 201), r.text


# ── Missing user field vs a requirement that IS set → BLOCKED ──────────────────
# Deliberate: an unverifiable applicant is not a fit. Otherwise every
# requirement would be opt-out-able by clearing your profile. This mirrors the
# `is_fit` the Mini App already renders (it greys Apply out for these users), so
# the enforced gate and the advisory flag agree.

async def test_missing_birth_year_rejected_when_age_required(make_user, as_user, db):
    founder = await make_user(name="Founder")
    me = await make_user(name="NoAge")  # birth_year NULL
    p = await _mk_project(db, founder.id, age_from=18)

    c = as_user(me)
    r = await c.post(f"/projects/{p.id}/apply")
    assert r.status_code == 403, r.text


async def test_missing_gender_rejected_when_gender_required(make_user, as_user, db):
    founder = await make_user(name="Founder")
    me = await make_user(name="NoGender")  # gender NULL
    p = await _mk_project(db, founder.id, gender_req="Female")

    c = as_user(me)
    r = await c.post(f"/projects/{p.id}/apply")
    assert r.status_code == 403, r.text


async def test_missing_region_rejected_when_region_required(make_user, as_user, db):
    required = await _mk_region(db)
    founder = await make_user(name="Founder")
    me = await make_user(name="NoRegion")  # region_id NULL
    p = await _mk_project(db, founder.id, req_region_ids=[required.id])

    c = as_user(me)
    r = await c.post(f"/projects/{p.id}/apply")
    assert r.status_code == 403, r.text


# ── The founder and existing teammates are untouched by the gate ───────────────

async def test_founder_not_blocked_by_own_requirements(make_user, as_user, db):
    """The creator hits the pre-existing 'You are the creator' 400, NOT the new
    403 — a founder who doesn't fit their own requirements keeps their project."""
    founder = await make_user(name="Founder", gender="Male", birth_year=_THIS_YEAR - 40)
    p = await _mk_project(db, founder.id, age_from=18, age_to=25, gender_req="Female")

    c = as_user(founder)
    r = await c.post(f"/projects/{p.id}/apply")
    assert r.status_code == 400, r.text
    assert "creator" in r.json()["detail"].lower()


async def test_existing_member_not_blocked_by_requirements(make_user, as_user, db):
    """A teammate already on the project gets the 'Already a member' 409, not a
    403 — tightening requirements later must not evict / re-gate the team."""
    from app.models.project import ProjectMember

    founder = await make_user(name="Founder")
    teammate = await make_user(name="Mate", gender="Male", birth_year=_THIS_YEAR - 40)
    p = await _mk_project(db, founder.id, age_from=18, age_to=25, gender_req="Female")
    db.add(ProjectMember(project_id=p.id, user_id=teammate.id))
    await db.commit()

    c = as_user(teammate)
    r = await c.post(f"/projects/{p.id}/apply")
    assert r.status_code == 409, r.text
    assert "member" in r.json()["detail"].lower()


# ── The gate and the payload's is_fit come from the same helper ────────────────

async def test_is_fit_payload_agrees_with_enforcement(make_user, as_user, db):
    """Anti-drift: whatever the detail payload tells the client (`is_fit`) is
    exactly what the apply endpoint enforces."""
    founder = await make_user(name="Founder")
    unfit = await make_user(name="Unfit", birth_year=_THIS_YEAR - 15)
    p = await _mk_project(db, founder.id, age_from=18, age_to=25)

    c = as_user(unfit)
    detail = await c.get(f"/projects/{p.id}")
    assert detail.status_code == 200, detail.text
    assert detail.json()["is_fit"] is False

    r = await c.post(f"/projects/{p.id}/apply")
    assert r.status_code == 403, r.text


async def test_unfit_application_row_is_not_created(make_user, as_user, db):
    """The 403 must be a real gate, not just a status code — no pending
    application may reach the founder's inbox."""
    from sqlalchemy import func, select

    from app.models.project import ProjectApplication

    founder = await make_user(name="Founder")
    unfit = await make_user(name="Unfit", gender="Male")
    p = await _mk_project(db, founder.id, gender_req="Female")

    c = as_user(unfit)
    r = await c.post(f"/projects/{p.id}/apply")
    assert r.status_code == 403, r.text

    n = (await db.execute(
        select(func.count(ProjectApplication.id)).where(
            ProjectApplication.project_id == p.id
        )
    )).scalar_one()
    assert n == 0
