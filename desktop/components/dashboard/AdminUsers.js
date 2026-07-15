"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { bfu } from "@/lib/client-api";
import { gradientFor, initials } from "@/lib/avatar";
import { useToast } from "@/components/ui/Toast";
import Pagination, { paginate } from "@/components/ui/Pagination";
import { handleFor } from "@/lib/handle";

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
// Client-side page size for the loaded window. NOTE: this slices the up-to-50-row
// server window (PAGE_SIZE) client-side; at ~1000+ users this list should page
// fully server-side (limit/offset per client page) instead of double-paginating.
const PER_PAGE = 15;
const ROLES = ["user", "admin", "super_admin"];
// Fields the backend allows denying (mirrors DENIABLE_FIELDS in admin.py).
const DENIABLE = ["name", "surname", "phone_number", "about", "birth_year", "gender", "tg_username"];

function roleLabel(role) {
  if (role === "super_admin") return "Super";
  if (role === "admin") return "Admin";
  if (role === "partner") return "Partner";
  if (role === "boss") return "Boss";
  return "User";
}

export default function AdminUsers({ me }) {
  const isSuper = me?.role === "super_admin";
  const { showToast, Toast } = useToast();

  const [rows, setRows] = useState([]);
  const [state, setState] = useState("loading"); // loading | ready | error
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(""); // "" | registered | pending | deleted | banned
  const [skip, setSkip] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [denyFor, setDenyFor] = useState(null); // user object being denied, or null
  const [fullFor, setFullFor] = useState(null); // { user, data } for the "all fields" reveal
  const [page, setPage] = useState(1);          // client-side page over the loaded window

  const load = useCallback(async (nextSkip, q, status) => {
    setState("loading");
    try {
      const data = await bfu("/admin/users", {
        params: { skip: nextSkip, limit: PAGE_SIZE, search: q || undefined, status: status || undefined },
      });
      const list = Array.isArray(data) ? data : [];
      setRows(list);
      setPage(1); // new server window (initial / search / prev-next) → back to page 1
      setSkip(nextSkip);
      setHasMore(list.length === PAGE_SIZE);
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    load(0, "", "");
  }, [load]);

  const onStatus = (v) => {
    setStatusFilter(v);
    load(0, search.trim(), v);
  };

  // DM a "finish your registration" nudge to someone who started the bot but
  // never completed sign-up.
  async function doNudge(u) {
    setBusyId(u.id);
    try {
      const res = await bfu(`/admin/users/${u.id}/nudge-register`, { method: "POST" });
      if (res?.ok) showToast(`Reminder sent to ${u.name || "user"}`);
      else showToast(`Couldn't reach ${u.name || "user"} — they haven't opened the bot chat`, "err");
    } catch (e) {
      showToast(e.message || "Couldn't send reminder", "err");
    } finally {
      setBusyId(null);
    }
  }

  // Nudge every pending user via one server call — the backend fans out to
  // Telegram and skips story-link users it can't DM. Summarised in one toast.
  async function doNudgeAll() {
    if (!window.confirm('Send a "finish registration" reminder to all pending users?')) return;
    setBusyId("bulk");
    try {
      const res = await bfu("/admin/users/nudge-all-pending", { method: "POST" });
      let msg = `${res.sent} reminded • ${res.unreachable_skipped} can't be reached yet`;
      if (res.failed > 0) msg += ` • ${res.failed} failed`;
      showToast(msg);
      // Reload the current window so refreshed can_message flags show up.
      load(skip, search.trim(), statusFilter);
    } catch (e) {
      showToast(e.message || "Couldn't send reminders", "err");
    } finally {
      setBusyId(null);
    }
  }

  // Reveal EVERY field of one user (phone, flags, raw ids, timestamps).
  async function openFull(u) {
    setFullFor({ user: u, data: null }); // open with a spinner
    try {
      const data = await bfu(`/admin/users/${u.id}/full`);
      setFullFor({ user: u, data });
    } catch (e) {
      showToast(e.message || "Couldn't load full record", "err");
      setFullFor(null);
    }
  }

  // Keep the client page in range when optimistic bans/deletes shrink the window.
  useEffect(() => {
    const pages = Math.max(1, Math.ceil(rows.length / PER_PAGE));
    if (page > pages) setPage(pages);
  }, [rows.length, page]);

  // Debounced search: reload from page 0 ~350ms after the last keystroke.
  const searchTimer = useRef(null);
  const onSearch = (v) => {
    setSearch(v);
    window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(() => load(0, v.trim(), statusFilter), 350);
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

  // Promote an ordinary member to a partner org owner. Idempotent server-side:
  // flips role to 'partner', creates/re-links a Partner org they own, and they
  // then use /web/partner. Confirm (role change), prompt for the org name, POST.
  async function doMakePartner(u) {
    const who = u.name || u.tg_username || "this user";
    if (!window.confirm(`Make ${who} a partner? This changes their role. They'll own a partner org and can open /web/partner.`)) return;
    const suggested = u.name ? `${u.name}${u.surname ? " " + u.surname : ""}` : (u.tg_username || "");
    const entered = window.prompt("Partner organization name?", suggested);
    if (entered == null) return; // cancelled
    const name = entered.trim();
    if (!name) return;
    setBusyId(u.id);
    try {
      await bfu(`/admin/users/${u.id}/make-partner`, { method: "POST", body: { name } });
      patchRow(u.id, { role: "partner" });
      showToast(`Made partner — they can now open /web/partner`);
    } catch (e) {
      showToast(e.message || "Couldn't make partner", "err");
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
        <select
          value={statusFilter}
          onChange={(e) => onStatus(e.target.value)}
          aria-label="Filter by status"
          style={{ ...selectStyle, borderRadius: 11, padding: "10px 12px" }}
        >
          <option value="">All users</option>
          <option value="registered">Registered (in Discover)</option>
          <option value="pending">Pending — not finished</option>
          <option value="deleted">Deleted</option>
          <option value="banned">Banned</option>
        </select>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)", letterSpacing: "0.08em" }}>
          {state === "ready" ? `${rows.length} shown` : ""}
        </span>
      </div>
      {statusFilter === "pending" && (
        <div style={{ marginTop: -8, marginBottom: 16, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12.5, color: "var(--muted)" }}>
            These opened the app but never finished sign-up (no region/skills) — so they don't appear in Discover yet.
          </span>
          {rows.some((r) => !r.is_registered && !r.banned && !r.is_deleted) && (
            <button
              type="button"
              className="ch-btn-ghost"
              style={{ padding: "6px 12px", fontSize: 12.5, borderColor: "var(--amber)", color: "var(--amber)" }}
              disabled={busyId === "bulk"}
              onClick={doNudgeAll}
            >
              {busyId === "bulk" ? "Sending…" : "📩 Remind all pending"}
            </button>
          )}
        </div>
      )}

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
        <>
          <div style={{ overflowX: "auto" }}>
            <div style={{ minWidth: 780 }}>
              {paginate(rows, page, PER_PAGE).map((u) => (
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
                  onShowFull={() => openFull(u)}
                  onNudge={() => doNudge(u)}
                  onMakePartner={() => doMakePartner(u)}
                />
              ))}
            </div>
          </div>
          <Pagination page={page} pageSize={PER_PAGE} total={rows.length} onPageChange={setPage} />
        </>
      )}

      {/* Pagination */}
      {state === "ready" && (skip > 0 || hasMore) && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 22 }}>
          <button
            type="button"
            className="ch-btn-ghost"
            disabled={skip === 0}
            onClick={() => load(Math.max(0, skip - PAGE_SIZE), search.trim(), statusFilter)}
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
            onClick={() => load(skip + PAGE_SIZE, search.trim(), statusFilter)}
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

      {fullFor && (
        <FullFieldsDialog
          user={fullFor.user}
          data={fullFor.data}
          onClose={() => setFullFor(null)}
        />
      )}

      <Toast />
    </div>
  );
}

function UserRow({ u, isSuper, busy, onVerify, onToggle, onSetRole, onBan, onRestore, onHardDelete, onDeny, onShowFull, onNudge, onMakePartner }) {
  const name = u.name ? `${u.name}${u.surname ? " " + u.surname : ""}` : u.tg_username || `User #${u.id}`;
  const banned = u.banned || u.is_deleted;
  const pending = !u.is_registered && !banned; // started sign-up, never finished → NOT in Discover
  // "Make partner" is only for ordinary members — never for someone who's already
  // a partner, admin, boss, or super_admin.
  const canMakePartner = u.role === "user" && !banned;
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
        href={`/web/u/${handleFor(u.id)}`}
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
        <Pill tone={u.role === "super_admin" ? "amber" : u.role === "admin" ? "ember" : u.role === "partner" ? "green" : "muted"}>
          {roleLabel(u.role)}
        </Pill>
        {pending ? (
          <>
            <Pill tone="terra" title="Started sign-up but never finished — not shown in Discover">⏳ Pending</Pill>
            {u.can_message === false && (
              <Pill
                tone="muted"
                title="This user opened the Mini App from a link but never started the bot or granted message permission, so a reminder can't reach them yet."
              >
                ✋ Can't DM yet
              </Pill>
            )}
          </>
        ) : (
          !banned && <Pill tone="green">Registered</Pill>
        )}
        {u.checked ? <Pill tone="green">✓ Checked</Pill> : <Pill tone="muted">Unchecked</Pill>}
        {banned && <Pill tone="terra">Banned</Pill>}
        {u.denied_fields && <Pill tone="terra">Corrections</Pill>}
      </div>

      {/* actions */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end", flex: "1 1 auto" }}>
        <ActionBtn onClick={onShowFull} busy={busy} title="Show every field for this user">Fields</ActionBtn>
        {pending && (
          <ActionBtn onClick={onNudge} busy={busy} title="DM a 'finish your registration' reminder that opens the app">
            📩 Remind to register
          </ActionBtn>
        )}
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
        {canMakePartner && (
          <ActionBtn onClick={onMakePartner} busy={busy} title="Promote to a partner org owner (they can then open /web/partner)">
            ◆ Make partner
          </ActionBtn>
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

function Pill({ children, tone, title }) {
  const color =
    tone === "amber" ? "var(--amber)" :
    tone === "ember" ? "var(--ember)" :
    tone === "green" ? "var(--green)" :
    tone === "terra" ? "var(--terra)" : "var(--muted)";
  return (
    <span
      title={title}
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
        overflowY: "auto", WebkitOverflowScrolling: "touch",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="ch-cell"
        style={{ width: "100%", maxWidth: 460, padding: 28, background: "var(--surface)", margin: "auto" }}
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

// "Show all fields": every column of one user, including the ones the list view
// hides (phone, flags, raw ids, timestamps). Read-only reveal for the admin.
function FullFieldsDialog({ user, data, onClose }) {
  const name = user.name || user.tg_username || `User #${user.id}`;
  const fmt = (v) => {
    if (v === null || v === undefined) return "—";
    if (typeof v === "boolean") return v ? "true" : "false";
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
  };
  const entries = data ? Object.entries(data).sort(([a], [b]) => a.localeCompare(b)) : [];
  const copyAll = async () => {
    try { await navigator.clipboard?.writeText(JSON.stringify(data, null, 2)); } catch { /* ignore */ }
  };
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`All fields for ${name}`}
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 90,
        background: "rgba(6,5,4,0.7)", backdropFilter: "blur(3px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
        overflowY: "auto", WebkitOverflowScrolling: "touch",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="ch-cell"
        style={{ width: "100%", maxWidth: 560, maxHeight: "82vh", display: "flex", flexDirection: "column", padding: 24, background: "var(--surface)", margin: "auto" }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 4 }}>
          <div className="ch-cell-label" style={{ margin: 0 }}>All fields</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="ch-btn-ghost" style={{ padding: "6px 10px", fontSize: 12 }} onClick={copyAll} disabled={!data}>Copy JSON</button>
            <button type="button" className="ch-btn-ghost" style={{ padding: "6px 10px", fontSize: 12 }} onClick={onClose}>Close</button>
          </div>
        </div>
        <h2 style={{ margin: "0 0 14px", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 20, color: "var(--text)" }}>
          {name}
        </h2>
        {!data ? (
          <div style={{ color: "var(--muted)", fontSize: 14, padding: "20px 0" }}>
            <span className="ch-spin" aria-hidden style={{ marginRight: 8 }}>◠</span> Loading full record…
          </div>
        ) : (
          <div style={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto", border: "1px solid var(--hair)", borderRadius: 10 }}>
            {entries.map(([k, v], i) => (
              <div
                key={k}
                style={{
                  display: "grid", gridTemplateColumns: "minmax(120px, 38%) 1fr", gap: 12,
                  padding: "8px 12px", borderBottom: i < entries.length - 1 ? "1px solid var(--hair)" : "none",
                  background: i % 2 ? "rgba(255,255,255,0.02)" : "transparent",
                }}
              >
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--muted)", wordBreak: "break-all" }}>{k}</span>
                <span style={{ fontSize: 12.5, color: "var(--text)", wordBreak: "break-word", whiteSpace: "pre-wrap" }}>{fmt(v)}</span>
              </div>
            ))}
          </div>
        )}
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
