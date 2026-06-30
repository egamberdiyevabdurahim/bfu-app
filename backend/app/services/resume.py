"""Renders a one-page A4 PDF resume/CV from a member's BFU profile.

Pure function, mirroring app/services/card.py: it takes already-computed profile
data (the same dicts `_profile_extras` + `_trust_extras` return) and returns PDF
bytes. Uses fpdf2 with the built-in Helvetica core fonts (no font files needed),
so it renders identically everywhere. Every string is passed through `_safe`
before drawing, so non-latin-1 input (Cyrillic, emoji) degrades gracefully
instead of raising.
"""
from __future__ import annotations

import unicodedata

from fpdf import FPDF

# Brand-ish palette (RGB). fpdf2 wants ints.
ACCENT = (123, 111, 255)
INK = (24, 24, 32)
MUTED = (120, 120, 140)
LINE = (220, 220, 230)


def _safe(s) -> str:
    """Make a string drawable by the latin-1 core fonts. Keep what we can,
    transliterate the rest, drop anything still un-encodable (e.g. emoji)."""
    s = str(s or "")
    try:
        s.encode("latin-1")
        return s
    except UnicodeEncodeError:
        pass
    # Best-effort: decompose accents / transliterate to ASCII, drop residue.
    norm = unicodedata.normalize("NFKD", s)
    out = norm.encode("latin-1", "ignore").decode("latin-1")
    return out.strip() or s.encode("ascii", "ignore").decode("ascii")


def render_resume_pdf(
    *, name: str, meta: str, public_url: str, about: str | None,
    skills: list[str], other_tags: list[str], extras: dict, trust: dict,
) -> bytes:
    pdf = FPDF(orientation="P", unit="mm", format="A4")
    pdf.set_auto_page_break(auto=True, margin=16)
    pdf.add_page()
    pdf.set_margins(left=18, top=16, right=18)
    epw = pdf.w - 36  # effective page width

    def h1(text: str):
        pdf.set_font("Helvetica", "B", 22)
        pdf.set_text_color(*INK)
        pdf.multi_cell(epw, 9, _safe(text))

    def small(text: str, color=MUTED):
        pdf.set_font("Helvetica", "", 10)
        pdf.set_text_color(*color)
        pdf.multi_cell(epw, 5, _safe(text))

    def section(title: str):
        pdf.ln(3)
        pdf.set_font("Helvetica", "B", 11)
        pdf.set_text_color(*ACCENT)
        pdf.cell(0, 6, _safe(title.upper()), new_x="LMARGIN", new_y="NEXT")
        pdf.set_draw_color(*LINE)
        y = pdf.get_y()
        pdf.line(18, y, 18 + epw, y)
        pdf.ln(2)

    def body(text: str, size=10):
        pdf.set_font("Helvetica", "", size)
        pdf.set_text_color(*INK)
        pdf.multi_cell(epw, 5, _safe(text))

    # ── Header ──
    h1(name or "BFU member")
    if meta:
        small(meta)
    if public_url:
        pdf.set_font("Helvetica", "", 9)
        pdf.set_text_color(*ACCENT)
        pdf.cell(0, 5, _safe(public_url), new_x="LMARGIN", new_y="NEXT",
                 link=public_url)

    cb = extras.get("currently_building")
    if cb:
        pdf.ln(1)
        pdf.set_font("Helvetica", "B", 11)
        pdf.set_text_color(*INK)
        pdf.multi_cell(epw, 6, _safe("Currently building: " + cb))

    # ── About ──
    if about and about.strip():
        section("About")
        body(about.strip())

    # ── Skills (with endorsement counts) ──
    endo = {e["skill"]: e.get("count", 0) for e in (trust.get("endorsements") or [])}
    if skills:
        section("Skills")
        line = "  ".join(
            f"{s} ({endo[s]})" if endo.get(s) else s for s in skills
        )
        body(line)
    if other_tags:
        section("Interests & strengths")
        body("  ".join(other_tags))

    # ── Projects founded ──
    founded = extras.get("founded_projects") or []
    section("Projects founded")
    if founded:
        for p in founded:
            status = "Active" if p.get("is_active") else "Closed"
            body(f"- {p.get('name', '')}  ({status})")
    else:
        small("No projects yet.")

    # ── Projects joined ──
    joined = extras.get("member_projects") or []
    section("Projects joined")
    if joined:
        for p in joined:
            status = "Active" if p.get("is_active") else "Closed"
            body(f"- {p.get('name', '')}  ({status})")
    else:
        small("None yet.")

    # ── Reputation: rating + vouches ──
    rating = trust.get("rating") or {}
    vouches = trust.get("vouches") or []
    if rating.get("average") is not None or vouches:
        section("Reputation")
        if rating.get("average") is not None:
            body(f"Rating: {rating['average']} / 5  ({rating.get('count', 0)} ratings)")
        for v in vouches[:3]:
            author = (v.get("author") or {}).get("display_name", "")
            body(f'"{v.get("text", "")}"  - {author}', size=9)

    # ── Portfolio links ──
    links = extras.get("portfolio_links") or []
    if links:
        section("Links")
        for l in links:
            label = l.get("label") or l.get("url", "")
            url = l.get("url", "")
            pdf.set_font("Helvetica", "", 10)
            pdf.set_text_color(*ACCENT)
            pdf.cell(0, 5, _safe(f"{label}: {url}"), new_x="LMARGIN",
                     new_y="NEXT", link=url)

    # ── Footer credit ──
    pdf.ln(4)
    pdf.set_font("Helvetica", "I", 8)
    pdf.set_text_color(*MUTED)
    pdf.cell(0, 4, _safe("Generated by Bright Futures Uzbekistan"),
             new_x="LMARGIN", new_y="NEXT")

    out = pdf.output()  # fpdf2 2.8 returns a bytearray
    return bytes(out)
