import { useState, useEffect, useRef, useCallback } from "react";
import { events, users, regions } from "../api";
import { Icon } from "./Icons";
import { InviteSheet } from "./InviteSheet";
import { useT } from "../i18n";
import { haptic } from "../tg";

// ─────────────────────────────────────────────────────────────────────────────
// Event registration form — the member-facing filler.
//
// An event may carry a `form_schema` (a list of question objects, authored by
// the founder in the admin panel — DATA, not code). Tapping "Going" on such an
// event opens THIS sheet instead of RSVPing straight away; only a successful
// POST /events/{id}/rsvp {status:"going", answers} marks them going.
//
// The founder's real form is 30 questions long, so this is built for length:
//   • full-height scroller (not a squat bottom sheet)
//   • live "12 / 30 answered" progress in the header
//   • EVERY keystroke is mirrored to localStorage per event id, so an accidental
//     close (Telegram's back swipe, a mis-tap on the backdrop, an app kill)
//     never costs the user their typing. Cleared only on a successful submit.
//
// The client validates before sending, but the SERVER is the real gate — its
// per-question 422s are surfaced inline, because it may disagree with us
// (schema edited mid-fill, a rule we don't know about).
// ─────────────────────────────────────────────────────────────────────────────

// i18n: src/i18n.jsx is owned by another agent this round, so the sheet's strings
// live here as a local {en,uz,ru} map and read `lang` from the shared useT().
// TODO(i18n): fold these keys into src/i18n.jsx (prefix `evform.`) once merged.
const S = {
  "title":      { en: "Registration", uz: "Ro‘yxatdan o‘tish", ru: "Регистрация" },
  "progress":   { en: "{n} / {m} answered", uz: "{n} / {m} javob berildi", ru: "{n} / {m} отвечено" },
  "required":   { en: "Required", uz: "Majburiy", ru: "Обязательно" },
  "optional":   { en: "Optional", uz: "Ixtiyoriy", ru: "Необязательно" },
  "choose":     { en: "Choose…", uz: "Tanlang…", ru: "Выберите…" },
  "submit":     { en: "Submit & register", uz: "Yuborish va ro‘yxatdan o‘tish", ru: "Отправить и записаться" },
  "update":     { en: "Update my answers", uz: "Javoblarimni yangilash", ru: "Обновить мои ответы" },
  "sending":    { en: "Sending…", uz: "Yuborilmoqda…", ru: "Отправка…" },
  "autosave":   { en: "Saved on this device as you type", uz: "Yozganingiz shu qurilmada saqlanadi", ru: "Черновик сохраняется на этом устройстве" },
  "restored":   { en: "Your unfinished answers were restored", uz: "Tugatilmagan javoblaringiz tiklandi", ru: "Ваши незаконченные ответы восстановлены" },
  "loadError":  { en: "Couldn't load the form.", uz: "Formani yuklab bo‘lmadi.", ru: "Не удалось загрузить форму." },
  "retry":      { en: "Retry", uz: "Qayta urinish", ru: "Повторить" },
  "close":      { en: "Close", uz: "Yopish", ru: "Закрыть" },
  "err.required": { en: "This question is required", uz: "Bu savol majburiy", ru: "Это обязательный вопрос" },
  "err.number":   { en: "Enter a number", uz: "Raqam kiriting", ru: "Введите число" },
  "err.option":   { en: "Choose one of the options", uz: "Variantlardan birini tanlang", ru: "Выберите один из вариантов" },
  "err.tooLong":  { en: "Too long (max 2000 characters)", uz: "Juda uzun (maks. 2000 belgi)", ru: "Слишком длинно (макс. 2000 символов)" },
  "err.fix":      { en: "Check {n} question(s) below", uz: "Quyidagi {n} ta savolni tekshiring", ru: "Проверьте {n} вопрос(ов) ниже" },
  "err.generic":  { en: "Couldn't send. Try again.", uz: "Yuborib bo‘lmadi. Qayta urinib ko‘ring.", ru: "Не удалось отправить. Попробуйте снова." },
  // Bring-a-friend prompt shown after a successful FIRST registration.
  "reg.title": { en: "You're registered!", uz: "Ro‘yxatdan o‘tdingiz!", ru: "Вы зарегистрированы!" },
  "reg.sub":   { en: "Know a builder who'd love this? Invite a friend.", uz: "Buni yoqtiradigan quruvchini bilasizmi? Do‘stingizni taklif qiling.", ru: "Знаете строителя, кому это понравится? Пригласите друга." },
  "reg.invite": { en: "Invite a friend", uz: "Do‘stni taklif qilish", ru: "Пригласить друга" },
  "reg.done":  { en: "Done", uz: "Tayyor", ru: "Готово" },
  // Used by EventsScreen (same local map, so all new strings stay in one file)
  "card.hasForm":  { en: "Registration form", uz: "Ro‘yxat formasi", ru: "Форма регистрации" },
  "card.editAnsw": { en: "✎ Edit answers", uz: "✎ Javoblarni tahrirlash", ru: "✎ Изменить ответы" },
};

// Local translator — same {var} interpolation contract as the global one.
export const useEventFormT = () => {
  const { lang } = useT();
  return useCallback((key, vars) => {
    const entry = S[key];
    let s = entry ? (entry[lang] ?? entry.en) : key;
    if (vars) Object.entries(vars).forEach(([k, v]) => { s = s.split(`{${k}}`).join(String(v)); });
    return s;
  }, [lang]);
};

// ── Draft persistence (per event) ────────────────────────────────────────────
const draftKey = (id) => `bfu_event_form_${id}`;

const loadDraft = (id) => {
  try {
    const raw = localStorage.getItem(draftKey(id));
    if (!raw) return null;
    const d = JSON.parse(raw);
    return d && typeof d.answers === "object" && d.answers ? d.answers : null;
  } catch { return null; }
};
const saveDraft = (id, answers) => {
  try { localStorage.setItem(draftKey(id), JSON.stringify({ answers, ts: Date.now() })); } catch { /* private mode / quota */ }
};
const clearDraft = (id) => {
  try { localStorage.removeItem(draftKey(id)); } catch { /* noop */ }
};

// ── Answer helpers ───────────────────────────────────────────────────────────
const MAX_LEN = 2000;
const isMulti = (q) => q.type === "checkboxes";
const emptyFor = (q) => (isMulti(q) ? [] : "");

const isAnswered = (q, v) =>
  isMulti(q) ? Array.isArray(v) && v.length > 0 : typeof v === "string" && v.trim() !== "";

// Coerce whatever the server / an older draft holds into the shape the field expects.
const coerce = (q, v) => {
  if (v == null) return emptyFor(q);
  if (isMulti(q)) return Array.isArray(v) ? v.map(String) : [String(v)];
  return Array.isArray(v) ? v.map(String).join(", ") : String(v);
};

// ── Profile prefill ──────────────────────────────────────────────────────────
// A question may carry `prefill: "name"|"surname"|"full_name"|"phone"|"region"|
// "birth_year"` (authored in the admin panel). When set, the matching question is
// seeded from the current user's profile (GET /users/me) as an ordinary, editable
// answer. `full_name` = name + surname; `region` resolves to the region NAME via
// the regions list (id-based lookup, localized), `birth_year` becomes a string.
const PREFILL_KINDS = new Set(["name", "surname", "full_name", "phone", "region", "birth_year"]);

const prefillValue = (kind, me, regionName) => {
  switch (kind) {
    case "name":       return me?.name ? String(me.name) : "";
    case "surname":    return me?.surname ? String(me.surname) : "";
    case "full_name":  return [me?.name, me?.surname].filter(Boolean).join(" ");
    case "phone":      return me?.phone_number ? String(me.phone_number) : "";
    case "region":     return regionName || "";
    case "birth_year": return me?.birth_year != null ? String(me.birth_year) : "";
    default:           return "";
  }
};

// Client-side gate. Mirrors the server rules; the server still has the last word.
const validate = (schema, answers, tf) => {
  const errs = {};
  for (const q of schema) {
    const v = answers[q.key];
    const filled = isAnswered(q, v);
    if (q.required && !filled) { errs[q.key] = tf("err.required"); continue; }
    if (!filled) continue;

    const opts = Array.isArray(q.options) ? q.options : null;
    if (q.type === "number" && !Number.isFinite(Number(String(v).trim()))) {
      errs[q.key] = tf("err.number");
    } else if ((q.type === "choice" || q.type === "dropdown") && opts && !opts.includes(v)) {
      errs[q.key] = tf("err.option");
    } else if (isMulti(q) && opts && v.some((x) => !opts.includes(x))) {
      errs[q.key] = tf("err.option");
    } else if (isMulti(q) ? v.some((x) => String(x).length > MAX_LEN) : String(v).length > MAX_LEN) {
      errs[q.key] = tf("err.tooLong");
    }
  }
  return errs;
};

// Section headers: a RUN of consecutive questions sharing the same `section`
// sits under one heading — so the head is only emitted when the value changes.
const withSectionHeads = (schema) =>
  (schema || []).map((q, i) => {
    const section = q.section || null;
    const prev = i > 0 ? (schema[i - 1].section || null) : null;
    return { q, head: section && section !== prev ? section : null };
  });

// The server's 422 body is authoritative but its exact shape is the backend
// agent's call, so dig defensively: { q1: "msg" }, { errors: {...} },
// [ { key/field, msg } ], or FastAPI's [ { loc: [...,"q1"], msg } ].
const serverErrors = (err, keys) => {
  const out = {};
  const put = (k, m) => { if (k && keys.includes(k) && !out[k]) out[k] = String(m || "").slice(0, 200); };
  const scan = (node, depth = 0) => {
    if (!node || depth > 4) return;
    if (Array.isArray(node)) {
      node.forEach((it) => {
        if (!it || typeof it !== "object") return;
        const loc = Array.isArray(it.loc) ? it.loc.map(String).filter((x) => keys.includes(x))[0] : null;
        put(it.key || it.field || it.question || loc, it.msg || it.message || it.error || it.detail);
      });
      return;
    }
    if (typeof node !== "object") return;
    Object.entries(node).forEach(([k, v]) => {
      if (keys.includes(k)) put(k, typeof v === "string" ? v : (v?.msg || v?.message || v?.error));
    });
    ["errors", "fields", "answers", "detail"].forEach((c) => { if (node[c]) scan(node[c], depth + 1); });
  };
  scan(err?.detail ?? err?.body?.detail ?? err?.body);
  return out;
};

// ── One question ─────────────────────────────────────────────────────────────
const Field = ({ q, value, error, onChange, tf, bindRef }) => {
  const bd = error ? "var(--terra)" : "var(--hair)";
  const inputStyle = { borderColor: bd };

  // Checkboxes hand back an UPDATER, not a value: two quick taps land in the same
  // React batch, and a value computed from the closed-over `value` would make the
  // second tap clobber the first.
  const toggleMulti = (opt) => (cur) => {
    const arr = Array.isArray(cur) ? cur : [];
    return arr.includes(opt) ? arr.filter((x) => x !== opt) : [...arr, opt];
  };

  const optionRow = (opt, on, multi) => (
    <button
      key={opt}
      type="button"
      onClick={() => onChange(multi ? toggleMulti(opt) : (on ? "" : opt))}
      style={{
        display: "flex", alignItems: "center", gap: 11, width: "100%", textAlign: "left",
        padding: "12px 14px", cursor: "pointer",
        background: on ? "var(--accent-dim)" : "var(--surface-2)",
        border: `1px solid ${on ? "var(--amber)" : bd}`,
        borderRadius: "var(--radius-sm)",
        color: on ? "var(--amber)" : "var(--text)",
        fontFamily: "var(--font-body)", fontSize: 14.5, fontWeight: on ? 600 : 500,
        transition: "background 0.15s ease, border-color 0.15s ease",
      }}
    >
      <span aria-hidden style={{
        flex: "0 0 auto", width: 19, height: 19,
        borderRadius: multi ? 5 : "50%",
        border: `1.5px solid ${on ? "var(--amber)" : "var(--surface-3)"}`,
        background: on ? "var(--amber)" : "transparent",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "#160E08", fontSize: 12, fontWeight: 800, lineHeight: 1,
      }}>{on ? "✓" : ""}</span>
      <span style={{ flex: 1, minWidth: 0, lineHeight: 1.35 }}>{opt}</span>
    </button>
  );

  let control;
  const opts = Array.isArray(q.options) ? q.options : [];

  switch (q.type) {
    case "paragraph":
      control = (
        <textarea className="input-field" rows={4} maxLength={MAX_LEN} style={{ ...inputStyle, resize: "vertical" }}
          value={value || ""} onChange={(e) => onChange(e.target.value)} />
      );
      break;
    case "number":
      control = (
        <input className="input-field" type="text" inputMode="decimal" maxLength={40} style={inputStyle}
          value={value || ""} onChange={(e) => onChange(e.target.value)} />
      );
      break;
    case "date":
      control = (
        <input className="input-field" type="date" style={inputStyle}
          value={value || ""} onChange={(e) => onChange(e.target.value)} />
      );
      break;
    case "phone":
      control = (
        <input className="input-field" type="tel" inputMode="tel" maxLength={40} placeholder="+998 ..." style={inputStyle}
          value={value || ""} onChange={(e) => onChange(e.target.value)} />
      );
      break;
    case "dropdown":
      control = (
        <select className="input-field" style={{ ...inputStyle, appearance: "none", cursor: "pointer" }}
          value={value || ""} onChange={(e) => onChange(e.target.value)}>
          <option value="">{tf("choose")}</option>
          {opts.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
      break;
    case "choice":
      control = <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{opts.map((o) => optionRow(o, value === o, false))}</div>;
      break;
    case "checkboxes":
      control = (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {opts.map((o) => optionRow(o, Array.isArray(value) && value.includes(o), true))}
        </div>
      );
      break;
    default: // "text" and any unknown type the admin invents — degrade to one line
      control = (
        <input className="input-field" type="text" maxLength={MAX_LEN} style={inputStyle}
          value={value || ""} onChange={(e) => onChange(e.target.value)} />
      );
  }

  return (
    <div ref={bindRef} style={{ scrollMarginTop: 90 }}>
      <label style={{ display: "block", fontSize: 14.5, fontWeight: 600, color: "var(--text)", lineHeight: 1.4, marginBottom: 8 }}>
        {q.label}
        {q.required
          ? <span style={{ color: "var(--terra)", marginLeft: 4 }} title={tf("required")}>*</span>
          : <span style={{ marginLeft: 6, fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.08em",
              textTransform: "uppercase", color: "var(--text-3)" }}>{tf("optional")}</span>}
      </label>
      {control}
      {error && (
        <div style={{ marginTop: 6, fontSize: 12.5, color: "var(--terra)", lineHeight: 1.4 }}>{error}</div>
      )}
    </div>
  );
};

// ── The sheet ────────────────────────────────────────────────────────────────
export const EventFormSheet = ({ event, onClose, onDone }) => {
  const tf = useEventFormT();
  const { lang } = useT();
  const eventId = event?.id;
  const alreadyGoing = event?.my_rsvp === "going";

  const [schema, setSchema] = useState(null);
  const [answers, setAnswers] = useState({});
  const [errors, setErrors] = useState({});
  const [banner, setBanner] = useState("");
  const [restored, setRestored] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState(false);
  const [saving, setSaving] = useState(false);
  // After a successful FIRST registration we don't close straight away — we offer
  // a one-tap "invite a friend" bonus (reusing the existing InviteSheet).
  const [registered, setRegistered] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);

  const hydrated = useRef(false);   // don't persist the empty pre-load state over a real draft
  const refs = useRef({});

  const load = useCallback(async () => {
    if (!eventId) return;
    setLoading(true); setLoadErr(false);
    try {
      const [ev, mine] = await Promise.all([
        events.get(eventId),
        events.myResponse(eventId).catch(() => null),   // 404 / not-yet-answered is fine
      ]);
      const qs = (Array.isArray(ev?.form_schema) ? ev.form_schema : []).filter((q) => q && q.key);

      // No form after all (admin cleared it while the card was on screen) →
      // behave exactly like a plain event: 1-click RSVP, no sheet.
      if (qs.length === 0) {
        const r = await events.rsvp(eventId, "going");
        clearDraft(eventId);
        onDone?.(r || {});
        onClose();
        return;
      }

      const base = {};
      qs.forEach((q) => { base[q.key] = emptyFor(q); });

      // Server answers (their last submission) are the floor…
      const prev = mine?.answers && typeof mine.answers === "object" ? mine.answers : null;
      if (prev) qs.forEach((q) => { if (prev[q.key] != null) base[q.key] = coerce(q, prev[q.key]); });

      // PREFILL — for questions tagged with a `prefill` hint, seed the answer from
      // the current user's profile, but only where the server has no answer yet
      // (my-response wins over prefill). Runs BEFORE the draft merge so a later
      // auto-saved draft that merely echoes the prefill isn't read as "restored".
      // Best-effort: a failed /users/me never blocks the form.
      const prefillQs = qs.filter((q) => q.prefill && PREFILL_KINDS.has(q.prefill) && !isMulti(q));
      if (prefillQs.length) {
        try {
          const me = await users.me();
          let regionName = "";
          if (me?.region_id && prefillQs.some((q) => q.prefill === "region")) {
            try {
              const list = await regions.list();
              const r = (Array.isArray(list) ? list : []).find((x) => x.id === me.region_id);
              if (r) regionName = r[`name_${lang}`] || r.name_en || r.name || "";
            } catch { /* region name is best-effort */ }
          }
          for (const q of prefillQs) {
            if (isAnswered(q, base[q.key])) continue;   // a real saved answer wins
            const v = prefillValue(q.prefill, me, regionName);
            if (v) base[q.key] = coerce(q, v);
          }
        } catch { /* prefill is a courtesy, never a gate */ }
      }

      // …and the local draft (their most recent typing) wins over it.
      const draft = loadDraft(eventId);
      let didRestore = false;
      if (draft) qs.forEach((q) => {
        if (draft[q.key] == null) return;
        const next = coerce(q, draft[q.key]);
        if (JSON.stringify(next) !== JSON.stringify(base[q.key])) didRestore = true;
        base[q.key] = next;
      });

      setSchema(qs);
      setAnswers(base);
      setRestored(didRestore);
      hydrated.current = true;
    } catch {
      setLoadErr(true);
    }
    setLoading(false);
  }, [eventId, onClose, onDone, lang]);

  useEffect(() => { load(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [eventId]);

  // Every keystroke lands in localStorage — this is what makes an accidental
  // close survivable on a 30-question form.
  useEffect(() => {
    if (!hydrated.current || !eventId) return;
    saveDraft(eventId, answers);
  }, [answers, eventId]);

  // `value` may be a plain value or an updater fn (see toggleMulti) — resolving it
  // inside the state updater keeps rapid taps from clobbering each other.
  const set = (key, value) => {
    setAnswers((a) => ({ ...a, [key]: typeof value === "function" ? value(a[key]) : value }));
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
    setBanner("");
  };

  const focusFirstError = (errs) => {
    const first = (schema || []).find((q) => errs[q.key]);
    if (first && refs.current[first.key]) {
      refs.current[first.key].scrollIntoView({ block: "center", behavior: "smooth" });
    }
  };

  const submit = async () => {
    if (saving || !schema) return;
    const errs = validate(schema, answers, tf);
    if (Object.keys(errs).length) {
      setErrors(errs);
      setBanner(tf("err.fix", { n: Object.keys(errs).length }));
      focusFirstError(errs);
      haptic("error");
      return;
    }
    setSaving(true);
    setBanner("");

    // Only keys the current schema knows about; empty optionals are omitted
    // (a re-RSVP overwrites the whole answers dict, so omitting == cleared).
    const payload = {};
    schema.forEach((q) => {
      const v = answers[q.key];
      if (isMulti(q)) { if (Array.isArray(v) && v.length) payload[q.key] = v; }
      else if (typeof v === "string" && v.trim() !== "") payload[q.key] = v.trim();
    });

    try {
      const r = await events.rsvp(eventId, "going", payload);
      clearDraft(eventId);
      haptic("success");
      onDone?.(r || {});
      // First registration → celebrate + offer the invite bonus before closing.
      // Re-editing existing answers just closes (they've been here before).
      if (alreadyGoing) {
        onClose();
      } else {
        setRegistered(true);
        setSaving(false);
      }
    } catch (e) {
      const se = serverErrors(e, schema.map((q) => q.key));
      if (Object.keys(se).length) {
        setErrors(se);
        setBanner(tf("err.fix", { n: Object.keys(se).length }));
        focusFirstError(se);
      } else {
        setBanner(e?.message || tf("err.generic"));
      }
      haptic("error");
      setSaving(false);
    }
  };

  // Invite bonus (reuses the existing InviteSheet). Rendered as the sole view so
  // it sits alone on screen — no z-index race with the form's own overlay.
  if (inviteOpen) return <InviteSheet onClose={() => setInviteOpen(false)} />;

  // Post-registration celebration + the optional "bring a friend" nudge.
  if (registered) {
    return (
      <div style={{
        position: "fixed", inset: 0, zIndex: 340, background: "var(--bg)",
        maxWidth: 430, margin: "0 auto", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", textAlign: "center",
        padding: "24px 24px calc(var(--safe-b) + 24px)",
      }}>
        <div style={{ fontSize: 46, marginBottom: 8 }} aria-hidden>🎉</div>
        <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 22, color: "var(--text)", marginBottom: 8 }}>
          {tf("reg.title")}
        </div>
        <div style={{ fontSize: 14.5, color: "var(--text-2)", lineHeight: 1.5, maxWidth: 300, marginBottom: 26 }}>
          {tf("reg.sub")}
        </div>
        <div style={{ width: "100%", maxWidth: 320, display: "flex", flexDirection: "column", gap: 12 }}>
          <button className="btn-primary" onClick={() => setInviteOpen(true)}>🎁 {tf("reg.invite")}</button>
          <button className="btn-ghost" style={{ width: "100%" }} onClick={onClose}>{tf("reg.done")}</button>
        </div>
      </div>
    );
  }

  const total = schema?.length || 0;
  const done = schema ? schema.filter((q) => isAnswered(q, answers[q.key])).length : 0;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const rows = withSectionHeads(schema);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 340, background: "var(--bg)",
      maxWidth: 430, margin: "0 auto", display: "flex", flexDirection: "column",
    }}>
      {/* Header — close + event title + live progress */}
      <div style={{
        flex: "0 0 auto", padding: "calc(var(--safe-t) + 14px) 16px 12px",
        borderBottom: "1px solid var(--hair)", background: "var(--surface)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={onClose} aria-label={tf("close")} style={{
            width: 38, height: 38, borderRadius: 11, border: "1px solid var(--hair)",
            background: "var(--surface-2)", color: "var(--text-2)", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}><Icon name="x" size={18} /></button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.14em",
              textTransform: "uppercase", color: "var(--amber)",
            }}>{tf("title")}</div>
            <div style={{
              fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 17, color: "var(--text)",
              lineHeight: 1.25, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>{event?.title || ""}</div>
          </div>
        </div>

        {total > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)" }}>
                {tf("progress", { n: done, m: total })}
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: pct === 100 ? "var(--green)" : "var(--text-3)" }}>
                {pct}%
              </span>
            </div>
            <div style={{ height: 4, borderRadius: 99, background: "var(--surface-3)", overflow: "hidden" }}>
              <div style={{
                width: `${pct}%`, height: "100%", borderRadius: 99,
                background: "linear-gradient(90deg, var(--amber), var(--ember))",
                transition: "width 0.25s ease",
              }} />
            </div>
          </div>
        )}
      </div>

      {/* Body — the questions */}
      <div style={{ flex: "1 1 auto", overflowY: "auto", padding: "18px 16px 28px" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: 60, color: "var(--text-3)" }}>
            <Icon name="loader" size={22} color="var(--amber)" />
          </div>
        ) : loadErr ? (
          <div style={{ textAlign: "center", padding: 40 }}>
            <div style={{ color: "var(--terra)", fontSize: 14, marginBottom: 14 }}>{tf("loadError")}</div>
            <button className="btn-ghost" onClick={load}>{tf("retry")}</button>
          </div>
        ) : (
          <>
            {restored && (
              <div style={{
                display: "flex", alignItems: "center", gap: 8, marginBottom: 16,
                padding: "10px 12px", borderRadius: "var(--radius-sm)",
                background: "rgba(127,176,105,0.12)", border: "1px solid rgba(127,176,105,0.34)",
                color: "var(--green)", fontSize: 12.5, lineHeight: 1.4,
              }}>
                <span aria-hidden>✓</span>{tf("restored")}
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {rows.map(({ q, head }) => (
                <div key={q.key}>
                  {head && (
                    <div style={{
                      fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: "0.14em",
                      textTransform: "uppercase", color: "var(--text-3)",
                      paddingBottom: 8, marginBottom: 14, borderBottom: "1px solid var(--hair)",
                    }}>{head}</div>
                  )}
                  <Field
                    q={q}
                    value={answers[q.key]}
                    error={errors[q.key]}
                    onChange={(v) => set(q.key, v)}
                    tf={tf}
                    bindRef={(el) => { refs.current[q.key] = el; }}
                  />
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Footer — sticky submit + the "your typing is safe" reassurance */}
      {!loading && !loadErr && (
        <div style={{
          flex: "0 0 auto", padding: "12px 16px calc(var(--safe-b) + 14px)",
          borderTop: "1px solid var(--hair)", background: "var(--surface)",
        }}>
          {banner && (
            <div style={{
              marginBottom: 10, padding: "9px 12px", borderRadius: "var(--radius-sm)",
              background: "rgba(192,86,59,0.14)", border: "1px solid rgba(192,86,59,0.4)",
              color: "var(--terra)", fontSize: 12.5, lineHeight: 1.4, textAlign: "center",
            }}>{banner}</div>
          )}
          <button className="btn-primary" onClick={submit} disabled={saving}>
            {saving ? tf("sending") : (alreadyGoing ? tf("update") : tf("submit"))}
          </button>
          <div style={{
            marginTop: 8, textAlign: "center", fontFamily: "var(--font-mono)",
            fontSize: 10, letterSpacing: "0.06em", color: "var(--text-3)",
          }}>{tf("autosave")}</div>
        </div>
      )}
    </div>
  );
};
