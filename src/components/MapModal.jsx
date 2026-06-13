import { useState, useEffect } from "react";
import { Icon } from "./Icons";
import { users } from "../api";
import { useT } from "../i18n";
import { UZ_REGIONS, UZ_VIEWBOX } from "./uzGeo";

// Fragments to match a geo region (ADM1_EN) to a /public/regions row (name_en).
const FRAGMENTS = {
  "Republic of Karakalpakstan": ["karakalpak"],
  "Khorezm region": ["khorezm", "xorazm"],
  "Navoi region": ["navoi"],
  "Bukhara region": ["bukhara", "buxoro"],
  "Kashkadarya province": ["qashqa", "kashka"],
  "Surkhandarya region": ["surkhan", "surxon"],
  "Samarkand region": ["samar"],
  "Jizzakh region": ["jizz", "jizak"],
  "Syrdarya region": ["sirdar", "syrdar"],
  "Tashkent region": ["tashkent region", "toshkent region", "tashkent reg"],
  "Tashkent city": ["tashkent city", "toshkent city", "toshkent shahri"],
  "Namangan region": ["namangan"],
  "Fergana region": ["fergana", "farg"],
  "Andijan region": ["andijan", "andijon"],
};

export const MapModal = ({ onClose }) => {
  const { t, lang } = useT();
  const [live, setLive] = useState(null);
  const [sel, setSel] = useState(null);

  useEffect(() => { users.regionsPublic().then(setLive).catch(() => setLive([])); }, []);

  const rows = UZ_REGIONS.map(g => {
    let hit = null;
    if (Array.isArray(live)) {
      const frags = FRAGMENTS[g.en] || [g.en.toLowerCase()];
      for (const f of frags) {
        hit = live.find(x => (x.name_en || "").toLowerCase().includes(f));
        if (hit) break;
      }
    }
    return {
      ...g,
      members: hit?.member_count || 0,
      projects: hit?.project_count || 0,
      label: g[lang] || g.en,
    };
  });
  const maxM = Math.max(1, ...rows.map(r => r.members));

  const fill = (m, active) => {
    const ratio = m / maxM;                       // 0..1
    const a = 0.12 + ratio * 0.72;                // opacity ramp
    return active ? "rgba(78,205,196,0.95)" : `rgba(123,111,255,${a.toFixed(3)})`;
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 250, display: "flex", flexDirection: "column", background: "var(--bg)" }}>
      <div style={{ padding: "calc(var(--safe-t) + 18px) 20px 12px", display: "flex", alignItems: "center", gap: 12, borderBottom: "1px solid var(--border)" }}>
        <button onClick={onClose} style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 99, width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--text-2)" }}>
          <Icon name="x" size={16} />
        </button>
        <div>
          <p style={{ color: "var(--text-3)", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", fontFamily: "var(--font-display)" }}>{t("map.kicker")}</p>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 800 }}>{t("map.title")}</h1>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
        <div style={{ borderRadius: 20, overflow: "hidden", background: "linear-gradient(135deg,#13131A,#0c0c14)", border: "1px solid var(--border)", padding: 6 }}>
          <svg viewBox={UZ_VIEWBOX} style={{ width: "100%", height: "auto" }}>
            {rows.map(r => {
              const active = sel?.en === r.en;
              return (
                <path key={r.en} d={r.path} onClick={() => setSel(r)}
                  fill={fill(r.members, active)}
                  stroke={active ? "#4ECDC4" : "rgba(167,139,250,0.55)"}
                  strokeWidth={active ? 2 : 0.8}
                  style={{ cursor: "pointer", transition: "fill 0.2s" }} />
              );
            })}
          </svg>
        </div>

        {sel ? (
          <div style={{ marginTop: 14, background: "var(--surface)", border: "1px solid var(--accent)", borderRadius: 14, padding: 16 }}>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 18 }}>{sel.label}</div>
            <div style={{ display: "flex", gap: 18, marginTop: 8 }}>
              <div><div style={{ fontSize: 22, fontWeight: 800, color: "var(--accent)", fontFamily: "var(--font-display)" }}>{sel.members}</div><div style={{ fontSize: 11, color: "var(--text-3)" }}>{t("map.members")}</div></div>
              <div><div style={{ fontSize: 22, fontWeight: 800, color: "#4ECDC4", fontFamily: "var(--font-display)" }}>{sel.projects}</div><div style={{ fontSize: 11, color: "var(--text-3)" }}>{t("map.projects")}</div></div>
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 14, textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>{t("map.tapHint")}</div>
        )}
      </div>
    </div>
  );
};
