"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { bfu } from "@/lib/client-api";
import { useT } from "@/components/i18n/LocaleProvider";

// The registration-form QUESTION BUILDER for one event (/dashboard/events).
//
// An event may carry a form. The questions are DATA, not code — the founder
// edits them here and changing them never needs a deploy.
//
//   Event.form_schema : JSON list | null   (null/[] = no form → one-tap RSVP)
//   EventRsvp.answers : JSON dict | null   (that member's answers, keyed by
//                                           question key)
//
// A question:
//   { key: "q1",            // stable id, unique within the form
//     label: "…",           // what the member reads
//     type: "text",         // one of TYPES below
//     required: true,
//     options: ["A","B"],   // ONLY for choice | checkboxes | dropdown
//     section: "Kirish" }   // optional heading; consecutive questions that
//                           // share it render under one heading
//
// ─────────────────────────────────────────────────────────────────────────────
// THE KEY IS THE CONTRACT. Answers are stored keyed by `key`, so a key is
// allocated ONCE (nextKey) when a question is created and is NEVER rewritten
// afterwards — editing a label, retyping it, flipping `required`, adding
// options, or moving the question up and down all leave `key` untouched. That is
// what lets the founder fix a typo in a question that 200 people already
// answered without orphaning a single answer. Deleting a question does NOT
// renumber the survivors either, for the same reason.
// ─────────────────────────────────────────────────────────────────────────────
//
// Reads   GET   {readEventPath(id)}   → EventOut + form_schema   (default /events/{id})
// Writes  PATCH {apiBase}/events/{id}  → { …EventBody, form_schema }  (default /admin)
//
// BASE IS A PROP, NOT A CONSTANT. The SAME builder drives the admin console
// (apiBase "/admin", read the public /events/{id}) and the partner panel
// (apiBase "/partner", read the scoped /partner/events/{id} so a not-yet-approved
// event is still readable). Everything below routes through `apiBase` /
// `readEventPath` — no hardcoded "/admin".
//
// The write sends the WHOLE EventBody (current values + form_schema) rather than
// form_schema alone, because the backend's EventBody still requires `type` and
// `title`. The PATCH handler applies model_dump(exclude_unset=True), so echoing
// the unchanged fields back is a no-op.
//
// The server validates the schema too (unique keys, known types, options present
// for choice-likes) and answers to it on submit — a client is never the only
// gate. Its 422 comes back keyed by question key and is surfaced per row.

// The 8 answer types in the contract.
export const TYPES = [
  "text",
  "paragraph",
  "choice",
  "checkboxes",
  "dropdown",
  "number",
  "date",
  "phone",
];

// The three types that need an options list. Everything else must NOT carry one.
const CHOICE_LIKE = new Set(["choice", "checkboxes", "dropdown"]);

// A question may PRE-FILL its answer from the signed-in member's profile
// (GET /users/me) — the client drops the value in but leaves it editable, so the
// student doesn't retype their name/phone/region on every event. These are the
// only profile fields a question is allowed to bind to (the SHARED CONTRACT). "" =
// no prefill. Written into the question schema as `prefill`; the form-fill clients
// read it.
export const PREFILL_FIELDS = ["name", "surname", "full_name", "phone", "region", "birth_year"];
const PREFILL_SET = new Set(PREFILL_FIELDS);

// ── The founder's real Marstiff SAT survey ───────────────────────────────────
// 30 questions, verbatim Uzbek, in his order, with his section headers. Loaded
// with one click and then trimmed / reordered / marked optional before saving.
// No `key` here on purpose: keys are minted in order (q1…q30) at load time.
// Every question is short-answer text and required, exactly as he wrote it.
const S1 = "Kirish";
const S2 = "Kontekst — SAT bilan tanishuv";
const S3 = "Real harakatlar";
const S4 = "Qiynoqlar";
const S5 = "O'tmishdagi urinishlar";
const S6 = "Orzu qilingan natija";

export const MARSTIFF_SAT_SURVEY = [
  // Q1 pre-fills the student's name from their profile (still editable). Rest of
  // the tuples are [section, label]; a 3rd element is the optional prefill key.
  [S1, "Ismingiz, nechinchi sinfda o'qiysiz?", "name"],
  [S1, "Bo'sh vaqtingizda nima qilishni yoqtirasiz?"],
  [S1, "Maktabdan tashqari yana qayerlarda o'qiysiz (kurs, repetitor)?"],

  [S2, "SAT haqida birinchi marta qachon va qayerdan eshitdingiz?"],
  [S2, "Nega aynan SAT? Kim aytdi yoki nima sabab bo'ldi?"],
  [S2, "Hozir tayyorgarlikni qachondan boshlagansiz? Aniq sana yodingizdami?"],

  [S3, "Tayyorgarlikni qanday boshladingiz — birinchi qadamingiz nima bo'ldi?"],
  [S3, "Shu hafta SAT uchun aniq nima qildingiz? Necha soat ajratdingiz?"],
  [S3, "Oxirgi marta test yechganingizda necha ball chiqdi?"],
  [S3, "Shu natijani ko'rganingizda birinchi fikringiz nima bo'ldi?"],

  [S4, "Qaysi bo'lim sizga eng ko'p vaqt oladi: Reading, Writing, yoki Math?"],
  [S4, "Oxirgi marta shu bo'lim ustida ishlayotganda nima his qildingiz — asabiylashdingizmi, charchadingizmi, zerikdingizmi?"],
  [S4, "Yolg'iz o'zingiz tayyorlanayotganda kimga savol berasiz, tushunmagan narsani kimdan so'raysiz?"],
  [S4, "Bir oy oldingi sizga qaraganda hozir yaxshiroq deb hisoblaysizmi? Nimadan bilasiz?"],
  [S4, "Eng oxirgi marta \"bo'ldi, tashlab qo'yaman\" deb o'ylagan payt bo'lganmi? Nima sabab bo'lgan edi?"],

  [S5, "SAT uchun qaysi ilova, sayt yoki YouTube kanalidan foydalanib ko'rgansiz? Aniq nomini ayting."],
  [S5, "Shulardan qaysi birini eng ko'p ishlatasiz hozir ham?"],
  [S5, "Bironta pullik kurs yoki repetitorga pul to'lab ko'rganmisiz?"],
  [S5, "Agar ha — qancha pul to'ladingiz va oxiri nima bo'ldi, davom etdingizmi?"],
  [S5, "Mock (sinov) imtihon topshirganmisiz? Qachon, qayerda?"],

  [S6, "Qaysi universitetga kirishni xohlaysiz? Nega aynan o'sha?"],
  [S6, "O'zingiz uchun \"zo'r ball\" deganda qancha raqamni tasavvur qilasiz?"],
  [S6, "Agar shu ballni olsangiz, birinchi kimga aytasiz va nima deysiz?"],
  [S6, "O'quv markazi yoki kurs tanlashda oxirgi marta nima qildingiz — kimdan so'radingiz, qayerni ko'rdingiz?"],
  [S6, "Do'stlaringizdan kimdir SAT kursiga borganmi? Qaysi markazga?"],
  [S6, "O'sha do'stingiz o'sha markaz haqida nima degan edi?"],
  [S6, "Marstiff yoki Marifat Jamal haqida eshitganmisiz? Qayerdan?"],
  [S6, "Agar bugun kimdir sizga \"mana shu narsa bilan tayyorlaning\" deb bitta narsa taklif qilsa, bu nima bo'lishini xohlardingiz?"],
  [S6, "Nima bo'lsa, ertaga kursga yozilishga qaror qilardingiz?"],
  [S6, "Agar hozir menga bitta savol bersangiz — SAT haqida, kurslar haqida, nima bo'lardi?"],
].map(([section, label, prefill]) => ({ section, label, type: "text", required: true, prefill: prefill || "" }));

// ── schema helpers ───────────────────────────────────────────────────────────

// Coerce whatever the API hands back into the editor's working shape. Tolerant:
// an unknown type degrades to "text" rather than blanking the question, and a
// missing key is minted so a hand-edited schema stays editable.
export function normalizeSchema(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const q of raw) {
    if (!q || typeof q !== "object") continue;
    const type = TYPES.includes(q.type) ? q.type : "text";
    out.push({
      key: typeof q.key === "string" && q.key ? q.key : nextKey(out),
      label: typeof q.label === "string" ? q.label : "",
      type,
      required: q.required !== false,
      options: CHOICE_LIKE.has(type) && Array.isArray(q.options)
        ? q.options.map((o) => String(o))
        : [],
      section: typeof q.section === "string" ? q.section : "",
      // Bind to a profile field, or "" (unknown values degrade to no prefill).
      prefill: typeof q.prefill === "string" && PREFILL_SET.has(q.prefill) ? q.prefill : "",
    });
  }
  return out;
}

// Mint the next free key: q<max+1> over the qN keys already present. Scans the
// WHOLE list (not just its length) so deleting q2 out of q1,q2,q3 and adding a
// new question yields q4 — never a recycled q2 that would inherit the deleted
// question's answers.
export function nextKey(list) {
  let max = 0;
  for (const q of list) {
    const m = /^q(\d+)$/.exec(q?.key || "");
    if (m) max = Math.max(max, Number(m[1]));
  }
  let n = max + 1;
  const taken = new Set(list.map((q) => q?.key));
  while (taken.has(`q${n}`)) n += 1; // paranoia: hand-written non-qN keys
  return `q${n}`;
}

// Strip the editor's working shape down to the wire shape: trimmed label,
// options ONLY on choice-likes, section omitted when blank.
function toWire(list) {
  return list.map((q) => {
    const out = {
      key: q.key,
      label: q.label.trim(),
      type: q.type,
      required: !!q.required,
    };
    if (CHOICE_LIKE.has(q.type)) {
      out.options = q.options.map((o) => o.trim()).filter(Boolean);
    }
    const section = (q.section || "").trim();
    if (section) out.section = section;
    // Only emit prefill when it's a recognised profile field — keeps the stored
    // schema clean and lets the server reject unknown bindings.
    if (q.prefill && PREFILL_SET.has(q.prefill)) out.prefill = q.prefill;
    return out;
  });
}

// Client-side sanity check → { [key]: message }. The server validates the same
// things (and more); this is just a fast, local first pass.
function validate(list, t) {
  const errs = {};
  const seen = new Set();
  for (const q of list) {
    if (!q.label.trim()) errs[q.key] = t("dash.form.err_label");
    else if (CHOICE_LIKE.has(q.type) && q.options.every((o) => !o.trim())) {
      errs[q.key] = t("dash.form.err_options");
    }
    if (seen.has(q.key)) errs[q.key] = `Duplicate key "${q.key}"`;
    seen.add(q.key);
  }
  return errs;
}

// Pull per-question errors out of a 422 body. The server keys them by question
// key; this reads the shapes it could plausibly arrive in without assuming one.
export function fieldErrorsFrom(detail) {
  if (!detail) return {};
  const out = {};
  const put = (k, v) => {
    if (typeof k === "string" && k) out[k] = typeof v === "string" ? v : String(v ?? "Invalid");
  };

  // { errors: {...} | [...] } → unwrap once.
  const body = detail && typeof detail === "object" && !Array.isArray(detail) && detail.errors
    ? detail.errors
    : detail;

  if (Array.isArray(body)) {
    for (const e of body) {
      if (!e || typeof e !== "object") continue;
      // FastAPI: { loc: ["body","answers","q3"], msg: "…" }
      if (Array.isArray(e.loc)) {
        const k = e.loc.filter((p) => typeof p === "string").pop();
        put(k, e.msg);
      } else {
        put(e.key || e.field, e.message || e.msg || e.detail);
      }
    }
    return out;
  }
  if (body && typeof body === "object") {
    for (const [k, v] of Object.entries(body)) put(k, v);
  }
  return out;
}

// Group consecutive questions that share a section into one heading (exactly how
// the member-facing form renders them). A blank section starts an unheaded run.
export function groupBySection(list) {
  const groups = [];
  for (const q of list) {
    const section = (q.section || "").trim();
    const last = groups[groups.length - 1];
    if (last && last.section === section) last.items.push(q);
    else groups.push({ section, items: [q] });
  }
  return groups;
}

// ── the builder ──────────────────────────────────────────────────────────────

export default function EventFormBuilder({
  event,
  onClose,
  onSaved,
  showToast,
  // API base for the WRITE (PATCH) — "/admin" (console) or "/partner" (panel).
  apiBase = "/admin",
  // How to READ one event (with its form_schema). Default is the public,
  // approved-only /events/{id}; the partner panel passes a scoped reader so a
  // pending event is still loadable. Both bases route only through these two.
  readEventPath = (id) => `/events/${id}`,
}) {
  const t = useT();
  const [questions, setQuestions] = useState([]);
  const [state, setState] = useState("loading"); // loading | ready | blocked
  const [tab, setTab] = useState("questions");   // questions | preview
  const [errors, setErrors] = useState({});      // { [key]: message }
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Load the questions this event already has. If that read fails while the
  // event is KNOWN to have a form, refuse to edit — saving over a schema we
  // couldn't read would silently wipe the founder's questions (and orphan every
  // answer already stored under their keys).
  useEffect(() => {
    let alive = true;
    (async () => {
      if (Object.prototype.hasOwnProperty.call(event, "form_schema")) {
        if (alive) {
          setQuestions(normalizeSchema(event.form_schema));
          setState("ready");
        }
        return;
      }
      try {
        const full = await bfu(readEventPath(event.id));
        if (!alive) return;
        setQuestions(normalizeSchema(full?.form_schema));
        setState("ready");
      } catch {
        if (!alive) return;
        if (event.has_form) setState("blocked");
        else {
          setQuestions([]);
          setState("ready");
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [event]);

  const mutate = useCallback((fn) => {
    setQuestions((qs) => fn(qs));
    setDirty(true);
  }, []);

  // Patch ONE question. `key` is deliberately not patchable — see the header.
  const patch = (key, changes) =>
    mutate((qs) => qs.map((q) => (q.key === key ? { ...q, ...changes, key: q.key } : q)));

  const addQuestion = () =>
    mutate((qs) => [
      ...qs,
      {
        key: nextKey(qs),
        label: "",
        type: "text",
        required: true,
        options: [],
        // Inherit the last section so a run of questions keeps its heading.
        section: qs.length ? qs[qs.length - 1].section : "",
        prefill: "",
      },
    ]);

  const removeQuestion = (key) => {
    if (!window.confirm(t("dash.form.remove_confirm"))) return;
    mutate((qs) => qs.filter((q) => q.key !== key)); // survivors keep their keys
    setErrors((e) => {
      const { [key]: _drop, ...rest } = e;
      return rest;
    });
  };

  const move = (key, delta) =>
    mutate((qs) => {
      const i = qs.findIndex((q) => q.key === key);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= qs.length) return qs;
      const next = [...qs];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const loadPreset = () => {
    if (questions.length && !window.confirm(t("dash.form.preset_confirm", { n: questions.length }))) {
      return;
    }
    // Fresh keys, q1…q30, in his order.
    const seeded = [];
    for (const q of MARSTIFF_SAT_SURVEY) {
      seeded.push({ ...q, key: nextKey(seeded), options: [] });
    }
    setQuestions(seeded);
    setErrors({});
    setDirty(true);
    setTab("questions");
  };

  // Existing sections, for the section-header datalist.
  const sections = useMemo(
    () => [...new Set(questions.map((q) => (q.section || "").trim()).filter(Boolean))],
    [questions]
  );

  async function save(list) {
    const local = validate(list, t);
    if (Object.keys(local).length) {
      setErrors(local);
      setTab("questions");
      showToast?.(t("dash.form.err_fix"), "err");
      return;
    }
    setSaving(true);
    setErrors({});
    const wire = toWire(list);
    try {
      // Whole EventBody + form_schema — see the header note on exclude_unset.
      const updated = await bfu(`${apiBase}/events/${event.id}`, {
        method: "PATCH",
        body: {
          type: event.type,
          title: event.title,
          description: event.description ?? null,
          link: event.link ?? null,
          cover_url: event.cover_url ?? null,
          deadline: event.deadline ?? null,
          region_id: event.region_id ?? null,
          partner_id: event.partner_id ?? null,
          form_schema: wire.length ? wire : null,
        },
      });
      showToast?.(wire.length ? t("dash.form.saved") : t("dash.form.cleared"));
      onSaved?.({ ...(updated || {}), has_form: wire.length > 0, form_schema: wire.length ? wire : null });
      onClose();
    } catch (err) {
      // The server validates the schema independently and answers with per-
      // question errors keyed by question key — pin them to their rows.
      const perQ = fieldErrorsFrom(err.detail);
      if (Object.keys(perQ).length) {
        setErrors(perQ);
        setTab("questions");
      }
      showToast?.(err.message || t("dash.form.err_save"), "err");
    } finally {
      setSaving(false);
    }
  }

  const clearForm = () => {
    if (!window.confirm(t("dash.form.clear_confirm"))) return;
    save([]);
  };

  const requestClose = useCallback(() => {
    if (dirty && !window.confirm(t("dash.form.discard_confirm"))) return;
    onClose();
  }, [dirty, onClose, t]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [requestClose]);

  const count = questions.length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("dash.events.form_title")}
      onClick={requestClose}
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
        style={{
          width: "100%", maxWidth: 880, maxHeight: "88vh",
          display: "flex", flexDirection: "column", margin: "auto",
          padding: 0, background: "var(--surface)", overflow: "hidden",
        }}
      >
        {/* header */}
        <div style={{ padding: "24px 26px 0", flex: "0 0 auto" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
            <div style={{ minWidth: 0 }}>
              <div className="ch-cell-label" style={{ marginBottom: 6 }}>{t("dash.form.kicker")}</div>
              <h2 style={{ margin: 0, fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 21, color: "var(--text)" }}>
                {t("dash.form.title")}
              </h2>
              <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--muted)", maxWidth: 620, lineHeight: 1.5 }}>
                {t("dash.form.subtitle")}
              </p>
              <div style={{ marginTop: 8, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)" }}>
                #{event.id} · {event.title}
              </div>
            </div>
            <button type="button" className="ch-btn-ghost" onClick={requestClose} style={{ padding: "6px 12px", fontSize: 12.5, flex: "0 0 auto" }}>
              {t("dash.form.close")}
            </button>
          </div>

          {/* tabs */}
          <div style={{ display: "flex", gap: 6, marginTop: 18, borderBottom: "1px solid var(--hair)" }}>
            {["questions", "preview"].map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  padding: "9px 4px", marginRight: 14,
                  fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase",
                  color: tab === id ? "var(--text)" : "var(--muted)",
                  borderBottom: `2px solid ${tab === id ? "var(--ember)" : "transparent"}`,
                  marginBottom: -1,
                }}
              >
                {t(id === "questions" ? "dash.form.tab_questions" : "dash.form.tab_preview")}
                {id === "questions" && count > 0 && (
                  <span style={{ marginLeft: 7, color: "var(--muted)" }}>{count}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* body */}
        <div style={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto", padding: "18px 26px" }}>
          {state === "loading" && (
            <div style={{ color: "var(--muted)", fontSize: 14, padding: "24px 0" }}>
              <span className="ch-spin" aria-hidden style={{ marginRight: 8 }}>◠</span>
              {t("dash.form.loading")}
            </div>
          )}

          {state === "blocked" && (
            <div style={{ color: "var(--terra)", fontSize: 14, lineHeight: 1.6, padding: "18px 0" }}>
              {t("dash.form.load_failed")}
            </div>
          )}

          {state === "ready" && tab === "questions" && (
            <>
              {count === 0 && (
                <div className="ch-grace" style={{ minHeight: 150 }}>
                  <span className="ch-grace-k">{t("dash.form.kicker")}</span>
                  <div className="ch-grace-t">{t("dash.form.empty_t")}</div>
                  <div className="ch-grace-s">{t("dash.form.empty_s")}</div>
                </div>
              )}

              {questions.map((q, i) => (
                <QuestionRow
                  key={q.key}
                  q={q}
                  index={i}
                  total={count}
                  error={errors[q.key]}
                  sections={sections}
                  onPatch={(changes) => patch(q.key, changes)}
                  onUp={() => move(q.key, -1)}
                  onDown={() => move(q.key, +1)}
                  onRemove={() => removeQuestion(q.key)}
                />
              ))}

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 6 }}>
                <button type="button" className="ch-btn-ghost" onClick={addQuestion} style={{ padding: "8px 14px", fontSize: 13 }}>
                  {t("dash.form.add_q")}
                </button>
                <button
                  type="button"
                  className="ch-btn-ghost"
                  onClick={loadPreset}
                  title={t("dash.form.preset_hint")}
                  style={{ padding: "8px 14px", fontSize: 13, borderColor: "var(--amber)", color: "var(--amber)" }}
                >
                  ◆ {t("dash.form.load_preset")}
                </button>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>{t("dash.form.preset_hint")}</span>
              </div>
            </>
          )}

          {state === "ready" && tab === "preview" && <Preview questions={questions} t={t} />}
        </div>

        {/* footer */}
        {state === "ready" && (
          <div
            style={{
              flex: "0 0 auto", display: "flex", alignItems: "center", justifyContent: "space-between",
              gap: 12, flexWrap: "wrap", padding: "16px 26px", borderTop: "1px solid var(--hair)",
              background: "var(--surface)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)", letterSpacing: "0.08em" }}>
                {count === 0 ? "—" : count === 1 ? t("dash.form.one_question") : t("dash.form.n_questions", { n: count })}
              </span>
              {count > 0 && (
                <button
                  type="button"
                  className="ch-btn-ghost"
                  onClick={clearForm}
                  disabled={saving}
                  style={{ padding: "7px 12px", fontSize: 12.5, borderColor: "rgba(192,86,59,0.5)", color: "var(--terra)" }}
                >
                  {t("dash.form.clear")}
                </button>
              )}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" className="ch-btn-ghost" onClick={requestClose} disabled={saving}>
                {t("dash.form.cancel")}
              </button>
              <button type="button" className="ch-btn-primary" onClick={() => save(questions)} disabled={saving}>
                {saving ? t("dash.form.saving") : t("dash.form.save")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── one editable question ────────────────────────────────────────────────────

function QuestionRow({ q, index, total, error, sections, onPatch, onUp, onDown, onRemove }) {
  const t = useT();
  const showOptions = CHOICE_LIKE.has(q.type);

  return (
    <div
      className="ch-cell"
      style={{
        padding: "14px 16px", marginBottom: 10,
        background: "var(--surface-2)",
        borderColor: error ? "rgba(192,86,59,0.6)" : undefined,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)", letterSpacing: "0.06em" }}>
          {t("dash.form.q_n", { n: index + 1 })}
        </span>
        {/* The stable id. Shown so the founder can see it never moves when he
            rewrites the question — answers are stored under it. */}
        <span
          title={t("dash.form.key_note")}
          style={{
            fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.06em",
            color: "var(--muted)", border: "1px solid var(--hair)", borderRadius: 99,
            padding: "2px 8px", background: "rgba(35,32,25,0.5)", cursor: "help",
          }}
        >
          {q.key}
        </span>

        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <IconBtn onClick={onUp} disabled={index === 0} title={t("dash.form.up")}>↑</IconBtn>
          <IconBtn onClick={onDown} disabled={index === total - 1} title={t("dash.form.down")}>↓</IconBtn>
          <IconBtn onClick={onRemove} title={t("dash.form.remove")} tone="terra">✕</IconBtn>
        </div>
      </div>

      <label style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
        <span style={labelStyle}>{t("dash.form.label")}</span>
        <textarea
          value={q.label}
          // Rewriting the label does NOT touch q.key — that is the whole point.
          onChange={(e) => onPatch({ label: e.target.value })}
          rows={2}
          placeholder={t("dash.form.label_ph")}
          style={{ ...inputStyle, width: "100%", resize: "vertical", lineHeight: 1.45 }}
        />
      </label>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, flex: "1 1 190px", minWidth: 0 }}>
          <span style={labelStyle}>{t("dash.form.type")}</span>
          <select
            value={q.type}
            onChange={(e) => {
              const type = e.target.value;
              // Leaving a choice-like type drops the options (the contract says
              // they exist ONLY there); entering one seeds a first blank line.
              onPatch({
                type,
                options: CHOICE_LIKE.has(type) ? (q.options.length ? q.options : [""]) : [],
              });
            }}
            style={{ ...selectStyle, width: "100%" }}
          >
            {TYPES.map((ty) => (
              <option key={ty} value={ty}>{t(`dash.form.t_${ty}`)}</option>
            ))}
          </select>
        </label>

        {/* Pre-fill this answer from the member's profile (still editable by them). */}
        <label style={{ display: "flex", flexDirection: "column", gap: 6, flex: "1 1 180px", minWidth: 0 }}>
          <span style={labelStyle}>{t("dash.form.prefill")}</span>
          <select
            value={q.prefill || ""}
            onChange={(e) => onPatch({ prefill: e.target.value })}
            style={{ ...selectStyle, width: "100%", ...(q.prefill ? { color: "var(--amber)", borderColor: "var(--amber)" } : {}) }}
            title={t("dash.form.prefill_hint")}
          >
            <option value="">{t("dash.form.prefill_none")}</option>
            {PREFILL_FIELDS.map((f) => (
              <option key={f} value={f}>{t(`dash.form.pf_${f}`)}</option>
            ))}
          </select>
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 6, flex: "2 1 240px", minWidth: 0 }}>
          <span style={labelStyle}>{t("dash.form.section")}</span>
          <input
            value={q.section}
            onChange={(e) => onPatch({ section: e.target.value })}
            list="bfu-form-sections"
            placeholder={t("dash.form.section_ph")}
            style={{ ...inputStyle, width: "100%" }}
          />
          <datalist id="bfu-form-sections">
            {sections.map((s) => <option key={s} value={s} />)}
          </datalist>
        </label>

        <label
          style={{
            display: "flex", alignItems: "center", gap: 8, flex: "0 0 auto",
            padding: "10px 12px", border: "1px solid var(--hair)", borderRadius: 11,
            background: "var(--surface)", cursor: "pointer", fontSize: 13, color: "var(--text)",
          }}
        >
          <input
            type="checkbox"
            checked={!!q.required}
            onChange={(e) => onPatch({ required: e.target.checked })}
            style={{ accentColor: "var(--ember)", width: 15, height: 15, cursor: "pointer" }}
          />
          {t("dash.form.required")}
        </label>
      </div>

      {showOptions && (
        <label style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 12 }}>
          <span style={labelStyle}>{t("dash.form.options")}</span>
          <textarea
            value={q.options.join("\n")}
            onChange={(e) => onPatch({ options: e.target.value.split("\n") })}
            rows={Math.min(8, Math.max(2, q.options.length + 1))}
            placeholder={t("dash.form.options_ph")}
            style={{ ...inputStyle, width: "100%", resize: "vertical", fontFamily: "var(--font-mono)", fontSize: 13 }}
          />
        </label>
      )}

      {error && (
        <div style={{ marginTop: 10, fontSize: 12.5, color: "var(--terra)" }}>{error}</div>
      )}
    </div>
  );
}

// ── live preview: exactly what a member sees, inert ──────────────────────────

function Preview({ questions, t }) {
  if (!questions.length) {
    return (
      <div className="ch-grace" style={{ minHeight: 150 }}>
        <span className="ch-grace-k">{t("dash.form.tab_preview")}</span>
        <div className="ch-grace-t">{t("dash.form.preview_empty")}</div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 16 }}>
        {t("dash.form.preview_note")}
      </div>
      {/* Inert on purpose: every control is disabled, so a stray click here can
          never be mistaken for filling the form in. */}
      <fieldset disabled style={{ border: "none", padding: 0, margin: 0, opacity: 0.95 }}>
        {groupBySection(questions).map((group, gi) => (
          <div key={`${group.section}-${gi}`} style={{ marginBottom: 22 }}>
            {group.section && (
              <div
                style={{
                  fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.1em",
                  textTransform: "uppercase", color: "var(--amber)",
                  paddingBottom: 8, marginBottom: 14, borderBottom: "1px solid var(--hair)",
                }}
              >
                {group.section}
              </div>
            )}
            {group.items.map((q) => (
              <div key={q.key} style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 14, color: "var(--text)", marginBottom: 7, lineHeight: 1.45 }}>
                  {q.label || <span style={{ color: "var(--muted)" }}>…</span>}
                  {q.required && <span style={{ color: "var(--terra)", marginLeft: 4 }}>*</span>}
                </div>
                {q.prefill && PREFILL_SET.has(q.prefill) && (
                  <div
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 5, marginBottom: 7,
                      fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.06em",
                      textTransform: "uppercase", color: "var(--amber)",
                      border: "1px solid var(--amber)", borderRadius: 99, padding: "2px 8px",
                    }}
                  >
                    ↳ {t("dash.form.prefill_badge", { field: t(`dash.form.pf_${q.prefill}`) })}
                  </div>
                )}
                <PreviewInput q={q} />
              </div>
            ))}
          </div>
        ))}
      </fieldset>
    </div>
  );
}

function PreviewInput({ q }) {
  const opts = q.options.map((o) => o.trim()).filter(Boolean);
  const box = { ...inputStyle, width: "100%", cursor: "default" };

  if (q.type === "paragraph") return <textarea rows={3} style={{ ...box, resize: "none" }} />;
  if (q.type === "number") return <input type="number" style={box} />;
  if (q.type === "date") return <input type="date" style={box} />;
  if (q.type === "phone") return <input type="tel" placeholder="+998 …" style={box} />;

  if (q.type === "dropdown") {
    return (
      <select style={{ ...selectStyle, width: "100%" }}>
        <option>—</option>
        {opts.map((o) => <option key={o}>{o}</option>)}
      </select>
    );
  }

  if (q.type === "choice" || q.type === "checkboxes") {
    const kind = q.type === "choice" ? "radio" : "checkbox";
    if (!opts.length) {
      return <div style={{ fontSize: 12.5, color: "var(--terra)" }}>—</div>;
    }
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {opts.map((o) => (
          <label key={o} style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13.5, color: "var(--text)" }}>
            <input type={kind} name={q.key} style={{ accentColor: "var(--ember)", width: 15, height: 15 }} />
            {o}
          </label>
        ))}
      </div>
    );
  }

  return <input type="text" style={box} />; // text
}

// ── local bits ───────────────────────────────────────────────────────────────

function IconBtn({ children, onClick, disabled, title, tone }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className="ch-btn-ghost"
      style={{
        padding: "5px 10px", fontSize: 12.5, lineHeight: 1.2,
        opacity: disabled ? 0.35 : 1,
        ...(tone === "terra" ? { borderColor: "rgba(192,86,59,0.5)", color: "var(--terra)" } : {}),
      }}
    >
      {children}
    </button>
  );
}

const labelStyle = {
  fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em",
  textTransform: "uppercase", color: "var(--muted)",
};

const inputStyle = {
  fontFamily: "var(--font-body)", fontSize: 14, color: "var(--text)",
  background: "var(--surface-2)", border: "1px solid var(--hair)",
  borderRadius: 11, padding: "10px 14px", outline: "none",
};

const selectStyle = {
  fontFamily: "var(--font-body)", fontSize: 14, color: "var(--text)",
  background: "var(--surface-2)", border: "1px solid var(--hair)",
  borderRadius: 11, padding: "10px 12px", cursor: "pointer",
};
