import { useState, useEffect } from "react";
import { projects as projectsApi } from "../api";
import { Icon } from "./Icons";
import { useT } from "../i18n";

// ── Saved / Favorited projects ────────────────────────────────────────────────
// Full-screen overlay. GET /projects/favorites → project cards; tapping a card
// opens the project (via the global `bfu:open-project` event → App's ProjectDetail);
// the heart un-saves (DELETE /projects/{id}/favorite) with an optimistic drop.

export const SavedSheet = ({ onClose }) => {
  const { t } = useT();
  const [list, setList] = useState(null); // null = loading
  const [error, setError] = useState(false);

  const load = () => {
    setError(false);
    projectsApi.favorites()
      .then((r) => setList(Array.isArray(r) ? r : []))
      .catch(() => setError(true));
  };
  useEffect(load, []);

  const unsave = async (id) => {
    setList((l) => (l || []).filter((p) => p.id !== id)); // optimistic
    try { await projectsApi.unfavorite(id); } catch { load(); }
  };

  const open = (id) => {
    window.dispatchEvent(new CustomEvent("bfu:open-project", { detail: { projectId: id } }));
    onClose(); // else ProjectDetail opens hidden behind this opaque full-screen sheet
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 260, background: "var(--bg)",
      maxWidth: 430, margin: "0 auto", display: "flex", flexDirection: "column",
      "--muted": "#A8A093", "--muted-strong": "#C6BEAF",
    }}>
      <div style={{
        flex: "0 0 auto", display: "flex", alignItems: "center", gap: 12,
        padding: "calc(var(--safe-t) + 14px) 16px 14px", borderBottom: "1px solid var(--hair)",
      }}>
        <button onClick={onClose} aria-label={t("common.close")} style={{
          width: 38, height: 38, borderRadius: 11, border: "1px solid var(--hair)",
          background: "var(--surface-2)", color: "var(--muted-strong)", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}><Icon name="x" size={18} /></button>
        <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 19, color: "var(--text)" }}>
          {t("saved.title")}
        </div>
      </div>

      <div style={{ flex: "1 1 auto", overflowY: "auto", padding: "16px 16px 40px" }}>
        {list === null && !error ? (
          <div style={{ textAlign: "center", padding: 50, color: "var(--text-3)" }}>
            <Icon name="loader" size={22} color="var(--amber)" />
          </div>
        ) : error ? (
          <div style={{ textAlign: "center", padding: 40, color: "var(--terra)", fontSize: 14 }}>
            {t("common.loadError")}{" "}
            <button onClick={load} style={{ background: "none", border: "none", color: "var(--amber)", cursor: "pointer", textDecoration: "underline" }}>{t("common.retry")}</button>
          </div>
        ) : list.length === 0 ? (
          <div style={{ textAlign: "center", padding: "52px 28px" }}>
            <div style={{ fontSize: 40 }} aria-hidden>❥</div>
            <p style={{ margin: "12px 0 0", color: "var(--muted-strong)", fontSize: 14, lineHeight: 1.55 }}>
              {t("saved.empty")}
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {list.map((p) => {
              const isStartup = p.type === "startup";
              return (
                <div key={p.id} className="ch-cell-static" style={{ padding: 14 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <button onClick={() => open(p.id)} style={{
                      flex: 1, minWidth: 0, textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: 0,
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <span style={{
                          fontFamily: "var(--font-mono)", fontSize: 9.5, fontWeight: 700, letterSpacing: "0.08em",
                          textTransform: "uppercase", padding: "3px 9px", borderRadius: 99,
                          background: isStartup ? "rgba(232,161,92,0.14)" : "rgba(127,176,105,0.14)",
                          color: isStartup ? "var(--amber)" : "var(--green)",
                        }}>{isStartup ? t("discover.badge.startup") : t("discover.badge.volunteer")}</span>
                      </div>
                      <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16, color: "var(--text)" }}>{p.name}</div>
                      {(p.goal || p.one_liner || p.description) && (
                        <div style={{ marginTop: 4, fontSize: 13, color: "var(--muted-strong)", lineHeight: 1.45,
                          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                          {p.goal || p.one_liner || p.description}
                        </div>
                      )}
                    </button>
                    <button onClick={() => unsave(p.id)} aria-label={t("saved.remove")} title={t("saved.remove")} style={{
                      flex: "0 0 auto", width: 34, height: 34, borderRadius: 10, border: "1px solid var(--hair)",
                      background: "var(--surface-2)", color: "var(--terra)", cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15,
                    }}>❤</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
