import { useEffect, useState } from "react";
import { useT } from "./i18n";
import { FontLoader } from "./components/Shared";

const BASE = import.meta.env.VITE_API_URL ?? "";

export const RegionLandingScreen = ({ regionId }) => {
  const { t, lang, setLang } = useT();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    fetch(`${BASE}/public/regions/${regionId}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(setData)
      .catch(() => setErr(true));
  }, [regionId]);

  if (err) return (
    <>
      <FontLoader />
      <div style={{ minHeight: "100dvh", background: "var(--bg)", color: "var(--text)",
                    display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "var(--text-3)" }}>Region not found.</div>
      </div>
    </>
  );

  const name = data ? (data[`name_${lang}`] || data.name_en) : "";
  const tgUrl = "https://t.me/BrightFuturesUzbekistan_bot";

  return (
    <>
      <FontLoader />
      <div style={{ minHeight: "100dvh", background: "var(--bg)", color: "var(--text)", overflow: "auto" }}>
        <div style={{ maxWidth: 760, margin: "0 auto", padding: "26px 20px 60px" }}>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
            <a href="/" style={{ color: "var(--text-2)", textDecoration: "none", fontSize: 13 }}>← BFU</a>
            <div style={{ display: "flex", gap: 4 }}>
              {["en","uz","ru"].map(l => (
                <button key={l} onClick={() => setLang(l)} style={{
                  padding: "6px 10px", fontSize: 12, fontWeight: 600,
                  background: lang === l ? "var(--accent-dim)" : "transparent",
                  color: lang === l ? "var(--accent)" : "var(--text-3)",
                  border: `1px solid ${lang === l ? "var(--accent)" : "var(--border)"}`,
                  borderRadius: 99, cursor: "pointer", textTransform: "uppercase",
                }}>{l}</button>
              ))}
            </div>
          </div>

          {!data ? (
            <div style={{ color: "var(--text-3)" }}>Loading…</div>
          ) : (
            <>
              <h1 style={{ fontFamily: "var(--font-display)", fontSize: 32, fontWeight: 800, marginBottom: 6 }}>{name}</h1>
              <div style={{ color: "var(--text-2)", marginBottom: 24, fontSize: 14 }}>
                {data.member_count} {t("region.members")} · {data.projects?.length || 0} {t("region.projects")}
              </div>

              <a href={tgUrl} target="_blank" rel="noopener noreferrer" style={{
                display: "inline-block", padding: "12px 22px", fontWeight: 700, fontSize: 14,
                background: "var(--accent)", color: "#fff", borderRadius: 10, textDecoration: "none",
                fontFamily: "var(--font-display)", marginBottom: 28,
              }}>{t("land.cta.telegram")}</a>

              <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18, marginBottom: 12 }}>
                {t("region.recentProjects")}
              </h2>
              {data.projects?.length ? data.projects.map(p => (
                <div key={p.id} style={{
                  background: "var(--surface)", border: "1px solid var(--border)",
                  borderRadius: 12, padding: 14, marginBottom: 10,
                }}>
                  <div style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 600, letterSpacing: "0.05em", marginBottom: 4 }}>
                    {p.type.toUpperCase()}
                  </div>
                  <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15, marginBottom: 2 }}>{p.name}</div>
                  {p.goal && <div style={{ color: "var(--text-2)", fontSize: 13, lineHeight: 1.55 }}>{p.goal}</div>}
                </div>
              )) : (
                <div style={{ color: "var(--text-3)", fontSize: 13 }}>{t("region.empty")}</div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
};
