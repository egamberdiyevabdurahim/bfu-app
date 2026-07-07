"use client";

import { useEffect, useState } from "react";
import { bfu } from "@/lib/client-api";
import { useToast } from "@/components/ui/Toast";
import { Modal, Field, Row, inputStyle, selectStyle } from "@/components/dashboard/AdminEvents";

// Partner-organisation content management for /dashboard/partners.
//
// Loads GET /admin/partners (PartnerOut[]: id, name, about, website, logo_url,
// region_id, owner_user_id, verified, is_deleted) — non-deleted, newest first.
// Actions (all get_admin_user):
//   - create  POST   /admin/partners   {PartnerBody}
//   - edit    PATCH  /admin/partners/{id} {PartnerBody}  (backend model_dump exclude_unset)
//   - delete  DELETE /admin/partners/{id}                (soft; is_deleted)
//
// PartnerBody = { name (required), about?, website?, logo_url?, region_id?,
// owner_user_id?, verified? (default true) }. Regions from GET /admin/regions.

export default function AdminPartners() {
  const { showToast, Toast } = useToast();
  const [rows, setRows] = useState([]);
  const [regions, setRegions] = useState([]);
  const [state, setState] = useState("loading");
  const [busyId, setBusyId] = useState(null);
  const [editing, setEditing] = useState(null); // partner | "new" | null

  useEffect(() => {
    let alive = true;
    Promise.all([
      bfu("/admin/partners").catch(() => []),
      bfu("/admin/regions").catch(() => []),
    ])
      .then(([pt, rg]) => {
        if (!alive) return;
        setRows(Array.isArray(pt) ? pt : []);
        setRegions(Array.isArray(rg) ? rg : []);
        setState("ready");
      })
      .catch(() => alive && setState("error"));
    return () => {
      alive = false;
    };
  }, []);

  const regionName = (id) => {
    const r = regions.find((x) => x.id === id);
    return r ? r.name_en || r.name_uz || r.name_ru || `Region ${id}` : null;
  };

  async function doDelete(p) {
    if (!window.confirm(`Delete partner "${p.name}"?`)) return;
    setBusyId(p.id);
    const prev = rows;
    setRows((rs) => rs.filter((x) => x.id !== p.id));
    try {
      await bfu(`/admin/partners/${p.id}`, { method: "DELETE" });
      showToast("Partner deleted");
    } catch (err) {
      setRows(prev);
      showToast(err.message || "Couldn't delete", "err");
    } finally {
      setBusyId(null);
    }
  }

  async function submitForm(payload, id) {
    try {
      if (id == null) {
        const created = await bfu("/admin/partners", { method: "POST", body: payload });
        setRows((rs) => [created, ...rs]);
        showToast("Partner created");
      } else {
        const updated = await bfu(`/admin/partners/${id}`, { method: "PATCH", body: payload });
        setRows((rs) => rs.map((x) => (x.id === id ? { ...x, ...updated } : x)));
        showToast("Partner updated");
      }
      setEditing(null);
    } catch (err) {
      showToast(err.message || "Couldn't save", "err");
    }
  }

  return (
    <div style={{ marginTop: 28 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
        <button type="button" className="ch-btn-primary" onClick={() => setEditing("new")} style={{ padding: "9px 18px" }}>
          + New partner
        </button>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)", letterSpacing: "0.08em" }}>
          {state === "ready" ? `${rows.length} shown` : ""}
        </span>
      </div>

      {state === "loading" && (
        <div style={{ color: "var(--muted)", fontSize: 14 }}>
          <span className="ch-spin" aria-hidden style={{ marginRight: 8 }}>◠</span>
          Loading partners…
        </div>
      )}
      {state === "error" && (
        <div style={{ color: "var(--terra)", fontSize: 14 }}>Couldn't load partners. Refresh to try again.</div>
      )}

      {state === "ready" && rows.length === 0 && (
        <div className="ch-grace" style={{ minHeight: 160 }}>
          <span className="ch-grace-k">Nothing yet</span>
          <div className="ch-grace-t">No partner organisations.</div>
          <div className="ch-grace-s">Add universities, companies, and NGOs that host events and back projects.</div>
        </div>
      )}

      {state === "ready" && rows.map((p) => (
        <div
          key={p.id}
          className="ch-cell"
          style={{ padding: "16px 18px", marginBottom: 10, display: "flex", alignItems: "center", gap: 16 }}
        >
          {p.logo_url ? (
            <img
              src={p.logo_url}
              alt=""
              style={{ width: 42, height: 42, borderRadius: 10, objectFit: "cover", flex: "0 0 auto", background: "var(--surface-2)" }}
            />
          ) : (
            <div
              style={{
                width: 42, height: 42, borderRadius: 10, flex: "0 0 auto",
                background: "var(--surface-2)", border: "1px solid var(--hair)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 16, color: "var(--amber)",
              }}
            >
              {(p.name || "?").slice(0, 1).toUpperCase()}
            </div>
          )}

          <div style={{ flex: "1 1 auto", minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)" }}>#{p.id}</span>
              {p.verified ? <Pill tone="green">✓ Verified</Pill> : <Pill tone="muted">Unverified</Pill>}
              {p.region_id && regionName(p.region_id) && <Pill tone="muted">{regionName(p.region_id)}</Pill>}
            </div>
            <div style={{ marginTop: 6, fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16, color: "var(--text)" }}>
              {p.name}
            </div>
            {p.about && (
              <div style={{ marginTop: 4, fontSize: 13.5, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 560 }}>
                {p.about}
              </div>
            )}
            {p.website && (
              <a href={p.website} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "var(--amber)", textDecoration: "none" }}>
                {p.website} ↗
              </a>
            )}
          </div>

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end", flex: "0 0 auto" }}>
            <ActionBtn onClick={() => setEditing(p)} busy={busyId === p.id} title="Edit this partner">Edit</ActionBtn>
            <ActionBtn onClick={() => doDelete(p)} busy={busyId === p.id} tone="terra" title="Delete this partner">Delete</ActionBtn>
          </div>
        </div>
      ))}

      {editing && (
        <PartnerDialog
          partner={editing === "new" ? null : editing}
          regions={regions}
          onCancel={() => setEditing(null)}
          onSubmit={submitForm}
        />
      )}

      <Toast />
    </div>
  );
}

function PartnerDialog({ partner, regions, onCancel, onSubmit }) {
  const isNew = !partner;
  const [name, setName] = useState(partner?.name || "");
  const [about, setAbout] = useState(partner?.about || "");
  const [website, setWebsite] = useState(partner?.website || "");
  const [logoUrl, setLogoUrl] = useState(partner?.logo_url || "");
  const [regionId, setRegionId] = useState(partner?.region_id ? String(partner.region_id) : "");
  const [verified, setVerified] = useState(partner?.verified ?? true);
  const [saving, setSaving] = useState(false);

  const regionName = (r) => r.name_en || r.name_uz || r.name_ru || `Region ${r.id}`;

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    const payload = {
      name: name.trim(),
      about: about.trim() || null,
      website: website.trim() || null,
      logo_url: logoUrl.trim() || null,
      region_id: regionId ? Number(regionId) : null,
      verified,
    };
    await onSubmit(payload, isNew ? null : partner.id);
    setSaving(false);
  }

  return (
    <Modal label={isNew ? "New partner" : `Edit partner #${partner.id}`} onCancel={onCancel}>
      <div className="ch-cell-label" style={{ marginBottom: 6 }}>{isNew ? "New partner" : "Edit partner"}</div>
      <h2 style={{ margin: "0 0 16px", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 22, color: "var(--text)" }}>
        {isNew ? "Add a partner" : name || `Partner #${partner.id}`}
      </h2>

      <Field label="Name *">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Organisation name" style={{ ...inputStyle, width: "100%" }} />
      </Field>

      <Field label="About">
        <textarea value={about} onChange={(e) => setAbout(e.target.value)} rows={3} placeholder="What does this organisation do?" style={{ ...inputStyle, width: "100%", resize: "vertical" }} />
      </Field>

      <Row>
        <Field label="Website">
          <input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://…" style={{ ...inputStyle, width: "100%" }} />
        </Field>
        <Field label="Logo URL">
          <input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://…" style={{ ...inputStyle, width: "100%" }} />
        </Field>
      </Row>

      <Row>
        <Field label="Region">
          <select value={regionId} onChange={(e) => setRegionId(e.target.value)} style={{ ...selectStyle, width: "100%" }}>
            <option value="">None</option>
            {regions.map((r) => <option key={r.id} value={r.id}>{regionName(r)}</option>)}
          </select>
        </Field>
        <Field label="Verified">
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "var(--muted)", cursor: "pointer", padding: "10px 0" }}>
            <input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} />
            Show a verified badge
          </label>
        </Field>
      </Row>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
        <button type="button" className="ch-btn-ghost" onClick={onCancel} disabled={saving}>Cancel</button>
        <button type="button" className="ch-btn-primary" onClick={handleSave} disabled={saving || !name.trim()}>
          {saving ? "Saving…" : isNew ? "Create partner" : "Save changes"}
        </button>
      </div>
    </Modal>
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
