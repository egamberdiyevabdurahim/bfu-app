import { useState, useEffect } from "react";
import { users } from "../api";
import { useT } from "../i18n";

// ─────────────────────────────────────────────────────────────────────────────
// Soft, RECURRING "join the BFU channel" reminder.
//
// Registration no longer GATES on channel membership. Instead this gentle,
// dismissible card floats above the bottom nav and links to the official BFU
// channel (fetched the same way the app already learns group links — the
// /users/me/groups payload, which carries each group's TG link + join status).
//
// "Recurring" = the dismiss is stored in sessionStorage, so closing it hides the
// card for the current session only; it comes back on the next app open. It is
// never blocking, and it disappears entirely once the member has joined.
// ─────────────────────────────────────────────────────────────────────────────
const DISMISS_KEY = "bfu_channel_reminder_dismissed";

export const ChannelReminder = () => {
  const { t } = useT();
  const [group, setGroup] = useState(null); // { name, group_link }
  const [hidden, setHidden] = useState(() => {
    try { return sessionStorage.getItem(DISMISS_KEY) === "1"; } catch { return false; }
  });

  useEffect(() => {
    if (hidden) return undefined;
    let alive = true;
    users.checkGroups()
      .then((groups) => {
        if (!alive) return;
        const list = Array.isArray(groups) ? groups : [];
        // First not-yet-joined group that exposes a link. If they've joined
        // everything, there's nothing to nudge.
        const g = list.find((x) => x && x.group_link && !x.joined);
        if (g) setGroup({ name: g.name || "", group_link: g.group_link });
      })
      .catch(() => { /* additive — a failed check just shows no reminder */ });
    return () => { alive = false; };
  }, [hidden]);

  if (hidden || !group) return null;

  const dismiss = () => {
    try { sessionStorage.setItem(DISMISS_KEY, "1"); } catch { /* private mode */ }
    setHidden(true);
  };

  return (
    <div style={{
      position: "absolute", left: 12, right: 12, zIndex: 120,
      bottom: "calc(var(--safe-b) + 84px)",
      display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
      borderRadius: "var(--radius-md)", background: "var(--surface-2)",
      border: "1px solid var(--hair)", boxShadow: "0 12px 32px rgba(0,0,0,0.38)",
      animation: "fadeUp 0.3s ease both",
    }}>
      <span style={{ fontSize: 22, flexShrink: 0 }} aria-hidden>📣</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 13.5, color: "var(--text)", lineHeight: 1.3 }}>
          {t("channel.title")}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2, lineHeight: 1.4 }}>
          {t("channel.body")}
        </div>
      </div>
      <a href={group.group_link} target="_blank" rel="noopener noreferrer" style={{
        flexShrink: 0, background: "linear-gradient(135deg, var(--amber), var(--ember))", color: "#160E08",
        borderRadius: "var(--radius-pill)", padding: "8px 14px", fontSize: 12, fontWeight: 700,
        textDecoration: "none", fontFamily: "var(--font-display)",
      }}>{t("channel.join")}</a>
      <button onClick={dismiss} aria-label={t("common.close")} style={{
        flexShrink: 0, background: "none", border: "none", color: "var(--text-3)",
        cursor: "pointer", fontSize: 15, padding: 4, lineHeight: 1,
      }}>✕</button>
    </div>
  );
};
