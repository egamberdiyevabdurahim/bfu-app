import { useState, useEffect, useRef, useCallback } from "react";
import QRCode from "qrcode";
import { events } from "../api";
import { Icon } from "./Icons";
import { useT } from "../i18n";
import { haptic } from "../tg";
import { fmtTime } from "../timefmt";

// ─────────────────────────────────────────────────────────────────────────────
// Event check-in — two faces of the same door.
//
//  • TicketModal (attendee): the QR + 6-char code door staff scan. Rendered
//    client-side from the `qr` string, so once opened it keeps working with no
//    signal. Shows a "checked in" badge once the door has scanned it.
//  • ScannerModal (partner/admin staff): Telegram's native QR scanner kept OPEN
//    for continuous scanning, a manual code field, and a searchable roster with
//    tap-to-check-in. The roster is pre-loaded so a decoded code shows the
//    attendee's name instantly even on weak signal.
//
// Every string lives in src/i18n.jsx under `events.ticket.*` / `events.scan.*`.
// ─────────────────────────────────────────────────────────────────────────────

// True when the running Telegram client can pop the native QR scanner.
export const hasNativeScanner = () =>
  typeof window !== "undefined" && typeof window.Telegram?.WebApp?.showScanQrPopup === "function";

// A scanned QR is "{event_id}.{code}"; the manual field is the bare code. Both are
// accepted by the backend, but for an INSTANT roster name-lookup we want the code.
const codeOf = (raw) => {
  const s = String(raw || "").trim();
  return s.includes(".") ? s.split(".").pop() : s;
};

// ── Attendee ticket ──────────────────────────────────────────────────────────
export const TicketModal = ({ event, onClose }) => {
  const { t } = useT();
  const eventId = event?.id;
  const [ticket, setTicket] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);

  const load = useCallback(async () => {
    if (!eventId) return;
    setLoading(true); setErr(false);
    try {
      const tk = await events.myTicket(eventId);
      setTicket(tk);
      if (tk?.qr) {
        // High error-correction + a fat quiet zone so a phone camera locks on
        // fast; dark bars on a pure-white module field (a coloured QR won't scan).
        const url = await QRCode.toDataURL(String(tk.qr), {
          errorCorrectionLevel: "M", margin: 2, width: 480,
          color: { dark: "#0A0A0F", light: "#FFFFFF" },
        });
        setQrDataUrl(url);
      }
    } catch { setErr(true); }
    setLoading(false);
  }, [eventId]);

  useEffect(() => { load(); }, [load]);

  const checkedIn = !!ticket?.checked_in;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 360, background: "var(--bg)",
      maxWidth: 430, margin: "0 auto", display: "flex", flexDirection: "column",
    }}>
      {/* Header */}
      <div style={{
        flex: "0 0 auto", padding: "calc(var(--safe-t) + 14px) 16px 12px",
        borderBottom: "1px solid var(--hair)", background: "var(--surface)",
        display: "flex", alignItems: "center", gap: 12,
      }}>
        <button onClick={onClose} aria-label={t("common.close")} style={{
          width: 38, height: 38, borderRadius: 11, border: "1px solid var(--hair)",
          background: "var(--surface-2)", color: "var(--text-2)", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}><Icon name="x" size={18} /></button>
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.14em",
            textTransform: "uppercase", color: "var(--amber)",
          }}>{t("events.ticket.kicker")}</div>
          <div style={{
            fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 17, color: "var(--text)",
            lineHeight: 1.25, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>{ticket?.event_title || event?.title || ""}</div>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "22px 20px calc(var(--safe-b) + 24px)" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: 60, color: "var(--text-3)" }}>
            <Icon name="loader" size={22} color="var(--amber)" />
          </div>
        ) : err ? (
          <div style={{ textAlign: "center", padding: 40 }}>
            <div style={{ color: "var(--terra)", fontSize: 14, marginBottom: 14 }}>{t("events.ticket.loadError")}</div>
            <button className="btn-ghost" onClick={load}>{t("common.retry")}</button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
            <div style={{ fontSize: 13.5, color: "var(--text-2)", lineHeight: 1.5, maxWidth: 300, marginBottom: 20 }}>
              {t("events.ticket.instructions")}
            </div>

            {/* QR — dark on a padded white card so a camera reads it in any theme */}
            <div style={{
              background: "#FFFFFF", padding: 16, borderRadius: "var(--radius-md)",
              boxShadow: "0 10px 30px rgba(0,0,0,0.35)", lineHeight: 0,
            }}>
              {qrDataUrl
                ? <img src={qrDataUrl} alt={t("events.ticket.kicker")} width={216} height={216} style={{ display: "block", width: 216, height: 216 }} />
                : <div style={{ width: 216, height: 216, display: "flex", alignItems: "center", justifyContent: "center", color: "#0A0A0F", fontFamily: "var(--font-mono)" }}>—</div>}
            </div>

            {/* Manual fallback code */}
            <div style={{ marginTop: 22, fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-3)" }}>
              {t("events.ticket.codeLabel")}
            </div>
            <div style={{
              marginTop: 6, fontFamily: "var(--font-mono)", fontWeight: 700,
              fontSize: 34, letterSpacing: "0.18em", color: "var(--text)",
              paddingLeft: "0.18em", // optical: balance the trailing tracking
            }}>{ticket?.code || "—"}</div>

            {/* Checked-in badge */}
            {checkedIn && (
              <div style={{
                marginTop: 22, display: "inline-flex", alignItems: "center", gap: 8,
                padding: "9px 16px", borderRadius: "var(--radius-pill)",
                background: "rgba(127,176,105,0.14)", border: "1px solid rgba(127,176,105,0.4)",
                color: "var(--green)", fontWeight: 700, fontSize: 14,
              }}>
                <span aria-hidden>✓</span> {t("events.ticket.checkedIn")}
              </div>
            )}

            {/* Refresh — check-in status is a door action, not live-pushed */}
            <button className="btn-ghost" onClick={load} style={{ marginTop: 22, padding: "9px 18px", fontSize: 13 }}>
              ↻ {t("events.ticket.refresh")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Staff scanner ────────────────────────────────────────────────────────────
// `base` is "admin" or "partner" (which check-in router to hit). `initialRoster`
// is pre-loaded by the caller (EventDetail) so a scan resolves a name instantly.
export const ScannerModal = ({ event, base = "admin", initialRoster = null, onClose }) => {
  const { t } = useT();
  const eventId = event?.id;
  const [roster, setRoster] = useState(Array.isArray(initialRoster) ? initialRoster : []);
  const [rosterErr, setRosterErr] = useState(false);
  const [query, setQuery] = useState("");
  const [manual, setManual] = useState("");
  const [results, setResults] = useState([]);   // recent scan outcomes (newest first)
  const [busyCode, setBusyCode] = useState(null); // code currently POSTing (roster row spinner)
  const lastScan = useRef({ code: "", ts: 0 });   // throttle duplicate continuous scans

  const refreshRoster = useCallback(async () => {
    if (!eventId) return;
    try {
      const r = await events.checkinRoster(eventId, base);
      setRoster(Array.isArray(r) ? r : []);
      setRosterErr(false);
    } catch { setRosterErr(true); }
  }, [eventId, base]);

  // Only fetch on open if the caller didn't hand us a pre-loaded roster.
  useEffect(() => { if (!Array.isArray(initialRoster)) refreshRoster(); /* eslint-disable-line */ }, [refreshRoster]);

  const rosterByCode = useCallback(
    (code) => roster.find((m) => String(m.code) === String(code)) || null,
    [roster],
  );

  // Push a result to the top of the feed (capped so a long door shift stays light).
  const pushResult = (r) => setResults((prev) => [{ id: `${Date.now()}-${Math.random()}`, ...r }, ...prev].slice(0, 40));

  // The one code path for a scanned QR, a manual code, or a roster tap.
  const doCheckin = useCallback(async (raw) => {
    const code = codeOf(raw);
    if (!code) return;
    setBusyCode(code);
    // Instant optimistic name from the pre-loaded roster (survives weak signal).
    const known = rosterByCode(code);
    try {
      const r = await events.checkin(eventId, raw, base);
      const name = r?.name || known?.name || t("events.scan.someone");
      if (r?.already_checked_in) {
        const when = r?.checked_in_at ? fmtTime(r.checked_in_at) : "";
        pushResult({ tone: "warn", name, msg: when ? t("events.scan.alreadyAt", { time: when }) : t("events.scan.already") });
        haptic("warning");
      } else {
        pushResult({ tone: "ok", name, msg: t("events.scan.checkedIn") });
        haptic("success");
      }
      // Reflect it in the roster immediately (by user_id when known, else by code).
      setRoster((prev) => prev.map((m) =>
        (r?.user_id != null && m.user_id === r.user_id) || String(m.code) === String(code)
          ? { ...m, checked_in: true } : m));
    } catch (e) {
      if (e?.status === 409) pushResult({ tone: "err", name: known?.name || "", msg: t("events.scan.wrongEvent") });
      else if (e?.status === 404) pushResult({ tone: "err", name: "", msg: t("events.scan.invalid") });
      else pushResult({ tone: "err", name: "", msg: e?.message || t("events.scan.failed") });
      haptic("error");
    } finally {
      setBusyCode(null);
    }
  }, [eventId, base, rosterByCode, t]);

  // Native Telegram scanner — kept OPEN for a whole door line. The callback
  // returns nothing (falsy) so the popup stays up; the staffer taps the native
  // close when done. Duplicate frames of the same code within 3s are ignored.
  const openScanner = () => {
    const w = window.Telegram?.WebApp;
    if (!w?.showScanQrPopup) return;
    try {
      w.showScanQrPopup({ text: t("events.scan.popupText") }, (text) => {
        const code = codeOf(text);
        const now = Date.now();
        if (code && !(code === lastScan.current.code && now - lastScan.current.ts < 3000)) {
          lastScan.current = { code, ts: now };
          doCheckin(text);
        }
        return false; // keep the scanner open
      });
    } catch { /* older client — manual/roster still work */ }
  };

  const submitManual = () => {
    const c = manual.trim();
    if (!c) return;
    doCheckin(c);
    setManual("");
  };

  const q = query.trim().toLowerCase();
  const filtered = q ? roster.filter((m) => String(m.name || "").toLowerCase().includes(q)) : roster;
  const checkedCount = roster.filter((m) => m.checked_in).length;

  const toneColor = { ok: "var(--green)", warn: "var(--amber)", err: "var(--terra)" };
  const toneGlyph = { ok: "✓", warn: "◔", err: "✗" };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 360, background: "var(--bg)",
      maxWidth: 430, margin: "0 auto", display: "flex", flexDirection: "column",
    }}>
      {/* Header */}
      <div style={{
        flex: "0 0 auto", padding: "calc(var(--safe-t) + 14px) 16px 12px",
        borderBottom: "1px solid var(--hair)", background: "var(--surface)",
        display: "flex", alignItems: "center", gap: 12,
      }}>
        <button onClick={onClose} aria-label={t("common.close")} style={{
          width: 38, height: 38, borderRadius: 11, border: "1px solid var(--hair)",
          background: "var(--surface-2)", color: "var(--text-2)", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}><Icon name="x" size={18} /></button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.14em",
            textTransform: "uppercase", color: "var(--amber)",
          }}>{t("events.scan.kicker")}</div>
          <div style={{
            fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 17, color: "var(--text)",
            lineHeight: 1.25, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>{event?.title || ""}</div>
        </div>
        {roster.length > 0 && (
          <div style={{ flexShrink: 0, textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)" }}>
            <span style={{ color: "var(--green)", fontWeight: 700 }}>{checkedCount}</span>/{roster.length}
          </div>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "18px 16px calc(var(--safe-b) + 24px)" }}>
        {/* Scan CTA (only when the native scanner exists) */}
        {hasNativeScanner() && (
          <button className="btn-primary" onClick={openScanner} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            📷 {t("events.scan.scanBtn")}
          </button>
        )}

        {/* Manual code entry */}
        <div style={{ marginTop: hasNativeScanner() ? 14 : 0 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: 8 }}>
            {t("events.scan.manualLabel")}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              className="input-field"
              value={manual}
              onChange={(e) => setManual(e.target.value.toUpperCase().replace(/\s/g, ""))}
              onKeyDown={(e) => { if (e.key === "Enter") submitManual(); }}
              placeholder={t("events.scan.manualPh")}
              maxLength={16}
              autoCapitalize="characters"
              style={{ flex: 1, fontFamily: "var(--font-mono)", letterSpacing: "0.14em", textTransform: "uppercase" }}
            />
            <button className="btn-ghost" onClick={submitManual} disabled={!manual.trim()} style={{ flexShrink: 0, padding: "0 18px" }}>
              {t("events.scan.checkInBtn")}
            </button>
          </div>
        </div>

        {/* Live scan result feed */}
        {results.length > 0 && (
          <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 8 }}>
            {results.map((r) => (
              <div key={r.id} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                borderRadius: "var(--radius-sm)",
                background: r.tone === "ok" ? "rgba(127,176,105,0.12)" : r.tone === "warn" ? "rgba(232,161,92,0.12)" : "rgba(192,86,59,0.12)",
                border: `1px solid ${r.tone === "ok" ? "rgba(127,176,105,0.34)" : r.tone === "warn" ? "rgba(232,161,92,0.34)" : "rgba(192,86,59,0.4)"}`,
              }}>
                <span aria-hidden style={{ color: toneColor[r.tone], fontWeight: 800, fontSize: 15 }}>{toneGlyph[r.tone]}</span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  {r.name && <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</div>}
                  <div style={{ fontSize: 12.5, color: toneColor[r.tone], lineHeight: 1.35 }}>{r.msg}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Roster */}
        <div style={{ marginTop: 22 }}>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
            paddingBottom: 8, marginBottom: 12, borderBottom: "1px solid var(--hair)",
          }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-3)" }}>
              {t("events.scan.rosterLabel")}
            </span>
            <button onClick={refreshRoster} aria-label={t("common.retry")} style={{
              background: "none", border: "none", color: "var(--text-3)", cursor: "pointer", fontSize: 13,
            }}>↻</button>
          </div>

          {rosterErr && roster.length === 0 ? (
            <div style={{ textAlign: "center", padding: 24 }}>
              <div style={{ color: "var(--terra)", fontSize: 13.5, marginBottom: 12 }}>{t("events.scan.rosterError")}</div>
              <button className="btn-ghost" onClick={refreshRoster}>{t("common.retry")}</button>
            </div>
          ) : roster.length === 0 ? (
            <div style={{ textAlign: "center", padding: 24, color: "var(--text-3)", fontSize: 13.5 }}>
              {t("events.scan.rosterEmpty")}
            </div>
          ) : (
            <>
              <input
                className="input-field"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("events.scan.searchPh")}
                style={{ marginBottom: 12 }}
              />
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {filtered.map((m) => {
                  const on = !!m.checked_in;
                  const busy = busyCode === String(m.code);
                  return (
                    <button
                      key={m.user_id ?? m.code}
                      onClick={() => { if (!on && !busy) doCheckin(m.code); }}
                      disabled={on || busy}
                      style={{
                        display: "flex", alignItems: "center", gap: 11, width: "100%", textAlign: "left",
                        padding: "11px 13px", borderRadius: "var(--radius-sm)", cursor: on ? "default" : "pointer",
                        background: on ? "rgba(127,176,105,0.10)" : "var(--surface-2)",
                        border: `1px solid ${on ? "rgba(127,176,105,0.34)" : "var(--hair)"}`,
                        opacity: busy ? 0.6 : 1,
                        transition: "background 0.15s ease, border-color 0.15s ease",
                      }}
                    >
                      <span aria-hidden style={{
                        flex: "0 0 auto", width: 20, height: 20, borderRadius: "50%",
                        border: `1.5px solid ${on ? "var(--green)" : "var(--surface-3)"}`,
                        background: on ? "var(--green)" : "transparent",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        color: "#0A0A0F", fontSize: 12, fontWeight: 800, lineHeight: 1,
                      }}>{on ? "✓" : ""}</span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: "block", fontSize: 14, fontWeight: on ? 600 : 500, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {m.name || t("events.scan.someone")}
                        </span>
                        <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: "0.12em", color: "var(--text-3)" }}>
                          {m.code}
                        </span>
                      </span>
                      {!on && !busy && (
                        <span style={{ flexShrink: 0, fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--amber)" }}>
                          {t("events.scan.tapToCheck")}
                        </span>
                      )}
                    </button>
                  );
                })}
                {filtered.length === 0 && (
                  <div style={{ textAlign: "center", padding: 18, color: "var(--text-3)", fontSize: 13 }}>
                    {t("events.scan.noMatch")}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
