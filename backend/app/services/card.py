"""Renders a shareable "BFU Card" PNG (1080×1920, Telegram Story ratio).

A dark, premium profile card — real Telegram photo (or gradient initials),
name, region, AI tags, verified tick — that a user pushes to their Telegram
Story. The bot handle is printed on the card so it drives discovery even for
non-Premium users (Telegram's tappable widget_link is Premium-only).
Uses the brand fonts bundled under app/assets/fonts.
"""
from __future__ import annotations

import io
import os

from PIL import Image, ImageDraw, ImageFilter, ImageFont

_FONT_DIR = os.path.join(os.path.dirname(__file__), "..", "assets", "fonts")
_SYNE = os.path.join(_FONT_DIR, "Syne-Bold.ttf")
_DM = os.path.join(_FONT_DIR, "DMSans.ttf")

W, H = 1080, 1920
BG = (10, 10, 15)
PANEL = (19, 19, 26)
BORDER = (255, 255, 255, 22)
TEXT = (240, 240, 255)
TEXT2 = (166, 166, 192)
TEXT3 = (131, 131, 155)
ACCENT = (123, 111, 255)
ACCENT2 = (167, 139, 250)
TEAL = (78, 205, 196)
AVATAR_COLORS = [
    (123, 111, 255), (255, 107, 107), (78, 205, 196),
    (255, 179, 71), (167, 139, 250), (52, 211, 153),
]


def _font(path: str, size: int, weight: int = 400) -> ImageFont.FreeTypeFont:
    f = ImageFont.truetype(path, size)
    try:
        f.set_variation_by_axes([weight])  # bundled fonts are variable
    except Exception:
        pass
    return f


def _text_w(draw, text, font) -> int:
    b = draw.textbbox((0, 0), text, font=font)
    return b[2] - b[0]


def _initials(name: str) -> str:
    parts = [p for p in (name or "?").split() if p]
    if not parts:
        return "?"
    if len(parts) == 1:
        return parts[0][:2].upper()
    return (parts[0][0] + parts[1][0]).upper()


def _circular_photo(blob: bytes, size: int) -> Image.Image | None:
    """Center-cropped circular avatar from raw image bytes, or None on error."""
    try:
        im = Image.open(io.BytesIO(blob)).convert("RGB")
    except Exception:
        return None
    w, h = im.size
    s = min(w, h)
    im = im.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s))
    im = im.resize((size, size), Image.LANCZOS)
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, size - 1, size - 1], fill=255)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(im, (0, 0), mask)
    return out


def _radial_glow(size: int, color, alpha: int) -> Image.Image:
    """A soft circular glow sprite (RGBA), size×size."""
    g = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(g).ellipse(
        [size * 0.18, size * 0.18, size * 0.82, size * 0.82], fill=(*color, alpha)
    )
    return g.filter(ImageFilter.GaussianBlur(size * 0.12))


def render_card_png(
    name: str, region: str | None, age: int | None, gender: str | None,
    checked: bool, tags: list[str], photo_bytes: bytes | None = None,
) -> bytes:
    img = Image.new("RGB", (W, H), BG)

    # --- background: layered mesh blobs + vignette ---
    blob = Image.new("RGB", (W, H), BG)
    bd = ImageDraw.Draw(blob)
    bd.ellipse([-260, -120, 700, 840], fill=(46, 32, 130))       # purple top-left
    bd.ellipse([520, 1180, 1380, 2040], fill=(12, 74, 74))        # teal bottom-right
    bd.ellipse([640, -160, 1240, 440], fill=(60, 40, 120))        # purple top-right
    blob = blob.filter(ImageFilter.GaussianBlur(200))
    img = Image.blend(img, blob, 0.7)

    # faint dot grid for texture
    grid = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(grid)
    for gy in range(120, H, 46):
        for gx in range(40, W, 46):
            gd.ellipse([gx, gy, gx + 2, gy + 2], fill=(255, 255, 255, 12))
    img = Image.alpha_composite(img.convert("RGBA"), grid)
    draw = ImageDraw.Draw(img, "RGBA")

    # --- header: logo + wordmark ---
    draw.rounded_rectangle([80, 96, 152, 168], radius=20, fill=ACCENT)
    draw.polygon([(116, 112), (138, 132), (116, 152), (94, 132)], fill=(255, 255, 255))
    draw.text((172, 114), "BRIGHT FUTURES", font=_font(_DM, 30, 600), fill=TEXT2)
    draw.text((172, 150), "UZBEKISTAN", font=_font(_DM, 30, 600), fill=TEXT3)

    # --- glassy center panel ---
    px0, py0, px1, py1 = 72, 372, 1008, 1512
    panel = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(panel).rounded_rectangle(
        [px0, py0, px1, py1], radius=52, fill=(255, 255, 255, 14))
    img = Image.alpha_composite(img, panel)
    draw = ImageDraw.Draw(img, "RGBA")
    draw.rounded_rectangle([px0, py0, px1, py1], radius=52, outline=BORDER, width=2)

    cx = 540
    # --- avatar with glow ring ---
    av_cy, av_r = 600, 132
    col = AVATAR_COLORS[(ord((name or "?")[0]) if name else 0) % len(AVATAR_COLORS)]
    glow = _radial_glow(av_r * 4, ACCENT2, 120)
    img.alpha_composite(glow, (cx - av_r * 2, av_cy - av_r * 2))
    draw = ImageDraw.Draw(img, "RGBA")
    # gradient-ish ring: teal underlay + accent ring
    draw.ellipse([cx - av_r - 10, av_cy - av_r - 10, cx + av_r + 10, av_cy + av_r + 10],
                 outline=(*TEAL, 180), width=4)
    draw.ellipse([cx - av_r - 4, av_cy - av_r - 4, cx + av_r + 4, av_cy + av_r + 4],
                 outline=(*ACCENT2, 230), width=6)

    photo = _circular_photo(photo_bytes, av_r * 2) if photo_bytes else None
    if photo is not None:
        img.alpha_composite(photo, (cx - av_r, av_cy - av_r))
        draw = ImageDraw.Draw(img, "RGBA")
    else:
        # Solid colors only — drawing alpha fills directly on an RGBA image
        # overwrites (no blend), so a "faint" fill becomes solid on RGB export.
        disc = tuple(int(c * 0.28) + 14 for c in col)            # dark tint
        bright = tuple(int(c + (255 - c) * 0.30) for c in col)   # light tint
        draw.ellipse([cx - av_r, av_cy - av_r, cx + av_r, av_cy + av_r], fill=disc)
        draw.text((cx, av_cy - 4), _initials(name), font=_font(_SYNE, 108, 800),
                  fill=bright, anchor="mm")

    # verified badge bottom-right of avatar (Instagram-style)
    if checked:
        bx, by, br = cx + av_r - 24, av_cy + av_r - 24, 34
        draw.ellipse([bx - br, by - br, bx + br, by + br], fill=ACCENT, outline=BG, width=6)
        draw.line([(bx - 15, by + 2), (bx - 3, by + 14), (bx + 16, by - 13)],
                  fill=(255, 255, 255), width=7, joint="curve")

    # --- name (shrink to fit; fall back to "First L." before truncating) ---
    disp = (name or "BFU member").strip()
    size = 78
    f_name = _font(_SYNE, size, 800)
    while _text_w(draw, disp, f_name) > 860 and size > 50:
        size -= 4
        f_name = _font(_SYNE, size, 800)
    if _text_w(draw, disp, f_name) > 860:
        # too long even shrunk → "First L."
        parts = disp.split()
        if len(parts) > 1:
            disp = f"{parts[0]} {parts[1][0]}."
            size = 78
            f_name = _font(_SYNE, size, 800)
            while _text_w(draw, disp, f_name) > 860 and size > 50:
                size -= 4
                f_name = _font(_SYNE, size, 800)
    draw.text((cx, 822), disp, font=f_name, fill=TEXT, anchor="mm")

    # --- meta line ---
    meta = " · ".join(
        x for x in [region, (f"{age} y.o." if age else None),
                    (gender if gender in ("Male", "Female") else None)]
        if x
    )
    if meta:
        draw.text((cx, 898), meta, font=_font(_DM, 36, 500), fill=TEXT2, anchor="mm")

    # --- tag chips (gradient-tinted, centered, wrapped, up to 6) ---
    f_tag = _font(_DM, 34, 600)
    chips = [t for t in (tags or []) if t][:6]
    pad_x, gap, chip_h = 30, 18, 66
    rows, cur, cur_w = [], [], 0
    for tg in chips:
        w = _text_w(draw, tg, f_tag) + pad_x * 2
        if cur and cur_w + gap + w > 860:
            rows.append((cur, cur_w)); cur, cur_w = [], 0
        cur.append((tg, w)); cur_w += (gap if cur_w else 0) + w
    if cur:
        rows.append((cur, cur_w))
    y = 985
    for row, total in rows[:3]:
        x = cx - total // 2
        for tg, w in row:
            # Solid colors (alpha fills don't blend on a direct RGBA draw).
            draw.rounded_rectangle([x, y, x + w, y + chip_h], radius=chip_h // 2,
                                   fill=(44, 40, 78), outline=(123, 111, 255), width=2)
            draw.text((x + w // 2, y + chip_h // 2 - 2), tg, font=f_tag,
                      fill=(214, 206, 255), anchor="mm")
            x += w + gap
        y += chip_h + gap

    # --- footer CTA ---
    draw.text((cx, 1604), "Join me on BFU", font=_font(_SYNE, 58, 800), fill=TEXT, anchor="mm")
    draw.text((cx, 1666), "Find your team, co-founders & opportunities",
              font=_font(_DM, 32, 500), fill=TEXT2, anchor="mm")
    # glowing CTA pill
    pill = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(pill).rounded_rectangle([210, 1734, 870, 1820], radius=44, fill=(*ACCENT, 255))
    pill = pill.filter(ImageFilter.GaussianBlur(0))
    glowp = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(glowp).rounded_rectangle([210, 1734, 870, 1820], radius=44, fill=(*ACCENT, 130))
    img.alpha_composite(glowp.filter(ImageFilter.GaussianBlur(24)))
    img.alpha_composite(pill)
    draw = ImageDraw.Draw(img, "RGBA")
    draw.text((cx, 1776), "t.me/BrightFuturesUzbekistan_bot",
              font=_font(_DM, 34, 700), fill=(255, 255, 255), anchor="mm")

    out = io.BytesIO()
    img.convert("RGB").save(out, format="PNG", optimize=True)
    return out.getvalue()
