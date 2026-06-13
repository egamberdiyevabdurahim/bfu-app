"""Project feed / membership / application-lifecycle regression tests."""
import pytest

pytestmark = pytest.mark.asyncio


async def _create_project(c, **body):
    payload = {"type": "startup", "name": "My Project"}
    payload.update(body)
    return await c.post("/projects", json=payload)


async def test_creator_is_member_in_feed(make_user, as_user, db):
    """Feed-slim regression: the creator is a member (no application row), so
    their own project card must report is_member=True and member_count>=1."""
    from app.models.project import Project

    user = await make_user()
    c = as_user(user)

    res = await _create_project(c, name="Feed Card Project")
    assert res.status_code == 201, res.text
    pid = res.json()["id"]

    # New projects are unapproved; the feed only shows approved+non-draft ones.
    # Approve directly in the DB (admin approval is out of scope here).
    proj = await db.get(Project, pid)
    proj.is_approved = True
    await db.commit()

    res = await c.get("/projects")
    assert res.status_code == 200, res.text
    cards = res.json()
    card = next((p for p in cards if p["id"] == pid), None)
    assert card is not None, "creator's project missing from feed"
    assert card["is_member"] is True
    assert card["member_count"] >= 1


async def test_apply_duplicate_and_withdraw(make_user, as_user, db):
    """B applies → 201; applies again → 409; withdraws → 204; withdraw again → 404."""
    from app.models.project import Project

    creator = await make_user()
    applicant = await make_user()

    # A creates a project (must be hiring for /apply to accept it).
    ca = as_user(creator)
    res = await _create_project(ca, name="Race Project", is_hiring=True)
    assert res.status_code == 201, res.text
    pid = res.json()["id"]

    proj = await db.get(Project, pid)
    proj.is_approved = True
    await db.commit()

    # B applies.
    cb = as_user(applicant)
    res = await cb.post(f"/projects/{pid}/apply")
    assert res.status_code in (200, 201), res.text

    # B applies again → duplicate rejected.
    res = await cb.post(f"/projects/{pid}/apply")
    assert res.status_code == 409, res.text

    # B withdraws → 204.
    res = await cb.delete(f"/projects/{pid}/apply")
    assert res.status_code == 204, res.text

    # Second withdraw → nothing left → 404.
    res = await cb.delete(f"/projects/{pid}/apply")
    assert res.status_code == 404, res.text


async def test_review_pending_guard(make_user, as_user, db):
    """A accepts B's application; re-reviewing (accept or decline) → 409."""
    from app.models.project import Project

    creator = await make_user()
    applicant = await make_user()

    ca = as_user(creator)
    res = await _create_project(ca, name="Review Project", is_hiring=True)
    assert res.status_code == 201, res.text
    pid = res.json()["id"]

    proj = await db.get(Project, pid)
    proj.is_approved = True
    await db.commit()

    cb = as_user(applicant)
    res = await cb.post(f"/projects/{pid}/apply")
    assert res.status_code in (200, 201), res.text
    app_id = res.json()["id"]

    # A accepts.
    ca = as_user(creator)
    res = await ca.patch(
        f"/projects/{pid}/applications/{app_id}", json={"action": "accept"}
    )
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "accepted"

    # Accepting again → already reviewed.
    res = await ca.patch(
        f"/projects/{pid}/applications/{app_id}", json={"action": "accept"}
    )
    assert res.status_code == 409, res.text
    assert "already reviewed" in res.text.lower()

    # Declining an already-accepted app → still guarded.
    res = await ca.patch(
        f"/projects/{pid}/applications/{app_id}", json={"action": "decline"}
    )
    assert res.status_code == 409, res.text
