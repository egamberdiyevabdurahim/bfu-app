import { useState, useEffect } from "react";
import { Icon } from "./Icons";
import { users } from "../api";
import { useT } from "../i18n";

// Stylized region coordinates (880×460 viewBox) — shared with the landing map.
const REGION_LAYOUT = [
  { name: "Karakalpakstan", x: 165, y: 165, m: ["karakalpak"] },
  { name: "Khorezm", x: 235, y: 215, m: ["khorezm", "xorazm"] },
  { name: "Navoiy", x: 360, y: 240, m: ["navoiy", "navoi"] },
  { name: "Bukhara", x: 380, y: 290, m: ["bukhara", "buxoro"] },
  { name: "Qashqadaryo", x: 470, y: 320, m: ["qashqa", "kashka"] },
  { name: "Surxondaryo", x: 530, y: 360, m: ["surxon", "surkhan"] },
  { name: "Samarqand", x: 510, y: 270, m: ["samar"] },
  { name: "Jizzax", x: 565, y: 240, m: ["jizz", "jizak"] },
  { name: "Sirdaryo", x: 605, y: 235, m: ["sirdar", "syrdar"] },
  { name: "Tashkent region", x: 660, y: 215, m: ["tashkent region", "toshkent region"] },
  { name: "Tashkent city", x: 690, y: 200, m: ["tashkent city", "toshkent city", "toshkent shahri"], cap: true },
  { name: "Namangan", x: 740, y: 215, m: ["namangan"] },
  { name: "Fergana", x: 770, y: 245, m: ["fergana", "farg"] },
  { name: "Andijon", x: 805, y: 230, m: ["andijon", "andijan"] },
];

const UZ_PATH = `M 95 155 C 130 110, 200 95, 260 130 C 310 155, 360 145, 410 170 C 460 195, 510 175, 570 195 C 620 210, 660 195, 690 180 C 715 167, 740 175, 780 195 C 815 215, 840 235, 825 265 C 815 285, 790 290, 760 280 C 730 270, 705 285, 685 270 C 660 250, 625 255, 590 245 C 555 235, 520 280, 490 305 C 460 330, 425 340, 405 320 C 385 300, 365 305, 350 295 C 330 280, 300 285, 275 270 C 250 255, 215 265, 190 250 C 160 235, 135 230, 115 215 C 95 200, 85 180, 95 155 Z`;

export const MapModal = ({ onClose }) => {
  const { t, lang } = useT();
  const [live, setLive] = useState(null);
  const [sel, setSel] = useState(null);

  useEffect(() => {
    users.regionsPublic().then(setLive).catch(() => setLive([]));
  }, []);

  const regions = REGION_LAYOUT.map(r => {
    let hit = null;
    if (Array.isArray(live)) {
      for (const frag of r.m) {
        hit = live.find(x => (x.name_en || "").toLowerCase().includes(frag));
        if (hit) break;
      }
    }
    return { ...r, members: hit?.member_count || 0, projects: hit?.project_count || 0,
             label: hit ? (hit[`name_${lang}`] || hit.name_en) : r.name };
  });
  const maxM = Math.max(1, ...regions.map(r => r.members));

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
        <div style={{ position: "relative", borderRadius: 20, overflow: "hidden", background: "linear-gradient(135deg,#13131A,#0c0c14)", border: "1px solid var(--border)" }}>
          <svg viewBox="0 0 880 460" style={{ width: "100%", height: "auto" }}>
            <defs>
              <radialGradient id="pinG" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#A78BFA" stopOpacity="0.55" />
                <stop offset="100%" stopColor="#A78BFA" stopOpacity="0" />
              </radialGradient>
            </defs>
            <path d={UZ_PATH} fill="#1C1C28" stroke="#7B6FFF" strokeOpacity="0.4" strokeWidth="1.5" />
            {regions.map(r => {
              const rad = 5 + (r.members / maxM) * 14;
              const active = sel?.name === r.name;
              return (
                <g key={r.name} transform={`translate(${r.x},${r.y})`} onClick={() => setSel(r)} style={{ cursor: "pointer" }}>
                  <circle r={rad + 8} fill="url(#pinG)" opacity={active ? 1 : 0.5} />
                  <circle r={rad} fill={r.cap ? "#4ECDC4" : "#7B6FFF"} stroke="#fff" strokeOpacity="0.85" strokeWidth="1" />
                </g>
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
