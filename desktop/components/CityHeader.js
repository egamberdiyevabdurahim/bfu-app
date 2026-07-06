"use client";

import { useCountUp } from "../lib/useCountUp";

// Ports the mockup's `.hero` block (docs/superpowers/mockups/2026-07-06-chorsu-city-discovery.html).
// Overline `TOSHKENT · <weekday> night`, Bricolage headline with amber count-up,
// Instrument-Serif italic sub, and three count-up stats. All numbers via useCountUp
// (prefers-reduced-motion handled inside the hook). Quiet-hours copy when online_now === 0.
export default function CityHeader({ stats = {}, weekday = "" }) {
  const onlineNow = stats.online_now || 0;
  const citiesLit = stats.cities_lit || 0;
  const newThisWeek = stats.new_this_week || 0;

  const online = useCountUp(onlineNow);
  const c1 = useCountUp(onlineNow);
  const c2 = useCountUp(citiesLit);
  const c3 = useCountUp(newThisWeek);

  const quiet = onlineNow === 0;

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
          Toshkent{weekday ? ` · ${weekday} night` : ""}
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
          {quiet ? (
            "The bazaar is resting"
          ) : (
            <>
              <span style={{ color: "var(--amber)" }}>{online}</span> builders lit tonight
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
          {quiet ? "Quiet hours — come build." : "Someone is always building right now."}
        </div>
      </div>

      <div style={{ display: "flex", gap: 26 }}>
        <Count value={c1} label="Online now" online />
        <Count value={c2} label="Cities lit" />
        <Count value={c3} label="New this week" />
      </div>
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
