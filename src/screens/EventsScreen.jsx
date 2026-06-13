import { useState, useEffect } from "react";
import { Page, SkeletonList } from "../components/Shared";
import { Icon } from "../components/Icons";
import { events } from "../api";
import { PartnersModal } from "../components/PartnersModal";
import { useT } from "../i18n";

const TYPES = ["foryou", "all", "hackathon", "grant", "scholarship", "meetup", "other"];

export const EventsScreen = ({ onBack, embedded = false, deepLinkEventId = null }) => {
  const { t } = useT();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState("foryou");
  const [partnersOpen, setPartnersOpen] = useState(false);

  useEffect(() => { load(); /* eslint-disable-line */ }, [type]);

  const load = async () => {
    setLoading(true);
    try {
      let res;
      if (type === "foryou") res = await events.forMe();      // Opportunity Radar
      else res = await events.list(type === "all" ? {} : { type });
      setList(Array.isArray(res) ? res : []);
    } catch (e) { setList([]); }
    setLoading(false);
  };

  const fmt = (iso) => {
    if (!iso) return "—";
    try { return new Date(iso).toLocaleDateString(); } catch { return iso; }
  };

  return (
    <div style={{ height: "var(--app-h, 100dvh)", display: "flex", flexDirection: "column", background: "var(--bg)", overflow: "hidden" }}>
      <div style={{ padding: embedded ? "calc(var(--safe-t) + 14px) 24px 12px" : "calc(var(--safe-t) + 18px) 24px 12px", flexShrink: 0, borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {!embedded && (
            <button onClick={onBack} style={{
              background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 99,
              width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", color: "var(--text-2)",
            }}><Icon name="arrow_left" size={16} /></button>
          )}
          <div style={{ flex: 1 }}>
            <p style={{ color: "var(--text-3)", fontSize: 11, fontFamily: "var(--font-display)", fontWeight: 700, letterSpacing: "0.1em" }}>{t("events.kicker")}</p>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 800 }}>{t("events.title")}</h1>
          </div>
          <button onClick={() => setPartnersOpen(true)} style={{
            background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 99,
            padding: "8px 14px", display: "flex", alignItems: "center", gap: 6,
            cursor: "pointer", color: "var(--text)", fontSize: 13, fontWeight: 600, flexShrink: 0,
          }}><Icon name="briefcase" size={15} /> {t("partners.title")}</button>
        </div>
      </div>

      <div style={{ padding: "12px 20px", flexShrink: 0, display: "flex", gap: 8, overflowX: "auto", scrollbarWidth: "none", borderBottom: "1px solid var(--border)" }}>
        {TYPES.map(ty => (
          <button key={ty} onClick={() => setType(ty)} style={{
            flexShrink: 0, padding: "6px 14px", borderRadius: 99, fontSize: 12, fontWeight: 600,
            background: type === ty ? "var(--accent)" : "var(--surface-2)",
            color: type === ty ? "#fff" : "var(--text-2)",
            border: type === ty ? "none" : "1px solid var(--border)", cursor: "pointer",
          }}>{ty === "all" ? t("events.filterAll") : ty === "foryou" ? t("events.foryou") : t(`events.type.${ty}`)}</button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: `16px 20px calc(${embedded ? 100 : 40}px + var(--safe-b))` }}>
        {loading ? <SkeletonList count={4} /> :
         list.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "var(--text-3)" }}>{t("events.empty")}</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {list.map((ev, i) => (
              <div key={ev.id} className="card" style={{
                animation: `fadeUp ${0.1 + i * 0.05}s ease`,
                border: deepLinkEventId === ev.id ? "2px solid var(--accent)" : "1px solid var(--border)",
                boxShadow: deepLinkEventId === ev.id ? "0 0 20px rgba(123,111,255,0.3)" : undefined,
              }}>
                {ev.cover_url && (
                  <img src={ev.cover_url} alt="" style={{ width: "100%", height: 140, objectFit: "cover", borderRadius: "var(--radius-sm)", marginBottom: 10 }} />
                )}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ background: "var(--accent-dim)", color: "var(--accent)", borderRadius: 6, padding: "3px 8px", fontSize: 11, fontWeight: 700 }}>
                    {t(`events.type.${ev.type}`) || ev.type}
                  </span>
                  {ev.deadline && (
                    <span style={{ fontSize: 11, color: "#FFB347", fontWeight: 600 }}>
                      {t("events.deadline", { d: fmt(ev.deadline) })}
                    </span>
                  )}
                </div>
                <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{ev.title}</h3>
                {ev.matched?.length > 0 && (
                  <div style={{ fontSize: 11, color: "#4ECDC4", fontWeight: 600, marginBottom: 6 }}>
                    ✨ {t("events.matches", { tags: ev.matched.join(", ") })}
                  </div>
                )}
                {ev.description && (
                  <p style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.6, marginBottom: 8 }}>{ev.description}</p>
                )}
                {ev.link && (
                  <a href={ev.link} target="_blank" rel="noopener noreferrer" style={{
                    display: "inline-block", color: "var(--accent)", fontSize: 13, fontWeight: 600, textDecoration: "none",
                  }}>{t("events.open")}</a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      {partnersOpen && <PartnersModal onClose={() => setPartnersOpen(false)} />}
    </div>
  );
};
