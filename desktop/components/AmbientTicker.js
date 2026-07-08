"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "@/components/i18n/LocaleProvider";

// Each line is an array of segments. A segment with `hl: true` renders in the
// bright ink white (--text) for emphasis; plain segments render in --muted.
// Honest, evergreen atmosphere only — no fabricated names, counts, or events.
// (An earlier version hardcoded fake people/numbers, which read as a "LIVE" lie;
// these lines are true whenever the app is up.) Pass real activity via `lines`
// once an activity-feed endpoint exists.
function buildDefaultLines(t) {
  return [
    [
      { t: t("city.ticker.default1_lead") },
      { t: " · " },
      { t: t("city.ticker.default1_hl"), hl: true },
    ],
    [
      { t: t("city.ticker.default2_lead") },
      { t: t("city.ticker.default2_hl"), hl: true },
    ],
    [
      { t: t("city.ticker.default3_lead") },
      { t: t("city.ticker.default3_hl"), hl: true },
    ],
    [
      { t: t("city.ticker.default4_lead") },
      { t: t("city.ticker.default4_hl"), hl: true },
    ],
  ];
}

// Normalize a line (string or segment array) into renderable segments.
function toSegments(line) {
  if (typeof line === "string") return [{ t: line }];
  return line;
}

export default function AmbientTicker({ lines }) {
  const t = useT();
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);
  const timerRef = useRef(null);

  const fallback = useMemo(() => buildDefaultLines(t), [t]);
  const effectiveLines = lines && lines.length ? lines : fallback;

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || effectiveLines.length <= 1) return undefined;

    timerRef.current = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIndex((i) => (i + 1) % effectiveLines.length);
        setVisible(true);
      }, 400);
    }, 3000);

    return () => clearInterval(timerRef.current);
  }, [effectiveLines]);

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
        textTransform: "uppercase", color: "var(--ember)", flex: "0 0 auto" }}>{t("city.ticker.live")}</span>
      <div style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "var(--muted)",
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        opacity: visible ? 1 : 0, transition: "opacity 0.4s ease" }}>
        {toSegments(effectiveLines[index]).map((seg, i) => (
          <span key={i} style={seg.hl ? { color: "var(--text)" } : undefined}>{seg.t}</span>
        ))}
      </div>
    </div>
  );
}
