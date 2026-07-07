"use client";

import { useState } from "react";

// Small reusable 1–5 star input. Controlled if `value`+`onChange` are passed;
// otherwise self-contained. Read-only mode shows a static rating. Firelit amber
// glyphs matching the Chorsu palette. Hover preview respects the pointer only —
// no motion, so prefers-reduced-motion is a non-issue here.
export default function StarInput({
  value = 0,
  onChange,
  readOnly = false,
  size = 26,
  disabled = false,
}) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;

  return (
    <div
      style={{ display: "inline-flex", gap: 4 }}
      role={readOnly ? "img" : "radiogroup"}
      aria-label={readOnly ? `${value} out of 5 stars` : "Rate 1 to 5 stars"}
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const on = n <= shown;
        const common = {
          fontSize: size,
          lineHeight: 1,
          color: on ? "var(--amber)" : "var(--hair)",
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
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            disabled={disabled}
            onMouseEnter={() => !disabled && setHover(n)}
            onMouseLeave={() => setHover(0)}
            onFocus={() => !disabled && setHover(n)}
            onBlur={() => setHover(0)}
            onClick={() => !disabled && onChange && onChange(n)}
            style={{
              ...common,
              background: "none",
              border: "none",
              padding: 0,
              cursor: disabled ? "default" : "pointer",
              opacity: disabled ? 0.5 : 1,
            }}
          >
            ★
          </button>
        );
      })}
    </div>
  );
}
