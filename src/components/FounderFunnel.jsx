import { useState, useEffect } from "react";
import { projects } from "../api";
import { useT } from "../i18n";

const pct = (num, den) => (den > 0 ? Math.round((num / den) * 100) : 0);

// A single labeled funnel bar. width = value / max (max = views, the widest stage).
const FunnelBar = ({ label, value, max, color, sub }) => (
  <div style={{ marginBottom: 10 }}>
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12,
      color: "var(--text-2)", marginBottom: 4, fontWeight: 600 }}>
      <span>{label}</span>
      <span>{value}{sub != null && <span style={{ color: "var(--text-3)", marginLeft: 6 }}>{sub}</span>}</span>
    </div>
    <div style={{ height: 10, background: "var(--surface-3)", borderRadius: 99, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${max > 0 ? Math.round((value / max) * 100) : 0}%`,
        minWidth: value > 0 ? 4 : 0, background: color, borderRadius: 99 }} />
    </div>
  </div>
);

export const FounderFunnel = () => {
  const { t } = useT();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);

  useEffect(() => {
    projects.funnel()
      .then(setData)
      .catch(() => setErr(true))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ color: "var(--text-3)", fontSize: 13, padding: 16 }}>{t("common.loading")}</div>;
  if (err || !data) return <div style={{ color: "var(--text-3)", fontSize: 13, padding: 16 }}>{t("an.loadError")}</div>;

  const tot = data.totals;
  if (!tot.project_count) {
    return <div style={{ color: "var(--text-3)", fontSize: 13, padding: 16, textAlign: "center" }}>{t("funnel.empty")}</div>;
  }
  const maxV = Math.max(tot.views, tot.applications, tot.accepted, 1);

  return (
    <div>
      <div style={{ fontWeight: 800, fontSize: 16, fontFamily: "var(--font-display)" }}>{t("funnel.title")}</div>
      <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 14 }}>{t("funnel.sub")}</div>

      <FunnelBar label={t("funnel.views")} value={tot.views} max={maxV} color="#7B6FFF" />
      <FunnelBar label={t("funnel.applications")} value={tot.applications} max={maxV} color="#4ECDC4"
        sub={`${pct(tot.applications, tot.views)}%`} />
      <FunnelBar label={t("funnel.accepted")} value={tot.accepted} max={maxV} color="#FFB347"
        sub={`${pct(tot.accepted, tot.applications)}%`} />

      <div className="section-label" style={{ marginTop: 18 }}>{t("funnel.perProject")}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {data.projects.map(p => {
          const tag = p.is_draft ? t("funnel.draft") : (!p.is_active ? t("funnel.closed") : null);
          return (
            <div key={p.id} style={{ background: "var(--surface-2)", border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)", padding: "10px 12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontWeight: 600, color: "var(--text)", fontSize: 14 }}>{p.name}</span>
                {tag && <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)",
                  background: "var(--surface-3)", borderRadius: 6, padding: "2px 6px" }}>{tag}</span>}
              </div>
              <div style={{ display: "flex", gap: 14, fontSize: 12, color: "var(--text-2)" }}>
                <span>{t("funnel.views")}: <b style={{ color: "var(--text)" }}>{p.views}</b></span>
                <span>{t("funnel.applications")}: <b style={{ color: "var(--text)" }}>{p.applications}</b></span>
                <span>{t("funnel.accepted")}: <b style={{ color: "#FFB347" }}>{p.accepted}</b></span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
