"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import QRCode from "qrcode";
import Atmosphere from "@/components/Atmosphere";
import { useT } from "@/components/i18n/LocaleProvider";

const BOT_USERNAME =
  process.env.NEXT_PUBLIC_BOT_USERNAME || "BrightFuturesUzbekistan_bot";

// Maps the ?error= reason (left over from the old widget flow / server bounce)
// to a translation key for a firelit, human line.
const ERROR_COPY = {
  unregistered: "login.error.unregistered",
  banned: "login.error.banned",
  network: "login.error.network",
  invalid: "login.error.invalid",
};

// Translation keys for live poll/start errors surfaced by the API routes.
const POLL_ERROR_COPY = {
  banned: "login.poll.banned",
  network: "login.poll.network",
  default: "login.poll.default",
};

const POLL_INTERVAL_MS = 2000;

function LoginInner() {
  const t = useT();
  const params = useSearchParams();
  const errorReason = params.get("error");
  const serverErrorMessage = errorReason
    ? t(ERROR_COPY[errorReason] || ERROR_COPY.invalid)
    : null;

  // Handshake state.
  const [deepLink, setDeepLink] = useState(null);
  const [code, setCode] = useState(null); // confirmation code the user must match in the bot
  const [qrDataUrl, setQrDataUrl] = useState(null);
  const [liveError, setLiveError] = useState(null);
  // `terminal` marks an error the user can't recover from by waiting (a failed
  // start or a hard poll error) — we then offer an explicit "Try again". A plain
  // network blip is NOT terminal (the poller self-heals).
  const [terminal, setTerminal] = useState(false);
  const [starting, setStarting] = useState(true);

  // The active nonce lives in a ref so the polling interval always reads the
  // freshest value without needing to be torn down and rebuilt on each start.
  const nonceRef = useRef(null);
  const mountedRef = useRef(true);
  // liveError is mirrored into a ref so the 2s poll interval can read it without
  // being torn down and rebuilt on every error transition (which perturbed the
  // poll cadence). The mirror is kept in sync in an effect (never during render).
  const liveErrorRef = useRef(null);
  useEffect(() => {
    liveErrorRef.current = liveError;
  }, [liveError]);

  // Kick off (or restart) the handshake: ask the server for a fresh
  // nonce + deep_link, render a QR for it, and let the poller pick it up.
  const startHandshake = useCallback(async () => {
    setStarting(true);
    setTerminal(false);
    setLiveError(null);
    try {
      const res = await fetch("/web/api/auth/web-login/start", { method: "POST" });
      const data = await res.json();
      if (!mountedRef.current) return;

      if (data?.status === "error" || !data?.nonce || !data?.deep_link) {
        setLiveError(t(POLL_ERROR_COPY.default));
        setTerminal(true);
        setStarting(false);
        return;
      }

      nonceRef.current = data.nonce;
      setDeepLink(data.deep_link);
      setCode(data.code || null);
      setLiveError(null);
      setTerminal(false);
      setStarting(false);

      // Generate the QR data-URL from the deep link (best-effort).
      try {
        const url = await QRCode.toDataURL(data.deep_link, {
          margin: 1,
          // Render at 2× the 168px display box so it stays crisp on retina.
          width: 336,
          color: { dark: "#160E08", light: "#F0E6D6" },
        });
        if (mountedRef.current) setQrDataUrl(url);
      } catch {
        // QR is a nicety — the button still works without it.
        if (mountedRef.current) setQrDataUrl(null);
      }
    } catch {
      if (!mountedRef.current) return;
      // A failed start (vs a mid-poll blip) leaves no nonce to recover, so it's
      // terminal — offer an explicit retry rather than spinning forever.
      setLiveError(t(POLL_ERROR_COPY.network));
      setTerminal(true);
      setStarting(false);
    }
  }, [t]);

  // Start the handshake on mount.
  useEffect(() => {
    mountedRef.current = true;
    startHandshake();
    return () => {
      mountedRef.current = false;
    };
  }, [startHandshake]);

  // Poll every 2s. On ok → land home. On expired → seamlessly re-start.
  // On error → show a friendly line but keep polling (network blips recover).
  useEffect(() => {
    const id = setInterval(async () => {
      const nonce = nonceRef.current;
      if (!nonce) return;

      let data;
      try {
        const res = await fetch(
          `/web/api/auth/web-login/poll?nonce=${encodeURIComponent(nonce)}`
        );
        data = await res.json();
      } catch {
        // Transient — try again on the next tick.
        return;
      }
      if (!mountedRef.current) return;

      if (data?.status === "ok") {
        // Brand-new members finish sign-up on the web; returning members go home.
        window.location.href = data.is_registered === false ? "/web/register" : "/web/home";
        return;
      }
      if (data?.status === "expired") {
        // Nonce timed out — quietly mint a new one.
        nonceRef.current = null;
        startHandshake();
        return;
      }
      if (data?.status === "error") {
        // A "banned" (or other explicit) error is terminal; surface a retry.
        setLiveError(t(POLL_ERROR_COPY[data.reason] || POLL_ERROR_COPY.default));
        setTerminal(true);
        return;
      }
      // pending → we're back in a healthy state. Clear any lingering transient
      // (non-terminal) error line so it doesn't stick around after recovery.
      if (data?.status === "pending" && liveErrorRef.current) {
        setLiveError(null);
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(id);
  }, [startHandshake]);

  return (
    <main
      style={{
        position: "relative",
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 20px",
      }}
    >
      <Atmosphere />

      <div
        style={{
          position: "relative",
          zIndex: 2,
          width: "100%",
          maxWidth: 460,
          textAlign: "center",
        }}
      >
        {/* brand mark */}
        <img
          src="/bfu-mark.png"
          alt="Bright Futures Uzbekistan"
          style={{
            height: 52,
            width: "auto",
            display: "block",
            margin: "0 auto 26px",
            filter: "drop-shadow(0 2px 16px rgba(232,161,92,0.3))",
          }}
        />

        <div
          className="ch-cell-static"
          style={{
            padding: "40px 36px 36px",
            background:
              "linear-gradient(160deg, rgba(232,161,92,0.06), rgba(192,86,59,0.04) 55%, var(--surface))",
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "var(--amber)",
            }}
          >
            {t("login.eyebrow")}
          </div>

          <h1
            style={{
              margin: "14px 0 0",
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: "clamp(30px, 8vw, 38px)",
              lineHeight: 1.08,
              letterSpacing: "-0.02em",
              color: "var(--text)",
            }}
          >
            {t("login.title.line1")}
            <br />
            <span
              style={{
                fontFamily: "var(--font-accent)",
                fontStyle: "italic",
                fontWeight: 400,
                color: "var(--amber)",
              }}
            >
              {t("login.title.line2")}
            </span>
          </h1>

          <p
            style={{
              margin: "14px auto 0",
              maxWidth: 340,
              fontSize: 15,
              lineHeight: 1.55,
              color: "var(--muted-strong)",
            }}
          >
            {t("login.subtitle")}
          </p>

          {serverErrorMessage && (
            <div
              role="alert"
              style={{
                margin: "22px 0 0",
                padding: "13px 16px",
                borderRadius: "var(--radius-sm)",
                border: "1px solid rgba(192,86,59,0.4)",
                background: "rgba(192,86,59,0.12)",
                fontSize: 13.5,
                lineHeight: 1.5,
                color: "var(--text)",
                textAlign: "left",
              }}
            >
              {serverErrorMessage}
            </div>
          )}

          {/* Primary action: open the BFU bot. Anchor (not button) so it opens
              a new tab and the poller in this tab catches the Start tap. When the
              start failed terminally we show a real "Try again" instead of a dead
              disabled control. */}
          <div style={{ marginTop: 28 }}>
            {deepLink ? (
              <a
                href={deepLink}
                target="_blank"
                rel="noopener noreferrer"
                className="ch-btn-primary"
                style={{
                  position: "relative",
                  justifyContent: "center",
                  width: "100%",
                  fontSize: 15,
                  padding: "14px 20px",
                }}
              >
                {t("login.cta.telegram")}
                <span style={{ marginLeft: 8, fontSize: 12 }} aria-hidden>
                  ↗
                </span>
                <span
                  style={{
                    position: "absolute",
                    width: 1,
                    height: 1,
                    overflow: "hidden",
                    clip: "rect(0 0 0 0)",
                  }}
                >
                  {t("login.cta.newTab")}
                </span>
              </a>
            ) : terminal ? (
              <button
                type="button"
                onClick={startHandshake}
                className="ch-btn-primary"
                style={{
                  justifyContent: "center",
                  width: "100%",
                  fontSize: 15,
                  padding: "14px 20px",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                {t("login.cta.retry")}
              </button>
            ) : (
              <div
                className="ch-btn-primary"
                aria-disabled="true"
                style={{
                  justifyContent: "center",
                  width: "100%",
                  fontSize: 15,
                  padding: "14px 20px",
                  background: "var(--surface-2)",
                  border: "1px solid var(--hair)",
                  color: "var(--muted-strong)",
                  boxShadow: "none",
                  cursor: "default",
                  pointerEvents: "none",
                }}
              >
                {starting ? t("login.prep.lighting") : t("login.prep.preparing")}
              </div>
            )}
          </div>

          {/* Confirmation code the user must match in the bot before approving —
              blocks login-CSRF (a phished tapper sees no matching code here). */}
          {deepLink && code && (
            <div style={{ marginTop: 20, textAlign: "center" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--muted-strong)", marginBottom: 8 }}>
                {t("login.code.label")}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 30, fontWeight: 700, letterSpacing: "0.3em", color: "var(--amber)", paddingLeft: "0.3em" }}>
                {code}
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 8, maxWidth: 300, marginInline: "auto", lineHeight: 1.5 }}>
                {t("login.code.hint")}
              </div>
            </div>
          )}

          {/* QR fallback for signing in from a phone. The label only appears
              once a QR actually exists, so we never show "or scan" with nothing
              beneath it; a dashed placeholder holds the space while it renders. */}
          {deepLink && (
            <div style={{ marginTop: 24 }}>
              {qrDataUrl ? (
                <>
                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                      color: "var(--muted-strong)",
                      marginBottom: 12,
                    }}
                  >
                    {t("login.qr.label")}
                  </div>
                  <img
                    src={qrDataUrl}
                    alt={t("login.qr.alt")}
                    width={168}
                    height={168}
                    style={{
                      display: "block",
                      margin: "0 auto",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--hair)",
                      boxShadow: "0 8px 26px rgba(0,0,0,0.35)",
                    }}
                  />
                </>
              ) : (
                <div
                  aria-hidden
                  style={{
                    width: 168,
                    height: 168,
                    margin: "0 auto",
                    borderRadius: "var(--radius-sm)",
                    border: "1px dashed var(--hair)",
                    background: "var(--surface-2)",
                  }}
                />
              )}
            </div>
          )}

          {/* Live status line for the handshake. */}
          <div
            aria-live="polite"
            style={{
              marginTop: 20,
              fontSize: 13,
              lineHeight: 1.5,
              color: liveError ? "var(--terra)" : "var(--muted-strong)",
              minHeight: 20,
            }}
          >
            {liveError
              ? liveError
              : deepLink
              ? t("login.status.waiting")
              : t("login.status.ready")}
          </div>

          <div
            style={{
              marginTop: 24,
              paddingTop: 22,
              borderTop: "1px solid var(--hair)",
              fontSize: 13,
              lineHeight: 1.5,
              color: "var(--muted-strong)",
            }}
          >
            {t("login.footer.new")}{" "}
            <a
              href={`https://t.me/${BOT_USERNAME}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--amber)", textDecoration: "none", fontWeight: 500 }}
            >
              {t("login.footer.openBot")}
            </a>{" "}
            {t("login.footer.joinFirst")}
          </div>
        </div>

        <div
          style={{
            marginTop: 26,
            fontFamily: "var(--font-accent)",
            fontStyle: "italic",
            fontSize: 17,
            color: "var(--muted)",
          }}
        >
          {t("login.tagline")}
        </div>
      </div>
    </main>
  );
}

// useSearchParams() must sit under a Suspense boundary so the /login route can
// prerender. The fallback is a bare firelit backdrop while the client reads the
// (optional) ?error= param.
export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main style={{ position: "relative", minHeight: "100vh" }}>
          <Atmosphere />
        </main>
      }
    >
      <LoginInner />
    </Suspense>
  );
}
