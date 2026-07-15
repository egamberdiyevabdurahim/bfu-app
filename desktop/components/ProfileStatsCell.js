"use client";

import { useT } from "@/components/i18n/LocaleProvider";

// Compact stat-tile row (founded / joined / accepted) — the desktop twin of the
// Mini App UserProfileModal's StatTile trio. Omitted entirely when all three
// counts are zero, so a brand-new builder never shows a row of zeros.
function StatTile({ value, label }) {
  return (
    <div
      style={{
        flex: 1, textAlign: "center", padding: "16px 8px",
        background: "var(--surface-2)", border: "1px solid var(--hair)",
        borderRadius: "var(--radius-sm)",
      }}
    >
      <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 26, color: "var(--text)" }}>
        {value}
      </div>
      <div className="ch-metric-label">{label}</div>
    </div>
  );
}

export default function ProfileStatsCell({ stats }) {
  const t = useT();
  const s = stats || {};
  const founded = s.projects_founded || 0;
  const joined = s.projects_joined || 0;
  const accepted = s.applications_accepted || 0;
  if (founded + joined + accepted === 0) return null;

  return (
    <div className="ch-cell-static" style={{ gridColumn: "span 2" }}>
      <div style={{ display: "flex", gap: 12 }}>
        <StatTile value={founded} label={t("profile.founded")} />
        <StatTile value={joined} label={t("profile.joined")} />
        <StatTile value={accepted} label={t("profile.accepted")} />
      </div>
    </div>
  );
}
