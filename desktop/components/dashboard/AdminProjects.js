"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { bfu } from "@/lib/client-api";
import { useToast } from "@/components/ui/Toast";
import Pagination, { paginate } from "@/components/ui/Pagination";

// The project moderation queue for /dashboard/projects.
//
// Loads GET /admin/projects?skip=&limit=&search= (AdminProjectOut[]). The
// endpoint returns ALL projects (newest first); there's no server-side
// pending-only filter, so we split client-side into "Pending approval" (the
// high-value queue, shown first) and "Live / approved". Actions:
//   - approve      PATCH  /admin/projects/{id}/approve   (toggle is_approved)
//   - pin          PATCH  /admin/projects/{id}/pin       (toggle is_pinned)
//   - delete       DELETE /admin/projects/{id}           (soft)
//   - hard delete  DELETE /admin/projects/{id}/hard      (super_admin)
//
// Approving is THE gate that makes a project public — the button is prominent
// and its toast says "now public". Optimistic + toast on every action. Each row
// links to /p/{id}.

const PAGE_SIZE = 50;
// Client-side page size for each section's slice of the loaded window. NOTE: this
// paginates the up-to-50-row server window (PAGE_SIZE) client-side; at high volume
// these sections should page fully server-side (limit/offset) instead.
const PER_PAGE = 15;

export default function AdminProjects({ me }) {
  const isSuper = me?.role === "super_admin";
  const { showToast, Toast } = useToast();

  const [rows, setRows] = useState([]);
  const [state, setState] = useState("loading"); // loading | ready | error
  const [search, setSearch] = useState("");
  const [skip, setSkip] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [showApproved, setShowApproved] = useState(true);

  const load = useCallback(async (nextSkip, q) => {
    setState("loading");
    try {
      const data = await bfu("/admin/projects", {
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

  const searchTimer = useRef(null);
  const onSearch = (v) => {
    setSearch(v);
    window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(() => load(0, v.trim()), 350);
  };

  const patchRow = (id, patch) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const removeRow = (id) => setRows((rs) => rs.filter((r) => r.id !== id));

  async function doApprove(p) {
    // The queue's marquee action. approve toggles is_approved server-side.
    setBusyId(p.id);
    const next = !p.is_approved;
    patchRow(p.id, { is_approved: next });
    try {
      const res = await bfu(`/admin/projects/${p.id}/approve`, { method: "PATCH" });
      if (res && typeof res.is_approved === "boolean") patchRow(p.id, { is_approved: res.is_approved });
      showToast(next ? "Approved — now public" : "Approval revoked");
    } catch (e) {
      patchRow(p.id, { is_approved: p.is_approved });
      showToast(e.message || "Couldn't update approval", "err");
    } finally {
      setBusyId(null);
    }
  }

  async function doPin(p) {
    setBusyId(p.id);
    const next = !p.is_pinned;
    patchRow(p.id, { is_pinned: next });
    try {
      const res = await bfu(`/admin/projects/${p.id}/pin`, { method: "PATCH" });
      if (res && typeof res.is_pinned === "boolean") patchRow(p.id, { is_pinned: res.is_pinned });
      showToast(next ? "Pinned" : "Unpinned");
    } catch (e) {
      patchRow(p.id, { is_pinned: p.is_pinned });
      showToast(e.message || "Couldn't pin", "err");
    } finally {
      setBusyId(null);
    }
  }

  async function doDelete(p) {
    if (!window.confirm(`Delete "${p.name}"? It disappears from the city (soft delete).`)) return;
    setBusyId(p.id);
    patchRow(p.id, { is_deleted: true });
    try {
      await bfu(`/admin/projects/${p.id}`, { method: "DELETE" });
      showToast(`Deleted "${p.name}"`);
    } catch (e) {
      patchRow(p.id, { is_deleted: p.is_deleted });
      showToast(e.message || "Couldn't delete", "err");
    } finally {
      setBusyId(null);
    }
  }

  async function doHardDelete(p) {
    if (!window.confirm(`PERMANENTLY delete "${p.name}"? This cannot be undone.`)) return;
    if (!window.confirm("Are you absolutely sure? This erases the project for good.")) return;
    setBusyId(p.id);
    try {
      await bfu(`/admin/projects/${p.id}/hard`, { method: "DELETE" });
      removeRow(p.id);
      showToast(`Permanently deleted "${p.name}"`);
    } catch (e) {
      showToast(e.message || "Couldn't delete", "err");
    } finally {
      setBusyId(null);
    }
  }

  const live = rows.filter((r) => !r.is_deleted);
  // Pending = not yet approved and not a draft (drafts aren't ready for review).
  const pending = live.filter((r) => !r.is_approved && !r.is_draft);
  const approved = live.filter((r) => r.is_approved);
  const drafts = live.filter((r) => !r.is_approved && r.is_draft);

  const actions = {
    onApprove: doApprove, onPin: doPin, onDelete: doDelete, onHardDelete: doHardDelete,
  };

  return (
    <div style={{ marginTop: 28 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search project name…"
          aria-label="Search projects"
          style={inputStyle}
        />
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--muted)", cursor: "pointer" }}>
          <input type="checkbox" checked={showApproved} onChange={(e) => setShowApproved(e.target.checked)} />
          Show approved
        </label>
      </div>

      {state === "loading" && (
        <div style={{ color: "var(--muted)", fontSize: 14 }}>
          <span className="ch-spin" aria-hidden style={{ marginRight: 8 }}>◠</span>
          Loading the queue…
        </div>
      )}
      {state === "error" && (
        <div style={{ color: "var(--terra)", fontSize: 14 }}>Couldn't load projects. Refresh to try again.</div>
      )}

      {state === "ready" && (
        <>
          <Section
            label={`Pending approval · ${pending.length}`}
            hint="Approve to make public"
            emptyTitle="Queue's clear."
            emptyBody="No projects waiting for a nod right now — nicely done."
            items={pending}
            busyId={busyId}
            isSuper={isSuper}
            {...actions}
          />

          {drafts.length > 0 && (
            <Section
              label={`Drafts · ${drafts.length}`}
              hint="Not submitted yet"
              items={drafts}
              busyId={busyId}
              isSuper={isSuper}
              {...actions}
            />
          )}

          {showApproved && (
            <Section
              label={`Live · ${approved.length}`}
              hint="Approved & public"
              emptyTitle="Nothing live yet."
              emptyBody="Approved projects will show up here once you start clearing the queue."
              items={approved}
              busyId={busyId}
              isSuper={isSuper}
              {...actions}
            />
          )}
        </>
      )}

      {state === "ready" && (skip > 0 || hasMore) && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 22 }}>
          <button type="button" className="ch-btn-ghost" disabled={skip === 0}
            onClick={() => load(Math.max(0, skip - PAGE_SIZE), search.trim())}>← Previous</button>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)" }}>
            {skip + 1}–{skip + rows.length}
          </span>
          <button type="button" className="ch-btn-ghost" disabled={!hasMore}
            onClick={() => load(skip + PAGE_SIZE, search.trim())}>Next →</button>
        </div>
      )}

      <Toast />
    </div>
  );
}

function Section({ label, hint, emptyTitle, emptyBody, items, busyId, isSuper, onApprove, onPin, onDelete, onHardDelete }) {
  const [page, setPage] = useState(1);
  // Reset to the first page whenever this section's set changes — a search reload,
  // the Show-approved toggle, or items moving between sections on approve/delete.
  useEffect(() => { setPage(1); }, [items.length]);

  return (
    <div style={{ marginTop: 20 }}>
      <div className="ch-slab" style={{ marginBottom: 12 }}>
        <span className="ch-slab-k">{hint}</span>
        <h2>{label}</h2>
        <span className="ch-slab-line" />
      </div>
      {items.length === 0 ? (
        emptyTitle ? (
          <div className="ch-grace" style={{ minHeight: 130 }}>
            <span className="ch-grace-k">All clear</span>
            <div className="ch-grace-t">{emptyTitle}</div>
            <div className="ch-grace-s">{emptyBody}</div>
          </div>
        ) : null
      ) : (
        <>
          {paginate(items, page, PER_PAGE).map((p) => (
            <ProjectRow
              key={p.id}
              p={p}
              isSuper={isSuper}
              busy={busyId === p.id}
              onApprove={() => onApprove(p)}
              onPin={() => onPin(p)}
              onDelete={() => onDelete(p)}
              onHardDelete={() => onHardDelete(p)}
            />
          ))}
          <Pagination page={page} pageSize={PER_PAGE} total={items.length} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}

function ProjectRow({ p, isSuper, busy, onApprove, onPin, onDelete, onHardDelete }) {
  const kind = p.type === "startup" ? "Startup" : "Volunteer";
  return (
    <div
      className="ch-cell"
      style={{ padding: "16px 18px", marginBottom: 10, display: "flex", alignItems: "center", gap: 16 }}
    >
      <a href={`/p/${p.id}`} style={{ textDecoration: "none", minWidth: 240, flex: "1 1 240px" }}>
        <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16, color: "var(--text)" }}>
          {p.name}
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)", marginTop: 3 }}>
          {kind} · id {p.id} · by #{p.creator_id}
        </div>
      </a>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", flex: "0 0 auto", minWidth: 130 }}>
        {p.is_approved ? <Pill tone="green">Public</Pill> : <Pill tone="amber">Pending</Pill>}
        {p.is_pinned && <Pill tone="ember">Pinned</Pill>}
        {p.is_draft && <Pill tone="muted">Draft</Pill>}
        {!p.is_active && <Pill tone="muted">Paused</Pill>}
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end", flex: "1 1 auto" }}>
        {p.is_approved ? (
          <ActionBtn onClick={onApprove} busy={busy} title="Revoke approval (hides it again)">Unapprove</ActionBtn>
        ) : (
          <button type="button" onClick={onApprove} disabled={busy} className="ch-btn-primary"
            title="Approve — makes the project public" style={{ padding: "8px 16px", fontSize: 13 }}>
            ✓ Approve
          </button>
        )}
        <ActionBtn onClick={onPin} busy={busy} title="Toggle pin">{p.is_pinned ? "Unpin" : "Pin"}</ActionBtn>
        <ActionBtn onClick={onDelete} busy={busy} tone="terra" title="Soft delete">Delete</ActionBtn>
        {isSuper && (
          <ActionBtn onClick={onHardDelete} busy={busy} tone="terra" title="Permanently delete (super-admin)">
            Hard delete
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
        padding: "7px 12px", fontSize: 12.5,
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

const inputStyle = {
  fontFamily: "var(--font-body)", fontSize: 14, color: "var(--text)",
  background: "var(--surface-2)", border: "1px solid var(--hair)",
  borderRadius: 11, padding: "10px 14px", minWidth: 260, outline: "none",
};
