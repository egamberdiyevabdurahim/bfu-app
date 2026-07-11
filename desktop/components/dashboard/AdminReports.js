"use client";

import { useEffect, useState } from "react";
import { bfu } from "@/lib/client-api";
import { useToast } from "@/components/ui/Toast";

// The reports list for /dashboard/reports.
//
// Loads GET /admin/reports (ReportOut[]: id, reporter_id, target_type,
// target_id, reason, resolved) — newest first, up to 100. Open (unresolved)
// reports float to the top. Each row links to the target — a user (/u/{id}) or
// project (/p/{id}) — and has a Resolve button:
//   PATCH /admin/reports/{id}/resolve  (toggles resolved)
// Optimistic + toast. Empty state when there are no open reports.

function targetHref(type, id) {
  const t = (type || "").toLowerCase();
  if (t === "user") return `/web/u/${id}`;
  if (t === "project") return `/web/p/${id}`;
  return null;
}

export default function AdminReports() {
  const { showToast, Toast } = useToast();
  const [rows, setRows] = useState([]);
  const [state, setState] = useState("loading"); // loading | ready | error
  const [busyId, setBusyId] = useState(null);
  const [showResolved, setShowResolved] = useState(false);

  useEffect(() => {
    let alive = true;
    bfu("/admin/reports")
      .then((data) => {
        if (!alive) return;
        setRows(Array.isArray(data) ? data : []);
        setState("ready");
      })
      .catch(() => alive && setState("error"));
    return () => {
      alive = false;
    };
  }, []);

  async function doResolve(r) {
    setBusyId(r.id);
    const next = !r.resolved;
    setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, resolved: next } : x)));
    try {
      const res = await bfu(`/admin/reports/${r.id}/resolve`, { method: "PATCH" });
      if (res && typeof res.resolved === "boolean") {
        setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, resolved: res.resolved } : x)));
      }
      showToast(next ? "Resolved" : "Reopened");
    } catch (e) {
      setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, resolved: r.resolved } : x)));
      showToast(e.message || "Couldn't update", "err");
    } finally {
      setBusyId(null);
    }
  }

  const open = rows.filter((r) => !r.resolved);
  const resolved = rows.filter((r) => r.resolved);
  const visible = showResolved ? rows : open;

  return (
    <div style={{ marginTop: 28 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)", letterSpacing: "0.08em" }}>
          {state === "ready" ? `${open.length} open · ${resolved.length} resolved` : ""}
        </span>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--muted)", cursor: "pointer" }}>
          <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} />
          Show resolved
        </label>
      </div>

      {state === "loading" && (
        <div style={{ color: "var(--muted)", fontSize: 14 }}>
          <span className="ch-spin" aria-hidden style={{ marginRight: 8 }}>◠</span>
          Loading reports…
        </div>
      )}
      {state === "error" && (
        <div style={{ color: "var(--terra)", fontSize: 14 }}>Couldn't load reports. Refresh to try again.</div>
      )}

      {state === "ready" && visible.length === 0 && (
        <div className="ch-grace" style={{ minHeight: 160 }}>
          <span className="ch-grace-k">All quiet</span>
          <div className="ch-grace-t">No open reports.</div>
          <div className="ch-grace-s">When someone flags a person or project, it'll land here for review.</div>
        </div>
      )}

      {state === "ready" && visible.map((r) => {
        const href = targetHref(r.target_type, r.target_id);
        return (
          <div
            key={r.id}
            className="ch-cell"
            style={{ padding: "16px 18px", marginBottom: 10, display: "flex", alignItems: "center", gap: 16, opacity: r.resolved ? 0.6 : 1 }}
          >
            <div style={{ flex: "1 1 auto", minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)" }}>
                  #{r.id} · by user {r.reporter_id}
                </span>
                <Pill tone={r.target_type === "user" ? "amber" : "ember"}>{r.target_type}</Pill>
                {r.resolved && <Pill tone="green">Resolved</Pill>}
              </div>
              <div style={{ marginTop: 6, fontSize: 15, color: "var(--text)" }}>
                {r.reason ? r.reason : <span style={{ color: "var(--muted)", fontStyle: "italic" }}>No reason given</span>}
              </div>
              <div style={{ marginTop: 4 }}>
                {href ? (
                  <a href={href} style={{ fontSize: 13, color: "var(--amber)", textDecoration: "none" }}>
                    View {r.target_type} #{r.target_id} →
                  </a>
                ) : (
                  <span style={{ fontSize: 13, color: "var(--muted)" }}>
                    {r.target_type} #{r.target_id}
                  </span>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={() => doResolve(r)}
              disabled={busyId === r.id}
              className={r.resolved ? "ch-btn-ghost" : "ch-btn-primary"}
              style={{ padding: "8px 16px", fontSize: 13, flex: "0 0 auto" }}
              title={r.resolved ? "Reopen this report" : "Mark handled"}
            >
              {r.resolved ? "Reopen" : "✓ Resolve"}
            </button>
          </div>
        );
      })}

      <Toast />
    </div>
  );
}

function Pill({ children, tone }) {
  const color =
    tone === "amber" ? "var(--amber)" :
    tone === "ember" ? "var(--ember)" :
    tone === "green" ? "var(--green)" :
    tone === "terra" ? "var(--terra)" : "var(--muted)";
  return (
    <span
      style={{
        fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.06em",
        textTransform: "uppercase", color,
        border: `1px solid ${color === "var(--muted)" ? "var(--hair)" : color}`,
        borderRadius: 99, padding: "3px 8px", whiteSpace: "nowrap",
        background: "rgba(35,32,25,0.5)",
      }}
    >
      {children}
    </span>
  );
}
