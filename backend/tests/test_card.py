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


def _near_white_pixel_count(im):
    """Count near-white (foreground text) pixels — the name is drawn in
    OG_TEXT which is close to white, so a non-blank render must have some."""
    rgb = im.convert("RGB")
    px = rgb.load()
    w, h = rgb.size
    count = 0
    for y in range(0, h, 3):
        for x in range(0, w, 3):
            r, g, b = px[x, y]
            if r > 220 and g > 220 and b > 220:
                count += 1
    return count


def test_render_og_png_handles_no_rating_or_building():
    """A brand-new profile (no rating yet, no currently_building) must still
    render WITH visible foreground content (name + footer), not a blank
    gradient. This drives the no-photo branch, which previously dropped all
    foreground content onto a discarded pre-convert image."""
    png = render_og_png(
        name="New Member", currently_building=None,
        rating_average=None, vouch_count=0, checked=False, photo_bytes=None,
    )
    im = Image.open(io.BytesIO(png))
    assert im.size == (1200, 630)
    # The name and footer are drawn in near-white; a blank fire-gradient card
    # has effectively none. Require a clear, non-trivial amount.
    assert _near_white_pixel_count(im) > 200


def test_render_og_png_long_name_does_not_raise():
    png = render_og_png(
        name="A Very Long Founder Name That Would Overflow A Fixed Width Card",
        currently_building="An equally verbose project description that keeps going",
        rating_average=5.0, vouch_count=142, checked=True, photo_bytes=None,
    )
    im = Image.open(io.BytesIO(png))
    assert im.size == (1200, 630)
