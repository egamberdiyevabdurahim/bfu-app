"use client";

import { useEffect, useRef } from "react";

const CIRCUMFERENCE = 2 * Math.PI * 52; // r=52, matches the SVG below

function elasticEaseOut(t) {
  if (t === 0) return 0;
  if (t === 1) return 1;
  const c4 = (2 * Math.PI) / 3;
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
}

export default function ReputationCell({ rating }) {
  const ringRef = useRef(null);

  useEffect(() => {
    const ring = ringRef.current;
    if (!ring) return undefined;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fraction = rating.average != null ? rating.average / 5 : 0;
    const target = CIRCUMFERENCE * (1 - fraction);

    if (reduce) {
      ring.setAttribute("stroke-dashoffset", String(target));
      return undefined;
    }

    let frame;
    const start = performance.now();
    const duration = 1300;
    const delayTimer = setTimeout(() => {
      const tick = (now) => {
        const p = Math.min(1, (now - start) / duration);
        const eased = elasticEaseOut(p);
        ring.setAttribute("stroke-dashoffset", String(CIRCUMFERENCE + (target - CIRCUMFERENCE) * eased));
        if (p < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    }, 250);

    return () => { clearTimeout(delayTimer); if (frame) cancelAnimationFrame(frame); };
  }, [rating.average]);

  return (
    <div className="ch-cell" style={{ gridColumn: "span 2", display: "flex", alignItems: "center", gap: 26 }}>
      <div style={{ position: "relative", flex: "0 0 auto", width: 128, height: 128 }}>
        <svg width="128" height="128" viewBox="0 0 128 128" style={{ transform: "rotate(-90deg)" }}>
          <circle cx="64" cy="64" r="52" fill="none" stroke="var(--surface-2)" strokeWidth="10" />
          <circle
            ref={ringRef}
            cx="64" cy="64" r="52" fill="none" stroke="url(#ch-rep-grad)"
            strokeWidth="10" strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE} strokeDashoffset={CIRCUMFERENCE}
          />
          <defs>
            <linearGradient id="ch-rep-grad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#F0B429" />
              <stop offset="1" stopColor="#FF6A3D" />
            </linearGradient>
          </defs>
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center" }}>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 38, lineHeight: 1,
            color: "var(--text)" }}>
            {rating.average != null ? rating.average.toFixed(1) : "—"}
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em",
            color: "var(--muted)", marginTop: 3 }}>/ 5.0</div>
        </div>
      </div>
      <div>
        <div className="ch-cell-label">Reputation</div>
        <div style={{ marginTop: 10, fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 22,
          color: "var(--text)", lineHeight: 1.15 }}>
          {rating.count > 0 ? <>Trusted across<br />the community</> : "New to the bazaar"}
        </div>
        <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8, fontSize: 13,
          color: "var(--muted)" }}>
          <span style={{ fontFamily: "var(--font-mono)", color: "var(--amber)" }}>{rating.count}</span> ratings
        </div>
      </div>
    </div>
  );
}
