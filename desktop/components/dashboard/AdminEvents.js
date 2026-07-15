"use client";

import { useEffect, useState } from "react";
import { bfu } from "@/lib/client-api";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/components/i18n/LocaleProvider";
import { fmtDate, toTashkentInput, fromTashkentInput } from "@/lib/datetime";
import EventFormBuilder from "@/components/dashboard/EventFormBuilder";
import EventResponses from "@/components/dashboard/EventResponses";

// Events content management. Powers BOTH the admin console (/dashboard/events)
// and the partner panel (/partner) — the ONLY difference is the props.
//
// BASE IS A PROP, NOT A CONSTANT. Everything routes through `apiBase` (default
// "/admin"; the partner panel passes "/partner"). The partner's own /partner/*
// router scopes every route to its org, so the SAME component, pointed at a
// different base, becomes a per-org panel over only that org's events.
//
// Loads GET {apiBase}/events (EventOut[]) — the backend floats pending
// (unapproved) events to the top, then newest first, up to 200. EventOut = {
// id, type, title, description, link, cover_url, deadline, starts_at, capacity,
// region_id, partner_id, is_approved, is_deleted, has_form }. Actions:
//   - create   POST   {apiBase}/events   {EventBody}
//              (admin: is_approved:true · partner: is_approved:FALSE → moderation)
//   - edit     PATCH  {apiBase}/events/{id} {EventBody}
//   - approve  PATCH  {apiBase}/events/{id}/approve   (ADMIN only — canApprove)
//              Makes the event VISIBLE only. It does NOT message anyone.
//   - announce POST   {apiBase}/events/{id}/announce  (ADMIN only, console-only)
//              The ONLY action that reaches chats: DMs matching members + posts
//              the group card. Never auto-fires — an admin has to press it. A
//              second press 409s unless ?force=true (re-announce). Partners have
//              no such route, so the button is admin-console only.
//   - delete   DELETE {apiBase}/events/{id}           (soft; canDelete)
//
// EventBody = { type (required), title (required), description?, link?,
// cover_url?, starts_at?, deadline? (ISO datetime), region_id?, partner_id?,
// capacity?, form_schema? }. Region options come from `regionsPath` (admin:
// /admin/regions · partner: the public /regions); partner options from
// `partnersPath` (null → the org picker is hidden, the partner is its own org).
// Optimistic + toast; confirm on delete.
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

// Event datetimes arrive as NAIVE UTC; the edit form's datetime-local inputs must
// show the Tashkent wall-clock (not the browser's), and the list must render in
// Tashkent — both go through lib/datetime so a re-save can't drift the instant.
function fmtDeadline(iso) {
  return fmtDate(iso) || null;
}

// Does this event carry a registration form? `has_form` is the authoritative
// flag from EventOut; form_schema is only present on rows we've just written, so
// it's a same-session shortcut, not a fallback.
function hasForm(e) {
  if (Array.isArray(e.form_schema)) return e.form_schema.length > 0;
  return e.has_form === true;
}

// Resolve an event's targeted regions to an id array. Prefer the new region_ids
// (multi-region); fall back to the legacy single region_id when region_ids is
// null/absent. Empty array = "all regions / unlimited".
function regionIdsOf(e) {
  if (Array.isArray(e?.region_ids) && e.region_ids.length) return e.region_ids;
  return e?.region_id ? [e.region_id] : [];
}

// Coerce the capacity input to what EventBody wants: null (unlimited) or a
// non-negative integer. Empty or non-numeric → null (never NaN over the wire).
function capacityValue(raw) {
  const s = String(raw ?? "").trim();
  if (s === "") return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.trunc(n));
}

export default function AdminEvents({
  // "/admin" (console) or "/partner" (per-org panel). Every fetch below is
  // `${apiBase}/events...` — no hardcoded "/admin".
  apiBase = "/admin",
  // Region options: admins hit /admin/regions; partners the public /regions.
  regionsPath = "/admin/regions",
  // Org options for the picker. null hides it (the partner IS its own org, and
  // the backend forces partner_id server-side).
  partnersPath = "/admin/partners",
  // Single-event read (form_schema) handed to the form/response children.
  // Default is the public, approved-only /events/{id}; partner passes a scoped
  // reader so a pending event still loads.
  readEventPath = (id) => `/events/${id}`,
  // ADMIN-only affordances. A partner can create/edit its own events but can't
  // self-approve (moderation) or delete (no such /partner route).
  canApprove = true,
  canDelete = true,
  // "admin" | "partner" — flips copy + the prominent "pending review" callout.
  variant = "admin",
} = {}) {
  const t = useT();
  const { showToast, Toast } = useToast();
  const isPartner = variant === "partner";
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
      bfu(`${apiBase}/events`).catch(() => []),
      bfu(regionsPath).catch(() => []),
      // The org picker is hidden for partners → don't fetch a list nobody sees.
      partnersPath ? bfu(partnersPath).catch(() => []) : Promise.resolve([]),
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
  }, [apiBase, regionsPath, partnersPath]);

  const regionName = (id) => {
    const r = regions.find((x) => x.id === id);
    return r ? r.name_en || r.name_uz || r.name_ru || `Region ${id}` : null;
  };
  const partnerName = (id) => {
    const p = partners.find((x) => x.id === id);
    return p ? p.name : null;
  };
  // Row summary of who an event targets. Empty (null/[]) → every region; else the
  // names of the targeted regions (or a count when there are many), resolved via
  // the already-fetched regions list.
  const regionSummary = (e) => {
    const ids = regionIdsOf(e);
    if (ids.length === 0) return "🌐 All regions";
    const names = ids.map(regionName).filter(Boolean);
    if (names.length === 0) return `${ids.length} region${ids.length > 1 ? "s" : ""}`;
    if (names.length <= 2) return names.join(", ");
    return `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
  };

  async function doApprove(e) {
    setBusyId(e.id);
    setRows((rs) => rs.map((x) => (x.id === e.id ? { ...x, is_approved: true } : x)));
    try {
      const res = await bfu(`${apiBase}/events/${e.id}/approve`, { method: "PATCH" });
      if (res && typeof res.is_approved === "boolean") {
        setRows((rs) => rs.map((x) => (x.id === e.id ? { ...x, ...res } : x)));
      }
      // Approve only makes it visible — it no longer touches anyone's chat. The
      // toast tells the admin the announce step is theirs to press.
      showToast("Approved — now press Announce to notify members");
    } catch (err) {
      setRows((rs) => rs.map((x) => (x.id === e.id ? { ...x, is_approved: e.is_approved } : x)));
      showToast(err.message || "Couldn't approve", "err");
    } finally {
      setBusyId(null);
    }
  }

  // The ONE button that reaches members' chats: DMs matching members + posts the
  // group card (which itself routes through the TG management-approval queue).
  // Admin-only — a partner has no /partner/announce route, so this is never
  // rendered in the partner panel. `force` re-announces an already-sent event.
  async function doAnnounce(e, force = false) {
    const first = !e.announced_at;
    const msg = first
      ? `Announce "${e.title}" to members?\n\nThis DMs every matching member and posts the event to the group (pending management approval). It can't be un-sent.`
      : `Re-announce "${e.title}"?\n\nEvery matching member will be messaged again.`;
    if (!window.confirm(msg)) return;
    setBusyId(e.id);
    try {
      const res = await bfu(`${apiBase}/events/${e.id}/announce${force ? "?force=true" : ""}`, { method: "POST" });
      if (res && typeof res === "object") {
        setRows((rs) => rs.map((x) => (x.id === e.id ? { ...x, ...res } : x)));
      }
      showToast(first ? "Announced to members" : "Re-announced");
    } catch (err) {
      showToast(err.message || "Couldn't announce", "err");
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
      await bfu(`${apiBase}/events/${e.id}`, { method: "DELETE" });
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
        const created = await bfu(`${apiBase}/events`, { method: "POST", body: payload });
        setRows((rs) => [created, ...rs]);
        // Partner-created events land unapproved → say "submitted for review",
        // not "created", so the moderation step is never a surprise.
        showToast(isPartner ? t("partner.events.submitted") : "Event created");
      } else {
        const updated = await bfu(`${apiBase}/events/${id}`, { method: "PATCH", body: payload });
        setRows((rs) => rs.map((x) => (x.id === id ? { ...x, ...updated } : x)));
        showToast(isPartner ? t("partner.events.updated") : "Event updated");
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
          {isPartner ? `+ ${t("partner.events.new")}` : "+ New event"}
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
          <span className="ch-grace-k">{isPartner ? t("partner.events.empty_k") : "Nothing yet"}</span>
          <div className="ch-grace-t">{isPartner ? t("partner.events.empty_t") : "No events."}</div>
          <div className="ch-grace-s">
            {isPartner
              ? t("partner.events.empty_s")
              : "Create one, then press Announce to DM matching members and post it to the group."}
          </div>
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
              {/* State of the explicit announce step: once sent, admins see it
                  was reached to chats (and the button flips to Re-announce). */}
              {e.is_approved && (e.announced_at
                ? <Pill tone="green">📣 Announced</Pill>
                : (!isPartner && <Pill tone="amber">Not announced</Pill>))}
              {hasForm(e) && (
                <Pill tone="ember">
                  ▤ {t("dash.events.has_form")}
                  {Array.isArray(e.form_schema) ? ` · ${e.form_schema.length}` : ""}
                </Pill>
              )}
              {e.capacity != null && (
                <Pill tone={typeof e.seats_left === "number" && e.seats_left <= 0 ? "terra" : "green"}>
                  ◎ {(e.going_count ?? 0)}/{e.capacity}
                  {typeof e.waitlist_count === "number" && e.waitlist_count > 0
                    ? ` · +${e.waitlist_count}`
                    : ""}
                </Pill>
              )}
              <Pill tone="muted">{regionSummary(e)}</Pill>
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
              {e.location && (
                <span style={{ fontSize: 12, color: "var(--muted)" }}>📍 {e.location}</span>
              )}
              {fmtDeadline(e.deadline) && (
                <span style={{ fontSize: 12, color: "var(--muted)" }}>⏰ {fmtDeadline(e.deadline)}</span>
              )}
              {e.link && (
                <a href={e.link} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "var(--amber)", textDecoration: "none" }}>
                  Link ↗
                </a>
              )}
            </div>

            {/* Requirement #4: a partner can't approve their own event, so make
                the moderation gate explicit and reassuring on every pending row —
                not just the small "Pending" pill above. */}
            {isPartner && !e.is_approved && (
              <div
                style={{
                  marginTop: 10,
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                  padding: "9px 12px",
                  borderRadius: 10,
                  border: "1px solid rgba(232,161,92,0.35)",
                  background: "rgba(232,161,92,0.08)",
                  maxWidth: 620,
                }}
              >
                <span aria-hidden style={{ color: "var(--amber)", fontSize: 13, lineHeight: 1.5 }}>◷</span>
                <div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--amber)" }}>
                    {t("partner.events.pending_k")}
                  </div>
                  <div style={{ marginTop: 3, fontSize: 12.5, color: "var(--muted-strong)", lineHeight: 1.5 }}>
                    {t("partner.events.pending_note")}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end", flex: "0 0 auto" }}>
            {canApprove && !e.is_approved && (
              <ActionBtn onClick={() => doApprove(e)} busy={busyId === e.id} title="Make the event visible in the app (does not message anyone)">✓ Approve</ActionBtn>
            )}
            {/* Explicit reach-members action — admin console only. Approve makes
                the event visible; Announce is the deliberate second press that
                actually DMs members + posts to the group. */}
            {!isPartner && e.is_approved && !e.announced_at && (
              <ActionBtn onClick={() => doAnnounce(e, false)} busy={busyId === e.id} tone="ember" title="DM matching members + post the event to the group">
                📢 Announce
              </ActionBtn>
            )}
            {!isPartner && e.is_approved && e.announced_at && (
              <ActionBtn onClick={() => doAnnounce(e, true)} busy={busyId === e.id} title="Already announced — click to message matching members again">
                📣 Re-announce
              </ActionBtn>
            )}
            <ActionBtn onClick={() => setFormFor(e)} busy={busyId === e.id} title={t("dash.events.form_title")}>
              ▤ {t("dash.events.form_btn")}
            </ActionBtn>
            {hasForm(e) && (
              <ActionBtn onClick={() => setRespFor(e)} busy={busyId === e.id} title={t("dash.events.responses_title")}>
                {t("dash.events.responses_btn")}
              </ActionBtn>
            )}
            <ActionBtn onClick={() => setEditing(e)} busy={busyId === e.id} title="Edit this event">
              {isPartner ? t("partner.events.edit") : "Edit"}
            </ActionBtn>
            {canDelete && (
              <ActionBtn onClick={() => doDelete(e)} busy={busyId === e.id} tone="terra" title="Delete this event">Delete</ActionBtn>
            )}
          </div>
        </div>
      ))}

      {editing && (
        <EventDialog
          event={editing === "new" ? null : editing}
          regions={regions}
          partners={partners}
          // Hide the org picker for a partner — it's its own org, forced server-side.
          showPartner={!!partnersPath}
          onCancel={() => setEditing(null)}
          onSubmit={submitForm}
        />
      )}

      {formFor && (
        <EventFormBuilder
          event={formFor}
          showToast={showToast}
          apiBase={apiBase}
          readEventPath={readEventPath}
          onClose={() => setFormFor(null)}
          // The builder hands back the saved row (+ has_form/form_schema) so the
          // pill and the Responses button update without a reload.
          onSaved={(saved) =>
            setRows((rs) => rs.map((x) => (x.id === formFor.id ? { ...x, ...saved } : x)))
          }
        />
      )}

      {respFor && (
        <EventResponses
          event={respFor}
          showToast={showToast}
          apiBase={apiBase}
          readEventPath={readEventPath}
          onClose={() => setRespFor(null)}
        />
      )}

      <Toast />
    </div>
  );
}

function EventDialog({ event, regions, partners, showPartner = true, onCancel, onSubmit }) {
  const isNew = !event;
  const [type, setType] = useState(event?.type || "hackathon");
  const [title, setTitle] = useState(event?.title || "");
  const [description, setDescription] = useState(event?.description || "");
  const [link, setLink] = useState(event?.link || "");
  const [coverUrl, setCoverUrl] = useState(event?.cover_url || "");
  const [location, setLocation] = useState(event?.location || "");
  const [startsAt, setStartsAt] = useState(toTashkentInput(event?.starts_at));
  const [deadline, setDeadline] = useState(toTashkentInput(event?.deadline));
  // Multi-region targeting. Seed from the event's region_ids (fall back to the
  // legacy single region_id). No specific regions → "All regions (unlimited)".
  const seedRegionIds = regionIdsOf(event).map(Number);
  const [allRegions, setAllRegions] = useState(seedRegionIds.length === 0);
  const [regionIds, setRegionIds] = useState(seedRegionIds);
  const [partnerId, setPartnerId] = useState(event?.partner_id ? String(event.partner_id) : "");
  // Max "going" attendees. Blank = unlimited. Beyond it, RSVPs are waitlisted
  // (enforced server-side) and auto-promoted when a seat frees up.
  const [capacity, setCapacity] = useState(event?.capacity != null ? String(event.capacity) : "");
  const [saving, setSaving] = useState(false);

  const regionName = (r) => r.name_en || r.name_uz || r.name_ru || `Region ${r.id}`;

  const toggleRegion = (id) =>
    setRegionIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

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
      // Free-text venue (e.g. "Tashkent, Marstiff HQ"). Trim; null when empty.
      location: location.trim() || null,
      // Two distinct datetimes: starts_at = when the event happens; deadline =
      // the signup cutoff. Interpret the input's wall-clock as Tashkent (fixed
      // +05:00) → UTC ISO, so the stored instant is correct on any browser tz.
      starts_at: fromTashkentInput(startsAt),
      deadline: fromTashkentInput(deadline),
      // Multi-region targeting. "All regions" ON → [] (unlimited); otherwise the
      // picked ids. The backend derives the legacy single region_id itself, so we
      // no longer send region_id.
      region_ids: allRegions ? [] : regionIds,
      partner_id: partnerId ? Number(partnerId) : null,
      // Blank → unlimited (null). Otherwise a non-negative whole number; garbage
      // (non-numeric) also falls back to null rather than sending NaN.
      capacity: capacityValue(capacity),
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

      <Field label="Location">
        <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Tashkent, Marstiff HQ" style={{ ...inputStyle, width: "100%" }} />
      </Field>

      {/* Multi-region targeting. "All regions" is an explicit unlimited toggle;
          when it's ON the per-region checkboxes are greyed/disabled. Otherwise
          pick any subset — the picked ids ride the payload as region_ids. */}
      <Field label="Target regions">
        <label style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer", marginBottom: 8 }}>
          <input
            type="checkbox"
            checked={allRegions}
            onChange={(e) => setAllRegions(e.target.checked)}
            style={{ width: 16, height: 16, accentColor: "var(--amber)", cursor: "pointer" }}
          />
          <span style={{ fontSize: 13.5, color: "var(--text)" }}>All regions (unlimited)</span>
        </label>
        <div
          aria-disabled={allRegions}
          style={{
            display: "flex", flexDirection: "column", gap: 2,
            maxHeight: 176, overflowY: "auto",
            border: "1px solid var(--hair)", borderRadius: 11,
            background: "var(--surface-2)", padding: "6px 4px",
            opacity: allRegions ? 0.45 : 1,
            pointerEvents: allRegions ? "none" : "auto",
          }}
        >
          {regions.length === 0 && (
            <span style={{ fontSize: 12.5, color: "var(--muted)", padding: "6px 10px" }}>No regions available.</span>
          )}
          {regions.map((r) => {
            const on = !allRegions && regionIds.includes(r.id);
            return (
              <label
                key={r.id}
                style={{
                  display: "flex", alignItems: "center", gap: 9,
                  padding: "7px 10px", borderRadius: 8, cursor: allRegions ? "default" : "pointer",
                  background: on ? "rgba(232,161,92,0.08)" : "transparent",
                }}
              >
                <input
                  type="checkbox"
                  checked={on}
                  disabled={allRegions}
                  onChange={() => toggleRegion(r.id)}
                  style={{ width: 15, height: 15, accentColor: "var(--amber)", cursor: allRegions ? "default" : "pointer" }}
                />
                <span style={{ fontSize: 13.5, color: on ? "var(--text)" : "var(--muted-strong)" }}>{regionName(r)}</span>
              </label>
            );
          })}
        </div>
      </Field>

      <Row>
        {/* Hidden in the partner panel — a partner IS its org, and the backend
            forces partner_id server-side, so there's nothing to pick. */}
        {showPartner && (
          <Field label="Partner">
            <select value={partnerId} onChange={(e) => setPartnerId(e.target.value)} style={{ ...selectStyle, width: "100%" }}>
              <option value="">None</option>
              {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
        )}
        {/* Optional seat cap. Blank = unlimited. Full events waitlist new RSVPs. */}
        <Field label="Capacity (seats)">
          <input
            type="number"
            min="0"
            inputMode="numeric"
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            placeholder="Unlimited"
            style={{ ...inputStyle, width: "100%" }}
          />
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
  const toneStyle =
    tone === "terra" ? { borderColor: "rgba(192,86,59,0.5)", color: "var(--terra)" } :
    tone === "ember" ? { borderColor: "var(--ember)", color: "var(--ember)" } :
    {};
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
        ...toneStyle,
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
