"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { bfu } from "@/lib/client-api";
import { useToast } from "@/lib/useToast";
import { Toast } from "@/components/ui/Toast";
import { useT, useLang } from "@/components/i18n/LocaleProvider";
import InviteModal from "@/components/InviteModal";
import PhoneInput from "@/components/ui/PhoneInput";
import { isCompletePhone } from "@/lib/phone";

// Event registration form (desktop). An event may carry a `form_schema` — a list
// of questions authored by an admin in the panel, so the questions are DATA and
// changing them never needs a deploy. Members with `has_form` events fill this in
// instead of the plain 1-click RSVP.
//
// Mirrors the Mini App's registration sheet, per the founder's rule that the two
// apps behave identically:
//   • event with NO form  → the existing 1-click RSVP is untouched (this modal is
//                           never mounted for it),
//   • event WITH a form   → "Going" opens this; only a successful
//                           POST /events/{id}/rsvp {status:"going", answers} makes
//                           you going,
//   • "Interested"        → never opens the form,
//   • already registered  → reopen and edit; GET /events/{id}/my-response prefills
//                           and a re-submit OVERWRITES the previous answers.
//
// Shape of the contract this is built against:
//   GET  /events/{id}              → EventOut + form_schema: [{ key, label, type,
//                                    required, options?, section? }]
//   GET  /events/{id}/my-response  → { answers: {...} | null }
//   POST /events/{id}/rsvp         → { status:"going", answers } → { rsvp_count, my_rsvp }
//   DELETE /events/{id}/rsvp       → withdraw (existing endpoint)
//   answers: { q1: "text", q4: ["a","b"] }   — string, or list for checkboxes.
//
// THE SERVER IS THE REAL GATE. The client-side validation below is a courtesy
// (it saves a round-trip and points at the offending field); every rule it
// enforces is enforced again server-side, and a 422 from the server is rendered
// against the exact question it names (`parseServerErrors`, below). We never
// treat a passing client check as permission.
//
// The real form is ~30 questions, so: a wide two-column scrollable panel, a
// progress bar, and — crucially — every keystroke is persisted to localStorage
// keyed by (user, event). An accidental Escape/backdrop click can't destroy
// someone's typing; the draft is restored on reopen and cleared only on a
// successful submit.

const MAX_ANSWER_LEN = 2000; // per answer (per item, for checkbox lists)
const DRAFT_VERSION = 1;
const DRAFT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // a month-old draft is stale

const MULTI_TYPES = new Set(["checkboxes"]);
const CHOICE_TYPES = new Set(["choice", "checkboxes", "dropdown"]);
const KNOWN_TYPES = new Set([
  "text",
  "paragraph",
  "choice",
  "checkboxes",
  "dropdown",
  "number",
  "date",
  "phone",
]);

// A question may carry `prefill: "name"|"surname"|"full_name"|"phone"|"region"|
// "birth_year"` — a hint to seed that answer from the current user's profile
// (GET /users/me) as an ordinary editable value. `full_name` = name + surname;
// `region` resolves to the region NAME (localized) via the regions list;
// `birth_year` becomes a string.
const PREFILL_KINDS = new Set(["name", "surname", "full_name", "phone", "region", "birth_year"]);

function prefillValue(kind, me, regionName) {
  switch (kind) {
    case "name":
      return me?.name ? String(me.name) : "";
    case "surname":
      return me?.surname ? String(me.surname) : "";
    case "full_name":
      return [me?.name, me?.surname].filter(Boolean).join(" ");
    case "phone":
      return me?.phone_number ? String(me.phone_number) : "";
    case "region":
      return regionName || "";
    case "birth_year":
      return me?.birth_year != null ? String(me.birth_year) : "";
    default:
      return "";
  }
}

/* ─────────────────────────── draft persistence ─────────────────────────── */

// Keyed by user AND event: a shared browser must not leak one member's
// half-typed answers into another's form.
function draftKey(meId, eventId) {
  return `bfu:eventform:v${DRAFT_VERSION}:u${meId ?? "anon"}:e${eventId}`;
}

function readDraft(meId, eventId) {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(draftKey(meId, eventId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.answers !== "object" || !parsed.answers) return null;
    if (parsed.at && Date.now() - parsed.at > DRAFT_TTL_MS) return null;
    return parsed.answers;
  } catch {
    // Corrupt/blocked storage is not an error worth showing — just no draft.
    return null;
  }
}

function writeDraft(meId, eventId, answers) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      draftKey(meId, eventId),
      JSON.stringify({ at: Date.now(), answers })
    );
  } catch {
    /* quota / private mode — typing still works, it just isn't recoverable */
  }
}

function clearDraft(meId, eventId) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(draftKey(meId, eventId));
  } catch {
    /* ignore */
  }
}

/* ──────────────────────────── schema helpers ───────────────────────────── */

const isMulti = (type) => MULTI_TYPES.has(type);
const emptyFor = (q) => (isMulti(q.type) ? [] : "");

function isAnswered(v) {
  if (Array.isArray(v)) return v.length > 0;
  return String(v ?? "").trim() !== "";
}

// Only questions the schema actually declares, with a usable key. A malformed
// entry from the admin panel is skipped rather than crashing the whole form.
function normalizeSchema(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const q of raw) {
    if (!q || typeof q !== "object") continue;
    const key = String(q.key ?? "").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const type = KNOWN_TYPES.has(q.type) ? q.type : "text";
    out.push({
      key,
      type,
      label: String(q.label ?? key),
      required: !!q.required,
      options: CHOICE_TYPES.has(type) && Array.isArray(q.options)
        ? q.options.map((o) => String(o))
        : [],
      section: q.section ? String(q.section) : null,
      prefill:
        typeof q.prefill === "string" && PREFILL_KINDS.has(q.prefill) ? q.prefill : null,
    });
  }
  return out;
}

// Consecutive questions sharing a `section` render under ONE heading. The same
// string reappearing later (non-consecutively) correctly opens a new heading —
// the contract says consecutive, and that's what the admin sees when ordering.
function groupSections(schema) {
  const groups = [];
  for (const q of schema) {
    const last = groups[groups.length - 1];
    if (last && last.section === q.section) last.items.push(q);
    else groups.push({ section: q.section, items: [q] });
  }
  return groups;
}

// Wide fields get the full row of the two-column grid so they stay readable.
function isWide(q) {
  if (q.type === "paragraph" || q.type === "checkboxes") return true;
  if (q.type === "choice") {
    return q.options.length > 3 || q.options.some((o) => o.length > 24);
  }
  return false;
}

/* ─────────────────────────────── validation ────────────────────────────── */

// The same rules the server enforces (required / option-membership / numeric /
// 2000-char cap). Runs before we spend a round-trip; the server re-checks.
function validateAnswers(schema, answers, t) {
  const errs = {};
  for (const q of schema) {
    const v = answers[q.key];
    const answered = isAnswered(v);

    if (q.required && !answered) {
      errs[q.key] = t("community.events.form.errRequired");
      continue;
    }
    if (!answered) continue;

    if (q.type === "checkboxes") {
      const list = Array.isArray(v) ? v : [];
      if (list.some((x) => !q.options.includes(x))) {
        errs[q.key] = t("community.events.form.errOption");
        continue;
      }
      if (list.some((x) => String(x).length > MAX_ANSWER_LEN)) {
        errs[q.key] = t("community.events.form.errTooLong", { n: MAX_ANSWER_LEN });
        continue;
      }
      continue;
    }

    const s = String(v).trim();
    if ((q.type === "choice" || q.type === "dropdown") && !q.options.includes(s)) {
      errs[q.key] = t("community.events.form.errOption");
      continue;
    }
    if (q.type === "number" && !Number.isFinite(Number(s))) {
      errs[q.key] = t("community.events.form.errNumber");
      continue;
    }
    if (q.type === "phone" && !isCompletePhone(s)) {
      errs[q.key] = t("community.events.form.errPhone");
      continue;
    }
    if (s.length > MAX_ANSWER_LEN) {
      errs[q.key] = t("community.events.form.errTooLong", { n: MAX_ANSWER_LEN });
    }
  }
  return errs;
}

// Turn whatever the server sent back on a 422 into { fields: {key: msg}, message }.
// Deliberately tolerant about the envelope — FastAPI can hand us a string, a dict
// keyed by question, a nested {errors:{…}}, or a list of {loc,msg} items — because
// the ONE thing that must not happen is a real per-question error being swallowed
// into a generic "something went wrong".
function parseServerErrors(body, keySet) {
  const fields = {};
  const orphans = [];
  let message = null;

  const msgOf = (v) => {
    if (typeof v === "string") return v;
    if (v && typeof v === "object") {
      return v.msg || v.message || v.error || v.detail || null;
    }
    return null;
  };
  const put = (k, v) => {
    const key = String(k ?? "");
    const msg = msgOf(v);
    if (!msg) return;
    if (keySet.has(key)) {
      if (!fields[key]) fields[key] = msg;
    } else {
      orphans.push(msg);
    }
  };

  const walk = (node, depth = 0) => {
    if (node == null || depth > 4) return;

    if (typeof node === "string") {
      if (!message) message = node;
      return;
    }

    if (Array.isArray(node)) {
      for (const item of node) {
        if (typeof item === "string") {
          orphans.push(item);
          continue;
        }
        if (!item || typeof item !== "object") continue;
        // {key|question|field: "q1", msg|message|error: "…"}
        const direct = item.key ?? item.question ?? item.field ?? item.name;
        if (direct != null) {
          put(direct, item);
          continue;
        }
        // FastAPI: { loc: ["body","answers","q1"], msg: "…" } — the question key
        // is the last loc segment we recognise.
        if (Array.isArray(item.loc)) {
          const hit = [...item.loc].reverse().find((seg) => keySet.has(String(seg)));
          if (hit != null) {
            put(hit, item);
            continue;
          }
        }
        const m = msgOf(item);
        if (m) orphans.push(m);
      }
      return;
    }

    if (typeof node === "object") {
      // Nested envelopes: { errors: {...} } / { fields: {...} } / { answers: {...} }
      for (const nest of ["errors", "fields", "answers", "detail"]) {
        if (node[nest] != null) walk(node[nest], depth + 1);
      }
      // { key: "q1", error: "…" }
      const direct = node.key ?? node.question ?? node.field;
      if (direct != null && keySet.has(String(direct))) put(direct, node);

      for (const [k, v] of Object.entries(node)) {
        if (["errors", "fields", "answers", "detail", "key", "question", "field", "type", "loc"].includes(k)) {
          continue;
        }
        if (keySet.has(k)) put(k, v);
        else if ((k === "message" || k === "msg" || k === "error") && typeof v === "string" && !message) {
          message = v;
        }
      }
    }
  };

  walk(body?.detail !== undefined ? body.detail : body);
  if (!message && typeof body?.message === "string") message = body.message;
  // Never swallow an error we couldn't attach to a question.
  if (orphans.length && !message) message = orphans.join(" · ");

  return { fields, message, orphans };
}

// Only keys the schema declares; trimmed; empty optional answers omitted (a
// re-submit OVERWRITES, so omitting a cleared optional answer correctly removes it).
function buildPayload(schema, answers) {
  const out = {};
  for (const q of schema) {
    const v = answers[q.key];
    if (!isAnswered(v)) continue;
    if (isMulti(q.type)) {
      out[q.key] = (Array.isArray(v) ? v : [])
        .map((x) => String(x).slice(0, MAX_ANSWER_LEN));
    } else {
      out[q.key] = String(v).trim().slice(0, MAX_ANSWER_LEN);
    }
  }
  return out;
}

// The RSVP submit is the ONE call that needs the raw error body: `bfu()` collapses
// a failure into `new Error(json.detail)`, which stringifies a per-question dict
// to "[object Object]" and loses exactly the information this modal must render.
// So this mirrors `bfu()`'s fetch (same BFF proxy path, same credentials — token
// refresh still happens in the proxy) and hands back the parsed body either way.
// Every other call in this file goes through `bfu()`.
async function postRsvpRaw(eventId, payload) {
  const res = await fetch(`/web/api/bfu/events/${eventId}/rsvp`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* empty / non-JSON body */
  }
  return { ok: res.ok, status: res.status, json };
}

/* ──────────────────────────────── styles ──────────────────────────────── */

const inputBase = {
  width: "100%",
  background: "var(--surface-2)",
  border: "1px solid var(--hair)",
  borderRadius: "var(--radius-sm)",
  color: "var(--text)",
  fontFamily: "var(--font-body)",
  fontSize: 15,
  padding: "11px 13px",
  transition: "border-color 0.18s ease",
};

/* ──────────────────────────── field renderers ─────────────────────────── */

function OptionRow({ children, checked, onClick, kind }) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "9px 12px",
        borderRadius: kind === "radio" ? "var(--radius-pill)" : "var(--radius-sm)",
        border: `1px solid ${checked ? "var(--amber)" : "var(--hair)"}`,
        background: checked ? "rgba(232,161,92,0.12)" : "var(--surface-2)",
        color: checked ? "var(--text)" : "var(--muted-strong)",
        cursor: "pointer",
        fontSize: 14,
        lineHeight: 1.4,
        transition: "border-color 0.15s ease, background 0.15s ease, color 0.15s ease",
      }}
      onClick={onClick}
    >
      {children}
    </label>
  );
}

function Field({ q, value, error, onChange, inputRef, eventId }) {
  const t = useT();
  const domId = `evq-${String(q.key).replace(/[^a-zA-Z0-9_-]/g, "_")}`;
  const errId = `${domId}-err`;
  const invalid = !!error;
  const border = invalid ? "var(--terra)" : "var(--hair)";
  const common = {
    id: domId,
    "aria-invalid": invalid || undefined,
    "aria-describedby": invalid ? errId : undefined,
    style: { ...inputBase, borderColor: border },
  };

  let control = null;

  if (q.type === "paragraph") {
    control = (
      <textarea
        {...common}
        ref={inputRef}
        rows={4}
        maxLength={MAX_ANSWER_LEN}
        value={value ?? ""}
        onChange={(e) => onChange(q.key, e.target.value)}
        style={{ ...common.style, resize: "vertical", lineHeight: 1.5 }}
      />
    );
  } else if (q.type === "dropdown") {
    control = (
      <select
        {...common}
        ref={inputRef}
        value={value ?? ""}
        onChange={(e) => onChange(q.key, e.target.value)}
        style={{ ...common.style, cursor: "pointer", appearance: "none", colorScheme: "dark" }}
      >
        <option value="">{t("community.events.form.selectPlaceholder")}</option>
        {q.options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  } else if (q.type === "choice") {
    control = (
      <div
        role="radiogroup"
        aria-labelledby={`${domId}-label`}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? errId : undefined}
        style={{ display: "flex", flexWrap: "wrap", gap: 8 }}
      >
        {q.options.map((o, i) => {
          const checked = String(value ?? "") === o;
          return (
            <OptionRow key={o} kind="radio" checked={checked}>
              <input
                ref={i === 0 ? inputRef : undefined}
                type="radio"
                name={`evq-${eventId}-${q.key}`}
                value={o}
                checked={checked}
                onChange={() => onChange(q.key, o)}
                style={{ accentColor: "var(--amber)", cursor: "pointer" }}
              />
              {o}
            </OptionRow>
          );
        })}
      </div>
    );
  } else if (q.type === "checkboxes") {
    const list = Array.isArray(value) ? value : [];
    control = (
      <div
        role="group"
        aria-labelledby={`${domId}-label`}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? errId : undefined}
        style={{ display: "flex", flexWrap: "wrap", gap: 8 }}
      >
        {q.options.map((o, i) => {
          const checked = list.includes(o);
          return (
            <OptionRow key={o} kind="check" checked={checked}>
              <input
                ref={i === 0 ? inputRef : undefined}
                type="checkbox"
                checked={checked}
                onChange={() =>
                  onChange(
                    q.key,
                    checked ? list.filter((x) => x !== o) : [...list, o]
                  )
                }
                style={{ accentColor: "var(--amber)", cursor: "pointer" }}
              />
              {o}
            </OptionRow>
          );
        })}
      </div>
    );
  } else if (q.type === "phone") {
    // Fixed +998 prefix; the user types only the 9 local digits. Stored/submitted
    // as the full "+998#########" — the server enforces the same shape.
    control = (
      <PhoneInput
        value={value ?? ""}
        onChange={(full) => onChange(q.key, full)}
        baseStyle={{ ...inputBase, borderColor: border }}
        invalid={invalid}
        inputRef={inputRef}
        inputProps={{
          id: domId,
          "aria-invalid": invalid || undefined,
          "aria-describedby": invalid ? errId : undefined,
        }}
      />
    );
  } else {
    // text | number | date
    const type =
      q.type === "number" ? "number" : q.type === "date" ? "date" : "text";
    control = (
      <input
        {...common}
        ref={inputRef}
        type={type}
        inputMode={q.type === "number" ? "decimal" : q.type === "phone" ? "tel" : undefined}
        maxLength={q.type === "number" || q.type === "date" ? undefined : MAX_ANSWER_LEN}
        placeholder={q.type === "phone" ? t("community.events.form.phonePlaceholder") : undefined}
        value={value ?? ""}
        onChange={(e) => onChange(q.key, e.target.value)}
        style={{ ...common.style, colorScheme: "dark" }}
      />
    );
  }

  const labelFor = q.type === "choice" || q.type === "checkboxes" ? undefined : domId;

  return (
    <div className={isWide(q) ? "evform-q evform-wide" : "evform-q"}>
      <label
        id={`${domId}-label`}
        htmlFor={labelFor}
        style={{
          display: "block",
          marginBottom: 8,
          fontSize: 13.5,
          fontWeight: 600,
          color: "var(--text)",
          lineHeight: 1.4,
        }}
      >
        {q.label}
        {q.required ? (
          <span aria-hidden style={{ color: "var(--terra)", marginLeft: 5 }}>
            *
          </span>
        ) : null}
        {q.required ? (
          <span className="evform-sr">{` (${t("community.events.form.required")})`}</span>
        ) : null}
      </label>
      {control}
      {error ? (
        <div
          id={errId}
          role="alert"
          style={{ marginTop: 6, fontSize: 12.5, color: "var(--terra)", lineHeight: 1.45 }}
        >
          {error}
        </div>
      ) : null}
    </div>
  );
}

/* ──────────────────────────────── modal ───────────────────────────────── */

/**
 * @param {object}   props.event     the EventOut from the feed (id, title, my_rsvp…)
 * @param {number}   props.meId      logged-in user id — namespaces the local draft
 * @param {Function} props.onClose   close the dialog
 * @param {Function} props.onRsvp    (eventId, patch) → reconcile the card in the feed
 */
export default function EventFormModal({ event, meId = null, onClose, onRsvp }) {
  const t = useT();
  const { lang } = useLang();
  const { toast, flash } = useToast(3200);

  const eventId = event?.id;
  const [phase, setPhase] = useState("loading"); // loading | ready | error
  const [loadError, setLoadError] = useState("");
  const [title, setTitle] = useState(event?.title || "");
  const [location, setLocation] = useState(event?.location || "");
  const [schema, setSchema] = useState([]);
  const [answers, setAnswers] = useState({});
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [restored, setRestored] = useState(false);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const [hadResponse, setHadResponse] = useState(false);
  // Flipped when a submit comes back 409 ("already registered"): the answers can't
  // be changed, so we drop into the read-only view even before the reload lands.
  const [forcedRegistered, setForcedRegistered] = useState(false);
  // After a successful FIRST registration we show a celebratory "invite a friend"
  // prompt (reusing InviteModal) before closing, instead of closing immediately.
  const [registered, setRegistered] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);

  // Baseline = what the SERVER has for this user. "Discard draft" returns here.
  const baselineRef = useRef({});
  const aliveRef = useRef(true);
  const dirtyRef = useRef(false);
  const answersRef = useRef({});
  const submittedRef = useRef(false);
  const fieldRefs = useRef({});
  const closeRef = useRef(null);
  const openerRef = useRef(null);
  const saveTimer = useRef(null);

  answersRef.current = answers;

  const keySet = useMemo(() => new Set(schema.map((q) => q.key)), [schema]);
  const groups = useMemo(() => groupSections(schema), [schema]);

  const total = schema.length;
  const answeredCount = useMemo(
    () => schema.reduce((n, q) => n + (isAnswered(answers[q.key]) ? 1 : 0), 0),
    [schema, answers]
  );
  const requiredLeft = useMemo(
    () => schema.reduce((n, q) => n + (q.required && !isAnswered(answers[q.key]) ? 1 : 0), 0),
    [schema, answers]
  );
  const pct = total ? Math.round((answeredCount / total) * 100) : 0;

  /* ── load: the schema + this user's existing answers, then the local draft ── */
  const load = useCallback(async () => {
    setPhase("loading");
    setLoadError("");
    try {
      const [ev, mine] = await Promise.all([
        bfu(`/events/${eventId}`),
        // A member with no response yet is the normal case — never a hard error.
        bfu(`/events/${eventId}/my-response`).catch(() => null),
      ]);
      if (!aliveRef.current) return;

      const qs = normalizeSchema(ev?.form_schema);
      if (ev?.title) setTitle(ev.title);
      if (ev?.location !== undefined) setLocation(ev.location || "");
      setSchema(qs);

      // Server answers → baseline, coerced to the shape each question expects.
      const server = {};
      const raw = mine?.answers && typeof mine.answers === "object" ? mine.answers : null;
      for (const q of qs) {
        const v = raw ? raw[q.key] : undefined;
        if (v === undefined || v === null) {
          server[q.key] = emptyFor(q);
        } else if (isMulti(q.type)) {
          server[q.key] = Array.isArray(v) ? v.map(String) : [String(v)];
        } else {
          server[q.key] = Array.isArray(v) ? v.map(String).join(", ") : String(v);
        }
      }

      // Registered up front? A stored response OR a going/waitlisted row means
      // the answers are locked → read-only. Decide this BEFORE prefill so we never
      // seed profile values that would masquerade as "submitted" answers in the
      // read-only view.
      const registeredNow =
        (!!raw && Object.keys(raw).length > 0) ||
        event?.my_rsvp === "going" ||
        event?.my_rsvp === "waitlisted";

      // PREFILL — seed answers tagged with a `prefill` hint from the user's
      // profile, but only where the server has no answer for that question
      // (my-response wins over prefill). Baked into the baseline BEFORE the draft
      // merge below, so a saved draft still wins (draft > my-response > prefill >
      // empty). Skipped entirely when already registered. Best-effort: a failed
      // /users/me never blocks the form.
      const prefillQs = registeredNow
        ? []
        : qs.filter((q) => q.prefill && PREFILL_KINDS.has(q.prefill) && !isMulti(q.type));
      if (prefillQs.length) {
        try {
          const me = await bfu("/users/me");
          let regionName = "";
          if (me?.region_id && prefillQs.some((q) => q.prefill === "region")) {
            try {
              const list = await bfu("/regions");
              const r = (Array.isArray(list) ? list : []).find((x) => x.id === me.region_id);
              if (r) regionName = r[`name_${lang}`] || r.name_en || r.name || "";
            } catch {
              /* region name is best-effort */
            }
          }
          if (aliveRef.current) {
            for (const q of prefillQs) {
              if (isAnswered(server[q.key])) continue; // a real saved answer wins
              const val = prefillValue(q.prefill, me, regionName);
              if (val) server[q.key] = val; // non-multi → plain string
            }
          }
        } catch {
          /* prefill is a courtesy, never a gate */
        }
      }

      baselineRef.current = server;
      setHadResponse(!!raw && Object.keys(raw).length > 0);

      // Already registered → read-only. Answers can't be edited (the server 409s
      // a re-submit), so a saved draft is meaningless here: never restore it, and
      // clear any stale one so it can't leak into a future first-time form.
      if (registeredNow) {
        clearDraft(meId, eventId);
        setAnswers(server);
        setPhase("ready");
        return;
      }

      // A surviving draft is strictly newer than the server's copy (a successful
      // submit clears it), so it wins — that's the whole point of persisting it.
      const draft = readDraft(meId, eventId);
      let next = server;
      if (draft) {
        const merged = { ...server };
        let differs = false;
        for (const q of qs) {
          if (!(q.key in draft)) continue;
          const dv = draft[q.key];
          const val = isMulti(q.type)
            ? (Array.isArray(dv) ? dv.map(String) : [])
            : String(dv ?? "");
          merged[q.key] = val;
          if (JSON.stringify(val) !== JSON.stringify(server[q.key])) differs = true;
        }
        if (differs) {
          next = merged;
          setRestored(true);
        } else {
          clearDraft(meId, eventId); // draft == server: nothing to recover
        }
      }
      setAnswers(next);
      setPhase("ready");
    } catch (err) {
      if (!aliveRef.current) return;
      setLoadError(err?.message || t("community.events.form.loadError"));
      setPhase("error");
    }
  }, [eventId, meId, t, lang]);

  useEffect(() => {
    aliveRef.current = true;
    openerRef.current = typeof document !== "undefined" ? document.activeElement : null;
    load();
    closeRef.current?.focus();
    return () => {
      aliveRef.current = false;
      openerRef.current?.focus?.();
    };
    // Mount === open. Re-running on a locale switch would refetch for nothing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Escape closes. The draft is already on disk, so closing costs nothing.
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose?.();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Persist typing (debounced), and flush on unmount so a close mid-debounce
  // still saves. Skipped once we've submitted successfully — that clears the draft.
  useEffect(() => {
    if (phase !== "ready" || !dirtyRef.current || submittedRef.current) return undefined;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      writeDraft(meId, eventId, answersRef.current);
    }, 350);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [answers, phase, meId, eventId]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (dirtyRef.current && !submittedRef.current) {
        writeDraft(meId, eventId, answersRef.current);
      }
    };
  }, [meId, eventId]);

  const setAnswer = useCallback((key, value) => {
    dirtyRef.current = true;
    setAnswers((prev) => ({ ...prev, [key]: value }));
    // Clear that question's error the moment it's touched — a stale red line
    // under a field the reader just fixed is a lie.
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  }, []);

  function focusFirstError(errs) {
    const first = schema.find((q) => errs[q.key]);
    if (!first) return;
    const node = fieldRefs.current[first.key];
    node?.scrollIntoView?.({ behavior: "smooth", block: "center" });
    node?.focus?.({ preventScroll: true });
  }

  function discardDraft() {
    clearDraft(meId, eventId);
    dirtyRef.current = false;
    setAnswers(baselineRef.current);
    setErrors({});
    setRestored(false);
    flash(t("community.events.form.draftDiscarded"), "ok");
  }

  async function submit(e) {
    e?.preventDefault?.();
    if (saving || phase !== "ready") return;

    setFormError("");
    const clientErrs = validateAnswers(schema, answers, t);
    if (Object.keys(clientErrs).length) {
      setErrors(clientErrs);
      setFormError(t("community.events.form.errFix", { n: Object.keys(clientErrs).length }));
      focusFirstError(clientErrs);
      return;
    }

    setSaving(true);
    setErrors({});
    try {
      const { ok, status, json } = await postRsvpRaw(eventId, {
        status: "going",
        answers: buildPayload(schema, answers),
      });

      if (!ok) {
        // Already registered — the server forbids editing submitted answers. Drop
        // to the read-only view and refresh from the server so it shows the real
        // (already-saved) answers rather than the ones just typed.
        if (status === 409) {
          setForcedRegistered(true);
          setFormError("");
          clearDraft(meId, eventId);
          flash(t("community.events.form.alreadyRegistered"), "ok");
          load();
          return;
        }
        // The server is the gate. Render ITS verdict, against the exact question.
        if (status === 422) {
          const { fields, message } = parseServerErrors(json, keySet);
          const n = Object.keys(fields).length;
          if (n) {
            setErrors(fields);
            setFormError(message || t("community.events.form.errFix", { n }));
            focusFirstError(fields);
          } else {
            setFormError(message || t("community.events.form.submitError"));
          }
          flash(t("community.events.form.errToast"), "err");
        } else {
          const msg =
            (typeof json?.detail === "string" && json.detail) ||
            t("community.events.form.submitError");
          setFormError(msg);
          flash(msg, "err");
        }
        return;
      }

      // Only NOW are they going.
      submittedRef.current = true;
      dirtyRef.current = false;
      clearDraft(meId, eventId);
      onRsvp?.(eventId, {
        my_rsvp: json?.my_rsvp ?? "going",
        rsvp_count:
          json?.rsvp_count ??
          Math.max(0, (event?.rsvp_count || 0) + (event?.my_rsvp === "going" ? 0 : 1)),
      });
      // First-time registration → celebrate + offer the invite bonus before
      // closing (the parent still gets the "registered" reason on dismiss). An
      // edit of existing answers just closes with "updated".
      if (hadResponse) {
        onClose?.("updated");
      } else if (aliveRef.current) {
        setRegistered(true);
      }
    } catch (err) {
      setFormError(err?.message || t("community.events.form.submitError"));
      flash(t("community.events.form.errToast"), "err");
    } finally {
      if (aliveRef.current) setSaving(false);
    }
  }

  async function withdraw() {
    if (saving) return;
    setSaving(true);
    try {
      const r = await bfu(`/events/${eventId}/rsvp`, { method: "DELETE" });
      submittedRef.current = true;
      clearDraft(meId, eventId);
      onRsvp?.(eventId, {
        my_rsvp: r?.my_rsvp ?? null,
        rsvp_count: r?.rsvp_count ?? Math.max(0, (event?.rsvp_count || 1) - 1),
      });
      onClose?.("withdrawn");
    } catch (err) {
      setFormError(err?.message || t("community.events.form.withdrawError"));
      flash(t("community.events.form.withdrawError"), "err");
      setConfirmWithdraw(false);
    } finally {
      if (aliveRef.current) setSaving(false);
    }
  }

  // Registered = a going/waitlisted row (with or without answers) OR a stored
  // response OR a 409 we just hit. In every case the answers are LOCKED: we show
  // a read-only view (withdrawing is still allowed), never the editable form.
  const isRegistered =
    event?.my_rsvp === "going" ||
    event?.my_rsvp === "waitlisted" ||
    hadResponse ||
    forcedRegistered;

  // Questions the member actually answered — rendered as label:value in the
  // read-only view. Empty when a going/waitlisted row carries no answers.
  const answeredQuestions = schema.filter((q) => isAnswered(answers[q.key]));
  const displayValue = (v) => (Array.isArray(v) ? v.join(", ") : String(v ?? ""));

  // Invite bonus (reuses the existing InviteModal). Rendered alone so there's no
  // nested-overlay / backdrop-propagation tangle with this modal's own dialog.
  if (inviteOpen) {
    return <InviteModal onClose={() => setInviteOpen(false)} />;
  }

  // Post-registration celebration + the optional "bring a friend" nudge. Dismiss
  // (Done or backdrop) hands the parent the "registered" reason it expects.
  if (registered) {
    const dismiss = () => onClose?.("registered");
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("community.events.form.registeredTitle")}
        onClick={dismiss}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 90,
          background: "rgba(6,5,4,0.72)",
          backdropFilter: "blur(3px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
          overflowY: "auto",
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="ch-cell-static"
          style={{
            width: "100%",
            maxWidth: 440,
            padding: "30px 28px",
            background: "var(--surface)",
            margin: "auto",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
            gap: 12,
          }}
        >
          <div style={{ fontSize: 46 }} aria-hidden>🎉</div>
          <h2
            style={{
              margin: 0,
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: 22,
              lineHeight: 1.2,
              color: "var(--text)",
            }}
          >
            {t("community.events.form.registeredTitle")}
          </h2>
          <p
            style={{
              margin: 0,
              fontSize: 14.5,
              lineHeight: 1.5,
              color: "var(--muted-strong)",
              maxWidth: 340,
            }}
          >
            {t("community.events.form.registeredBody")}
          </p>
          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              justifyContent: "center",
              marginTop: 8,
            }}
          >
            <button
              type="button"
              className="ch-btn-primary"
              onClick={() => setInviteOpen(true)}
            >
              🎁 {t("community.events.form.inviteFriend")}
            </button>
            <button type="button" className="ch-btn-ghost" onClick={dismiss}>
              {t("community.events.form.registeredDone")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("community.events.form.dialogAria", { title })}
      onClick={() => onClose?.()}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 90,
        background: "rgba(6,5,4,0.72)",
        backdropFilter: "blur(3px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        overflowY: "auto",
      }}
    >
      <style>{`
        .evform-panel { width: 100%; max-width: 860px; margin: auto; display: flex; flex-direction: column;
                        max-height: min(88vh, 900px); padding: 0; overflow: hidden; background: var(--surface); }
        .evform-body  { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 22px 26px 26px; display: flex; flex-direction: column; gap: 26px; }
        .evform-grid  { display: grid; grid-template-columns: 1fr; gap: 18px 22px; }
        @media (min-width: 780px) {
          .evform-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .evform-wide { grid-column: 1 / -1; }
        }
        .evform-q { min-width: 0; }
        .evform-sr { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
                     overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
        .evform-panel input:focus-visible,
        .evform-panel select:focus-visible,
        .evform-panel textarea:focus-visible { outline: 2px solid var(--amber); outline-offset: 1px; }
      `}</style>

      <div onClick={(e) => e.stopPropagation()} className="ch-cell-static evform-panel">
        {/* ── Header: what this is, how far you are, and the way out ── */}
        <div
          style={{
            padding: "22px 26px 16px",
            borderBottom: "1px solid var(--hair)",
            background: "var(--surface)",
            flex: "0 0 auto",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="ch-cell-label">{t("community.events.form.kicker")}</div>
              <h2
                style={{
                  margin: "8px 0 0",
                  fontFamily: "var(--font-display)",
                  fontWeight: 700,
                  fontSize: 21,
                  lineHeight: 1.22,
                  letterSpacing: "-0.01em",
                  color: "var(--text)",
                }}
              >
                {title}
              </h2>
              {location ? (
                <div
                  style={{
                    marginTop: 8,
                    fontFamily: "var(--font-mono)",
                    fontSize: 12,
                    letterSpacing: "0.03em",
                    color: "var(--muted)",
                  }}
                >
                  📍 {location}
                </div>
              ) : null}
            </div>
            <button
              type="button"
              ref={closeRef}
              className="ch-btn-ghost"
              onClick={() => onClose?.()}
              aria-label={t("common.close")}
              style={{ padding: "6px 12px", fontSize: 13, flex: "0 0 auto" }}
            >
              ✕
            </button>
          </div>

          {phase === "ready" && total > 0 && !isRegistered ? (
            <div style={{ marginTop: 14 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  flexWrap: "wrap",
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "var(--muted-strong)",
                }}
              >
                <span>{t("community.events.form.progress", { done: answeredCount, total })}</span>
                <span style={{ color: requiredLeft ? "var(--amber)" : "var(--green)" }}>
                  {requiredLeft
                    ? t("community.events.form.requiredLeft", { n: requiredLeft })
                    : t("community.events.form.allRequiredDone")}
                </span>
              </div>
              <div
                role="progressbar"
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
                style={{
                  marginTop: 8,
                  height: 4,
                  borderRadius: "var(--radius-pill)",
                  background: "var(--surface-2)",
                  border: "1px solid var(--hair)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${pct}%`,
                    height: "100%",
                    background: "var(--amber)",
                    transition: "width 0.25s ease",
                  }}
                />
              </div>
            </div>
          ) : null}
        </div>

        {/* ── Body ── */}
        {phase === "loading" ? (
          <div className="evform-body" style={{ color: "var(--muted-strong)", fontSize: 14 }}>
            <div>
              <span className="ch-spin" aria-hidden style={{ marginRight: 8 }}>
                ◠
              </span>
              {t("community.events.form.loading")}
            </div>
          </div>
        ) : phase === "error" ? (
          <div className="evform-body">
            <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              <span style={{ color: "var(--terra)", fontSize: 14 }}>
                {loadError || t("community.events.form.loadError")}
              </span>
              <button type="button" className="ch-btn-ghost" onClick={load}>
                {t("community.tryAgain")}
              </button>
            </div>
          </div>
        ) : isRegistered ? (
          // READ-ONLY. Once registered, answers are locked (a re-submit 409s), so
          // there are no inputs and no Update — only a confirmation banner and the
          // answers as they were sent. Withdrawing (footer) is still allowed.
          <div className="evform-body">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
                padding: "13px 16px",
                borderRadius: "var(--radius-sm)",
                border: "1px solid rgba(127,176,105,0.34)",
                background: "rgba(127,176,105,0.1)",
              }}
            >
              <span style={{ fontSize: 20 }} aria-hidden>✓</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 700, color: "var(--text)" }}>
                  {t("community.events.form.registeredBannerTitle")}
                </div>
                <div style={{ marginTop: 3, fontSize: 13, color: "var(--muted-strong)", lineHeight: 1.45 }}>
                  {t("community.events.form.registeredBannerBody")}
                </div>
              </div>
            </div>

            {answeredQuestions.length ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {answeredQuestions.map((q) => (
                  <div key={q.key}>
                    <div
                      style={{
                        fontSize: 12.5,
                        fontWeight: 600,
                        color: "var(--muted-strong)",
                        lineHeight: 1.4,
                      }}
                    >
                      {q.label}
                    </div>
                    <div
                      style={{
                        marginTop: 4,
                        fontSize: 15,
                        color: "var(--text)",
                        lineHeight: 1.5,
                        whiteSpace: "pre-wrap",
                        overflowWrap: "anywhere",
                      }}
                    >
                      {displayValue(answers[q.key])}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : total === 0 ? (
          // Defensive: `has_form` said yes but the schema came back empty. Don't
          // strand the reader in a blank dialog — let them RSVP the plain way.
          <div className="evform-body">
            <div style={{ fontSize: 14, color: "var(--muted-strong)", lineHeight: 1.55 }}>
              {t("community.events.form.emptySchema")}
            </div>
          </div>
        ) : (
          <form id="evform" className="evform-body" onSubmit={submit} noValidate>
            {restored ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  flexWrap: "wrap",
                  padding: "11px 14px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid rgba(127,176,105,0.34)",
                  background: "rgba(127,176,105,0.1)",
                  fontSize: 13,
                  color: "var(--muted-strong)",
                }}
              >
                <span style={{ flex: 1, minWidth: 200 }}>
                  {t("community.events.form.draftRestored")}
                </span>
                <button
                  type="button"
                  className="ch-btn-ghost"
                  onClick={discardDraft}
                  style={{ padding: "6px 12px", fontSize: 12.5 }}
                >
                  {t("community.events.form.discardDraft")}
                </button>
              </div>
            ) : null}

            {groups.map((g, gi) => (
              <div key={`${g.section || "_"}-${gi}`}>
                {g.section ? (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      margin: "0 0 16px",
                    }}
                  >
                    <h3
                      style={{
                        margin: 0,
                        fontFamily: "var(--font-mono)",
                        fontSize: 11,
                        letterSpacing: "0.16em",
                        textTransform: "uppercase",
                        color: "var(--amber)",
                        flex: "0 0 auto",
                      }}
                    >
                      {g.section}
                    </h3>
                    <span style={{ flex: 1, height: 1, background: "var(--hair)" }} />
                  </div>
                ) : null}
                <div className="evform-grid">
                  {g.items.map((q) => (
                    <Field
                      key={q.key}
                      q={q}
                      eventId={eventId}
                      value={answers[q.key]}
                      error={errors[q.key]}
                      onChange={setAnswer}
                      inputRef={(el) => {
                        fieldRefs.current[q.key] = el;
                      }}
                    />
                  ))}
                </div>
              </div>
            ))}
          </form>
        )}

        {/* ── Footer: the server's verdict + the only two ways forward ── */}
        {phase === "ready" ? (
          <div
            style={{
              flex: "0 0 auto",
              borderTop: "1px solid var(--hair)",
              background: "var(--surface)",
              padding: "14px 26px",
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div style={{ flex: 1, minWidth: 180 }}>
              {formError ? (
                <span role="alert" style={{ fontSize: 13, color: "var(--terra)", lineHeight: 1.45 }}>
                  {formError}
                </span>
              ) : isRegistered ? (
                <span style={{ fontSize: 13, color: "var(--muted-strong)" }}>
                  {t("community.events.form.registeredFooterHint")}
                </span>
              ) : (
                <span style={{ fontSize: 13, color: "var(--muted-strong)" }}>
                  {t("community.events.form.savedHint")}
                </span>
              )}
            </div>

            {isRegistered ? (
              // Withdrawing is allowed; editing is not. A de-emphasized ghost
              // control, plus a close on the far side.
              confirmWithdraw ? (
                <>
                  <span style={{ fontSize: 13, color: "var(--terra)" }}>
                    {t("community.events.form.withdrawConfirm")}
                  </span>
                  <button
                    type="button"
                    className="ch-btn-ghost"
                    onClick={withdraw}
                    disabled={saving}
                    style={{ borderColor: "rgba(192,86,59,0.5)", color: "var(--terra)" }}
                  >
                    {t("community.events.form.withdrawYes")}
                  </button>
                  <button
                    type="button"
                    className="ch-btn-ghost"
                    onClick={() => setConfirmWithdraw(false)}
                    disabled={saving}
                  >
                    {t("community.events.form.withdrawNo")}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="ch-btn-ghost"
                    onClick={() => setConfirmWithdraw(true)}
                    disabled={saving}
                    style={{ fontSize: 12.5, color: "var(--muted-strong)" }}
                  >
                    {t("community.events.form.withdraw")}
                  </button>
                  <button type="button" className="ch-btn-primary" onClick={() => onClose?.()}>
                    {t("common.close")}
                  </button>
                </>
              )
            ) : total > 0 ? (
              <button
                type="submit"
                form="evform"
                className="ch-btn-primary"
                disabled={saving}
                aria-busy={saving || undefined}
              >
                {saving
                  ? t("community.events.form.submitting")
                  : t("community.events.form.submit")}
              </button>
            ) : (
              <button type="button" className="ch-btn-ghost" onClick={() => onClose?.()}>
                {t("common.close")}
              </button>
            )}
          </div>
        ) : null}
      </div>

      {/* Toast inside the overlay's stacking context so it paints above the dim. */}
      <div onClick={(e) => e.stopPropagation()}>
        <Toast toast={toast} />
      </div>
    </div>
  );
}
