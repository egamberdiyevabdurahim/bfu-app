import { useState, useEffect } from "react";
import { users, projects, bookings } from "../api";
import { useT } from "../i18n";
import { FLAGS } from "../flags";

// ── Home "command center" strip (top of the Profile tab) ──────────────────────
// Mirrors the desktop HomeDashboard's highest-value modules, reusing existing
// endpoints. Each card self-hides when empty so the profile stays clean:
//   • Needs you now  — pending applicants + unread notifications + session requests
//   • Who viewed you — profile-viewers count + recent avatars
// All rows are tappable; the parent (ProfileScreen) owns the overlays via callbacks.

const initialsOf = (name) =>
  ((name || "?").trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?");
const STACK = [
  "linear-gradient(140deg,#E8A15C,#C0563B)",
  "linear-gradient(140deg,#F0B429,#C0563B)",
  "linear-gradient(140deg,#5EC5B6,#12564F)",
  "linear-gradient(140deg,#7FB069,#12564F)",
];

const relDays = (iso) => {
  if (!iso) return "";
  let s = String(iso); if (!/[zZ]|[+-]\d\d:?\d\d$/.test(s)) s += "Z";
  const d = Math.floor((Date.now() - new Date(s).getTime()) / 86400000);
  if (d <= 0) return "today";
  if (d === 1) return "1d";
  return `${d}d`;
};

export const HomeStrip = ({ refreshKey, onOpenRequests, onOpenInbox, onOpenBookings, onOpenUser }) => {
  const { t } = useT();
  const [pending, setPending] = useState(0);
  const [unread, setUnread] = useState(0);
  const [sessionReqs, setSessionReqs] = useState(0);
  const [viewers, setViewers] = useState({ count: 0, recent: [] });

  useEffect(() => {
    projects.funnel().then((f) => setPending(f?.totals?.pending || 0)).catch(() => {});
    users.unreadCount().then((r) => setUnread(r?.unread || 0)).catch(() => {});
    if (FLAGS.MENTORING) {
      bookings.mine().then((r) => {
        const reqs = (r?.as_mentor || []).filter((b) => b.status === "requested").length;
        setSessionReqs(reqs);
      }).catch(() => {});
    }
    users.profileViewers().then((r) => setViewers({ count: r?.count || 0, recent: r?.recent || [] })).catch(() => {});
  }, [refreshKey]);

  const needs = [
    pending > 0 && { key: "pending", glyph: "✒", n: pending, label: t("home.pendingApps"), onClick: onOpenRequests },
    unread > 0 && { key: "unread", glyph: "🔔", n: unread, label: t("home.unread"), onClick: onOpenInbox },
    FLAGS.MENTORING && sessionReqs > 0 && { key: "sessions", glyph: "◷", n: sessionReqs, label: t("home.sessionReqs"), onClick: onOpenBookings },
  ].filter(Boolean);

  const hasNeeds = needs.length > 0;
  const hasViewers = viewers.count > 0;
  if (!hasNeeds && !hasViewers) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 22 }}>
      {/* Needs you now */}
      {hasNeeds && (
        <div className="ch-cell-static" style={{ borderColor: "rgba(255,106,61,0.3)",
          background: "linear-gradient(150deg, rgba(255,106,61,0.08), var(--surface) 60%)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--ember)",
              boxShadow: "0 0 12px rgba(255,106,61,0.8)" }} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.16em",
              textTransform: "uppercase", color: "var(--ember)" }}>{t("home.needsYou")}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
            {needs.map((r) => (
              <button key={r.key} onClick={r.onClick} style={{
                display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left",
                background: "var(--surface-2)", border: "1px solid var(--hair)", borderRadius: "var(--radius-sm)",
                padding: "12px 14px", cursor: "pointer",
              }}>
                <span style={{ fontSize: 17, width: 22, textAlign: "center" }} aria-hidden>{r.glyph}</span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, color: "var(--text)" }}>{r.label}</span>
                <span style={{ minWidth: 22, height: 22, padding: "0 7px", borderRadius: 99,
                  background: "linear-gradient(135deg, var(--ember), var(--terra))", color: "#160E08",
                  fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700,
                  display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{r.n}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Who viewed you */}
      {hasViewers && (
        <div className="ch-cell-static">
          <div className="ch-cell-label">{t("home.whoViewed")}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 14 }}>
            <div style={{ display: "flex" }}>
              {viewers.recent.slice(0, 4).map((v, i) => (
                <button key={v.id} onClick={() => onOpenUser?.(v.id)} aria-label={v.display_name} style={{
                  width: 42, height: 42, borderRadius: "50%", background: STACK[i % STACK.length],
                  border: "2px solid var(--surface)", marginLeft: i === 0 ? 0 : -13, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", padding: 0,
                  fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14, color: "#160E08", position: "relative" }}>
                  {v.photo_url
                    ? <img src={v.photo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : initialsOf(v.display_name)}
                  {v.is_online && (
                    <span aria-hidden style={{ position: "absolute", right: -1, bottom: -1, width: 11, height: 11,
                      borderRadius: "50%", background: "var(--green)", border: "2px solid var(--surface)" }} />
                  )}
                </button>
              ))}
            </div>
            <div style={{ flex: 1, minWidth: 0, fontSize: 14, color: "var(--text)" }}>
              <span style={{ fontFamily: "var(--font-mono)", color: "var(--amber)" }}>{viewers.count}</span>{" "}
              {viewers.count === 1 ? t("home.viewerOne") : t("home.viewerMany")}
            </div>
          </div>
          {viewers.recent.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 14 }}>
              {viewers.recent.slice(0, 3).map((v) => (
                <button key={`row-${v.id}`} onClick={() => onOpenUser?.(v.id)} style={{
                  display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left",
                  background: "transparent", border: "none", padding: "4px 2px", cursor: "pointer",
                }}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: "var(--text)", fontWeight: 600,
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.display_name}</span>
                  {v.region && <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-3)" }}>{v.region}</span>}
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-3)" }}>{relDays(v.viewed_at)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
