"""Public, crawlable profile page at /public/u/{id} (Batch B)."""
import pytest

pytestmark = pytest.mark.asyncio


async def _mk_project(db, creator_id, name, *, is_active=True):
    from app.models.project import Project
    p = Project(type="startup", creator_id=creator_id, name=name, is_active=is_active,
                is_draft=False, is_deleted=False, is_approved=True)
    db.add(p)
    await db.commit()
    await db.refresh(p)
    return p


async def test_public_profile_renders_html(make_user, client, db):
    user = await make_user(name="Aziz", surname="Karimov")
    await _mk_project(db, user.id, "Solar Farm", is_active=True)

    # No auth needed — it's a public endpoint.
    res = await client.get(f"/public/u/{user.id}")
    assert res.status_code == 200, res.text
    assert res.headers["content-type"].startswith("text/html")
    html = res.text
    assert "Solar Farm" in html
    assert "Aziz" in html
    # Open Graph + canonical for crawlers / unfurlers.
    assert 'property="og:title"' in html
    assert "<title>" in html


async def test_public_profile_404_for_unknown(client):
    res = await client.get("/public/u/999999")
    assert res.status_code == 404


async def test_public_profile_404_for_unregistered(make_user, client):
    u = await make_user(name="Ghost", is_registered=False)
    res = await client.get(f"/public/u/{u.id}")
    assert res.status_code == 404
