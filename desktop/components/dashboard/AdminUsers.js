"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { bfu } from "@/lib/client-api";
import { gradientFor, initials } from "@/lib/avatar";
import { useToast } from "@/components/ui/Toast";

// The user moderation table for /dashboard/users.
//
// Loads GET /admin/users?skip=&limit=&search= (AdminUserOut[]) — the backend
// paginates via skip/limit (default 50) and searches name/surname/tg_username.
// Each row shows avatar + name + @username + role + status pills, with actions:
//   - verify        POST   /admin/users/{id}/verify           (admin)
//   - toggle-check  PATCH  /admin/users/{id}/toggle-check      (admin)
//   - deny          POST   /admin/users/{id}/deny {fields,note}(admin)
//   - set role      PATCH  /admin/users/{id}/role {role}       (super_admin)
//   - ban           DELETE /admin/users/{id}   (soft; sets banned+is_deleted)
//   - restore       POST   /admin/users/{id}/restore           (admin)
//   - hard delete   DELETE /admin/users/{id}/hard  (super_admin; 409 if owns projects)
//
// Every action updates the row optimistically and shows a toast. The AdminUserOut
// shape exposes `is_deleted` (not a separate `banned`) — soft-delete flips both
// server-side, so we treat is_deleted as "banned".

const PAGE_SIZE = 50;
const ROLES = ["user", "admin", "super_admin"];
// Fields the backend allows denying (mirrors DENIABLE_FIELDS in admin.py).
const DENIABLE = ["name", "surname", "phone_number", "about", "birth_year", "gender", "tg_username"];

function roleLabel(role) {
  if (role === "super_admin") return "Super";
  if (role === "admin") return "Admin";
  return "User";
}

export default function AdminUsers({ me }) {
  const isSuper = me?.role === "super_admin";
  const { showToast, Toast } = useToast();

  const [rows, setRows] = useState([]);
  const [state, setState] = useState("loading"); // loading | ready | error
  const [search, setSearch] = useState("");
  const [skip, setSkip] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [denyFor, setDenyFor] = useState(null); // user object being denied, or null

  const load = useCallback(async (nextSkip, q) => {
    setState("loading");
    try {
      const data = await bfu("/admin/users", {
        params: { skip: nextSkip, limit: PAGE_SIZE, search: q || undefined },
      });
      const list = Array.isArray(data) ? data : [];
      setRows(list);
      setSkip(nextSkip);
      setHasMore(list.length === PAGE_SIZE);
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    load(0, "");
  }, [load]);

  // Debounced search: reload from page 0 ~350ms after the last keystroke.
  const searchTimer = useRef(null);
  const onSearch = (v) => {
    setSearch(v);
    window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(() => load(0, v.trim()), 350);
  };

  // Patch a single row in place (optimistic).
  const patchRow = (id, patch) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const removeRow = (id) => setRows((rs) => rs.filter((r) => r.id !== id));

  // --- actions ---
  async function doVerify(u) {
    setBusyId(u.id);
    patchRow(u.id, { checked: true, denied_fields: null, denied_note: null });
    try {
      await bfu(`/admin/users/${u.id}/verify`, { method: "POST" });
      showToast(`Verified ${u.name || "user"}`);
    } catch (e) {
      patchRow(u.id, { checked: u.checked });
      showToast(e.message || "Couldn't verify", "err");
    } finally {
      setBusyId(null);
    }
  }

  async function doToggleCheck(u) {
    setBusyId(u.id);
    const next = !u.checked;
    patchRow(u.id, { checked: next });
    try {
      const res = await bfu(`/admin/users/${u.id}/toggle-check`, { method: "PATCH" });
      if (res && typeof res.checked === "boolean") patchRow(u.id, { checked: res.checked });
      showToast(next ? "Marked checked" : "Un-checked");
    } catch (e) {
      patchRow(u.id, { checked: u.checked });
      showToast(e.message || "Couldn't update", "err");
    } finally {
      setBusyId(null);
    }
  }

  async function doSetRole(u, role) {
    if (role === u.role) return;
    setBusyId(u.id);
    patchRow(u.id, { role });
    try {
      const res = await bfu(`/admin/users/${u.id}/role`, { method: "PATCH", body: { role } });
      if (res?.role) patchRow(u.id, { role: res.role });
      showToast(`${u.name || "User"} is now ${roleLabel(role)}`);
    } catch (e) {
      patchRow(u.id, { role: u.role });
      showToast(e.message || "Couldn't change role", "err");
    } finally {
      setBusyId(null);
    }
  }

  async function doBan(u) {
    if (!window.confirm(`Ban ${u.name || "this user"}? They'll lose access until restored.`)) return;
    setBusyId(u.id);
    patchRow(u.id, { is_deleted: true });
    try {
      await bfu(`/admin/users/${u.id}`, { method: "DELETE" });
      showToast(`Banned ${u.name || "user"}`);
    } catch (e) {
      patchRow(u.id, { is_deleted: u.is_deleted });
      showToast(e.message || "Couldn't ban", "err");
    } finally {
      setBusyId(null);
    }
  }

  async function doRestore(u) {
    setBusyId(u.id);
    patchRow(u.id, { is_deleted: false });
    try {
      await bfu(`/admin/users/${u.id}/restore`, { method: "POST" });
      showToast(`Restored ${u.name || "user"}`);
    } catch (e) {
      patchRow(u.id, { is_deleted: u.is_deleted });
      showToast(e.message || "Couldn't restore", "err");
    } finally {
      setBusyId(null);
    }
  }

  async function doHardDelete(u) {
    if (!window.confirm(`PERMANENTLY delete ${u.name || "this user"}? This cannot be undone.`)) return;
    if (!window.confirm("Are you absolutely sure? This erases the account for good.")) return;
    setBusyId(u.id);
    try {
      await bfu(`/admin/users/${u.id}/hard`, { method: "DELETE" });
      removeRow(u.id);
      showToast(`Permanently deleted ${u.name || "user"}`);
    } catch (e) {
      // 409 = user owns projects; keep the row and explain.
      showToast(e.message || "Couldn't delete", "err");
    } finally {
      setBusyId(null);
    }
  }

  async function submitDeny(fields, note) {
    const u = denyFor;
    if (!u || fields.length === 0) return;
    setBusyId(u.id);
    try {
      await bfu(`/admin/users/${u.id}/deny`, { method: "POST", body: { fields, note: note || null } });
      patchRow(u.id, { checked: false, denied_fields: JSON.stringify(fields), denied_note: note || null });
      showToast(`Asked ${u.name || "user"} to fix ${fields.length} field(s)`);
      setDenyFor(null);
    } catch (e) {
      showToast(e.message || "Couldn't send corrections", "err");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div style={{ marginTop: 28 }}>
      {/* Search */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search name or @username…"
          aria-label="Search users"
          style={inputStyle}
        />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)", letterSpacing: "0.08em" }}>
          {state === "ready" ? `${rows.length} shown` : ""}
        </span>
      </div>

      {state === "loading" && (
        <div style={{ color: "var(--muted)", fontSize: 14 }}>
          <span className="ch-spin" aria-hidden style={{ marginRight: 8 }}>◠</span>
          Loading the roll…
        </div>
      )}
      {state === "error" && (
        <div style={{ color: "var(--terra)", fontSize: 14 }}>Couldn't load users. Refresh to try again.</div>
      )}

      {state === "ready" && rows.length === 0 && (
        <div className="ch-grace" style={{ minHeight: 150 }}>
          <span className="ch-grace-k">Nothing here</span>
          <div className="ch-grace-t">No users match.</div>
          <div className="ch-grace-s">Try a different name or clear the search.</div>
        </div>
      )}

      {state === "ready" && rows.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <div style={{ minWidth: 780 }}>
            {rows.map((u) => (
              <UserRow
                key={u.id}
                u={u}
                isSuper={isSuper}
                busy={busyId === u.id}
                onVerify={() => doVerify(u)}
                onToggle={() => doToggleCheck(u)}
                onSetRole={(r) => doSetRole(u, r)}
                onBan={() => doBan(u)}
                onRestore={() => doRestore(u)}
                onHardDelete={() => doHardDelete(u)}
                onDeny={() => setDenyFor(u)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Pagination */}
      {state === "ready" && (skip > 0 || hasMore) && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 22 }}>
          <button
            type="button"
            className="ch-btn-ghost"
            disabled={skip === 0}
            onClick={() => load(Math.max(0, skip - PAGE_SIZE), search.trim())}
          >
            ← Previous
          </button>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)" }}>
            {skip + 1}–{skip + rows.length}
          </span>
          <button
            type="button"
            className="ch-btn-ghost"
            disabled={!hasMore}
            onClick={() => load(skip + PAGE_SIZE, search.trim())}
          >
            Next →
          </button>
        </div>
      )}

      {denyFor && (
        <DenyDialog
          user={denyFor}
          onCancel={() => setDenyFor(null)}
          onSubmit={submitDeny}
        />
      )}

      <Toast />
    </div>
  );
}

function UserRow({ u, isSuper, busy, onVerify, onToggle, onSetRole, onBan, onRestore, onHardDelete, onDeny }) {
  const name = u.name ? `${u.name}${u.surname ? " " + u.surname : ""}` : u.tg_username || `User #${u.id}`;
  const banned = u.is_deleted;
  return (
    <div
      className="ch-cell"
      style={{
        padding: "16px 18px",
        marginBottom: 10,
        display: "flex",
        alignItems: "center",
        gap: 16,
        opacity: banned ? 0.62 : 1,
      }}
    >
      {/* identity */}
      <a
        href={`/u/${u.id}`}
        style={{ display: "flex", alignItems: "center", gap: 12, textDecoration: "none", minWidth: 220, flex: "1 1 220px" }}
      >
        <div
          style={{
            width: 42, height: 42, borderRadius: "50%", flex: "0 0 auto",
            background: gradientFor(u.id ?? name),
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 15, color: "#160E08",
          }}
        >
          {initials(name)}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {name}
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)" }}>
            {u.tg_username ? `@${u.tg_username}` : `id ${u.id}`}
          </div>
        </div>
      </a>

      {/* status pills */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", flex: "0 0 auto", minWidth: 140 }}>
        <Pill tone={u.role === "super_admin" ? "amber" : u.role === "admin" ? "ember" : "muted"}>
          {roleLabel(u.role)}
        </Pill>
        {u.checked ? <Pill tone="green">✓ Checked</Pill> : <Pill tone="muted">Unchecked</Pill>}
        {banned && <Pill tone="terra">Banned</Pill>}
        {u.denied_fields && <Pill tone="terra">Corrections</Pill>}
      </div>

      {/* actions */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end", flex: "1 1 auto" }}>
        {!banned && !u.checked && (
          <ActionBtn onClick={onVerify} busy={busy} title="Mark this profile verified">✓ Verify</ActionBtn>
        )}
        {!banned && (
          <ActionBtn onClick={onToggle} busy={busy} title="Toggle the checked flag">
            {u.checked ? "Uncheck" : "Check"}
          </ActionBtn>
        )}
        {!banned && (
          <ActionBtn onClick={onDeny} busy={busy} title="Ask the user to correct profile fields">Deny…</ActionBtn>
        )}
        {isSuper && (
          <select
            aria-label={`Role for ${name}`}
            value={u.role}
            disabled={busy}
            onChange={(e) => onSetRole(e.target.value)}
            style={selectStyle}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>{roleLabel(r)}</option>
            ))}
          </select>
        )}
        {banned ? (
          <ActionBtn onClick={onRestore} busy={busy} title="Lift the ban">Restore</ActionBtn>
        ) : (
          <ActionBtn onClick={onBan} busy={busy} tone="terra" title="Ban (soft-delete)">Ban</ActionBtn>
        )}
        {isSuper && (
          <ActionBtn onClick={onHardDelete} busy={busy} tone="terra" title="Permanently delete (super-admin)">
            Delete
          </ActionBtn>
        )}
      </div>
    </div>
  );
}

function ActionBtn({ children, onClick, busy, tone, title }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      title={title}
      className="ch-btn-ghost"
      style={{
        padding: "7px 12px",
        fontSize: 12.5,
        ...(tone === "terra" ? { borderColor: "rgba(192,86,59,0.5)", color: "var(--terra)" } : {}),
      }}
    >
      {children}
    </button>
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

// Modal to pick which profile fields to send back for correction, plus a note.
function DenyDialog({ user, onCancel, onSubmit }) {
  const [picked, setPicked] = useState([]);
  const [note, setNote] = useState("");
  const name = user.name || user.tg_username || `User #${user.id}`;

  const toggle = (f) =>
    setPicked((p) => (p.includes(f) ? p.filter((x) => x !== f) : [...p, f]));

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Request corrections from ${name}`}
      onClick={onCancel}
      style={{
        position: "fixed", inset: 0, zIndex: 90,
        background: "rgba(6,5,4,0.7)", backdropFilter: "blur(3px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="ch-cell"
        style={{ width: "100%", maxWidth: 460, padding: 28, background: "var(--surface)" }}
      >
        <div className="ch-cell-label" style={{ marginBottom: 6 }}>Request corrections</div>
        <h2 style={{ margin: "0 0 6px", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 22, color: "var(--text)" }}>
          {name}
        </h2>
        <p style={{ margin: "0 0 16px", fontSize: 13.5, color: "var(--muted)" }}>
          They'll get a Telegram nudge to fix the fields you pick, and the profile is un-checked.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
          {DENIABLE.map((f) => {
            const on = picked.includes(f);
            return (
              <button
                key={f}
                type="button"
                onClick={() => toggle(f)}
                className="ch-btn-ghost"
                style={{
                  padding: "7px 12px", fontSize: 12.5,
                  ...(on ? { borderColor: "var(--amber)", color: "var(--amber)", background: "rgba(35,32,25,0.9)" } : {}),
                }}
              >
                {f}
              </button>
            );
          })}
        </div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional note (what to fix, why)…"
          rows={3}
          style={{ ...inputStyle, width: "100%", resize: "vertical", marginBottom: 18 }}
        />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button type="button" className="ch-btn-ghost" onClick={onCancel}>Cancel</button>
          <button
            type="button"
            className="ch-btn-primary"
            disabled={picked.length === 0}
            onClick={() => onSubmit(picked, note.trim())}
          >
            Send correction request
          </button>
        </div>
      </div>
    </div>
  );
}

const inputStyle = {
  fontFamily: "var(--font-body)", fontSize: 14, color: "var(--text)",
  background: "var(--surface-2)", border: "1px solid var(--hair)",
  borderRadius: 11, padding: "10px 14px", minWidth: 260, outline: "none",
};

const selectStyle = {
  fontFamily: "var(--font-body)", fontSize: 12.5, color: "var(--text)",
  background: "var(--surface-2)", border: "1px solid var(--hair)",
  borderRadius: 99, padding: "7px 10px", cursor: "pointer",
};
