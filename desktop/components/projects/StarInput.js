"use client";

import { useState } from "react";
import { useT } from "@/components/i18n/LocaleProvider";

// Small reusable 1–5 star input. Controlled if `value`+`onChange` are passed;
// otherwise self-contained. Read-only mode shows a static rating. Firelit amber
// glyphs matching the Chorsu palette. Hover preview respects the pointer only —
// no motion, so prefers-reduced-motion is a non-issue here.
//
// Interactive mode is a proper ARIA radiogroup with a roving tabindex: only the
// checked star (or the first, when none is checked) is in the tab order, and
// Arrow/Home/End move-and-select, matching the WAI-ARIA radiogroup pattern.
export default function StarInput({
  value = 0,
  onChange,
  readOnly = false,
  size = 26,
  disabled = false,
}) {
  const t = useT();
  const [hover, setHover] = useState(0);
  const shown = hover || value;

  function move(next) {
    if (disabled) return;
    const clamped = Math.max(1, Math.min(5, next));
    onChange && onChange(clamped);
  }

  function onKeyDown(e) {
    if (disabled) return;
    switch (e.key) {
      case "ArrowRight":
      case "ArrowUp":
        e.preventDefault();
        move((value || 0) + 1);
        break;
      case "ArrowLeft":
      case "ArrowDown":
        e.preventDefault();
        move((value || 1) - 1);
        break;
      case "Home":
        e.preventDefault();
        move(1);
        break;
      case "End":
        e.preventDefault();
        move(5);
        break;
      default:
        break;
    }
  }

  // The star that owns tabindex 0 (roving): the checked one, else the first.
  const rovingIndex = value >= 1 && value <= 5 ? value : 1;

  return (
    <div
      style={{ display: "inline-flex", gap: 4 }}
      role={readOnly ? "img" : "radiogroup"}
      aria-label={readOnly ? t("projmanage.stars_readonly_aria", { value }) : t("projmanage.stars_rate_aria")}
      aria-disabled={!readOnly && disabled ? "true" : undefined}
      onKeyDown={readOnly ? undefined : onKeyDown}
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const on = n <= shown;
        const common = {
          fontSize: size,
          lineHeight: 1,
          // Empty stars read at ~3:1 on the dark surface instead of near-invisible --hair.
          color: on ? "var(--amber)" : "var(--muted-strong)",
          transition: "color 120ms ease",
          textShadow: on ? "0 0 12px rgba(232,161,92,0.45)" : "none",
        };
        if (readOnly) {
          return (
            <span key={n} aria-hidden style={common}>
              ★
            </span>
          );
        }
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={n > 1 ? t("projmanage.stars_many", { n }) : t("projmanage.stars_one", { n })}
            tabIndex={n === rovingIndex ? 0 : -1}
            disabled={disabled}
            onMouseEnter={() => !disabled && setHover(n)}
            onMouseLeave={() => setHover(0)}
            onFocus={() => !disabled && setHover(n)}
            onBlur={() => setHover(0)}
            onClick={() => !disabled && onChange && onChange(n)}
            style={{
              ...common,
              // Empty (unhovered) glyph outlined so all 5 slots read clearly.
              color: on ? "var(--amber)" : "var(--muted-strong)",
              background: "none",
              border: "none",
              borderRadius: "var(--radius-sm)",
              padding: 0,
              cursor: disabled ? "default" : "pointer",
              opacity: disabled ? 0.5 : 1,
            }}
          >
            {on ? "★" : "☆"}
          </button>
        );
      })}
    </div>
  );
}
