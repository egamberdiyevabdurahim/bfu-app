"use client";

import { useT } from "@/components/i18n/LocaleProvider";

// Stable achievement ids → presentation only (icon/color). Labels are resolved
// at render via t(`profile.achv_${key}`) so they translate; unknown keys fall
// back to the raw backend key.
const ACHIEVEMENT_META = {
  first_project: { icon: "◆", color: "amber" },
  first_application: { icon: "✓", color: "green" },
  five_invites: { icon: "✶", color: "ember" },
  verified: { icon: "✓", color: "green" },
  first_endorsement: { icon: "◆", color: "amber" },
  mentor: { icon: "✶", color: "ember" },
  first_vouch_received: { icon: "✓", color: "green" },
};

const COLOR_STYLES = {
  amber: { bg: "rgba(232,161,92,0.12)", border: "rgba(232,161,92,0.35)", text: "var(--amber)" },
  green: { bg: "rgba(127,176,105,0.12)", border: "rgba(127,176,105,0.35)", text: "var(--green)" },
  ember: { bg: "rgba(255,106,61,0.10)", border: "rgba(255,106,61,0.3)", text: "var(--ember)" },
};

export default function AchievementsCell({ achievements = [] }) {
  const t = useT();
  const list = Array.isArray(achievements) ? achievements : [];

  return (
    <div className="ch-cell-static" style={{ gridColumn: "span 2" }}>
      <div className="ch-cell-label">{t("profile.achievements")}</div>
      {list.length === 0 ? (
        <p style={{ margin: "18px 0 0", fontSize: 14, lineHeight: 1.5, color: "var(--muted-strong)" }}>
          {t("profile.no_badges")}
        </p>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 18 }}>
          {list.map((a) => {
            const known = ACHIEVEMENT_META[a.key];
            const meta = known || { icon: "◆", color: "amber" };
            const label = known ? t(`profile.achv_${a.key}`) : a.key;
            if (!a.earned) {
              return (
                <div key={a.key} title={t("profile.not_earned")} style={{ display: "inline-flex", alignItems: "center",
                  gap: 8, padding: "9px 14px", borderRadius: "var(--radius-pill)", background: "var(--surface-2)",
                  border: "1px dashed var(--hair)", color: "var(--muted-strong)", fontSize: 13, fontWeight: 500,
                  opacity: 0.75 }}>
                  <span aria-hidden style={{ fontFamily: "var(--font-mono)" }}>◇</span> {label}
                </div>
              );
            }
            const style = COLOR_STYLES[meta.color];
            return (
              <div key={a.key} style={{ display: "inline-flex", alignItems: "center", gap: 8,
                padding: "9px 14px", borderRadius: "var(--radius-pill)", background: style.bg,
                border: `1px solid ${style.border}`, color: style.text, fontSize: 13, fontWeight: 600 }}>
                <span aria-hidden>{meta.icon}</span> {label}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
