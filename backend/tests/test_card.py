"""render_og_png: a 1200x630 landscape share-image, distinct from the
1080x1920 Story card render_card_png already produces."""
from PIL import Image
import io

from app.services.card import render_og_png


def test_render_og_png_dimensions_and_format():
    png = render_og_png(
        name="Aziz Karimov", currently_building="Solar Farm",
        rating_average=4.8, vouch_count=8, checked=True, photo_bytes=None,
    )
    assert isinstance(png, (bytes, bytearray))
    im = Image.open(io.BytesIO(png))
    assert im.size == (1200, 630)
    assert im.format == "PNG"


def test_render_og_png_handles_no_rating_or_building():
    """A brand-new profile (no rating yet, no currently_building) must still
    render without raising."""
    png = render_og_png(
        name="New Member", currently_building=None,
        rating_average=None, vouch_count=0, checked=False, photo_bytes=None,
    )
    im = Image.open(io.BytesIO(png))
    assert im.size == (1200, 630)


def test_render_og_png_long_name_does_not_raise():
    png = render_og_png(
        name="A Very Long Founder Name That Would Overflow A Fixed Width Card",
        currently_building="An equally verbose project description that keeps going",
        rating_average=5.0, vouch_count=142, checked=True, photo_bytes=None,
    )
    im = Image.open(io.BytesIO(png))
    assert im.size == (1200, 630)
