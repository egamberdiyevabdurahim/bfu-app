"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { bfu } from "@/lib/client-api";
import { useT } from "@/components/i18n/LocaleProvider";

// The attendee's own event ticket (desktop). A member who is GOING to an event
// opens this from the event detail's registered view and shows it at the door —
// a laptop stand-in for the Mini App's phone ticket.
//
// Contract (GET /events/{id}/my-ticket, via the authed bfu proxy):
//   { event_id, event_title, code, qr ('{id}.{code}'), checked_in }
//   404 when the caller isn't a going registrant.
//
// The QR encodes the `qr` string exactly; the door scanner (phone) or the desktop
// check-in panel accepts either the QR or the 6-char `code` typed by hand — so we
// show BOTH, large. Once `checked_in` is true a green badge replaces the "show
// this at the door" hint.
export default function MyTicketModal({ event, onClose }) {
  const t = useT();
  const [phase, setPhase] = useState("loading"); // loading | ready | error | none
  const [ticket, setTicket] = useState(null);
  const [qrUrl, setQrUrl] = useState("");
  const closeRef = useRef(null);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    (async () => {
      try {
        const tk = await bfu(`/events/${event.id}/my-ticket`);
        if (!aliveRef.current) return;
        setTicket(tk || null);
        // Render the QR client-side from the `qr` string. Dark modules on a white
        // ground so a photographed screen still scans; generous margin.
        const payload = tk?.qr || (tk?.code ? `${event.id}.${tk.code}` : "");
        if (payload) {
          try {
            const url = await QRCode.toDataURL(payload, {
              width: 240,
              margin: 2,
              errorCorrectionLevel: "M",
              color: { dark: "#160E08", light: "#FFFFFF" },
            });
            if (aliveRef.current) setQrUrl(url);
          } catch {
            /* QR render is best-effort — the code below is still usable by hand */
          }
        }
        if (aliveRef.current) setPhase("ready");
      } catch (err) {
        if (!aliveRef.current) return;
        // 404 = not a going registrant (e.g. waitlisted). Say so plainly instead
        // of a generic error.
        setPhase(err?.status === 404 ? "none" : "error");
      }
    })();
    return () => {
      aliveRef.current = false;
    };
  }, [event.id]);

  useEffect(() => {
    closeRef.current?.focus?.();
    function onKey(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose?.();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const checkedIn = !!ticket?.checked_in;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("community.events.ticket.aria", { title: event.title || "" })}
      onClick={() => onClose?.()}
      style={{
        position: "fixed", inset: 0, zIndex: 95,
        background: "rgba(6,5,4,0.72)", backdropFilter: "blur(3px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
        overflowY: "auto", WebkitOverflowScrolling: "touch",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="ch-cell-static"
        style={{
          width: "100%", maxWidth: 400, padding: "26px 26px 30px", background: "var(--surface)",
          margin: "auto", display: "flex", flexDirection: "column", alignItems: "center",
          textAlign: "center", gap: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, width: "100%" }}>
          <div style={{ textAlign: "left", minWidth: 0 }}>
            <div className="ch-cell-label">{t("community.events.ticket.kicker")}</div>
            <div
              style={{
                marginTop: 6, fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16,
                color: "var(--text)", lineHeight: 1.25, overflow: "hidden", textOverflow: "ellipsis",
                display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
              }}
            >
              {event.title}
            </div>
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

        {phase === "loading" && (
          <div style={{ color: "var(--muted-strong)", fontSize: 14, padding: "40px 0" }}>
            <span className="ch-spin" aria-hidden style={{ marginRight: 8 }}>◠</span>
            {t("community.events.ticket.loading")}
          </div>
        )}

        {phase === "error" && (
          <div style={{ color: "var(--terra)", fontSize: 14, padding: "24px 0" }}>
            {t("community.events.ticket.error")}
          </div>
        )}

        {phase === "none" && (
          <div style={{ color: "var(--muted-strong)", fontSize: 14, lineHeight: 1.5, padding: "24px 0" }}>
            {t("community.events.ticket.none")}
          </div>
        )}

        {phase === "ready" && (
          <>
            {/* QR on a white, padded card so a photographed screen still scans. */}
            <div
              style={{
                background: "#FFFFFF", borderRadius: 16, padding: 16,
                boxShadow: "0 6px 20px rgba(0,0,0,0.28)",
                display: "flex", alignItems: "center", justifyContent: "center",
                width: 240, height: 240, boxSizing: "content-box",
              }}
            >
              {qrUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={qrUrl}
                  alt={t("community.events.ticket.qrAlt")}
                  width={240}
                  height={240}
                  style={{ display: "block", width: 240, height: 240 }}
                />
              ) : (
                <span style={{ color: "#160E08", fontSize: 13 }}>{t("community.events.ticket.qrAlt")}</span>
              )}
            </div>

            {/* The 6-char code, large — the manual fallback if the scan misses. */}
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--muted)" }}>
                {t("community.events.ticket.codeLabel")}
              </div>
              <div
                style={{
                  fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 34,
                  letterSpacing: "0.22em", color: "var(--text)", paddingLeft: "0.22em",
                }}
              >
                {ticket?.code || "——————"}
              </div>
            </div>

            {checkedIn ? (
              <div
                style={{
                  display: "inline-flex", alignItems: "center", gap: 8,
                  padding: "9px 16px", borderRadius: "var(--radius-pill)",
                  border: "1px solid rgba(127,176,105,0.4)", background: "rgba(127,176,105,0.12)",
                  color: "var(--green)", fontFamily: "var(--font-mono)", fontSize: 12.5,
                  letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 700,
                }}
              >
                ✓ {t("community.events.ticket.checkedIn")}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: "var(--muted-strong)", lineHeight: 1.5, maxWidth: 300 }}>
                {t("community.events.ticket.hint")}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
