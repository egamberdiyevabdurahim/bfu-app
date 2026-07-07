"use client";

import { useEffect, useState } from "react";
import { bfu } from "@/lib/client-api";
import { useToast } from "@/components/ui/Toast";
import { Modal, Field, Row, inputStyle, selectStyle } from "@/components/dashboard/AdminEvents";

// Places content management for /dashboard/places — two sections, Schools and
// Learning Centers, which share one body family.
//
// Schools:
//   GET    /admin/schools           (PlaceOut[]: id, name, region_id, group_id,
//                                     group_link, latitude, longitude)
//   POST   /admin/schools           {CreateLocation}
//   PATCH  /admin/schools/{id}      {UpdateGroupConfig}
//   DELETE /admin/schools/{id}      (soft; is_deleted)
// Learning Centers: same shape at /admin/learning-centers[...].
//
// CreateLocation = { name (required), region_id (required), group_id?,
//   group_link?, latitude?, longitude? }.
// UpdateGroupConfig = { group_id?, group_link?, name?, region_id?, latitude?,
//   longitude? } — the backend applies each present field (is-not-None guards),
//   so an edit sends the full current field set. Regions from GET /admin/regions.

const KINDS = [
  { key: "school", label: "Schools", path: "/admin/schools", noun: "school" },
  { key: "lc", label: "Learning Centers", path: "/admin/learning-centers", noun: "learning center" },
];

export default function AdminPlaces() {
  const { showToast, Toast } = useToast();
  const [regions, setRegions] = useState([]);
  const [schools, setSchools] = useState([]);
  const [lcs, setLcs] = useState([]);
  const [state, setState] = useState("loading");
  const [busyId, setBusyId] = useState(null); // `${kind}:${id}`
  const [editing, setEditing] = useState(null); // { kind, place|null }

  useEffect(() => {
    let alive = true;
    Promise.all([
      bfu("/admin/regions").catch(() => []),
      bfu("/admin/schools").catch(() => []),
      bfu("/admin/learning-centers").catch(() => []),
    ])
      .then(([rg, sc, lc]) => {
        if (!alive) return;
        setRegions(Array.isArray(rg) ? rg : []);
        setSchools(Array.isArray(sc) ? sc : []);
        setLcs(Array.isArray(lc) ? lc : []);
        setState("ready");
      })
      .catch(() => alive && setState("error"));
    return () => {
      alive = false;
    };
  }, []);

  const setter = (kind) => (kind === "school" ? setSchools : setLcs);
  const rowsFor = (kind) => (kind === "school" ? schools : lcs);
  const kindMeta = (kind) => KINDS.find((k) => k.key === kind);
  const regionName = (id) => {
    const r = regions.find((x) => x.id === id);
    return r ? r.name_en || r.name_uz || r.name_ru || `Region ${id}` : null;
  };

  async function doDelete(kind, place) {
    const meta = kindMeta(kind);
    if (!window.confirm(`Delete ${meta.noun} "${place.name}"?`)) return;
    const bid = `${kind}:${place.id}`;
    setBusyId(bid);
    const prev = rowsFor(kind);
    setter(kind)((rs) => rs.filter((x) => x.id !== place.id));
    try {
      await bfu(`${meta.path}/${place.id}`, { method: "DELETE" });
      showToast(`${cap(meta.noun)} deleted`);
    } catch (err) {
      setter(kind)(prev);
      showToast(err.message || "Couldn't delete", "err");
    } finally {
      setBusyId(null);
    }
  }

  async function submitForm(kind, payload, id) {
    const meta = kindMeta(kind);
    try {
      if (id == null) {
        const created = await bfu(meta.path, { method: "POST", body: payload });
        setter(kind)((rs) => [...rs, created]);
        showToast(`${cap(meta.noun)} created`);
      } else {
        const updated = await bfu(`${meta.path}/${id}`, { method: "PATCH", body: payload });
        // PATCH returns the updated model; merge what we get, fall back to payload.
        setter(kind)((rs) => rs.map((x) => (x.id === id ? { ...x, ...payload, ...(updated || {}) } : x)));
        showToast(`${cap(meta.noun)} updated`);
      }
      setEditing(null);
    } catch (err) {
      showToast(err.message || "Couldn't save", "err");
    }
  }

  return (
    <div style={{ marginTop: 28 }}>
      {state === "loading" && (
        <div style={{ color: "var(--muted)", fontSize: 14 }}>
          <span className="ch-spin" aria-hidden style={{ marginRight: 8 }}>◠</span>
          Loading places…
        </div>
      )}
      {state === "error" && (
        <div style={{ color: "var(--terra)", fontSize: 14 }}>Couldn't load places. Refresh to try again.</div>
      )}

      {state === "ready" && KINDS.map((k) => (
        <section key={k.key} style={{ marginBottom: 40 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
            <h2 style={{ margin: 0, fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 22, color: "var(--text)" }}>
              {k.label}
            </h2>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)", letterSpacing: "0.08em" }}>
              {rowsFor(k.key).length}
            </span>
            <button
              type="button"
              className="ch-btn-primary"
              onClick={() => setEditing({ kind: k.key, place: null })}
              style={{ padding: "8px 16px", fontSize: 13, marginLeft: "auto" }}
            >
              + New {k.noun}
            </button>
          </div>

          {rowsFor(k.key).length === 0 ? (
            <div className="ch-grace" style={{ minHeight: 130 }}>
              <span className="ch-grace-k">Empty</span>
              <div className="ch-grace-t">No {k.label.toLowerCase()} yet.</div>
              <div className="ch-grace-s">Add one and link its Telegram group so members can find each other locally.</div>
            </div>
          ) : (
            rowsFor(k.key).map((pl) => (
              <div
                key={pl.id}
                className="ch-cell"
                style={{ padding: "14px 18px", marginBottom: 10, display: "flex", alignItems: "center", gap: 16 }}
              >
                <div style={{ flex: "1 1 auto", minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)" }}>#{pl.id}</span>
                    {regionName(pl.region_id) && <Pill tone="muted">{regionName(pl.region_id)}</Pill>}
                    {pl.group_link && <Pill tone="green">Group linked</Pill>}
                    {(pl.latitude != null && pl.longitude != null) && <Pill tone="muted">📍 pinned</Pill>}
                  </div>
                  <div style={{ marginTop: 6, fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15, color: "var(--text)" }}>
                    {pl.name}
                  </div>
                  {pl.group_link && (
                    <a href={pl.group_link} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "var(--amber)", textDecoration: "none" }}>
                      {pl.group_link} ↗
                    </a>
                  )}
                </div>

                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end", flex: "0 0 auto" }}>
                  <ActionBtn onClick={() => setEditing({ kind: k.key, place: pl })} busy={busyId === `${k.key}:${pl.id}`} title="Edit">Edit</ActionBtn>
                  <ActionBtn onClick={() => doDelete(k.key, pl)} busy={busyId === `${k.key}:${pl.id}`} tone="terra" title="Delete">Delete</ActionBtn>
                </div>
              </div>
            ))
          )}
        </section>
      ))}

      {editing && (
        <PlaceDialog
          kind={editing.kind}
          noun={kindMeta(editing.kind).noun}
          place={editing.place}
          regions={regions}
          onCancel={() => setEditing(null)}
          onSubmit={(payload, id) => submitForm(editing.kind, payload, id)}
        />
      )}

      <Toast />
    </div>
  );
}

function PlaceDialog({ kind, noun, place, regions, onCancel, onSubmit }) {
  const isNew = !place;
  const [name, setName] = useState(place?.name || "");
  const [regionId, setRegionId] = useState(place?.region_id ? String(place.region_id) : "");
  const [groupLink, setGroupLink] = useState(place?.group_link || "");
  const [groupId, setGroupId] = useState(place?.group_id != null ? String(place.group_id) : "");
  const [lat, setLat] = useState(place?.latitude != null ? String(place.latitude) : "");
  const [lng, setLng] = useState(place?.longitude != null ? String(place.longitude) : "");
  const [saving, setSaving] = useState(false);

  const regionName = (r) => r.name_en || r.name_uz || r.name_ru || `Region ${r.id}`;

  async function handleSave() {
    if (!name.trim()) return;
    if (!regionId) return; // region_id is required for both create and (safely) edit
    setSaving(true);
    // CreateLocation on POST / UpdateGroupConfig on PATCH share these keys; the
    // backend guards each field, so sending the full present set is safe both ways.
    const payload = {
      name: name.trim(),
      region_id: Number(regionId),
      group_id: groupId.trim() ? Number(groupId) : null,
      group_link: groupLink.trim() || null,
      latitude: lat.trim() ? Number(lat) : null,
      longitude: lng.trim() ? Number(lng) : null,
    };
    await onSubmit(payload, isNew ? null : place.id);
    setSaving(false);
  }

  return (
    <Modal label={isNew ? `New ${noun}` : `Edit ${noun} #${place.id}`} onCancel={onCancel}>
      <div className="ch-cell-label" style={{ marginBottom: 6 }}>{isNew ? `New ${noun}` : `Edit ${noun}`}</div>
      <h2 style={{ margin: "0 0 16px", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 22, color: "var(--text)" }}>
        {isNew ? `Add a ${noun}` : name || `${cap(noun)} #${place.id}`}
      </h2>

      <Row>
        <Field label="Name *">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={`${cap(noun)} name`} style={{ ...inputStyle, width: "100%" }} />
        </Field>
        <Field label="Region *">
          <select value={regionId} onChange={(e) => setRegionId(e.target.value)} style={{ ...selectStyle, width: "100%" }}>
            <option value="">Choose a region…</option>
            {regions.map((r) => <option key={r.id} value={r.id}>{regionName(r)}</option>)}
          </select>
        </Field>
      </Row>

      <Field label="Telegram group link">
        <input value={groupLink} onChange={(e) => setGroupLink(e.target.value)} placeholder="https://t.me/…" style={{ ...inputStyle, width: "100%" }} />
      </Field>

      <Row>
        <Field label="Telegram group ID">
          <input value={groupId} onChange={(e) => setGroupId(e.target.value)} placeholder="-100…" style={{ ...inputStyle, width: "100%" }} />
        </Field>
        <Field label="Latitude">
          <input value={lat} onChange={(e) => setLat(e.target.value)} placeholder="41.31" style={{ ...inputStyle, width: "100%" }} />
        </Field>
        <Field label="Longitude">
          <input value={lng} onChange={(e) => setLng(e.target.value)} placeholder="69.24" style={{ ...inputStyle, width: "100%" }} />
        </Field>
      </Row>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
        <button type="button" className="ch-btn-ghost" onClick={onCancel} disabled={saving}>Cancel</button>
        <button type="button" className="ch-btn-primary" onClick={handleSave} disabled={saving || !name.trim() || !regionId}>
          {saving ? "Saving…" : isNew ? `Create ${noun}` : "Save changes"}
        </button>
      </div>
    </Modal>
  );
}

function cap(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
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
