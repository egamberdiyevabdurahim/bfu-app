"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { bfu } from "@/lib/client-api";
import { Modal, Field, ActionBtn, Pill, inputStyle } from "@/components/dashboard/AdminEvents";
import { fmtTashkent } from "@/lib/datetime";

// Desktop door check-in for ONE event — the backup to the phone scanner (no
// camera here: a code box + a searchable roster). Serves both the admin console
// (apiBase "/admin") and the partner panel (apiBase "/partner").
//
// Contract (all via the authed bfu proxy):
//   POST {apiBase}/events/{id}/checkin { code }
//        → { ok, already_checked_in, user_id, name, checked_in_at }
//        · 404 unknown code · 409 code belongs to a DIFFERENT event
//   GET  {apiBase}/events/{id}/checkin-roster
//        → [ { user_id, code, name, checked_in } ]
//
// Two ways in:
//   (a) type the 6-char code → POST → green "✓ {name} checked in" / amber
//       "already checked in" / red "wrong event · invalid",
//   (b) the roster: search by name, press "✓ Check in" on a row (name-search
//       fallback for when a scan/read of the code fails).
// A successful check-in flips the matching roster row live.

// The code is 6 chars; be forgiving about how it's typed (spaces, case).
function normalizeCode(raw) {
  return String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
}

export default function EventCheckin({ event, apiBase = "/admin", onClose }) {
  const [roster, setRoster] = useState([]);
  const [rosterState, setRosterState] = useState("loading"); // loading | ready | error
  const [code, setCode] = useState("");
  const [search, setSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [rowBusy, setRowBusy] = useState(null); // user_id mid-checkin from the roster
  const [result, setResult] = useState(null);   // { tone, title, sub }
  const aliveRef = useRef(true);
  const codeRef = useRef(null);

  const loadRoster = useCallback(async () => {
    setRosterState("loading");
    try {
      const list = await bfu(`${apiBase}/events/${event.id}/checkin-roster`);
      if (!aliveRef.current) return;
      setRoster(Array.isArray(list) ? list : []);
      setRosterState("ready");
    } catch {
      if (aliveRef.current) setRosterState("error");
    }
  }, [apiBase, event.id]);

  useEffect(() => {
    aliveRef.current = true;
    loadRoster();
    codeRef.current?.focus?.();
    return () => {
      aliveRef.current = false;
    };
  }, [loadRoster]);

  // Mark a roster row checked-in in place (idempotent).
  const markChecked = useCallback((userId) => {
    if (userId == null) return;
    setRoster((rs) => rs.map((r) => (r.user_id === userId ? { ...r, checked_in: true } : r)));
  }, []);

  // The one code path both entry points share. Returns nothing; drives `result`.
  const runCheckin = useCallback(async (rawCode, { fromRoster = false, rosterUserId = null } = {}) => {
    const c = normalizeCode(rawCode);
    if (!c) return;
    if (fromRoster) setRowBusy(rosterUserId);
    else setSubmitting(true);
    try {
      const res = await bfu(`${apiBase}/events/${event.id}/checkin`, {
        method: "POST",
        body: { code: c },
      });
      if (!aliveRef.current) return;
      const name = res?.name || `#${res?.user_id ?? ""}`;
      markChecked(res?.user_id);
      if (res?.already_checked_in) {
        const when = fmtTashkent(res?.checked_in_at, { hour: "2-digit", minute: "2-digit" });
        setResult({ tone: "amber", title: `${name} — already checked in`, sub: when ? `Since ${when}` : "" });
      } else {
        setResult({ tone: "green", title: `✓ ${name} checked in`, sub: "" });
      }
      if (!fromRoster) setCode(""); // clear the box for the next attendee
    } catch (err) {
      if (!aliveRef.current) return;
      const status = err?.status;
      if (status === 404) {
        setResult({ tone: "red", title: "Invalid code", sub: `No registrant has code "${c}".` });
      } else if (status === 409) {
        setResult({ tone: "red", title: "Wrong event", sub: "That code belongs to a different event." });
      } else {
        setResult({ tone: "red", title: "Couldn't check in", sub: err?.message || "Please try again." });
      }
    } finally {
      if (!aliveRef.current) return;
      if (fromRoster) setRowBusy(null);
      else {
        setSubmitting(false);
        codeRef.current?.focus?.();
      }
    }
  }, [apiBase, event.id, markChecked]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return roster;
    return roster.filter(
      (r) =>
        (r.name || "").toLowerCase().includes(q) ||
        (r.code || "").toLowerCase().includes(q)
    );
  }, [roster, search]);

  const total = roster.length;
  const checkedCount = useMemo(() => roster.filter((r) => r.checked_in).length, [roster]);

  const resultTone =
    result?.tone === "green" ? "var(--green)" :
    result?.tone === "amber" ? "var(--amber)" : "var(--terra)";
  const resultBg =
    result?.tone === "green" ? "rgba(127,176,105,0.12)" :
    result?.tone === "amber" ? "rgba(232,161,92,0.1)" : "rgba(192,86,59,0.1)";

  return (
    <Modal label={`Check-in — ${event.title}`} onCancel={onClose}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
        <div style={{ minWidth: 0 }}>
          <div className="ch-cell-label" style={{ marginBottom: 6 }}>Door check-in</div>
          <h2 style={{ margin: 0, fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 20, color: "var(--text)" }}>
            {event.title}
          </h2>
          <div style={{ marginTop: 8, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)" }}>
            #{event.id}
            {rosterState === "ready" ? <> · {checkedCount}/{total} checked in</> : null}
          </div>
        </div>
        <button type="button" className="ch-btn-ghost" onClick={onClose} style={{ padding: "6px 12px", fontSize: 12.5, flex: "0 0 auto" }}>
          Close
        </button>
      </div>

      {/* (a) manual code entry — the desktop stand-in for a phone scan */}
      <Field label="Enter code">
        <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
          <input
            ref={codeRef}
            value={code}
            onChange={(e) => setCode(normalizeCode(e.target.value))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (!submitting) runCheckin(code);
              }
            }}
            placeholder="6-char code"
            aria-label="Attendee check-in code"
            autoComplete="off"
            spellCheck={false}
            style={{
              ...inputStyle,
              flex: "1 1 auto",
              minWidth: 0,
              fontFamily: "var(--font-mono)",
              fontSize: 18,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
            }}
          />
          <button
            type="button"
            className="ch-btn-primary"
            onClick={() => runCheckin(code)}
            disabled={submitting || normalizeCode(code).length === 0}
            style={{ flex: "0 0 auto", padding: "0 18px" }}
          >
            {submitting ? "…" : "Check in"}
          </button>
        </div>
      </Field>

      {result ? (
        <div
          role="status"
          style={{
            display: "flex", flexDirection: "column", gap: 2,
            padding: "10px 14px", borderRadius: 11, marginBottom: 16,
            border: `1px solid ${resultTone}`, background: resultBg,
          }}
        >
          <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14, color: resultTone }}>
            {result.title}
          </span>
          {result.sub ? (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--muted-strong)" }}>
              {result.sub}
            </span>
          ) : null}
        </div>
      ) : null}

      {/* (b) roster — name-search fallback for when a scan fails */}
      <div className="ch-cell-label" style={{ marginBottom: 8 }}>Roster</div>
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by name or code…"
        aria-label="Search roster"
        style={{ ...inputStyle, width: "100%", marginBottom: 10 }}
      />

      {rosterState === "loading" && (
        <div style={{ color: "var(--muted)", fontSize: 13, padding: "16px 0" }}>
          <span className="ch-spin" aria-hidden style={{ marginRight: 8 }}>◠</span>
          Loading roster…
        </div>
      )}
      {rosterState === "error" && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ color: "var(--terra)", fontSize: 13 }}>Couldn't load the roster.</span>
          <button type="button" className="ch-btn-ghost" onClick={loadRoster} style={{ padding: "6px 12px", fontSize: 12.5 }}>
            Retry
          </button>
        </div>
      )}

      {rosterState === "ready" && (
        total === 0 ? (
          <div style={{ color: "var(--muted)", fontSize: 13, padding: "12px 0" }}>
            No registrants yet.
          </div>
        ) : (
          <div
            style={{
              display: "flex", flexDirection: "column", gap: 2,
              maxHeight: 320, overflowY: "auto",
              border: "1px solid var(--hair)", borderRadius: 11,
              background: "var(--surface-2)", padding: "4px",
            }}
          >
            {filtered.length === 0 ? (
              <div style={{ color: "var(--muted)", fontSize: 13, padding: "12px 10px" }}>
                No one matches “{search.trim()}”.
              </div>
            ) : (
              filtered.map((r) => (
                <div
                  key={r.user_id}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "9px 10px", borderRadius: 8,
                  }}
                >
                  <div style={{ flex: "1 1 auto", minWidth: 0 }}>
                    <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 14, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {r.name || `#${r.user_id}`}
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: "0.1em", color: "var(--muted)" }}>
                      {r.code || "——————"}
                    </div>
                  </div>
                  {r.checked_in ? (
                    <Pill tone="green">✓ In</Pill>
                  ) : (
                    <ActionBtn
                      onClick={() => runCheckin(r.code, { fromRoster: true, rosterUserId: r.user_id })}
                      busy={rowBusy === r.user_id}
                      tone="ember"
                      title="Check this attendee in"
                    >
                      ✓ Check in
                    </ActionBtn>
                  )}
                </div>
              ))
            )}
          </div>
        )
      )}
    </Modal>
  );
}
