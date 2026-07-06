"use client";

import { useCountUp } from "../lib/useCountUp";

// Screen 4 (/projects) header. Mirrors CityHeader's grammar: a mono overline,
// a Bricolage headline, an Instrument-Serif italic sub, and count-up stats
// (Total projects / Hiring now) via useCountUp (prefers-reduced-motion handled
// inside the hook). When there are no projects, a warm quiet-state headline
// invites the reader to post the first one.
export default function ProjectsHeader({ stats = {} }) {
  const total = Number(stats.total) || 0;
  const hiring = Number(stats.hiring) || 0;

  const totalCount = useCountUp(total);
  const s1 = useCountUp(total);
  const s2 = useCountUp(hiring);

  const empty = total === 0;

  return (
    <div
      style={{
        marginTop: 40,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "space-between",
        gap: 30,
        flexWrap: "wrap",
      }}
    >
      <div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "var(--muted)",
          }}
        >
          Uzbekistan · Projects
        </div>
        <h1
          style={{
            margin: "10px 0 0",
            fontFamily: "var(--font-display)",
            fontWeight: 800,
            fontSize: 64,
            lineHeight: 0.98,
            letterSpacing: "-0.02em",
          }}
        >
          {empty ? (
            "No projects lit yet"
          ) : (
            <>
              <span style={{ color: "var(--amber)" }}>{totalCount}</span> projects building tonight
            </>
          )}
        </h1>
        <div
          style={{
            marginTop: 12,
            fontFamily: "var(--font-accent)",
            fontStyle: "italic",
            fontSize: 24,
            color: "var(--muted)",
          }}
        >
          {empty
            ? "Be the first — every great thing started as someone's project."
            : "Find your team. Pull a thread you can't unsee."}
        </div>
      </div>

      {!empty && (
        <div style={{ display: "flex", gap: 26 }}>
          <Count value={s1} label="Total projects" />
          <Count value={s2} label="Hiring now" online />
        </div>
      )}
    </div>
  );
}

function Count({ value, label, online }) {
  return (
    <div>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: 34,
          lineHeight: 1,
          color: online ? "var(--green)" : "var(--text)",
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--muted)",
          marginTop: 5,
        }}
      >
        {label}
      </div>
    </div>
  );
}
