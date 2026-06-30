import { useState, useEffect } from "react";
import { projects } from "../api";
import { useT } from "../i18n";
import { tgAlert } from "../tg";

const Stars = ({ value, onChange }) => (
  <div style={{ display: "flex", gap: 4 }}>
    {[1, 2, 3, 4, 5].map(n => (
      <button key={n} onClick={() => onChange(n)} style={{
        background: "none", border: "none", cursor: "pointer", padding: 0,
        fontSize: 22, color: n <= value ? "#FFB347" : "var(--surface-3)",
      }}>★</button>
    ))}
  </div>
);

export const RateSheet = ({ projectId, onClose }) => {
  const { t } = useT();
  const [cohort, setCohort] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState({}); // userId -> { stars, note }

  useEffect(() => {
    projects.rateable(projectId)
      .then(r => setCohort(r.cohort || []))
      .catch(e => tgAlert(e.message))
      .finally(() => setLoading(false));
  }, [projectId]);

  const setStars = (uid, stars) => setDraft(d => ({ ...d, [uid]: { ...d[uid], stars } }));
  const setNote = (uid, note) => setDraft(d => ({ ...d, [uid]: { ...d[uid], note } }));

  const submit = async (uid) => {
    const d = draft[uid];
    if (!d?.stars) return;
    try {
      await projects.rateMember(projectId, uid, d.stars, d.note || null);
      setCohort(c => c.map(p => p.id === uid ? { ...p, rated_by_me: true } : p));
      tgAlert(t("rate.done"));
    } catch (e) { tgAlert(e.message); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 320, display: "flex", flexDirection: "column" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }} />
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, maxWidth: 430, margin: "0 auto",
        background: "var(--surface)", borderRadius: "24px 24px 0 0", maxHeight: "88dvh",
        display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--border)" }}>
          <h2 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 800 }}>{t("rate.title")}</h2>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px 40px" }}>
          {loading ? (
            <div style={{ color: "var(--text-3)", fontSize: 13, textAlign: "center", padding: 20 }}>{t("common.loading")}</div>
          ) : cohort.length === 0 ? (
            <div style={{ color: "var(--text-3)", fontSize: 13, textAlign: "center", padding: 20 }}>—</div>
          ) : cohort.map(p => (
            <div key={p.id} style={{ background: "var(--surface-2)", border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)", padding: "12px 14px", marginBottom: 10, opacity: p.rated_by_me ? 0.6 : 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontWeight: 600, color: "var(--text)" }}>{p.display_name}</span>
                <Stars value={draft[p.id]?.stars || 0} onChange={s => setStars(p.id, s)} />
              </div>
              {!p.rated_by_me && (
                <>
                  <input value={draft[p.id]?.note || ""} onChange={e => setNote(p.id, e.target.value)}
                    placeholder={t("rate.note")} maxLength={200} style={{ width: "100%", boxSizing: "border-box",
                      background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
                      color: "var(--text)", padding: "8px 10px", fontSize: 13, marginBottom: 8 }} />
                  <button onClick={() => submit(p.id)} disabled={!draft[p.id]?.stars} style={{
                    background: "var(--accent)", border: "none", borderRadius: "var(--radius-sm)", color: "#fff",
                    padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>{t("rate.submit")}</button>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
