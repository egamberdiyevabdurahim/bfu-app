import { useState, useEffect } from "react";
import { Icon } from "./Icons";
import { AvatarEl } from "./Shared";
import { users } from "../api";
import { useT } from "../i18n";
import { UserProfileModal } from "./UserProfileModal";
import { RateSheet } from "./RateSheet";
import { relTime } from "../timefmt";
import { FLAGS } from "../flags";

// Some notification types point at surfaces that are hidden for V1: a stale row
// would take the user to a screen that no longer exists, so we drop those types
// from the list entirely. Each group is tied to the flag that OWNS it, so
// flipping one flag back restores exactly its own rows and nothing else.
// The label/icon entries below stay in place — nothing here is deleted.
const BOOKING_TYPES = ["booking_request", "booking_confirmed", "booking_declined"]; // FLAGS.MENTORING
const RATING_TYPES = ["rate_prompt", "session_rate_prompt"];                        // FLAGS.TRUST

const HIDDEN_TYPES = [
  ...(FLAGS.MENTORING ? [] : BOOKING_TYPES),
  ...(FLAGS.TRUST ? [] : RATING_TYPES),
];
const isVisibleNotif = (n) => !HIDDEN_TYPES.includes(n.type);

// Connections + Following are the same surface the desktop removed for V1 (nav
// row filtered out, route notFound()s). With FLAGS.CONNECTIONS off only
// "activity" remains — and a tab bar with a single tab is noise, so it's hidden.
const TABS = [
  ["activity", "inbox.tab.activity"],
  ...(FLAGS.CONNECTIONS
    ? [["connections", "inbox.tab.connections"], ["following", "inbox.tab.following"]]
    : []),
];

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
    case "event_rsvp":        return t("inbox.event_rsvp", { name });
    default:            return name;
  }
}

const TYPE_EMOJI = {
  mutual: "🎉", interest: "💜", intro: "👋",
  application: "🔔", accepted: "✅", declined: "📭", rate_prompt: "⭐",
  new_follower: "➕", project_update: "📣",
  booking_request: "📅", booking_confirmed: "✅", booking_declined: "🚫",
  event_rsvp: "🎟️",
};

export const InboxModal = ({ onClose }) => {
  const { t } = useT();
  const [tab, setTab] = useState("activity");
  const [items, setItems] = useState(null);
  const [connections, setConnections] = useState(null);
  const [following, setFollowing] = useState(null);
  const [viewingUserId, setViewingUserId] = useState(null);
  const [rateProjectId, setRateProjectId] = useState(null);

  useEffect(() => {
    users.notifications().then(r => setItems(r?.items || [])).catch(() => setItems([]));
    // Mark everything read as soon as the inbox is opened.
    users.markRead().catch(() => {});
  }, []);

  useEffect(() => {
    // With FLAGS.CONNECTIONS off neither tab can be reached, so neither list is
    // ever fetched — the endpoints stay live, we just don't call them.
    if (!FLAGS.CONNECTIONS) return;
    if (tab === "connections" && connections === null) {
      users.connections().then(r => setConnections(Array.isArray(r) ? r : [])).catch(() => setConnections([]));
    }
    if (tab === "following" && following === null) {
      users.following()
        .then(r => setFollowing({ users: r?.users || [], projects: r?.projects || [] }))
        .catch(() => setFollowing({ users: [], projects: [] }));
    }
  }, [tab, connections, following]);

  const fmt = (iso) => relTime(iso); // Tashkent-aware, UTC-safe relative time
  const visibleItems = items === null ? null : items.filter(isVisibleNotif);

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

        {/* Tabs — only worth a bar when there's more than one to switch between. */}
        {TABS.length > 1 && (
          <div style={{ display: "flex", gap: 8, padding: "8px 20px 12px" }}>
            {TABS.map(([id, key]) => (
              <button key={id} onClick={() => setTab(id)} style={{
                padding: "6px 14px", borderRadius: 99, fontSize: 13, fontWeight: 600,
                background: tab === id ? "var(--accent)" : "var(--surface-2)",
                color: tab === id ? "#fff" : "var(--text-2)",
                border: tab === id ? "none" : "1px solid var(--border)", cursor: "pointer",
              }}>{t(key)}</button>
            ))}
          </div>
        )}

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: TABS.length > 1 ? "0 16px 32px" : "8px 16px 32px" }}>
          {/* Activity is the fallback branch: with FLAGS.CONNECTIONS off, no tab
              value can route away from it. */}
          {!(FLAGS.CONNECTIONS && (tab === "connections" || tab === "following")) ? (
            visibleItems === null ? (
              <div style={{ textAlign: "center", padding: 30, color: "var(--text-3)" }}>{t("common.loading")}</div>
            ) : visibleItems.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40, color: "var(--text-3)" }}>{t("inbox.empty")}</div>
            ) : visibleItems.map(n => {
              // Rating rows are filtered out entirely while FLAGS.TRUST is off;
              // the flag is re-checked here so no row can ever open the RateSheet.
              const isRatePrompt = FLAGS.TRUST && RATING_TYPES.includes(n.type) && !!n.project?.id;
              const isEvent = n.type === "event_rsvp" && !!n.event_id;
              const clickable = !!n.actor || isRatePrompt || isEvent;
              const onTap = () => {
                if (isRatePrompt) { setRateProjectId(n.project.id); return; }
                if (isEvent) {
                  // Open the Events tab + highlight the card (Mini App reads
                  // start_param, not the desktop "/events?e=" link string).
                  window.dispatchEvent(new CustomEvent("bfu:open-event", { detail: { eventId: n.event_id } }));
                  onClose?.();
                  return;
                }
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
          ) : tab === "connections" ? (
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
          ) : (
            following === null ? (
              <div style={{ textAlign: "center", padding: 30, color: "var(--text-3)" }}>{t("common.loading")}</div>
            ) : (following.users.length === 0 && following.projects.length === 0) ? (
              <div style={{ textAlign: "center", padding: 40, color: "var(--text-3)" }}>{t("inbox.noFollowing")}</div>
            ) : (
              <>
                {following.users.map(u => (
                  <div key={`fu${u.id}`} onClick={() => setViewingUserId(u.id)} style={{
                    display: "flex", gap: 12, alignItems: "center", padding: "12px 8px",
                    borderBottom: "1px solid var(--border)", cursor: "pointer",
                  }}>
                    <AvatarEl name={u.display_name} size={44} photoUrl={u.photo_url} />
                    <div style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 700, fontFamily: "var(--font-display)" }}>
                      {u.display_name}
                    </div>
                    <Icon name="arrow_right" size={16} />
                  </div>
                ))}
                {following.projects.map(p => (
                  <div key={`fp${p.id}`} onClick={() => { window.dispatchEvent(new CustomEvent("bfu:open-project", { detail: { projectId: p.id } })); onClose(); }} style={{
                    display: "flex", gap: 12, alignItems: "center", padding: "12px 8px",
                    borderBottom: "1px solid var(--border)", cursor: "pointer",
                  }}>
                    <div style={{ width: 44, height: 44, borderRadius: 12, background: "var(--surface-2)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--teal-bright)", fontSize: 18 }}>◆</div>
                    <div style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 700, fontFamily: "var(--font-display)" }}>
                      {p.name}
                    </div>
                    <Icon name="arrow_right" size={16} />
                  </div>
                ))}
              </>
            )
          )}
        </div>
      </div>

      {viewingUserId && (
        <UserProfileModal userId={viewingUserId} onClose={() => setViewingUserId(null)} />
      )}
      {/* Rating is hidden for V1 (FLAGS.TRUST) — the sheet stays imported and
          intact, it just has no way to mount. Flip the flag to restore it. */}
      {FLAGS.TRUST && rateProjectId && (
        <RateSheet projectId={rateProjectId} onClose={() => setRateProjectId(null)} />
      )}
      <style>{`@keyframes slideUp { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>
    </div>
  );
};
