"use client";

import { useRef, useState } from "react";

// Screen 4 (/projects) filter row. Mirrors FilterBar's pattern: CLIENT-SIDE
// filtering over the already-loaded project set — no refetch. This wrapper
// renders the server-rendered project grid as `children`; on chip select it
// walks its own subtree and shows/hides `[data-project]` cards. This keeps
// ProjectBrowseCard a pure SERVER component (only this wrapper is a client
// component).
//
// FilterBar <-> ProjectBrowseCard data-attribute contract (ProjectBrowseCard
// MUST emit exactly these on each `[data-project]` element):
//   data-type    "startup" | "volunteering" | ""
//   data-hiring  "1" | "0"

const ALL = "all";
const STARTUP = "startup";
const VOLUNTEERING = "volunteering";
const HIRING = "hiring";

const CHIPS = [
  { key: ALL, label: "All" },
  { key: STARTUP, label: "Startups" },
  { key: VOLUNTEERING, label: "Volunteering" },
  { key: HIRING, label: "Hiring now", marker: "green" },
];

// Decide whether a single project card element passes the active filter.
function cardMatches(el, key) {
  if (key === ALL) return true;
  if (key === HIRING) return el.getAttribute("data-hiring") === "1";
  if (key === STARTUP) return el.getAttribute("data-type") === "startup";
  if (key === VOLUNTEERING) return el.getAttribute("data-type") === "volunteering";
  return true;
}

export default function ProjectFilterBar({ children }) {
  const [active, setActive] = useState(ALL);
  const rootRef = useRef(null);
  const [empty, setEmpty] = useState(false);

  function applyFilter(key) {
    setActive(key);
    const root = rootRef.current;
    if (!root) return;

    let visible = 0;
    root.querySelectorAll("[data-project]").forEach((card) => {
      const ok = cardMatches(card, key);
      card.hidden = !ok;
      if (ok) visible += 1;
    });
    setEmpty(visible === 0);
  }

  return (
    <div ref={rootRef}>
      <div
        role="tablist"
        aria-label="Filter projects"
        style={{
          marginTop: 34,
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        {CHIPS.map((chip) => {
          const on = active === chip.key;
          return (
            <button
              key={chip.key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => applyFilter(chip.key)}
              style={{
                padding: "9px 16px",
                borderRadius: "var(--radius-pill)",
                border: on
                  ? "1px solid rgba(232,161,92,0.5)"
                  : "1px solid var(--hair)",
                background: on
                  ? "linear-gradient(135deg, rgba(232,161,92,0.16), rgba(192,86,59,0.12))"
                  : "transparent",
                color: on ? "var(--amber)" : "var(--muted)",
                fontFamily: "var(--font-mono)",
                fontSize: 11.5,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                cursor: "pointer",
                transition: "color 0.16s ease, border-color 0.16s ease, background 0.16s ease",
                display: "inline-flex",
                alignItems: "center",
              }}
            >
              {chip.marker === "green" && (
                <span
                  aria-hidden="true"
                  style={{
                    display: "inline-block",
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: "var(--green)",
                    marginRight: 6,
                    boxShadow: "0 0 8px rgba(127,176,105,0.8)",
                    verticalAlign: "middle",
                  }}
                />
              )}
              {chip.label}
            </button>
          );
        })}
      </div>

      {children}

      {/* Filter produced no matches — a calm inline note (the grid above is
          fully hidden by the [data-project] toggles). */}
      {empty && (
        <div
          style={{
            marginTop: 22,
            padding: "20px 24px",
            borderRadius: "var(--radius)",
            border: "1px dashed var(--hair)",
            fontFamily: "var(--font-accent)",
            fontStyle: "italic",
            fontSize: 18,
            color: "var(--muted)",
          }}
        >
          Nothing here yet under this filter — try another.
        </div>
      )}
    </div>
  );
}
