"""Server-side validation for the shared phone/about contract, intentions
default-ON at first registration, and school/LC/intentions being optional.

SHARED CONTRACT (frontends mirror these EXACT rules):
  * PHONE: valid iff it matches ^\\+998\\d{9}$ (+998 then exactly 9 digits).
  * ABOUT: valid iff it has at least 10 whitespace-separated words.
"""
import pytest

pytestmark = pytest.mark.asyncio


async def _mk_region(db, name="Tashkent"):
    from app.models.region import Region

    r = Region(name_uz=name, name_en=name, name_ru=name)
    db.add(r)
    await db.commit()
    await db.refresh(r)
    return r


def _reg_body(region_id, **over):
    body = {
        "name": "Ali",
        "phone_number": "+998901234567",
        "region_id": region_id,
    }
    body.update(over)
    return body


# ── PHONE on the registration/complete path ────────────────────────────────────

async def test_register_accepts_valid_phone(make_user, as_user, db):
    region = await _mk_region(db)
    user = await make_user(is_registered=False)
    c = as_user(user)
    res = await c.post("/users/me/register", json=_reg_body(region.id, phone_number="+998901234567"))
    assert res.status_code == 200, res.text
    assert res.json()["is_registered"] is True

    from app.models.user import User
    fresh = await db.get(User, user.id)
    await db.refresh(fresh)
    assert fresh.phone_number == "+998901234567"


@pytest.mark.parametrize(
    "bad_phone",
    [
        "+7901234567890",   # wrong prefix
        "998901234567",     # missing leading +
        "+99890123456",     # only 8 digits after +998
        "+9989012345678",   # 10 digits after +998
        "+998abcdefghi",    # letters
        "+998 90 123 45 67",  # spaces / separators
    ],
)
async def test_register_rejects_bad_phone(make_user, as_user, db, bad_phone):
    region = await _mk_region(db)
    user = await make_user(is_registered=False)
    c = as_user(user)
    res = await c.post("/users/me/register", json=_reg_body(region.id, phone_number=bad_phone))
    assert res.status_code == 422, res.text

    # And the user was NOT registered as a side effect.
    from app.models.user import User
    fresh = await db.get(User, user.id)
    await db.refresh(fresh)
    assert fresh.is_registered is False


async def test_patch_me_rejects_bad_phone(make_user, as_user, db):
    user = await make_user()
    c = as_user(user)
    res = await c.patch("/users/me", json={"phone_number": "12345"})
    assert res.status_code == 422, res.text


async def test_patch_me_accepts_valid_phone(make_user, as_user, db):
    user = await make_user()
    c = as_user(user)
    res = await c.patch("/users/me", json={"phone_number": "+998911112233"})
    assert res.status_code == 200, res.text
    assert res.json()["phone_number"] == "+998911112233"


# ── ABOUT (>= 10 words) on the profile-edit path ───────────────────────────────

async def test_patch_me_rejects_short_about(make_user, as_user, db):
    user = await make_user()
    c = as_user(user)
    res = await c.patch("/users/me", json={"about": "only three words here"})
    assert res.status_code == 422, res.text


async def test_patch_me_accepts_long_about(make_user, as_user, db):
    user = await make_user()
    c = as_user(user)
    about = "I am a builder who loves shipping products with great teams every single day"
    assert len(about.split()) >= 10
    res = await c.patch("/users/me", json={"about": about})
    assert res.status_code == 200, res.text
    assert res.json()["about"] == about


async def test_patch_me_about_boundary_exactly_ten_words(make_user, as_user, db):
    user = await make_user()
    c = as_user(user)
    nine = "one two three four five six seven eight nine"
    assert len(nine.split()) == 9
    res = await c.patch("/users/me", json={"about": nine})
    assert res.status_code == 422, res.text

    ten = nine + " ten"
    assert len(ten.split()) == 10
    res = await c.patch("/users/me", json={"about": ten})
    assert res.status_code == 200, res.text


# ── Intentions default ON + school/LC/intentions all optional ──────────────────

async def test_register_without_school_lc_intentions_defaults_intentions_on(
    make_user, as_user, db
):
    """A registration body carrying only the required fields (no school,
    no learning-center, no intention flags) succeeds and the new member ends up
    opted-in to everything."""
    region = await _mk_region(db)
    user = await make_user(
        is_registered=False, open_to_work=False, open_to_volunteering=False
    )
    c = as_user(user)
    res = await c.post("/users/me/register", json=_reg_body(region.id))
    assert res.status_code == 200, res.text

    from sqlalchemy import func, select

    from app.models.user import User, UserLearningCenter, UserSchool
    fresh = await db.get(User, user.id)
    await db.refresh(fresh)
    assert fresh.is_registered is True
    assert fresh.open_to_work is True
    assert fresh.open_to_volunteering is True
    # No school / learning-center rows were required or created.
    school_count = await db.scalar(
        select(func.count()).select_from(UserSchool).where(UserSchool.user_id == user.id)
    )
    lc_count = await db.scalar(
        select(func.count()).select_from(UserLearningCenter).where(
            UserLearningCenter.user_id == user.id
        )
    )
    assert school_count == 0
    assert lc_count == 0


async def test_register_respects_explicit_intention_flags(make_user, as_user, db):
    """When the client DOES send intention flags at registration they win over
    the default-ON behaviour."""
    region = await _mk_region(db)
    user = await make_user(is_registered=False)
    c = as_user(user)
    res = await c.post(
        "/users/me/register",
        json=_reg_body(region.id, open_to_work=False, open_to_volunteering=True),
    )
    assert res.status_code == 200, res.text

    from app.models.user import User
    fresh = await db.get(User, user.id)
    await db.refresh(fresh)
    assert fresh.open_to_work is False
    assert fresh.open_to_volunteering is True
