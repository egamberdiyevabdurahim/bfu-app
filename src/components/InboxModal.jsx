import { useState, useEffect } from "react";
import { Icon } from "./Icons";
import { AvatarEl } from "./Shared";
import { users } from "../api";
import { useT } from "../i18n";
import { UserProfileModal } from "./UserProfileModal";
import { RateSheet } from "./RateSheet";

// Localized one-liner per notification type, rendered from structured fields.
function notifText(t, n) {
  const name = n.actor?.display_name || t("inbox.someone");
  const proj = n.project?.name || "";
  switch (n.type) {
    case "mutual":      return t("inbox.mutual", { name });
    case "interest":    return t("inbox.interest", { name });
    case "intro":       return t("inbox.intro", { name });
    case "application": return t("inbox.application", { name, project: proj });
    case "accepted":    return t("inbox.accepted", { project: proj });
    case "declined":    return t("inbox.declined", { project: proj });
    case "rate_prompt": return proj ? `${t("rate.prompt")} — ${proj}` : t("rate.prompt");
    case "new_follower":      return t("inbox.new_follower", { name });
    case "project_update":    return t("inbox.project_update", { project: proj });
    case "booking_request":   return t("inbox.booking_request", { name });
    case "booking_confirmed": return t("inbox.booking_confirmed", { name });
    case "booking_declined":  return t("inbox.booking_declined", { name });
    default:            return name;
  }
}

const TYPE_EMOJI = {
  mutual: "🎉", interest: "💜", intro: "👋",
  application: "🔔", accepted: "✅", declined: "📭", rate_prompt: "⭐",
  new_follower: "➕", project_update: "📣",
  booking_request: "📅", booking_confirmed: "✅", booking_declined: "🚫",
};

export const InboxModal = ({ onClose }) => {
  const { t } = useT();
  const [tab, setTab] = useState("activity");
  const [items, setItems] = useState(null);
  const [connections, setConnections] = useState(null);
  const [viewingUserId, setViewingUserId] = useState(null);
  const [rateProjectId, setRateProjectId] = useState(null);

  useEffect(() => {
    users.notifications().then(r => setItems(r?.items || [])).catch(() => setItems([]));
    // Mark everything read as soon as the inbox is opened.
    users.markRead().catch(() => {});
  }, []);

  useEffect(() => {
    if (tab === "connections" && connections === null) {
      users.connections().then(r => setConnections(Array.isArray(r) ? r : [])).catch(() => setConnections([]));
    }
  }, [tab, connections]);

  const fmt = (iso) => { try { return new Date(iso).toLocaleDateString(); } catch { return ""; } };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 250, display: "flex", flexDirection: "column" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }} />
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0, maxWidth: 430, margin: "0 auto",
        background: "var(--surface)", borderRadius: "24px 24px 0 0", maxHeight: "88dvh",
        display: "flex", flexDirection: "column", animation: "slideUp 0.3s ease",
      }}>
        <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 0" }}>
          <div style={{ width: 40, height: 4, background: "var(--surface-3)", borderRadius: 99 }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 20px 4px" }}>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 800 }}>{t("inbox.title")}</h2>
          <button onClick={onClose} style={{ background: "var(--surface-2)", border: "none", borderRadius: 99, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--text-2)" }}>
            <Icon name="x" size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 8, padding: "8px 20px 12px" }}>
          {[["activity", "inbox.tab.activity"], ["connections", "inbox.tab.connections"]].map(([id, key]) => (
            <button key={id} onClick={() => setTab(id)} style={{
              padding: "6px 14px", borderRadius: 99, fontSize: 13, fontWeight: 600,
              background: tab === id ? "var(--accent)" : "var(--surface-2)",
              color: tab === id ? "#fff" : "var(--text-2)",
              border: tab === id ? "none" : "1px solid var(--border)", cursor: "pointer",
            }}>{t(key)}</button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "0 16px 32px" }}>
          {tab === "activity" ? (
            items === null ? (
              <div style={{ textAlign: "center", padding: 30, color: "var(--text-3)" }}>{t("common.loading")}</div>
            ) : items.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40, color: "var(--text-3)" }}>{t("inbox.empty")}</div>
            ) : items.map(n => {
              const isRatePrompt = n.type === "rate_prompt" && !!n.project?.id;
              const clickable = !!n.actor || isRatePrompt;
              const onTap = () => {
                if (isRatePrompt) { setRateProjectId(n.project.id); return; }
                if (n.actor) setViewingUserId(n.actor.id);
              };
              return (
                <div key={n.id} onClick={onTap} style={{
                  display: "flex", gap: 12, alignItems: "center", padding: "12px 8px",
                  borderBottom: "1px solid var(--border)", cursor: clickable ? "pointer" : "default",
                  opacity: n.is_read ? 0.72 : 1,
                }}>
                  {n.actor
                    ? <AvatarEl name={n.actor.display_name} size={42} photoUrl={n.actor.photo_url} />
                    : <div style={{ width: 42, height: 42, borderRadius: "50%", background: "var(--surface-2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>{TYPE_EMOJI[n.type] || "🔔"}</div>}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, color: "var(--text)", lineHeight: 1.4 }}>
                      <span style={{ marginRight: 5 }}>{TYPE_EMOJI[n.type]}</span>{notifText(t, n)}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>{fmt(n.created_at)}</div>
                  </div>
                  {!n.is_read && <div style={{ width: 8, height: 8, borderRadius: 99, background: "var(--accent)", flexShrink: 0 }} />}
                </div>
              );
            })
          ) : (
            connections === null ? (
              <div style={{ textAlign: "center", padding: 30, color: "var(--text-3)" }}>{t("common.loading")}</div>
            ) : connections.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40, color: "var(--text-3)" }}>{t("inbox.noConnections")}</div>
            ) : connections.map(u => (
              <div key={u.id} onClick={() => setViewingUserId(u.id)} style={{
                display: "flex", gap: 12, alignItems: "center", padding: "12px 8px",
                borderBottom: "1px solid var(--border)", cursor: "pointer",
              }}>
                <AvatarEl name={u.display_name} size={44} photoUrl={u.photo_url} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, fontFamily: "var(--font-display)" }}>
                    {[u.name, u.surname].filter(Boolean).join(" ") || u.display_name}
                  </div>
                  <div style={{ fontSize: 12, color: "#4ECDC4" }}>{t("inbox.matched")}</div>
                </div>
                <Icon name="arrow_right" size={16} />
              </div>
            ))
          )}
        </div>
      </div>

      {viewingUserId && (
        <UserProfileModal userId={viewingUserId} onClose={() => setViewingUserId(null)} />
      )}
      {rateProjectId && (
        <RateSheet projectId={rateProjectId} onClose={() => setRateProjectId(null)} />
      )}
      <style>{`@keyframes slideUp { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>
    </div>
  );
};
