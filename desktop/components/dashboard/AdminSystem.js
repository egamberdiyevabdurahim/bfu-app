"use client";

import { useEffect, useState } from "react";
import { bfu } from "@/lib/client-api";
import { useToast } from "@/components/ui/Toast";
import { downloadExport } from "@/lib/export";

// System panel for /dashboard/system.
//
// Read-only logs (both get_admin_user):
//   GET /admin/audit  → [{ id, admin_id, action, target_type, target_id,
//                          details, created_at }]  newest first, up to 200
//   GET /admin/errors → [{ id, path, method, message, created_at }] up to 50
//
// Data exports (SUPER-ADMIN only server-side):
//   GET /admin/export/users.json    → authed JSON download
//   GET /admin/export/projects.json → authed JSON download
// These are JSON, so they ride the /api/bfu proxy; lib/export.js fetches the
// blob and triggers a browser save. Plain admins see the export card disabled
// with a "super-admins only" note (the backend would 403 anyway).
//
// Optional: GET /admin/my-bot-location → { latitude, longitude } (this admin's
// last location shared with the Telegram bot).

function fmtTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString("en-US", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function AdminSystem({ me }) {
  const isSuper = me?.role === "super_admin";
  const { showToast, Toast } = useToast();

  const [audit, setAudit] = useState([]);
  const [errors, setErrors] = useState([]);
  const [botLoc, setBotLoc] = useState(null);
  const [state, setState] = useState("loading");
  const [exporting, setExporting] = useState(null); // "users" | "projects" | null

  useEffect(() => {
    let alive = true;
    Promise.all([
      bfu("/admin/audit").catch(() => []),
      bfu("/admin/errors").catch(() => []),
      bfu("/admin/my-bot-location").catch(() => null),
    ])
      .then(([a, e, loc]) => {
        if (!alive) return;
        setAudit(Array.isArray(a) ? a : []);
        setErrors(Array.isArray(e) ? e : []);
        setBotLoc(loc && loc.latitude != null ? loc : null);
        setState("ready");
      })
      .catch(() => alive && setState("error"));
    return () => {
      alive = false;
    };
  }, []);

  async function doExport(kind) {
    setExporting(kind);
    try {
      await downloadExport(kind);
      showToast(`Exported ${kind}.json`);
    } catch (err) {
      showToast(err.message || "Export failed", "err");
    } finally {
      setExporting(null);
    }
  }

  return (
    <div style={{ marginTop: 28 }}>
      {/* ── Exports ── */}
      <section style={{ marginBottom: 40 }}>
        <h2 style={{ margin: "0 0 6px", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 22, color: "var(--text)" }}>
          Data exports
        </h2>
        <p style={{ margin: "0 0 16px", fontSize: 14, color: "var(--muted)", maxWidth: 560 }}>
          Download a full JSON snapshot of members or projects.{" "}
          {isSuper ? "Handle with care — it contains personal data." : "Super-admins only."}
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            className="ch-btn-primary"
            onClick={() => doExport("users")}
            disabled={!isSuper || exporting === "users"}
            style={{ padding: "10px 18px", opacity: isSuper ? 1 : 0.5 }}
            title={isSuper ? "Download users.json" : "Super-admins only"}
          >
            {exporting === "users" ? "Exporting…" : "⬇ Export users.json"}
          </button>
          <button
            type="button"
            className="ch-btn-primary"
            onClick={() => doExport("projects")}
            disabled={!isSuper || exporting === "projects"}
            style={{ padding: "10px 18px", opacity: isSuper ? 1 : 0.5 }}
            title={isSuper ? "Download projects.json" : "Super-admins only"}
          >
            {exporting === "projects" ? "Exporting…" : "⬇ Export projects.json"}
          </button>
        </div>
        {botLoc && (
          <div style={{ marginTop: 16, fontSize: 12.5, color: "var(--muted)" }}>
            Your last bot location:{" "}
            <a
              href={`https://maps.google.com/?q=${botLoc.latitude},${botLoc.longitude}`}
              target="_blank"
              rel="noreferrer"
              style={{ color: "var(--amber)", textDecoration: "none" }}
            >
              {Number(botLoc.latitude).toFixed(4)}, {Number(botLoc.longitude).toFixed(4)} ↗
            </a>
          </div>
        )}
      </section>

      {state === "loading" && (
        <div style={{ color: "var(--muted)", fontSize: 14 }}>
          <span className="ch-spin" aria-hidden style={{ marginRight: 8 }}>◠</span>
          Loading logs…
        </div>
      )}
      {state === "error" && (
        <div style={{ color: "var(--terra)", fontSize: 14 }}>Couldn't load logs. Refresh to try again.</div>
      )}

      {state === "ready" && (
        <>
          {/* ── Audit log ── */}
          <section style={{ marginBottom: 40 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 22, color: "var(--text)" }}>
                Audit log
              </h2>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)" }}>
                {audit.length} recent
              </span>
            </div>
            {audit.length === 0 ? (
              <div className="ch-grace" style={{ minHeight: 120 }}>
                <span className="ch-grace-k">Quiet</span>
                <div className="ch-grace-t">No admin actions logged yet.</div>
              </div>
            ) : (
              <LogTable
                cols={["When", "Admin", "Action", "Target", "Details"]}
                rows={audit.map((a) => [
                  fmtTime(a.created_at),
                  a.admin_id != null ? `#${a.admin_id}` : "—",
                  <Mono key="act">{a.action}</Mono>,
                  a.target_type ? `${a.target_type} #${a.target_id ?? "?"}` : "—",
                  a.details ? <Details key="d" value={a.details} /> : "—",
                ])}
              />
            )}
          </section>

          {/* ── Error log ── */}
          <section>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 22, color: "var(--text)" }}>
                Error log
              </h2>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)" }}>
                {errors.length} recent
              </span>
            </div>
            {errors.length === 0 ? (
              <div className="ch-grace" style={{ minHeight: 120 }}>
                <span className="ch-grace-k">All clear</span>
                <div className="ch-grace-t">No server errors recorded.</div>
              </div>
            ) : (
              <LogTable
                cols={["When", "Method", "Path", "Message"]}
                rows={errors.map((e) => [
                  fmtTime(e.created_at),
                  <Mono key="m">{e.method || "—"}</Mono>,
                  <Mono key="p">{e.path || "—"}</Mono>,
                  <span key="msg" style={{ color: "var(--terra)" }}>{e.message || "—"}</span>,
                ])}
              />
            )}
          </section>
        </>
      )}

      <Toast />
    </div>
  );
}

function LogTable({ cols, rows }) {
  return (
    <div className="ch-cell" style={{ padding: 0, overflowX: "auto" }}>
      <table style={{ width: "100%", minWidth: 640, borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr>
            {cols.map((c) => (
              <th
                key={c}
                style={{
                  textAlign: "left", padding: "12px 16px",
                  fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em",
                  textTransform: "uppercase", color: "var(--muted)",
                  borderBottom: "1px solid var(--hair)", whiteSpace: "nowrap",
                }}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, i) => (
            <tr key={i}>
              {cells.map((cell, j) => (
                <td
                  key={j}
                  style={{
                    padding: "11px 16px", color: "var(--text)", verticalAlign: "top",
                    borderBottom: i < rows.length - 1 ? "1px solid var(--hair)" : "none",
                    whiteSpace: j === 0 ? "nowrap" : "normal",
                  }}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Mono({ children }) {
  return <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--amber)" }}>{children}</span>;
}

function Details({ value }) {
  // details is JSON (dict) from the backend; render compactly.
  let text;
  try {
    text = typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    text = String(value);
  }
  return (
    <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)", wordBreak: "break-word" }}>
      {text}
    </span>
  );
}
