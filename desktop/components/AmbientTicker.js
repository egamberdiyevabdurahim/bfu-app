"use client";

import { useEffect, useRef, useState } from "react";

// Each line is an array of segments. A segment with `hl: true` renders in the
// bright ink white (--text) for emphasis; plain segments render in --muted.
// This ports the reference's 4 rich multi-clause lines and their white-highlight
// <span> on a key noun (Chorsu Profile.dc.html lines 409-414).
const DEFAULT_LINES = [
  [
    { t: "Aziza just added a project in Tashkent · " },
    { t: "34 builders online", hl: true },
    { t: " tonight · Rustam is looking for a co-founder right now" },
  ],
  [
    { t: "Malika endorsed Aziz for " },
    { t: "firmware", hl: true },
    { t: " · 5 builders joined Fergana this week · the bazaar is warm tonight" },
  ],
  [
    { t: "Dilnoza", hl: true },
    { t: " shipped SolarPay v2 · 12 builders online in Samarkand · someone is always building right now" },
  ],
  [
    { t: "New vouch for " },
    { t: "Grid Storage", hl: true },
    { t: " · Rustam went online · 34 builders in the city tonight" },
  ],
];

// Normalize a line (string or segment array) into renderable segments.
function toSegments(line) {
  if (typeof line === "string") return [{ t: line }];
  return line;
}

export default function AmbientTicker({ lines = DEFAULT_LINES }) {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);
  const timerRef = useRef(null);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || lines.length <= 1) return undefined;

    timerRef.current = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIndex((i) => (i + 1) % lines.length);
        setVisible(true);
      }, 400);
    }, 3000);

    return () => clearInterval(timerRef.current);
  }, [lines]);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 14,
      padding: "12px 20px", borderRadius: "var(--radius-pill)", border: "1px solid var(--hair)",
      background: "linear-gradient(90deg, rgba(26,24,21,0.7), rgba(26,24,21,0.3))",
      backdropFilter: "blur(6px)", overflow: "hidden" }}>
      <span style={{ position: "relative", display: "inline-flex", flex: "0 0 auto", width: 8, height: 8 }}>
        <span className="ch-online-ping" />
        <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "var(--ember)" }} />
      </span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.16em",
        textTransform: "uppercase", color: "var(--ember)", flex: "0 0 auto" }}>Live</span>
      <div style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "var(--muted)",
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        opacity: visible ? 1 : 0, transition: "opacity 0.4s ease" }}>
        {toSegments(lines[index]).map((seg, i) => (
          <span key={i} style={seg.hl ? { color: "var(--text)" } : undefined}>{seg.t}</span>
        ))}
      </div>
    </div>
  );
}
