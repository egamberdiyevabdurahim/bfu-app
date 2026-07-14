"use client";

import { useEffect, useState } from "react";
import { bfu } from "@/lib/client-api";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/components/i18n/LocaleProvider";
import EventFormBuilder from "@/components/dashboard/EventFormBuilder";
import EventResponses from "@/components/dashboard/EventResponses";

// Events content management for /dashboard/events.
//
// Loads GET /admin/events (EventOut[]) — the backend floats pending
// (unapproved, partner-submitted) events to the top, then newest first, up to
// 200. EventOut = { id, type, title, description, link, cover_url, deadline,
// region_id, partner_id, is_approved, is_deleted, has_form }. Actions (all
// get_admin_user):
//   - create   POST   /admin/events   {EventBody}   (is_approved:true on admin create)
//   - edit     PATCH  /admin/events/{id} {EventBody}
//   - approve  PATCH  /admin/events/{id}/approve    (for pending ones)
//   - delete   DELETE /admin/events/{id}            (soft; sets is_deleted)
//
// EventBody = { type (required), title (required), description?, link?,
// cover_url?, deadline? (ISO datetime), region_id?, partner_id?, form_schema? }.
// Regions for the dropdown come from GET /admin/regions; partners from
// GET /admin/partners (id+name). Optimistic + toast; confirm on delete.
//
// REGISTRATION FORM. An event can carry one (Event.form_schema): the questions a
// member answers when they say "I'm going". Two surfaces hang off each row:
//   - "Form"      → EventFormBuilder  (write the questions; PATCH form_schema)
//   - "Responses" → EventResponses    (read the answers; CSV export)
// The question list is DATA, so changing it never needs a deploy. `has_form` on
// EventOut is what the pill and the Responses button key off.
//
// NOTE for anyone editing EventDialog below: it deliberately does NOT send
// `form_schema`. The backend PATCH applies model_dump(exclude_unset=True), so an
// absent key is left alone — editing an event's title can't wipe its questions.

// Common event "types" — free-form on the backend, so this is just a convenience
// list; the form also accepts anything typed.
const TYPES = ["hackathon", "scholarship", "internship", "workshop", "competition", "conference", "grant", "other"];

// Convert an ISO datetime string (or null) to the value a datetime-local input
// wants ("YYYY-MM-DDTHH:mm"), in local time. Returns "" when absent.
function toLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtDeadline(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}

// Does this event carry a registration form? `has_form` is the authoritative
// flag from EventOut; form_schema is only present on rows we've just written, so
// it's a same-session shortcut, not a fallback.
function hasForm(e) {
  if (Array.isArray(e.form_schema)) return e.form_schema.length > 0;
  return e.has_form === true;
}

export default function AdminEvents() {
  const t = useT();
  const { showToast, Toast } = useToast();
  const [rows, setRows] = useState([]);
  const [regions, setRegions] = useState([]);
  const [partners, setPartners] = useState([]);
  const [state, setState] = useState("loading"); // loading | ready | error
  const [busyId, setBusyId] = useState(null);
  const [editing, setEditing] = useState(null);   // event object | "new" | null
  const [formFor, setFormFor] = useState(null);   // event whose questions we're editing
  const [respFor, setRespFor] = useState(null);   // event whose answers we're reading

  useEffect(() => {
    let alive = true;
    Promise.all([
      bfu("/admin/events").catch(() => []),
      bfu("/admin/regions").catch(() => []),
      bfu("/admin/partners").catch(() => []),
    ])
      .then(([ev, rg, pt]) => {
        if (!alive) return;
        setRows(Array.isArray(ev) ? ev : []);
        setRegions(Array.isArray(rg) ? rg : []);
        setPartners(Array.isArray(pt) ? pt : []);
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
  const partnerName = (id) => {
    const p = partners.find((x) => x.id === id);
    return p ? p.name : null;
  };

  async function doApprove(e) {
    setBusyId(e.id);
    setRows((rs) => rs.map((x) => (x.id === e.id ? { ...x, is_approved: true } : x)));
    try {
      const res = await bfu(`/admin/events/${e.id}/approve`, { method: "PATCH" });
      if (res && typeof res.is_approved === "boolean") {
        setRows((rs) => rs.map((x) => (x.id === e.id ? { ...x, ...res } : x)));
      }
      showToast("Event approved — announced to the group");
    } catch (err) {
      setRows((rs) => rs.map((x) => (x.id === e.id ? { ...x, is_approved: e.is_approved } : x)));
      showToast(err.message || "Couldn't approve", "err");
    } finally {
      setBusyId(null);
    }
  }

  async function doDelete(e) {
    if (!window.confirm(`Delete "${e.title}"? It will be hidden from the app.`)) return;
    setBusyId(e.id);
    const prev = rows;
    setRows((rs) => rs.filter((x) => x.id !== e.id));
    try {
      await bfu(`/admin/events/${e.id}`, { method: "DELETE" });
      showToast("Event deleted");
    } catch (err) {
      setRows(prev);
      showToast(err.message || "Couldn't delete", "err");
    } finally {
      setBusyId(null);
    }
  }

  async function submitForm(payload, id) {
    // id === null → create; else patch.
    try {
      if (id == null) {
        const created = await bfu("/admin/events", { method: "POST", body: payload });
        setRows((rs) => [created, ...rs]);
        showToast("Event created");
      } else {
        const updated = await bfu(`/admin/events/${id}`, { method: "PATCH", body: payload });
        setRows((rs) => rs.map((x) => (x.id === id ? { ...x, ...updated } : x)));
        showToast("Event updated");
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
          + New event
        </button>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)", letterSpacing: "0.08em" }}>
          {state === "ready" ? `${rows.length} shown` : ""}
        </span>
      </div>

      {state === "loading" && (
        <div style={{ color: "var(--muted)", fontSize: 14 }}>
          <span className="ch-spin" aria-hidden style={{ marginRight: 8 }}>◠</span>
          Loading events…
        </div>
      )}
      {state === "error" && (
        <div style={{ color: "var(--terra)", fontSize: 14 }}>Couldn't load events. Refresh to try again.</div>
      )}

      {state === "ready" && rows.length === 0 && (
        <div className="ch-grace" style={{ minHeight: 160 }}>
          <span className="ch-grace-k">Nothing yet</span>
          <div className="ch-grace-t">No events.</div>
          <div className="ch-grace-s">Create one and it'll be announced to the global group with a deep link.</div>
        </div>
      )}

      {state === "ready" && rows.map((e) => (
        <div
          key={e.id}
          className="ch-cell"
          style={{ padding: "16px 18px", marginBottom: 10, display: "flex", alignItems: "center", gap: 16 }}
        >
          <div style={{ flex: "1 1 auto", minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)" }}>#{e.id}</span>
              <Pill tone="ember">{e.type}</Pill>
              {e.is_approved ? <Pill tone="green">Approved</Pill> : <Pill tone="amber">Pending</Pill>}
              {hasForm(e) && (
                <Pill tone="ember">
                  ▤ {t("dash.events.has_form")}
                  {Array.isArray(e.form_schema) ? ` · ${e.form_schema.length}` : ""}
                </Pill>
              )}
              {e.region_id && regionName(e.region_id) && <Pill tone="muted">{regionName(e.region_id)}</Pill>}
              {e.partner_id && partnerName(e.partner_id) && <Pill tone="muted">◆ {partnerName(e.partner_id)}</Pill>}
            </div>
            <div style={{ marginTop: 6, fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16, color: "var(--text)" }}>
              {e.title}
            </div>
            {e.description && (
              <div style={{ marginTop: 4, fontSize: 13.5, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 560 }}>
                {e.description}
              </div>
            )}
            <div style={{ marginTop: 4, display: "flex", gap: 14, flexWrap: "wrap" }}>
              {fmtDeadline(e.deadline) && (
                <span style={{ fontSize: 12, color: "var(--muted)" }}>⏰ {fmtDeadline(e.deadline)}</span>
              )}
              {e.link && (
                <a href={e.link} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "var(--amber)", textDecoration: "none" }}>
                  Link ↗
                </a>
              )}
            </div>
          </div>

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end", flex: "0 0 auto" }}>
            {!e.is_approved && (
              <ActionBtn onClick={() => doApprove(e)} busy={busyId === e.id} title="Approve + announce">✓ Approve</ActionBtn>
            )}
            <ActionBtn onClick={() => setFormFor(e)} busy={busyId === e.id} title={t("dash.events.form_title")}>
              ▤ {t("dash.events.form_btn")}
            </ActionBtn>
            {hasForm(e) && (
              <ActionBtn onClick={() => setRespFor(e)} busy={busyId === e.id} title={t("dash.events.responses_title")}>
                {t("dash.events.responses_btn")}
              </ActionBtn>
            )}
            <ActionBtn onClick={() => setEditing(e)} busy={busyId === e.id} title="Edit this event">Edit</ActionBtn>
            <ActionBtn onClick={() => doDelete(e)} busy={busyId === e.id} tone="terra" title="Delete this event">Delete</ActionBtn>
          </div>
        </div>
      ))}

      {editing && (
        <EventDialog
          event={editing === "new" ? null : editing}
          regions={regions}
          partners={partners}
          onCancel={() => setEditing(null)}
          onSubmit={submitForm}
        />
      )}

      {formFor && (
        <EventFormBuilder
          event={formFor}
          showToast={showToast}
          onClose={() => setFormFor(null)}
          // The builder hands back the saved row (+ has_form/form_schema) so the
          // pill and the Responses button update without a reload.
          onSaved={(saved) =>
            setRows((rs) => rs.map((x) => (x.id === formFor.id ? { ...x, ...saved } : x)))
          }
        />
      )}

      {respFor && (
        <EventResponses event={respFor} showToast={showToast} onClose={() => setRespFor(null)} />
      )}

      <Toast />
    </div>
  );
}

function EventDialog({ event, regions, partners, onCancel, onSubmit }) {
  const isNew = !event;
  const [type, setType] = useState(event?.type || "hackathon");
  const [title, setTitle] = useState(event?.title || "");
  const [description, setDescription] = useState(event?.description || "");
  const [link, setLink] = useState(event?.link || "");
  const [coverUrl, setCoverUrl] = useState(event?.cover_url || "");
  const [startsAt, setStartsAt] = useState(toLocalInput(event?.starts_at));
  const [deadline, setDeadline] = useState(toLocalInput(event?.deadline));
  const [regionId, setRegionId] = useState(event?.region_id ? String(event.region_id) : "");
  const [partnerId, setPartnerId] = useState(event?.partner_id ? String(event.partner_id) : "");
  const [saving, setSaving] = useState(false);

  const regionName = (r) => r.name_en || r.name_uz || r.name_ru || `Region ${r.id}`;

  async function handleSave() {
    if (!title.trim()) return;
    if (!type.trim()) return;
    setSaving(true);
    // Build EventBody. deadline: convert local-datetime back to ISO; null when empty.
    const payload = {
      type: type.trim(),
      title: title.trim(),
      description: description.trim() || null,
      link: link.trim() || null,
      cover_url: coverUrl.trim() || null,
      // Two distinct datetimes: starts_at = when the event happens; deadline =
      // the signup cutoff. Both convert local-datetime → ISO, null when empty.
      starts_at: startsAt ? new Date(startsAt).toISOString() : null,
      deadline: deadline ? new Date(deadline).toISOString() : null,
      region_id: regionId ? Number(regionId) : null,
      partner_id: partnerId ? Number(partnerId) : null,
    };
    await onSubmit(payload, isNew ? null : event.id);
    setSaving(false);
  }

  return (
    <Modal label={isNew ? "New event" : `Edit event #${event.id}`} onCancel={onCancel}>
      <div className="ch-cell-label" style={{ marginBottom: 6 }}>{isNew ? "New event" : "Edit event"}</div>
      <h2 style={{ margin: "0 0 16px", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 22, color: "var(--text)" }}>
        {isNew ? "Add an event" : title || `Event #${event.id}`}
      </h2>

      <Field label="Title *">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Event title" style={{ ...inputStyle, width: "100%" }} />
      </Field>

      <Field label="Type *">
        <input
          value={type}
          onChange={(e) => setType(e.target.value)}
          list="event-types"
          placeholder="e.g. hackathon"
          style={{ ...inputStyle, width: "100%" }}
        />
        <datalist id="event-types">
          {TYPES.map((t) => <option key={t} value={t} />)}
        </datalist>
      </Field>

      {/* The two datetimes side by side so their distinct roles are obvious:
          "Starts at" is when the event actually happens; "Deadline" is the
          signup cutoff. */}
      <Row>
        <Field label="Starts at">
          <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} style={{ ...inputStyle, width: "100%" }} />
        </Field>
        <Field label="Deadline">
          <input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} style={{ ...inputStyle, width: "100%" }} />
        </Field>
      </Row>

      <Field label="Description">
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="What is this event about?" style={{ ...inputStyle, width: "100%", resize: "vertical" }} />
      </Field>

      <Row>
        <Field label="Link">
          <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" style={{ ...inputStyle, width: "100%" }} />
        </Field>
        <Field label="Cover image URL">
          <input value={coverUrl} onChange={(e) => setCoverUrl(e.target.value)} placeholder="https://…" style={{ ...inputStyle, width: "100%" }} />
        </Field>
      </Row>

      <Row>
        <Field label="Region">
          <select value={regionId} onChange={(e) => setRegionId(e.target.value)} style={{ ...selectStyle, width: "100%" }}>
            <option value="">All / none</option>
            {regions.map((r) => <option key={r.id} value={r.id}>{regionName(r)}</option>)}
          </select>
        </Field>
        <Field label="Partner">
          <select value={partnerId} onChange={(e) => setPartnerId(e.target.value)} style={{ ...selectStyle, width: "100%" }}>
            <option value="">None</option>
            {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
      </Row>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
        <button type="button" className="ch-btn-ghost" onClick={onCancel} disabled={saving}>Cancel</button>
        <button type="button" className="ch-btn-primary" onClick={handleSave} disabled={saving || !title.trim() || !type.trim()}>
          {saving ? "Saving…" : isNew ? "Create event" : "Save changes"}
        </button>
      </div>
    </Modal>
  );
}

// ── shared bits (kept local to avoid a premature abstraction) ────────────────

export function Modal({ label, onCancel, children }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onClick={onCancel}
      style={{
        position: "fixed", inset: 0, zIndex: 90,
        background: "rgba(6,5,4,0.7)", backdropFilter: "blur(3px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
        overflowY: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="ch-cell"
        style={{ width: "100%", maxWidth: 560, padding: 28, background: "var(--surface)", margin: "auto" }}
      >
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14, flex: 1, minWidth: 0 }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted)" }}>
        {label}
      </span>
      {children}
    </label>
  );
}

export function Row({ children }) {
  return <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>{children}</div>;
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

export const inputStyle = {
  fontFamily: "var(--font-body)", fontSize: 14, color: "var(--text)",
  background: "var(--surface-2)", border: "1px solid var(--hair)",
  borderRadius: 11, padding: "10px 14px", outline: "none",
};

export const selectStyle = {
  fontFamily: "var(--font-body)", fontSize: 14, color: "var(--text)",
  background: "var(--surface-2)", border: "1px solid var(--hair)",
  borderRadius: 11, padding: "10px 12px", cursor: "pointer",
};
