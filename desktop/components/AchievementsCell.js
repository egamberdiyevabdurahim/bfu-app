const ACHIEVEMENT_META = {
  first_project: { label: "First project", icon: "◆", color: "amber" },
  first_application: { label: "First application", icon: "✓", color: "green" },
  five_invites: { label: "5 invites", icon: "✶", color: "ember" },
  verified: { label: "Verified", icon: "✓", color: "green" },
  first_endorsement: { label: "First endorsement", icon: "◆", color: "amber" },
  mentor: { label: "Mentor", icon: "✶", color: "ember" },
  first_vouch_received: { label: "First vouch", icon: "✓", color: "green" },
};

const COLOR_STYLES = {
  amber: { bg: "rgba(232,161,92,0.12)", border: "rgba(232,161,92,0.35)", text: "var(--amber)" },
  green: { bg: "rgba(127,176,105,0.12)", border: "rgba(127,176,105,0.35)", text: "var(--green)" },
  ember: { bg: "rgba(255,106,61,0.10)", border: "rgba(255,106,61,0.3)", text: "var(--ember)" },
};

export default function AchievementsCell({ achievements = [] }) {
  const list = Array.isArray(achievements) ? achievements : [];

  return (
    <div className="ch-cell-static" style={{ gridColumn: "span 2" }}>
      <div className="ch-cell-label">Achievements</div>
      {list.length === 0 ? (
        <p style={{ margin: "18px 0 0", fontSize: 14, lineHeight: 1.5, color: "var(--muted-strong)" }}>
          No badges earned yet.
        </p>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 18 }}>
          {list.map((a) => {
            const meta = ACHIEVEMENT_META[a.key] || { label: a.key, icon: "◆", color: "amber" };
            if (!a.earned) {
              return (
                <div key={a.key} title="Not earned yet" style={{ display: "inline-flex", alignItems: "center",
                  gap: 8, padding: "9px 14px", borderRadius: "var(--radius-pill)", background: "var(--surface-2)",
                  border: "1px dashed var(--hair)", color: "var(--muted-strong)", fontSize: 13, fontWeight: 500,
                  opacity: 0.75 }}>
                  <span aria-hidden style={{ fontFamily: "var(--font-mono)" }}>◇</span> {meta.label}
                </div>
              );
            }
            const style = COLOR_STYLES[meta.color];
            return (
              <div key={a.key} style={{ display: "inline-flex", alignItems: "center", gap: 8,
                padding: "9px 14px", borderRadius: "var(--radius-pill)", background: style.bg,
                border: `1px solid ${style.border}`, color: style.text, fontSize: 13, fontWeight: 600 }}>
                <span aria-hidden>{meta.icon}</span> {meta.label}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
