"""Event registration forms — the ONE place the form rules live.

An Event may carry ``form_schema``: a JSON list of question objects authored by
an admin in the panel (the questions are DATA, not code — editing them never
needs a deploy). A member's answers land in ``EventRsvp.answers``, a JSON dict
keyed by question key.

    question  {"key","label","type","required"?,"options"?,"section"?}
    answers   {"q1": "Ali, 11-sinf", "q4": ["a","b"]}

Both write paths call in HERE — never re-implement a rule inline in a router:

    admin saves the questions   -> validate_schema()  / normalize_schema()
    a member RSVPs with answers -> parse_answers()    / validate_answers()

The client is never the gate: every rule below is enforced server-side, and a
failing answer set must 422 *before* any row is written.
"""
from __future__ import annotations

from typing import Any

# ── limits ────────────────────────────────────────────────────────────────────
MAX_ANSWER_LEN = 2000     # per answer (per item, for a checkbox list)
MAX_QUESTIONS = 60
MAX_OPTIONS = 50
MAX_KEY_LEN = 64
MAX_LABEL_LEN = 500
MAX_SECTION_LEN = 200

# ── question types ────────────────────────────────────────────────────────────
FREE_TYPES = ("text", "paragraph", "date", "phone")
SINGLE_CHOICE_TYPES = ("choice", "dropdown")   # value must be ONE of options
MULTI_CHOICE_TYPES = ("checkboxes",)           # EVERY value must be one of options
NUMBER_TYPES = ("number",)
OPTION_TYPES = SINGLE_CHOICE_TYPES + MULTI_CHOICE_TYPES  # these REQUIRE options
QUESTION_TYPES = FREE_TYPES + SINGLE_CHOICE_TYPES + MULTI_CHOICE_TYPES + NUMBER_TYPES


def has_form(schema: Any) -> bool:
    """True when the event carries at least one question (null/[] = plain RSVP)."""
    return bool(schema) and isinstance(schema, list)


# ── schema (admin authoring) ──────────────────────────────────────────────────
def validate_schema(schema: Any) -> dict[str, str]:
    """Validate the QUESTION LIST an admin is trying to save.

    Returns ``{}`` when valid, else ``{question_key_or_position: reason}`` so the
    panel can point at the offending question. ``None``/``[]`` are valid — they
    mean "no form", i.e. a plain one-click RSVP.
    """
    errors: dict[str, str] = {}
    if schema is None or schema == []:
        return errors
    if not isinstance(schema, list):
        return {"form": "form_schema must be a list of questions"}
    if len(schema) > MAX_QUESTIONS:
        return {"form": f"Too many questions (max {MAX_QUESTIONS})"}

    seen: set[str] = set()
    for i, q in enumerate(schema):
        pos = f"#{i + 1}"
        if not isinstance(q, dict):
            errors[pos] = "Question must be an object"
            continue

        raw_key = q.get("key")
        key = raw_key.strip() if isinstance(raw_key, str) else ""
        slot = key or pos              # report against the key when we have one
        if not key:
            errors[pos] = "Question needs a non-empty 'key'"
            continue
        if len(key) > MAX_KEY_LEN:
            errors[slot] = f"Key is too long (max {MAX_KEY_LEN} chars)"
            continue
        if key in seen:
            errors[slot] = "Duplicate question key"
            continue
        seen.add(key)

        label = q.get("label")
        if not isinstance(label, str) or not label.strip():
            errors[slot] = "Question needs a non-empty 'label'"
            continue
        if len(label) > MAX_LABEL_LEN:
            errors[slot] = f"Label is too long (max {MAX_LABEL_LEN} chars)"
            continue

        qtype = q.get("type")
        if qtype not in QUESTION_TYPES:
            errors[slot] = f"Unknown type '{qtype}' (allowed: {', '.join(QUESTION_TYPES)})"
            continue

        section = q.get("section")
        if section is not None and (
            not isinstance(section, str) or len(section) > MAX_SECTION_LEN
        ):
            errors[slot] = f"Section must be a string (max {MAX_SECTION_LEN} chars)"
            continue

        if qtype in OPTION_TYPES:
            opts = q.get("options")
            if not isinstance(opts, list) or not opts:
                errors[slot] = f"Type '{qtype}' requires a non-empty 'options' list"
                continue
            if len(opts) > MAX_OPTIONS:
                errors[slot] = f"Too many options (max {MAX_OPTIONS})"
                continue
            if any(not isinstance(o, str) or not o.strip() for o in opts):
                errors[slot] = "Options must be non-empty strings"
                continue
            if len({o.strip() for o in opts}) != len(opts):
                errors[slot] = "Duplicate option"
                continue

    return errors


def normalize_schema(schema: Any) -> list[dict] | None:
    """Trim + drop junk from an ALREADY-VALIDATED schema (call validate_schema
    first). ``None``/``[]`` normalize to ``None`` = no form."""
    if not has_form(schema):
        return None
    out: list[dict] = []
    for q in schema:
        qtype = q["type"]
        item: dict[str, Any] = {
            "key": q["key"].strip(),
            "label": q["label"].strip(),
            "type": qtype,
            "required": bool(q.get("required", False)),
        }
        if qtype in OPTION_TYPES:
            item["options"] = [o.strip() for o in q["options"]]
        section = q.get("section")
        if isinstance(section, str) and section.strip():
            item["section"] = section.strip()
        out.append(item)
    return out


# ── answers (member RSVP) ─────────────────────────────────────────────────────
def _is_blank(v: Any) -> bool:
    if v is None:
        return True
    if isinstance(v, str):
        return not v.strip()
    if isinstance(v, (list, tuple)):
        return len([x for x in v if not (isinstance(x, str) and not x.strip())]) == 0
    return False


def parse_answers(schema: Any, answers: Any) -> tuple[dict[str, Any], dict[str, str]]:
    """Validate ``answers`` against ``schema``.

    Returns ``(cleaned, errors)``:
      * ``cleaned`` — only keys that exist in the schema, trimmed/coerced. Answers
        for unknown keys are IGNORED (not an error).
      * ``errors``  — ``{question_key: reason}``; ``{}`` means OK. The caller
        must 422 with this body and write NOTHING when it is non-empty.
    """
    errors: dict[str, str] = {}
    cleaned: dict[str, Any] = {}
    if not has_form(schema):
        return cleaned, errors
    if answers is None:
        answers = {}
    if not isinstance(answers, dict):
        return cleaned, {"form": "answers must be an object"}

    for q in schema:
        if not isinstance(q, dict):
            continue
        key = q.get("key")
        if not isinstance(key, str) or not key:
            continue
        qtype = q.get("type")
        required = bool(q.get("required", False))
        options = [o for o in (q.get("options") or []) if isinstance(o, str)]
        raw = answers.get(key)

        if _is_blank(raw):
            if required:
                errors[key] = "This question is required"
            continue

        # ── checkboxes: a list, every value must be a known option ────────────
        if qtype in MULTI_CHOICE_TYPES:
            values = raw if isinstance(raw, list) else [raw]
            picked: list[str] = []
            bad = False
            for v in values:
                if not isinstance(v, str):
                    errors[key] = "Each selection must be text"
                    bad = True
                    break
                v = v.strip()
                if not v:
                    continue
                if len(v) > MAX_ANSWER_LEN:
                    errors[key] = f"Answer is too long (max {MAX_ANSWER_LEN} characters)"
                    bad = True
                    break
                if v not in options:
                    errors[key] = f"'{v}' is not one of the allowed options"
                    bad = True
                    break
                picked.append(v)
            if bad:
                continue
            if not picked:
                if required:
                    errors[key] = "This question is required"
                continue
            cleaned[key] = picked
            continue

        # ── everything else is a single scalar ────────────────────────────────
        if isinstance(raw, (list, tuple, dict)):
            errors[key] = "Expected a single value"
            continue
        if isinstance(raw, bool):  # bool is an int subclass — reject before number
            errors[key] = "Expected a single value"
            continue

        if qtype in NUMBER_TYPES:
            if isinstance(raw, (int, float)):
                cleaned[key] = raw
                continue
            text = str(raw).strip()
            if len(text) > MAX_ANSWER_LEN:
                errors[key] = f"Answer is too long (max {MAX_ANSWER_LEN} characters)"
                continue
            try:
                float(text.replace(",", "."))
            except (TypeError, ValueError):
                errors[key] = "Must be a number"
                continue
            cleaned[key] = text
            continue

        text = raw if isinstance(raw, str) else str(raw)
        text = text.strip()
        if len(text) > MAX_ANSWER_LEN:
            errors[key] = f"Answer is too long (max {MAX_ANSWER_LEN} characters)"
            continue
        if qtype in SINGLE_CHOICE_TYPES and text not in options:
            errors[key] = f"'{text}' is not one of the allowed options"
            continue
        cleaned[key] = text

    return cleaned, errors


def validate_answers(schema: Any, answers: Any) -> dict[str, str]:
    """``{question_key: error}``; empty dict = the answers are valid."""
    return parse_answers(schema, answers)[1]


# ── CSV / export helpers (shared by the admin export) ─────────────────────────
def answer_to_text(value: Any) -> str:
    """Flatten one stored answer for a CSV cell (checkbox lists join with '; ')."""
    if value is None:
        return ""
    if isinstance(value, (list, tuple)):
        return "; ".join(str(v) for v in value)
    return str(value)
