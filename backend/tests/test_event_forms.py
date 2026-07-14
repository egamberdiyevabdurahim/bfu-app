"""Event registration forms: schema authoring, server-side answer validation,
RSVP storage, my-response, and the admin responses list + CSV export.

The point of this slice is that the SERVER is the gate — a client that skips a
required question, invents a choice value, or posts a 5000-char essay must be
rejected with a 422 that names the question, and nothing may be written.
"""
import pytest
from sqlalchemy import select

from app.models.event import Event
from app.models.event_rsvp import EventRsvp
from app.services.event_forms import validate_answers, validate_schema

SCHEMA = [
    {"key": "q1", "label": "Ismingiz, nechinchi sinfda o'qiysiz?", "type": "text",
     "required": True, "section": "Kontekst"},
    {"key": "q2", "label": "Nega qatnashmoqchisiz?", "type": "paragraph", "required": False,
     "section": "Kontekst"},
    {"key": "q3", "label": "Qaysi vaqt?", "type": "choice", "required": True,
     "options": ["Shanba 10:00", "Yakshanba 14:00"]},
    {"key": "q4", "label": "Qaysi fanlar?", "type": "checkboxes", "required": False,
     "options": ["Math", "English", "Physics"]},
    {"key": "q5", "label": "Yoshingiz", "type": "number", "required": False},
]

VALID_ANSWERS = {
    "q1": "Ali, 11-sinf",
    "q3": "Shanba 10:00",
    "q4": ["Math", "English"],
    "q5": "17",
}


async def _make_event(db, **overrides) -> Event:
    defaults = dict(type="meetup", title="Free SAT Mock Test", is_approved=True, is_deleted=False)
    defaults.update(overrides)
    e = Event(**defaults)
    db.add(e)
    await db.commit()
    await db.refresh(e)
    return e


# ── schema validation (admin authoring) ───────────────────────────────────────

def test_schema_valid_and_empty_forms_pass():
    assert validate_schema(SCHEMA) == {}
    assert validate_schema(None) == {}
    assert validate_schema([]) == {}


def test_schema_rejects_duplicate_keys():
    errors = validate_schema([
        {"key": "q1", "label": "A", "type": "text"},
        {"key": "q1", "label": "B", "type": "text"},
    ])
    assert "q1" in errors and "Duplicate" in errors["q1"]


def test_schema_rejects_unknown_type():
    errors = validate_schema([{"key": "q1", "label": "A", "type": "signature"}])
    assert "q1" in errors and "Unknown type" in errors["q1"]


def test_schema_rejects_choice_without_options():
    for qtype in ("choice", "dropdown", "checkboxes"):
        errors = validate_schema([{"key": "q1", "label": "A", "type": qtype}])
        assert "q1" in errors and "options" in errors["q1"], qtype
        errors = validate_schema([{"key": "q1", "label": "A", "type": qtype, "options": []}])
        assert "q1" in errors, qtype


def test_schema_rejects_missing_key_or_label():
    assert "#1" in validate_schema([{"label": "A", "type": "text"}])
    assert "q1" in validate_schema([{"key": "q1", "label": "  ", "type": "text"}])


# ── answer validation (the enforcement path) ──────────────────────────────────

def test_answers_valid():
    assert validate_answers(SCHEMA, VALID_ANSWERS) == {}


def test_answer_required_missing_or_empty():
    for bad in ({}, {"q1": "", "q3": "Shanba 10:00"}, {"q1": "   ", "q3": "Shanba 10:00"}):
        errors = validate_answers(SCHEMA, bad)
        assert "q1" in errors and "required" in errors["q1"].lower()


def test_answer_required_empty_list_is_missing():
    schema = [{"key": "c", "label": "Pick", "type": "checkboxes", "required": True,
               "options": ["a", "b"]}]
    assert "c" in validate_answers(schema, {"c": []})


def test_answer_bad_choice_value_rejected():
    errors = validate_answers(SCHEMA, {**VALID_ANSWERS, "q3": "Payshanba 09:00"})
    assert "q3" in errors and "allowed options" in errors["q3"]


def test_answer_bad_checkbox_value_rejected():
    errors = validate_answers(SCHEMA, {**VALID_ANSWERS, "q4": ["Math", "Chemistry"]})
    assert "q4" in errors and "allowed options" in errors["q4"]


def test_answer_non_numeric_number_rejected():
    errors = validate_answers(SCHEMA, {**VALID_ANSWERS, "q5": "seventeen"})
    assert errors["q5"] == "Must be a number"
    assert validate_answers(SCHEMA, {**VALID_ANSWERS, "q5": 17}) == {}


def test_answer_over_long_rejected():
    errors = validate_answers(SCHEMA, {**VALID_ANSWERS, "q1": "x" * 2001})
    assert "q1" in errors and "too long" in errors["q1"]
    assert validate_answers(SCHEMA, {**VALID_ANSWERS, "q1": "x" * 2000}) == {}


def test_answers_for_unknown_keys_are_ignored():
    assert validate_answers(SCHEMA, {**VALID_ANSWERS, "q99": "junk"}) == {}


# ── RSVP with a form ──────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_rsvp_with_valid_form_stores_answers(db, make_user, as_user):
    u = await make_user()
    e = await _make_event(db, form_schema=SCHEMA)

    r = await as_user(u).post(
        f"/events/{e.id}/rsvp", json={"status": "going", "answers": VALID_ANSWERS}
    )
    assert r.status_code == 200, r.text
    assert r.json()["my_rsvp"] == "going" and r.json()["rsvp_count"] == 1

    row = (await db.execute(select(EventRsvp).where(EventRsvp.event_id == e.id))).scalar_one()
    assert row.answers["q1"] == "Ali, 11-sinf"
    assert row.answers["q4"] == ["Math", "English"]
    assert "q2" not in row.answers          # optional + unanswered → simply absent


@pytest.mark.asyncio
async def test_rsvp_missing_required_answer_422_and_writes_nothing(db, make_user, as_user):
    u = await make_user()
    e = await _make_event(db, form_schema=SCHEMA)

    r = await as_user(u).post(
        f"/events/{e.id}/rsvp",
        json={"status": "going", "answers": {"q3": "Shanba 10:00"}},   # q1 missing
    )
    assert r.status_code == 422, r.text
    errors = r.json()["detail"]["errors"]
    assert "q1" in errors and "required" in errors["q1"].lower()   # says WHICH + why

    rows = (await db.execute(select(EventRsvp).where(EventRsvp.event_id == e.id))).scalars().all()
    assert rows == []                                              # 422 wrote nothing


@pytest.mark.asyncio
async def test_rsvp_with_no_answers_at_all_422(db, make_user, as_user):
    u = await make_user()
    e = await _make_event(db, form_schema=SCHEMA)
    r = await as_user(u).post(f"/events/{e.id}/rsvp", json={"status": "going"})
    assert r.status_code == 422
    assert set(r.json()["detail"]["errors"]) == {"q1", "q3"}


@pytest.mark.asyncio
async def test_rsvp_bad_choice_422(db, make_user, as_user):
    u = await make_user()
    e = await _make_event(db, form_schema=SCHEMA)
    r = await as_user(u).post(f"/events/{e.id}/rsvp", json={
        "status": "going", "answers": {**VALID_ANSWERS, "q3": "nonexistent"},
    })
    assert r.status_code == 422 and "q3" in r.json()["detail"]["errors"]


@pytest.mark.asyncio
async def test_re_rsvp_overwrites_answers(db, make_user, as_user):
    u = await make_user()
    e = await _make_event(db, form_schema=SCHEMA)
    client = as_user(u)

    await client.post(f"/events/{e.id}/rsvp", json={"status": "going", "answers": VALID_ANSWERS})
    fixed = {**VALID_ANSWERS, "q1": "Ali Valiyev, 11-sinf", "q3": "Yakshanba 14:00"}
    r = await client.post(f"/events/{e.id}/rsvp", json={"status": "going", "answers": fixed})
    assert r.status_code == 200

    rows = (await db.execute(select(EventRsvp).where(EventRsvp.event_id == e.id))).scalars().all()
    assert len(rows) == 1                                   # same row, reused
    await db.refresh(rows[0])
    assert rows[0].answers["q1"] == "Ali Valiyev, 11-sinf"
    assert rows[0].answers["q3"] == "Yakshanba 14:00"


@pytest.mark.asyncio
async def test_event_without_form_is_still_one_click(db, make_user, as_user):
    u = await make_user()
    e = await _make_event(db)                               # form_schema is NULL
    r = await as_user(u).post(f"/events/{e.id}/rsvp", json={"status": "going"})
    assert r.status_code == 200
    assert r.json()["my_rsvp"] == "going" and r.json()["rsvp_count"] == 1

    row = (await db.execute(select(EventRsvp).where(EventRsvp.event_id == e.id))).scalar_one()
    assert row.answers is None

    # stray answers on a form-less event are ignored, not an error
    r = await as_user(u).post(
        f"/events/{e.id}/rsvp", json={"status": "going", "answers": {"x": "y"}}
    )
    assert r.status_code == 200
    await db.refresh(row)
    assert row.answers is None


@pytest.mark.asyncio
async def test_interested_never_requires_the_form(db, make_user, as_user):
    u = await make_user()
    e = await _make_event(db, form_schema=SCHEMA)
    r = await as_user(u).post(f"/events/{e.id}/rsvp", json={"status": "interested"})
    assert r.status_code == 200
    assert r.json()["my_rsvp"] == "interested" and r.json()["rsvp_count"] == 0

    # …but upgrading that row to "going" does require it
    r = await as_user(u).post(f"/events/{e.id}/rsvp", json={"status": "going"})
    assert r.status_code == 422


# ── read paths ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_has_form_on_list_and_form_schema_on_detail(db, make_user, as_user):
    u = await make_user()
    with_form = await _make_event(db, title="With form", form_schema=SCHEMA)
    plain = await _make_event(db, title="Plain")
    client = as_user(u)

    rows = {x["id"]: x for x in (await client.get("/events")).json()}
    assert rows[with_form.id]["has_form"] is True
    assert rows[plain.id]["has_form"] is False

    detail = (await client.get(f"/events/{with_form.id}")).json()
    assert detail["has_form"] is True
    assert [q["key"] for q in detail["form_schema"]] == ["q1", "q2", "q3", "q4", "q5"]
    assert detail["form_schema"][2]["options"] == ["Shanba 10:00", "Yakshanba 14:00"]

    plain_detail = (await client.get(f"/events/{plain.id}")).json()
    assert plain_detail["has_form"] is False and plain_detail["form_schema"] is None

    assert (await client.get("/events/999999")).status_code == 404


@pytest.mark.asyncio
async def test_my_response_returns_what_was_saved(db, make_user, as_user):
    u = await make_user()
    other = await make_user()
    e = await _make_event(db, form_schema=SCHEMA)

    assert (await as_user(u).get(f"/events/{e.id}/my-response")).json()["answers"] is None

    await as_user(u).post(f"/events/{e.id}/rsvp", json={"status": "going", "answers": VALID_ANSWERS})
    mine = (await as_user(u).get(f"/events/{e.id}/my-response")).json()
    assert mine["answers"]["q1"] == "Ali, 11-sinf"
    assert mine["answers"]["q4"] == ["Math", "English"]

    # …and it is MY response only
    assert (await as_user(other).get(f"/events/{e.id}/my-response")).json()["answers"] is None


# ── admin: schema authoring + responses + CSV ─────────────────────────────────

@pytest.mark.asyncio
async def test_admin_patch_form_schema(db, make_user, as_user):
    admin = await make_user(role="admin")
    e = await _make_event(db)
    r = await as_user(admin).patch(f"/admin/events/{e.id}", json={"form_schema": SCHEMA})
    assert r.status_code == 200, r.text
    assert r.json()["has_form"] is True
    assert len(r.json()["form_schema"]) == 5

    await db.refresh(e)
    assert e.form_schema[0]["key"] == "q1"

    # clearing the form returns the event to a plain one-click RSVP
    r = await as_user(admin).patch(f"/admin/events/{e.id}", json={"form_schema": []})
    assert r.status_code == 200 and r.json()["has_form"] is False


@pytest.mark.asyncio
async def test_admin_patch_invalid_schema_422(db, make_user, as_user):
    admin = await make_user(role="admin")
    e = await _make_event(db)
    r = await as_user(admin).patch(f"/admin/events/{e.id}", json={
        "form_schema": [{"key": "q1", "label": "Pick", "type": "choice"}],   # no options
    })
    assert r.status_code == 422
    assert "q1" in r.json()["detail"]["errors"]
    await db.refresh(e)
    assert e.form_schema is None                       # rejected → nothing stored


@pytest.mark.asyncio
async def test_admin_create_event_with_form(db, make_user, as_user):
    admin = await make_user(role="admin")
    r = await as_user(admin).post("/admin/events", json={
        "type": "meetup", "title": "Free SAT Mock Test", "form_schema": SCHEMA,
    })
    assert r.status_code == 201, r.text
    assert r.json()["has_form"] is True


@pytest.mark.asyncio
async def test_admin_responses_list_and_csv(db, make_user, as_user):
    admin = await make_user(role="admin")
    ali = await make_user(name="ali", surname="valiyev", tg_username="ali",
                          phone_number="+998901112233")
    e = await _make_event(db, form_schema=SCHEMA)

    await as_user(ali).post(f"/events/{e.id}/rsvp", json={"status": "going", "answers": VALID_ANSWERS})

    rows = (await as_user(admin).get(f"/admin/events/{e.id}/responses")).json()
    assert len(rows) == 1
    row = rows[0]
    assert row["user_id"] == ali.id
    assert row["display_name"] == "Ali. V"
    assert row["tg_username"] == "ali" and row["phone_number"] == "+998901112233"
    assert row["submitted_at"] and row["answers"]["q3"] == "Shanba 10:00"

    r = await as_user(admin).get(f"/admin/events/{e.id}/responses.csv")
    assert r.status_code == 200
    assert "text/csv" in r.headers["content-type"]
    assert f'filename="event-{e.id}-responses.csv"' in r.headers["content-disposition"]
    assert r.content.startswith(b"\xef\xbb\xbf")            # Excel-safe UTF-8 BOM

    text = r.content.decode("utf-8-sig")
    header, first = text.splitlines()[0], text.splitlines()[1]
    assert header.split(",")[:5] == ["user_id", "name", "username", "phone", "submitted_at"]
    assert "Ismingiz, nechinchi sinfda o'qiysiz?" in header   # header = LABEL, not key
    assert "Yoshingiz" in header
    assert "Math; English" in first                          # checkbox list joined with "; "
    assert "@ali" in first and "+998901112233" in first


@pytest.mark.asyncio
async def test_admin_responses_forbidden_for_non_admin(db, make_user, as_user):
    u = await make_user()
    e = await _make_event(db, form_schema=SCHEMA)
    assert (await as_user(u).get(f"/admin/events/{e.id}/responses")).status_code == 403
    assert (await as_user(u).get(f"/admin/events/{e.id}/responses.csv")).status_code == 403
    assert (await as_user(u).patch(f"/admin/events/{e.id}",
                                   json={"form_schema": SCHEMA})).status_code == 403
