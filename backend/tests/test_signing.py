"""Signed-URL scope helpers — each scope must produce a distinct, stable,
enumeration-resistant signature."""
from app.services.signing import avatar_sig, card_sig, og_sig


def test_og_sig_is_stable_and_scoped():
    assert og_sig(42) == og_sig(42)
    assert og_sig(42) != og_sig(43)
    # Different scopes must not collide for the same user id.
    assert og_sig(42) != card_sig(42)
    assert og_sig(42) != avatar_sig(42)
