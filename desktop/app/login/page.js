"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import QRCode from "qrcode";
import Atmosphere from "@/components/Atmosphere";

const BOT_USERNAME =
  process.env.NEXT_PUBLIC_BOT_USERNAME || "BrightFuturesUzbekistan_bot";

// Maps the ?error= reason (left over from the old widget flow / server bounce)
// to a firelit, human line.
const ERROR_COPY = {
  unregistered:
    "You're not registered yet — join in the Telegram bot first, then come back to sign in.",
  banned: "This account is suspended. Reach out in the bot if you think that's a mistake.",
  network: "We couldn't reach the gate just now. Give it another try in a moment.",
  invalid: "That sign-in didn't go through. Please try again.",
};

// Friendly copy for live poll/start errors surfaced by the API routes.
const POLL_ERROR_COPY = {
  banned:
    "This account is suspended. Reach out in the bot if you think that's a mistake.",
  network: "We lost the connection for a moment — retrying…",
  default:
    "That didn't work — make sure you're a registered BFU member, or try again.",
};

const POLL_INTERVAL_MS = 2000;

function LoginInner() {
  const params = useSearchParams();
  const errorReason = params.get("error");
  const serverErrorMessage = errorReason
    ? ERROR_COPY[errorReason] || ERROR_COPY.invalid
    : null;

  // Handshake state.
  const [deepLink, setDeepLink] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState(null);
  const [liveError, setLiveError] = useState(null);
  const [starting, setStarting] = useState(true);

  // The active nonce lives in a ref so the polling interval always reads the
  // freshest value without needing to be torn down and rebuilt on each start.
  const nonceRef = useRef(null);
  const mountedRef = useRef(true);

  // Kick off (or restart) the handshake: ask the server for a fresh
  // nonce + deep_link, render a QR for it, and let the poller pick it up.
  const startHandshake = useCallback(async () => {
    setStarting(true);
    try {
      const res = await fetch("/api/auth/web-login/start", { method: "POST" });
      const data = await res.json();
      if (!mountedRef.current) return;

      if (data?.status === "error" || !data?.nonce || !data?.deep_link) {
        setLiveError(POLL_ERROR_COPY.default);
        setStarting(false);
        return;
      }

      nonceRef.current = data.nonce;
      setDeepLink(data.deep_link);
      setLiveError(null);
      setStarting(false);

      // Generate the QR data-URL from the deep link (best-effort).
      try {
        const url = await QRCode.toDataURL(data.deep_link, {
          margin: 1,
          width: 220,
          color: { dark: "#160E08", light: "#F0E6D6" },
        });
        if (mountedRef.current) setQrDataUrl(url);
      } catch {
        // QR is a nicety — the button still works without it.
        if (mountedRef.current) setQrDataUrl(null);
      }
    } catch {
      if (!mountedRef.current) return;
      setLiveError(POLL_ERROR_COPY.network);
      setStarting(false);
    }
  }, []);

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
          `/api/auth/web-login/poll?nonce=${encodeURIComponent(nonce)}`
        );
        data = await res.json();
      } catch {
        // Transient — try again on the next tick.
        return;
      }
      if (!mountedRef.current) return;

      if (data?.status === "ok") {
        window.location.href = "/home";
        return;
      }
      if (data?.status === "expired") {
        // Nonce timed out — quietly mint a new one.
        nonceRef.current = null;
        startHandshake();
        return;
      }
      if (data?.status === "error") {
        setLiveError(POLL_ERROR_COPY[data.reason] || POLL_ERROR_COPY.default);
        return;
      }
      // pending → clear any transient error line and keep waiting.
      if (data?.status === "pending" && liveError === POLL_ERROR_COPY.network) {
        setLiveError(null);
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(id);
  }, [startHandshake, liveError]);

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
          className="ch-cell"
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
            Sign in
          </div>

          <h1
            style={{
              margin: "14px 0 0",
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: 38,
              lineHeight: 1.05,
              letterSpacing: "-0.02em",
              color: "var(--text)",
            }}
          >
            Welcome back to
            <br />
            <span
              style={{
                fontFamily: "var(--font-accent)",
                fontStyle: "italic",
                fontWeight: 400,
                color: "var(--amber)",
              }}
            >
              the bazaar
            </span>
          </h1>

          <p
            style={{
              margin: "14px auto 0",
              maxWidth: 340,
              fontSize: 14.5,
              lineHeight: 1.55,
              color: "var(--muted)",
            }}
          >
            The lamps are lit and the workshops are humming. Sign in with Telegram
            to pick up where you left off.
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
              a new tab and the poller in this tab catches the Start tap. */}
          <div style={{ marginTop: 28 }}>
            {deepLink ? (
              <a
                href={deepLink}
                target="_blank"
                rel="noopener"
                className="ch-btn-primary"
                style={{
                  justifyContent: "center",
                  width: "100%",
                  fontSize: 15,
                  padding: "14px 20px",
                }}
              >
                Continue with Telegram
              </a>
            ) : (
              <div
                className="ch-btn-primary"
                aria-disabled="true"
                style={{
                  justifyContent: "center",
                  width: "100%",
                  fontSize: 15,
                  padding: "14px 20px",
                  opacity: 0.6,
                  cursor: "default",
                  pointerEvents: "none",
                }}
              >
                {starting ? "Lighting the lamp…" : "Preparing sign-in…"}
              </div>
            )}
          </div>

          {/* QR fallback for signing in from a phone. */}
          {deepLink && (
            <div style={{ marginTop: 24 }}>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "var(--muted)",
                  marginBottom: 12,
                }}
              >
                or scan with your phone
              </div>
              {qrDataUrl && (
                <img
                  src={qrDataUrl}
                  alt="Scan to open the BFU bot"
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
              color: liveError ? "var(--terra)" : "var(--muted)",
              minHeight: 20,
            }}
          >
            {liveError
              ? liveError
              : deepLink
              ? "Waiting for you to tap Start in Telegram…"
              : "Getting things ready…"}
          </div>

          <div
            style={{
              marginTop: 24,
              paddingTop: 22,
              borderTop: "1px solid var(--hair)",
              fontSize: 13,
              lineHeight: 1.5,
              color: "var(--muted)",
            }}
          >
            New here?{" "}
            <a
              href={`https://t.me/${BOT_USERNAME}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--amber)", textDecoration: "none", fontWeight: 500 }}
            >
              Open the Telegram bot
            </a>{" "}
            to join first.
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
          Someone is always building right now.
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
