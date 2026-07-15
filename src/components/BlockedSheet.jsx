import { useState, useEffect } from "react";
import { messages as msgApi } from "../api";
import { AvatarEl } from "./Shared";
import { Icon } from "./Icons";
import { useT } from "../i18n";

// ── Blocked users list (view + unblock) ───────────────────────────────────────
// Full-screen overlay (Chorsu). GET /messages/blocked → people I've blocked;
// unblock reuses DELETE /users/{id}/block with an optimistic drop.

export const BlockedSheet = ({ onClose }) => {
  const { t } = useT();
  const [list, setList] = useState(null);
  const [error, setError] = useState(false);

  const load = () => {
    setError(false);
    msgApi.blocked().then((r) => setList(Array.isArray(r) ? r : [])).catch(() => setError(true));
  };
  useEffect(load, []);

  const unblock = async (id) => {
    setList((l) => (l || []).filter((u) => u.id !== id)); // optimistic
    try { await msgApi.unblock(id); } catch { load(); }
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
          {t("blocked.title")}
        </div>
      </div>

      <div style={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "16px 16px 40px" }}>
        {list === null && !error ? (
          <div style={{ textAlign: "center", padding: 50, color: "var(--text-3)" }}>
            <Icon name="loader" size={22} color="var(--amber)" />
          </div>
        ) : error ? (
          <div style={{ textAlign: "center", padding: 40, color: "var(--terra)", fontSize: 14 }}>{t("common.loadError")}</div>
        ) : list.length === 0 ? (
          <div style={{ textAlign: "center", padding: "52px 28px", color: "var(--muted-strong)", fontSize: 14 }}>
            {t("blocked.empty")}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {list.map((u) => (
              <div key={u.id} style={{
                display: "flex", alignItems: "center", gap: 12, padding: "10px 12px",
                background: "var(--surface-2)", border: "1px solid var(--hair)", borderRadius: "var(--radius-sm)",
              }}>
                <AvatarEl name={u.display_name} size={40} photoUrl={u.photo_url} />
                <div style={{ flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 600, color: "var(--text)",
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{u.display_name}</div>
                <button onClick={() => unblock(u.id)} style={{
                  flex: "0 0 auto", padding: "8px 14px", borderRadius: 99, border: "1px solid var(--hair)",
                  background: "var(--surface)", color: "var(--amber)", fontSize: 13, fontWeight: 600, cursor: "pointer",
                  fontFamily: "var(--font-body)",
                }}>{t("msg.unblock")}</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
