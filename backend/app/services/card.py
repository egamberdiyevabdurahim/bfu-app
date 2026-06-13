"""Renders a shareable "BFU Card" PNG (1080×1920, Telegram Story ratio).

A dark, status-y profile card — name, region, AI tags, verified tick — that a
user pushes to their Telegram Story with their referral link as a tappable
widget. Uses the brand fonts bundled under app/assets/fonts.
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


def render_card_png(
    name: str, region: str | None, age: int | None, gender: str | None,
    checked: bool, tags: list[str],
) -> bytes:
    img = Image.new("RGB", (W, H), BG)

    # --- background gradient blobs ---
    blob = Image.new("RGB", (W, H), BG)
    bd = ImageDraw.Draw(blob)
    bd.ellipse([-200, 80, 620, 900], fill=(40, 30, 120))      # purple, top-left
    bd.ellipse([560, 1100, 1320, 1900], fill=(12, 70, 70))     # teal, bottom-right
    blob = blob.filter(ImageFilter.GaussianBlur(190))
    img = Image.blend(img, blob, 0.65)
    draw = ImageDraw.Draw(img, "RGBA")

    # --- header: logo + wordmark ---
    draw.rounded_rectangle([80, 92, 152, 164], radius=20, fill=ACCENT)
    # diamond mark (drawn, not a glyph — brand fonts lack ✦)
    draw.polygon([(116, 108), (138, 128), (116, 148), (94, 128)], fill=(255, 255, 255))
    f_kicker = _font(_DM, 30, 600)
    draw.text((172, 110), "BRIGHT FUTURES", font=f_kicker, fill=TEXT2)
    draw.text((172, 146), "UZBEKISTAN", font=f_kicker, fill=TEXT3)

    # --- center panel ---
    px0, py0, px1, py1 = 80, 380, 1000, 1500
    draw.rounded_rectangle([px0, py0, px1, py1], radius=48, fill=PANEL, outline=BORDER, width=2)

    # avatar
    cx, cy, r = 540, 600, 110
    col = AVATAR_COLORS[(ord((name or "?")[0]) if name else 0) % len(AVATAR_COLORS)]
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(*col, 40), outline=(*col, 150), width=4)
    f_init = _font(_SYNE, 92, 800)
    draw.text((cx, cy - 6), _initials(name), font=f_init, fill=col, anchor="mm")

    # name (+ verified)
    disp = (name or "BFU member").strip()
    f_name = _font(_SYNE, 76, 800)
    while _text_w(draw, disp, f_name) > 760 and len(disp) > 4:
        disp = disp[:-2]
    name_w = _text_w(draw, disp, f_name)
    nx = cx - name_w // 2
    draw.text((cx, 790), disp, font=f_name, fill=TEXT, anchor="mm")
    if checked:
        # drawn check badge (brand fonts lack ✓)
        bx, by, br = nx + name_w + 44, 790, 30
        draw.ellipse([bx - br, by - br, bx + br, by + br], fill=ACCENT)
        draw.line([(bx - 14, by + 2), (bx - 3, by + 13), (bx + 15, by - 12)],
                  fill=(255, 255, 255), width=6, joint="curve")

    # meta line (gender as a word — symbol glyphs aren't in the brand fonts)
    meta = " · ".join(
        x for x in [region, (f"{age} y.o." if age else None),
                    (gender if gender in ("Male", "Female") else None)]
        if x
    )
    if meta:
        draw.text((cx, 868), meta, font=_font(_DM, 36, 500), fill=TEXT2, anchor="mm")

    # tag chips — centered, wrapped, up to ~6
    f_tag = _font(_DM, 34, 600)
    chips = [t for t in (tags or []) if t][:6]
    pad_x, gap, chip_h = 28, 18, 64
    rows, cur, cur_w = [], [], 0
    for tg in chips:
        w = _text_w(draw, tg, f_tag) + pad_x * 2
        if cur and cur_w + gap + w > 840:
            rows.append((cur, cur_w)); cur, cur_w = [], 0
        cur.append((tg, w)); cur_w += (gap if cur_w else 0) + w
    if cur:
        rows.append((cur, cur_w))
    y = 980
    for row, total in rows[:3]:
        x = cx - total // 2
        for tg, w in row:
            draw.rounded_rectangle([x, y, x + w, y + chip_h], radius=chip_h // 2,
                                   fill=(123, 111, 255, 30), outline=(123, 111, 255, 90), width=2)
            draw.text((x + w // 2, y + chip_h // 2 - 2), tg, font=f_tag, fill=(214, 204, 255), anchor="mm")
            x += w + gap
        y += chip_h + gap

    # --- footer CTA ---
    draw.text((cx, 1610), "Join me on BFU", font=_font(_SYNE, 56, 800), fill=TEXT, anchor="mm")
    draw.text((cx, 1672), "Find your team, co-founders & opportunities",
              font=_font(_DM, 34, 500), fill=TEXT2, anchor="mm")
    draw.rounded_rectangle([340, 1740, 740, 1820], radius=40, fill=ACCENT)
    draw.text((cx, 1780), "Open in Telegram →", font=_font(_DM, 36, 700), fill=(255, 255, 255), anchor="mm")

    out = io.BytesIO()
    img.save(out, format="PNG", optimize=True)
    return out.getvalue()
