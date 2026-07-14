"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { bfu } from "@/lib/client-api";
import { gradientFor, initials } from "@/lib/avatar";
import { useT } from "@/components/i18n/LocaleProvider";
import { normalizeSchema, groupBySection } from "@/components/dashboard/EventFormBuilder";

// The RESPONSES viewer for one event's registration form (/dashboard/events).
//
// Reads:
//   GET /admin/events/{id}/responses      → [{ user_id, display_name, tg_username,
//                                              phone_number, submitted_at, answers }]
//   GET /events/{id}                      → the form_schema, so the columns come
//                                            out in the founder's question ORDER
//                                            with his LABELS (answers alone are a
//                                            bare {key: value} dict).
//   GET /admin/events/{id}/responses.csv  → the download (Excel-safe UTF-8).
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

function fmtWhen(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

export default function EventResponses({ event, onClose, showToast }) {
  const t = useT();
  const [rows, setRows] = useState([]);
  const [schema, setSchema] = useState([]);
  const [state, setState] = useState("loading"); // loading | ready | error
  const [csvBusy, setCsvBusy] = useState(false);
  const [openRow, setOpenRow] = useState(null); // one response, expanded

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // The schema read is best-effort: if it fails we still show the answers,
        // just keyed by question key instead of by label.
        const [responses, full] = await Promise.all([
          bfu(`/admin/events/${event.id}/responses`),
          Object.prototype.hasOwnProperty.call(event, "form_schema")
            ? Promise.resolve({ form_schema: event.form_schema })
            : bfu(`/events/${event.id}`).catch(() => null),
        ]);
        if (!alive) return;
        setRows(Array.isArray(responses) ? responses : []);
        setSchema(normalizeSchema(full?.form_schema));
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
      const res = await fetch(`/web/api/bfu/admin/events/${event.id}/responses.csv`, {
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
  }, [event.id, event.title, showToast, t]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (openRow) setOpenRow(null);
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, openRow]);

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
          <div style={{ display: "flex", gap: 8, flex: "0 0 auto" }}>
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
