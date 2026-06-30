import { useState, useEffect } from "react";
import { users } from "../api";
import { useT } from "../i18n";

const EMOJI = {
  first_project: "🚀", first_application: "📨", five_invites: "🤝",
  verified: "✅", first_endorsement: "👍", mentor: "🎓", first_vouch_received: "🛡️",
};

export const AchievementsSection = () => {
  const { t } = useT();
  const [items, setItems] = useState(null);

  useEffect(() => {
    users.achievements().then(r => setItems(r.achievements || [])).catch(() => setItems([]));
  }, []);

  if (items === null) {
    return <div style={{ padding: 16, color: "var(--text-3)", fontSize: 13 }}>{t("common.loading")}</div>;
  }
  if (items.length === 0) return null;

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 16, marginBottom: 10 }}>
        🏆 {t("ach.title")}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {items.map(a => {
          const pct = a.progress ? Math.round((a.progress.current / a.progress.target) * 100) : (a.earned ? 100 : 0);
          return (
            <div key={a.key} style={{
              padding: "12px", borderRadius: "var(--radius-sm)",
              background: a.earned ? "var(--accent-dim)" : "var(--surface-2)",
              border: `1px solid ${a.earned ? "var(--accent)" : "var(--border)"}`,
              opacity: a.earned ? 1 : 0.6 }}>
              <div style={{ fontSize: 22, marginBottom: 4 }}>{EMOJI[a.key] || "🏅"}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{t(`ach.${a.key}.name`)}</div>
              <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>{t(`ach.${a.key}.desc`)}</div>
              {a.progress && !a.earned && (
                <>
                  <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 6 }}>
                    {a.progress.current} / {a.progress.target}
                  </div>
                  <div style={{ height: 4, background: "var(--surface-3)", borderRadius: 99, marginTop: 4, overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: "var(--accent)" }} />
                  </div>
                </>
              )}
              {!a.earned && !a.progress && (
                <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  {t("ach.locked")}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
