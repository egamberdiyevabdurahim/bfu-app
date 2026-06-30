"""Batch F: Telegram inline mode — build_inline_results (no polling loop)."""
import pytest

pytestmark = pytest.mark.asyncio


async def _mk_project(db, creator_id, name, *, about="", is_approved=True,
                      is_draft=False, is_deleted=False):
    from app.models.project import Project
    p = Project(type="startup", creator_id=creator_id, name=name, about=about,
                is_active=True, is_approved=is_approved, is_draft=is_draft,
                is_deleted=is_deleted)
    db.add(p)
    await db.commit()
    await db.refresh(p)
    return p


async def test_inline_results_match_approved_project(make_user, db):
    from bot import build_inline_results
    owner = await make_user(name="Owner")
    p = await _mk_project(db, owner.id, "Solar Farm", about="Clean energy for schools")

    results = await build_inline_results("solar", tg_user_id=owner.telegram_id, db=db)
    assert len(results) >= 1
    # The matching project must produce a deep link to startapp=project_<id>.
    blob = " ".join(
        (r.input_message_content.message_text or "") + " " + (r.url or "")
        for r in results
    )
    assert f"project_{p.id}" in blob
    titles = [r.title for r in results]
    assert any("Solar Farm" in (tt or "") for tt in titles)


async def test_inline_results_excludes_draft_and_unapproved(make_user, db):
    from bot import build_inline_results
    owner = await make_user(name="Owner")
    await _mk_project(db, owner.id, "Hidden Draft", is_draft=True)
    await _mk_project(db, owner.id, "Pending Co", is_approved=False)

    results = await build_inline_results("Hidden", tg_user_id=owner.telegram_id, db=db)
    assert all("Hidden Draft" not in (r.title or "") for r in results)
    results2 = await build_inline_results("Pending", tg_user_id=owner.telegram_id, db=db)
    assert all("Pending Co" not in (r.title or "") for r in results2)


async def test_inline_results_no_match_is_empty(make_user, db):
    from bot import build_inline_results
    owner = await make_user(name="Owner")
    await _mk_project(db, owner.id, "Solar Farm")
    results = await build_inline_results("zzzznotathing", tg_user_id=owner.telegram_id, db=db)
    assert results == []


async def test_inline_empty_query_includes_own_profile_link(make_user, db):
    from bot import build_inline_results
    me = await make_user(name="Aziz")
    await _mk_project(db, me.id, "Recent Co")
    results = await build_inline_results("", tg_user_id=me.telegram_id, db=db)
    blob = " ".join(
        (r.input_message_content.message_text or "") + " " + (r.url or "")
        for r in results
    )
    # Default set leads with the typist's own profile deep link.
    assert f"user_{me.id}" in blob


async def test_inline_handler_calls_answer(make_user, db, monkeypatch):
    """The @dp.inline_query handler answers with the built results."""
    import bot as botmod

    owner = await make_user(name="Owner")
    await _mk_project(db, owner.id, "Solar Farm", about="Clean energy")

    # Point the handler's session factory at the test session so it reads our row.
    class _CtxFactory:
        def __call__(self):
            outer = self
            class _Ctx:
                async def __aenter__(self_inner):
                    return db
                async def __aexit__(self_inner, *a):
                    return False
            return _Ctx()
    monkeypatch.setattr(botmod, "AsyncSessionLocal", _CtxFactory())

    captured = {}

    class _FakeUser:
        id = owner.telegram_id

    class _FakeQuery:
        query = "solar"
        from_user = _FakeUser()
        async def answer(self, results, **kwargs):
            captured["results"] = results
            captured["kwargs"] = kwargs

    await botmod.inline_query_handler(_FakeQuery())
    assert "results" in captured
    assert len(captured["results"]) >= 1
    assert captured["kwargs"].get("is_personal") is True


def test_stickers_copy_has_all_langs():
    import bot as botmod
    for lang in ("en", "uz", "ru"):
        assert lang in botmod._STICKERS
        assert botmod._STICKERS[lang]["btn"]
        assert botmod._STICKERS[lang]["soon"]
