"use client";

import { useCountUp } from "../../lib/useCountUp";

// Command-center stat row. Client leaf so the numbers can count up on mount
// (useCountUp handles prefers-reduced-motion internally). Each tile is a
// .ch-cell with a big Bricolage number + a mono label — the firelit grammar
// from the City hero, laid out as a five-across bento.
//
// `stats` is the raw /admin/stats payload:
//   { users, projects, regions, schools, learning_centers }
export default function StatCards({ stats = {} }) {
  const cards = [
    { key: "users", label: "Builders", value: stats.users || 0, tone: "amber" },
    { key: "projects", label: "Projects", value: stats.projects || 0, tone: "ember" },
    { key: "regions", label: "Regions", value: stats.regions || 0, tone: "text" },
    { key: "schools", label: "Schools", value: stats.schools || 0, tone: "teal" },
    {
      key: "learning_centers",
      label: "Learning centers",
      value: stats.learning_centers || 0,
      tone: "green",
    },
  ];

  return (
    <div className="statcards-grid">
      {cards.map((c) => (
        <StatCard key={c.key} {...c} />
      ))}
      <style>{`
        .statcards-grid {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 16px;
          margin-top: 34px;
        }
        /* Five-across is too tight below ~1100px; step down gracefully so the
           big numbers never crush together. */
        @media (max-width: 1100px) {
          .statcards-grid { grid-template-columns: repeat(3, 1fr); }
        }
        @media (max-width: 720px) {
          .statcards-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 420px) {
          .statcards-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}

const TONE_COLOR = {
  amber: "var(--amber)",
  ember: "var(--ember)",
  teal: "var(--teal-bright)",
  green: "var(--green)",
  text: "var(--text)",
};

function StatCard({ label, value, tone }) {
  const n = useCountUp(value);
  const color = TONE_COLOR[tone] || "var(--text)";
  return (
    <div
      className="ch-cell-static"
      style={{
        padding: 22,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        background:
          "linear-gradient(160deg, rgba(255,106,61,0.05), var(--surface) 68%)",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 800,
          fontSize: 44,
          lineHeight: 0.95,
          letterSpacing: "-0.02em",
          color,
        }}
      >
        {n.toLocaleString("en-US")}
      </div>
      <div className="ch-cell-label">{label}</div>
    </div>
  );
}
