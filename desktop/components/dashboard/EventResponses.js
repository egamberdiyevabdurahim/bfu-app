"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { bfu } from "@/lib/client-api";
import { gradientFor, initials } from "@/lib/avatar";
import { useT } from "@/components/i18n/LocaleProvider";
import { fmtTashkent } from "@/lib/datetime";
import { normalizeSchema, groupBySection } from "@/components/dashboard/EventFormBuilder";

// The RESPONSES viewer for one event's registration form.
//
// BASE IS A PROP, NOT A CONSTANT. The SAME viewer serves the admin console
// (apiBase "/admin") and the partner panel (apiBase "/partner"); every read/write
// below routes through `apiBase` (or `readEventPath` for the single-event schema
// read) — there is no hardcoded "/admin".
//
// Reads (shown at the default "/admin" base):
//   GET {apiBase}/events/{id}/responses   → [{ user_id, display_name, tg_username,
//                                              phone_number, submitted_at, answers }]
//   GET {readEventPath(id)}               → the form_schema, so the columns come
//                                            out in the founder's question ORDER
//                                            with his LABELS (answers alone are a
//                                            bare {key: value} dict). Default
//                                            /events/{id}; partner passes a scoped
//                                            reader so pending events still load.
//   GET {apiBase}/events/{id}/responses.csv → the download (Excel-safe UTF-8).
//
// Layout problem this solves: the Marstiff SAT survey is 30 free-text questions,
// so a naive table is a mile wide and each cell is a paragraph. So: the table
// scrolls horizontally inside its own box (the page never does), every answer
// cell is clamped to three lines, and "Read" opens one person's full sheet.

// One respondent's answer for one question, as text. Checkbox answers arrive as
// a list; everything else as a string.
function answerText(value) {
  if (value === null || value === undefined || value === "") return "";
  if (Array.isArray(value)) return value.map((v) => String(v)).join("; ");
  return String(value);
}

// submitted_at / generated_at are NAIVE-UTC — render in Tashkent (a bare
// new Date would show them 5h early). "—" when absent.
function fmtWhen(iso) {
  return fmtTashkent(iso, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) || "—";
}

// The partner lead pipeline: where each registrant is on the way from "signed
// up" to "enrolled". Mirrors EventRsvp.lead_status on the backend. Order here is
// the funnel order the select offers.
const LEAD_STATUSES = ["registered", "showed", "scored", "called", "enrolled", "no_show"];

// Colour each stage so the pipeline is scannable in the table: the win state
// (enrolled) reads green, the drop-out (no_show) reads terra/red, the working
// stages warm up through ember/amber, and the untouched default stays muted.
function leadTone(status) {
  switch (status) {
    case "enrolled": return "var(--green)";
    case "no_show": return "var(--terra)";
    case "scored": return "var(--amber)";
    case "called": return "var(--amber)";
    case "showed": return "var(--ember)";
    case "registered":
    default: return "var(--muted)";
  }
}

export default function EventResponses({
  event,
  onClose,
  showToast,
  // API base for responses / funnel / ai-report / csv / lead-status + score
  // writes — "/admin" (console) or "/partner" (panel).
  apiBase = "/admin",
  // How to READ one event (for its form_schema). Default public /events/{id};
  // the partner panel passes a scoped reader so a pending event still loads.
  readEventPath = (id) => `/events/${id}`,
}) {
  const t = useT();
  const [rows, setRows] = useState([]);
  const [schema, setSchema] = useState([]);
  const [funnel, setFunnel] = useState(null); // GET /admin/events/{id}/funnel — stage counts
  const [sentFor, setSentFor] = useState(null); // user_id whose result DM we just triggered
  const [state, setState] = useState("loading"); // loading | ready | error
  const [csvBusy, setCsvBusy] = useState(false);
  const [openRow, setOpenRow] = useState(null); // one response, expanded
  const [aiOpen, setAiOpen] = useState(false);  // AI summary modal
  const [aiState, setAiState] = useState("idle"); // idle | loading | ready | error
  const [aiReport, setAiReport] = useState(null); // { summary, response_count, generated_at }
  // Guards the "result sent" timeout so it never sets state on an unmounted modal.
  const aliveRef = useRef(true);
  useEffect(() => () => { aliveRef.current = false; }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // The schema read is best-effort: if it fails we still show the answers,
        // just keyed by question key instead of by label.
        const [responses, full, funnelRes] = await Promise.all([
          bfu(`${apiBase}/events/${event.id}/responses`),
          Object.prototype.hasOwnProperty.call(event, "form_schema")
            ? Promise.resolve({ form_schema: event.form_schema })
            : bfu(readEventPath(event.id)).catch(() => null),
          // Best-effort: the funnel is a headline, but a failed read must not
          // hide the responses table.
          bfu(`${apiBase}/events/${event.id}/funnel`).catch(() => null),
        ]);
        if (!alive) return;
        setRows(Array.isArray(responses) ? responses : []);
        setSchema(normalizeSchema(full?.form_schema));
        setFunnel(funnelRes && typeof funnelRes === "object" ? funnelRes : null);
        setState("ready");
      } catch {
        if (alive) setState("error");
      }
    })();
    return () => {
      alive = false;
    };
  }, [event]);

  // Columns: the schema's questions in order. If the schema didn't load, fall
  // back to the union of the keys actually present in the answers, so the data
  // is never hidden just because the schema read failed.
  const columns = useMemo(() => {
    if (schema.length) return schema.map((q) => ({ key: q.key, label: q.label || q.key }));
    const keys = [];
    const seen = new Set();
    for (const r of rows) {
      for (const k of Object.keys(r?.answers || {})) {
        if (!seen.has(k)) {
          seen.add(k);
          keys.push(k);
        }
      }
    }
    return keys.map((k) => ({ key: k, label: k }));
  }, [schema, rows]);

  // Hit the CSV endpoint through the same authed proxy bfu() uses (the Bearer
  // token is attached server-side from the httpOnly cookie), then hand the blob
  // to the browser. A plain <a href> would work too, but this way a 403/500
  // surfaces as a toast instead of downloading an error page as "…​.csv".
  const downloadCsv = useCallback(async () => {
    setCsvBusy(true);
    try {
      const res = await fetch(`/web/api/bfu${apiBase}/events/${event.id}/responses.csv`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const slug = (event.title || "event")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40) || "event";
      a.download = `${slug}-responses.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      showToast?.(err.message || t("dash.resp.csv_failed"), "err");
    } finally {
      setCsvBusy(false);
    }
  }, [apiBase, event.id, event.title, showToast, t]);

  // Patch one response row in place (optimistic), keyed by user_id.
  const patchRespRow = useCallback((userId, patch) => {
    setRows((rs) => rs.map((r) => (r.user_id === userId ? { ...r, ...patch } : r)));
  }, []);

  // Lead-status change: PATCH /admin/events/{id}/responses/{user_id} { lead_status }.
  // Optimistic — flip the cell immediately, roll back on failure.
  const setLeadStatus = useCallback(async (r, next) => {
    const prev = r.lead_status || "registered";
    if (next === prev) return;
    patchRespRow(r.user_id, { lead_status: next });
    try {
      const res = await bfu(`${apiBase}/events/${event.id}/responses/${r.user_id}`, {
        method: "PATCH",
        body: { lead_status: next },
      });
      if (res && typeof res.lead_status === "string") patchRespRow(r.user_id, { lead_status: res.lead_status });
      showToast?.(t("dash.resp.lead_saved"));
    } catch (err) {
      patchRespRow(r.user_id, { lead_status: prev });
      showToast?.(err.message || t("dash.resp.lead_failed"), "err");
    }
  }, [apiBase, event.id, patchRespRow, showToast, t]);

  // Score commit (on blur, not per keystroke): PATCH { score }. Empty clears to
  // null; otherwise a whole number. No-ops when unchanged.
  const setScore = useCallback(async (r, raw) => {
    const prev = r.score ?? null;
    const trimmed = String(raw).trim();
    let next;
    if (trimmed === "") next = null;
    else {
      const n = Number(trimmed);
      if (!Number.isFinite(n)) return; // garbage input — leave the stored value alone
      next = Math.trunc(n);
    }
    if (next === prev) return;
    patchRespRow(r.user_id, { score: next });
    try {
      const res = await bfu(`${apiBase}/events/${event.id}/responses/${r.user_id}`, {
        method: "PATCH",
        body: { score: next },
      });
      if (res && Object.prototype.hasOwnProperty.call(res, "score")) patchRespRow(r.user_id, { score: res.score });
      // Setting a score (not clearing it) makes the backend DM the student their
      // result. Say so — a toast + a brief inline "sent" tick by the input.
      if (next != null) {
        showToast?.(t("dash.resp.score_sent"));
        setSentFor(r.user_id);
        setTimeout(() => {
          if (aliveRef.current) setSentFor((cur) => (cur === r.user_id ? null : cur));
        }, 4000);
      } else {
        showToast?.(t("dash.resp.score_saved"));
      }
    } catch (err) {
      patchRespRow(r.user_id, { score: prev });
      showToast?.(err.message || t("dash.resp.score_failed"), "err");
    }
  }, [apiBase, event.id, patchRespRow, showToast, t]);

  // Ask the backend for a one-shot AI summary of every answer. The service is
  // robust to 0 responses (returns a "no responses yet" summary), so this is
  // always allowed once the responses have loaded.
  const openAiReport = useCallback(async () => {
    setAiOpen(true);
    setAiState("loading");
    try {
      const rep = await bfu(`${apiBase}/events/${event.id}/ai-report`);
      setAiReport(rep || {});
      setAiState("ready");
    } catch {
      setAiState("error");
    }
  }, [apiBase, event.id]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (aiOpen) setAiOpen(false);
      else if (openRow) setOpenRow(null);
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, openRow, aiOpen]);

  const count = rows.length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("dash.events.responses_title")}
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 90,
        background: "rgba(6,5,4,0.7)", backdropFilter: "blur(3px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="ch-cell"
        style={{
          width: "100%", maxWidth: 1040, maxHeight: "88vh",
          display: "flex", flexDirection: "column",
          padding: 0, background: "var(--surface)", overflow: "hidden",
        }}
      >
        {/* header */}
        <div
          style={{
            flex: "0 0 auto", padding: "24px 26px 18px",
            display: "flex", alignItems: "flex-start", justifyContent: "space-between",
            gap: 16, flexWrap: "wrap", borderBottom: "1px solid var(--hair)",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div className="ch-cell-label" style={{ marginBottom: 6 }}>{t("dash.resp.kicker")}</div>
            <h2 style={{ margin: 0, fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 21, color: "var(--text)" }}>
              {t("dash.resp.title")}
            </h2>
            <div style={{ marginTop: 8, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)" }}>
              #{event.id} · {event.title}
              {state === "ready" && (
                <> · {count === 1 ? t("dash.resp.one") : t("dash.resp.count", { n: count })}</>
              )}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flex: "0 0 auto", flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button
              type="button"
              className="ch-btn-ghost"
              onClick={openAiReport}
              disabled={state !== "ready"}
              title={t("dash.resp.ai_title")}
              style={{ padding: "7px 13px", fontSize: 12.5, borderColor: "var(--ember)", color: "var(--ember)" }}
            >
              ✦ {t("dash.resp.ai_btn")}
            </button>
            <button
              type="button"
              className="ch-btn-ghost"
              onClick={downloadCsv}
              disabled={csvBusy || state !== "ready" || count === 0}
              style={{ padding: "7px 13px", fontSize: 12.5, borderColor: "var(--amber)", color: "var(--amber)" }}
            >
              {csvBusy ? t("dash.resp.csv_busy") : `↓ ${t("dash.resp.csv")}`}
            </button>
            <button type="button" className="ch-btn-ghost" onClick={onClose} style={{ padding: "7px 13px", fontSize: 12.5 }}>
              {t("dash.resp.close")}
            </button>
          </div>
        </div>

        {/* body */}
        <div style={{ flex: "1 1 auto", overflow: "auto", padding: "18px 26px 26px" }}>
          {state === "loading" && (
            <div style={{ color: "var(--muted)", fontSize: 14, padding: "24px 0" }}>
              <span className="ch-spin" aria-hidden style={{ marginRight: 8 }}>◠</span>
              {t("dash.resp.loading")}
            </div>
          )}

          {state === "error" && (
            <div style={{ color: "var(--terra)", fontSize: 14 }}>{t("dash.resp.error")}</div>
          )}

          {state === "ready" && funnel && (funnel.total || 0) > 0 && (
            <Funnel data={funnel} t={t} />
          )}

          {state === "ready" && count === 0 && (
            <div className="ch-grace" style={{ minHeight: 160 }}>
              <span className="ch-grace-k">{t("dash.resp.kicker")}</span>
              <div className="ch-grace-t">{t("dash.resp.empty_t")}</div>
              <div className="ch-grace-s">
                {event.has_form === false && !schema.length ? t("dash.resp.no_form") : t("dash.resp.empty_s")}
              </div>
            </div>
          )}

          {state === "ready" && count > 0 && (
            // The table — and ONLY the table — scrolls sideways.
            <div style={{ overflowX: "auto", border: "1px solid var(--hair)", borderRadius: 12 }}>
              <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 640 }}>
                <thead>
                  <tr>
                    <Th sticky>{t("dash.resp.person")}</Th>
                    <Th>{t("dash.resp.stage")}</Th>
                    <Th>{t("dash.resp.score")}</Th>
                    <Th>{t("dash.resp.submitted")}</Th>
                    <Th>{t("dash.resp.phone")}</Th>
                    {columns.map((c) => (
                      <Th key={c.key} title={c.label}>
                        <span style={{ display: "block", maxWidth: 260 }}>{c.label}</span>
                      </Th>
                    ))}
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const zebra = i % 2 === 1;
                    return (
                      <tr key={r.user_id ?? i}>
                        <Td sticky zebra={zebra}>
                          <Person r={r} />
                        </Td>
                        <Td zebra={zebra}>
                          <LeadStatusSelect
                            value={r.lead_status || "registered"}
                            onChange={(next) => setLeadStatus(r, next)}
                            t={t}
                          />
                        </Td>
                        <Td zebra={zebra}>
                          <ScoreCell
                            value={r.score}
                            onCommit={(raw) => setScore(r, raw)}
                            sent={sentFor === r.user_id}
                            t={t}
                          />
                        </Td>
                        <Td zebra={zebra}>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--muted)", whiteSpace: "nowrap" }}>
                            {fmtWhen(r.submitted_at)}
                          </span>
                        </Td>
                        <Td zebra={zebra}>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--muted)", whiteSpace: "nowrap" }}>
                            {r.phone_number || t("dash.resp.none")}
                          </span>
                        </Td>
                        {columns.map((c) => (
                          <Td key={c.key} zebra={zebra}>
                            <AnswerCell text={answerText(r.answers?.[c.key])} t={t} />
                          </Td>
                        ))}
                        <Td zebra={zebra}>
                          <button
                            type="button"
                            className="ch-btn-ghost"
                            onClick={() => setOpenRow(r)}
                            style={{ padding: "6px 11px", fontSize: 12, whiteSpace: "nowrap" }}
                          >
                            {t("dash.resp.open")}
                          </button>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {openRow && (
        <ResponseSheet
          row={openRow}
          schema={schema}
          columns={columns}
          onClose={() => setOpenRow(null)}
        />
      )}

      {aiOpen && (
        <AiReportModal
          event={event}
          state={aiState}
          report={aiReport}
          onRetry={openAiReport}
          onClose={() => setAiOpen(false)}
        />
      )}
    </div>
  );
}

// ── lead pipeline: a colour-coded status select per registrant ────────────────

function LeadStatusSelect({ value, onChange, t }) {
  const tone = leadTone(value);
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={t("dash.resp.stage")}
      style={{
        fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.04em",
        textTransform: "uppercase", color: tone,
        background: "var(--surface-2)",
        border: `1px solid ${tone === "var(--muted)" ? "var(--hair)" : tone}`,
        borderRadius: 99, padding: "5px 9px", cursor: "pointer", outline: "none",
        maxWidth: 150,
      }}
    >
      {LEAD_STATUSES.map((s) => (
        <option key={s} value={s} style={{ color: "var(--text)", textTransform: "none" }}>
          {t(`dash.resp.lead.${s}`)}
        </option>
      ))}
    </select>
  );
}

// ── score cell: number input that only commits (PATCH) on blur / Enter ────────

function ScoreCell({ value, onCommit, sent, t }) {
  const [draft, setDraft] = useState(value == null ? "" : String(value));
  // Re-sync when the stored value changes underneath us (optimistic rollback,
  // or a fresh server value replacing the optimistic one).
  useEffect(() => {
    setDraft(value == null ? "" : String(value));
  }, [value]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <input
        type="number"
        inputMode="numeric"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => onCommit(draft)}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
        placeholder={t("dash.resp.score_ph")}
        aria-label={t("dash.resp.score")}
        style={{
          fontFamily: "var(--font-mono)", fontSize: 12.5, color: "var(--text)",
          background: "var(--surface-2)", border: `1px solid ${sent ? "var(--green)" : "var(--hair)"}`,
          borderRadius: 9, padding: "6px 8px", width: 74, outline: "none",
        }}
      />
      {/* The backend DMs the student their result when a score is saved — confirm it. */}
      {sent && (
        <span style={{
          fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: "0.04em",
          color: "var(--green)", whiteSpace: "nowrap",
        }}>
          ✦ {t("dash.resp.result_sent")}
        </span>
      )}
    </div>
  );
}

// ── AI summary modal: one Claude pass over every answer ───────────────────────

function AiReportModal({ event, state, report, onRetry, onClose }) {
  const t = useT();
  const count = report?.response_count;
  const summary = (report?.summary || "").trim();
  const generatedAt = report?.generated_at;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("dash.resp.ai_title")}
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 95,
        background: "rgba(6,5,4,0.72)", backdropFilter: "blur(3px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="ch-cell"
        style={{
          width: "100%", maxWidth: 620, maxHeight: "84vh",
          display: "flex", flexDirection: "column", padding: 0,
          background: "var(--surface)", overflow: "hidden",
        }}
      >
        <div
          style={{
            flex: "0 0 auto", padding: "22px 24px 16px", borderBottom: "1px solid var(--hair)",
            display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div className="ch-cell-label" style={{ marginBottom: 6 }}>{t("dash.resp.ai_kicker")}</div>
            <h2 style={{ margin: 0, fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 20, color: "var(--text)" }}>
              {t("dash.resp.ai_title")}
            </h2>
            <div style={{ marginTop: 8, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)" }}>
              #{event.id} · {event.title}
              {state === "ready" && typeof count === "number" && (
                <> · {count === 1 ? t("dash.resp.one") : t("dash.resp.count", { n: count })}</>
              )}
            </div>
          </div>
          <button type="button" className="ch-btn-ghost" onClick={onClose} style={{ padding: "6px 12px", fontSize: 12.5, flex: "0 0 auto" }}>
            {t("dash.resp.close")}
          </button>
        </div>

        <div style={{ flex: "1 1 auto", overflowY: "auto", padding: "20px 24px 24px" }}>
          {state === "loading" && (
            <div style={{ color: "var(--muted)", fontSize: 14, padding: "16px 0" }}>
              <span className="ch-spin" aria-hidden style={{ marginRight: 8 }}>◠</span>
              {t("dash.resp.ai_loading")}
            </div>
          )}

          {state === "error" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14, alignItems: "flex-start" }}>
              <div style={{ color: "var(--terra)", fontSize: 14 }}>{t("dash.resp.ai_error")}</div>
              <button type="button" className="ch-btn-ghost" onClick={onRetry} style={{ padding: "7px 13px", fontSize: 12.5 }}>
                {t("dash.resp.ai_retry")}
              </button>
            </div>
          )}

          {state === "ready" && (
            <>
              <div style={{ fontSize: 14.5, color: "var(--text)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                {summary || t("dash.resp.ai_empty")}
              </div>
              {generatedAt && (
                <div style={{ marginTop: 18, fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--muted)" }}>
                  {t("dash.resp.ai_generated", { when: fmtWhen(generatedAt) })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── one answer cell: clamped to 3 lines, expandable in place ─────────────────

function AnswerCell({ text, t }) {
  const [open, setOpen] = useState(false);
  if (!text) return <span style={{ color: "var(--muted)" }}>{t("dash.resp.none")}</span>;

  // ~150 chars is where 3 clamped lines run out at this column width; below that
  // there is nothing to expand.
  const long = text.length > 150;

  return (
    <div style={{ maxWidth: 300, minWidth: 160 }}>
      <div
        style={{
          fontSize: 13, color: "var(--text)", lineHeight: 1.5, whiteSpace: "pre-wrap",
          ...(open || !long
            ? {}
            : {
                display: "-webkit-box",
                WebkitLineClamp: 3,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }),
        }}
      >
        {text}
      </div>
      {long && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          style={{
            marginTop: 3, background: "none", border: "none", padding: 0, cursor: "pointer",
            fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: "0.06em",
            textTransform: "uppercase", color: "var(--amber)",
          }}
        >
          {open ? t("dash.resp.less") : t("dash.resp.more")}
        </button>
      )}
    </div>
  );
}

// ── one person's full sheet: every question + their answer, in order ─────────

function ResponseSheet({ row, schema, columns, onClose }) {
  const t = useT();
  const name = row.display_name || row.tg_username || `#${row.user_id}`;
  // Prefer the schema (sections + order + labels); fall back to bare columns.
  const groups = schema.length
    ? groupBySection(schema)
    : [{ section: "", items: columns.map((c) => ({ ...c, required: false })) }];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={name}
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
      style={{
        position: "fixed", inset: 0, zIndex: 95,
        background: "rgba(6,5,4,0.72)", backdropFilter: "blur(3px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="ch-cell"
        style={{
          width: "100%", maxWidth: 640, maxHeight: "84vh",
          display: "flex", flexDirection: "column", padding: 0,
          background: "var(--surface)", overflow: "hidden",
        }}
      >
        <div
          style={{
            flex: "0 0 auto", padding: "22px 24px 16px", borderBottom: "1px solid var(--hair)",
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <Person r={row} />
            <div style={{ marginTop: 8, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)" }}>
              {fmtWhen(row.submitted_at)}
              {row.phone_number ? ` · ${row.phone_number}` : ""}
            </div>
          </div>
          <button type="button" className="ch-btn-ghost" onClick={onClose} style={{ padding: "6px 12px", fontSize: 12.5, flex: "0 0 auto" }}>
            {t("dash.resp.close")}
          </button>
        </div>

        <div style={{ flex: "1 1 auto", overflowY: "auto", padding: "18px 24px 24px" }}>
          {groups.map((group, gi) => (
            <div key={`${group.section}-${gi}`} style={{ marginBottom: 20 }}>
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
              {group.items.map((q) => {
                const text = answerText(row.answers?.[q.key]);
                return (
                  <div key={q.key} style={{ marginBottom: 15 }}>
                    <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 4, lineHeight: 1.45 }}>
                      {q.label || q.key}
                    </div>
                    <div style={{ fontSize: 14, color: text ? "var(--text)" : "var(--muted)", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
                      {text || t("dash.resp.none")}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── the funnel: registered → showed → scored → called → enrolled ─────────────
// The headline. Reads GET /admin/events/{id}/funnel and lays the pipeline out as
// horizontal bars (count + % of total), with the off-pipeline states (going /
// interested / waitlisted / no-show) as chips underneath.

function Funnel({ data, t }) {
  const total = data.total || 0;
  if (!total) return null;

  // Pipeline order. Colours mirror the lead-status palette used in the table.
  const STAGES = [
    { key: "registered", tone: "var(--muted)" },
    { key: "showed", tone: "var(--ember)" },
    { key: "scored", tone: "var(--amber)" },
    { key: "called", tone: "var(--amber)" },
    { key: "enrolled", tone: "var(--green)" },
  ];
  // Off-pipeline tallies, shown only when non-zero.
  const CHIPS = [
    { key: "going", tone: "var(--green)" },
    { key: "interested", tone: "var(--muted)" },
    { key: "waitlisted", tone: "var(--amber)" },
    { key: "no_show", tone: "var(--terra)" },
  ];
  const pct = (n) => (total ? Math.round((n / total) * 100) : 0);
  const chipLabel = (key) =>
    key === "no_show" ? t("dash.resp.lead.no_show") : t(`dash.resp.funnel.${key}`);

  return (
    <div className="ch-cell" style={{ padding: "18px 20px", marginBottom: 22, background: "var(--surface-2)" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <div className="ch-cell-label">{t("dash.resp.funnel_kicker")}</div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)" }}>
          {t("dash.resp.funnel_total", { n: total })}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        {STAGES.map(({ key, tone }) => {
          const n = data[key] || 0;
          const p = pct(n);
          return (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div
                title={t(`dash.resp.lead.${key}`)}
                style={{
                  flex: "0 0 118px", fontFamily: "var(--font-mono)", fontSize: 11,
                  letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--muted)",
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}
              >
                {t(`dash.resp.lead.${key}`)}
              </div>
              <div
                style={{
                  flex: "1 1 auto", height: 22, borderRadius: 6, position: "relative",
                  background: "var(--surface)", border: "1px solid var(--hair)", overflow: "hidden",
                }}
              >
                {/* Bar width tracks % of total; a hair of width so a non-zero count is never invisible. */}
                <div style={{ position: "absolute", inset: 0, width: `${n > 0 ? Math.max(p, 3) : 0}%`, background: tone, opacity: 0.32, transition: "width 0.4s ease" }} />
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", paddingLeft: 9, gap: 8 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--text)" }}>{n}</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--muted)" }}>{p}%</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {CHIPS.some(({ key }) => (data[key] || 0) > 0) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
          {CHIPS.filter(({ key }) => (data[key] || 0) > 0).map(({ key, tone }) => (
            <span
              key={key}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: "0.04em",
                textTransform: "uppercase", color: tone,
                border: `1px solid ${tone}`, borderRadius: 99, padding: "3px 10px",
              }}
            >
              {chipLabel(key)} <b style={{ color: "var(--text)" }}>{data[key] || 0}</b>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── bits ────────────────────────────────────────────────────────────────────

function Person({ r }) {
  const name = r.display_name || r.tg_username || `#${r.user_id}`;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 150 }}>
      <div
        style={{
          width: 34, height: 34, borderRadius: "50%", flex: "0 0 auto",
          background: gradientFor(r.user_id ?? name),
          display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 12.5, color: "#160E08",
        }}
      >
        {initials(name)}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 170 }}>
          {name}
        </div>
        {r.tg_username && (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--muted)" }}>
            @{r.tg_username}
          </div>
        )}
      </div>
    </div>
  );
}

function Th({ children, title, sticky }) {
  return (
    <th
      title={title}
      style={{
        textAlign: "left", padding: "11px 14px",
        borderBottom: "1px solid var(--hair)",
        fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.08em",
        textTransform: "uppercase", color: "var(--muted)", fontWeight: 400,
        verticalAlign: "bottom", whiteSpace: "normal",
        background: "var(--surface)",
        ...(sticky ? { position: "sticky", left: 0, zIndex: 2 } : {}),
      }}
    >
      {children}
    </th>
  );
}

// The zebra tint is painted on the CELL, not the row, and always over an opaque
// base — the sticky first column has to be opaque (otherwise the answer columns
// scroll visibly underneath it) while still carrying the same stripe as the rest
// of its row, and a translucent stripe on <tr> can't do both.
function Td({ children, sticky, zebra }) {
  const background = zebra
    ? "linear-gradient(rgba(255,255,255,0.02), rgba(255,255,255,0.02)), var(--surface)"
    : "var(--surface)";
  return (
    <td
      style={{
        padding: "12px 14px", borderBottom: "1px solid var(--hair)", verticalAlign: "top",
        background,
        ...(sticky ? { position: "sticky", left: 0, zIndex: 1 } : {}),
      }}
    >
      {children}
    </td>
  );
}
