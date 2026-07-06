"use client";

import { Suspense, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Atmosphere from "@/components/Atmosphere";

const BOT_USERNAME =
  process.env.NEXT_PUBLIC_BOT_USERNAME || "BrightFuturesUzbekistan_bot";

// Maps the ?error= reason (set by /api/auth/telegram) to a firelit, human line.
const ERROR_COPY = {
  unregistered:
    "You're not registered yet — join in the Telegram bot first, then come back to sign in.",
  banned: "This account is suspended. Reach out in the bot if you think that's a mistake.",
  network: "We couldn't reach the gate just now. Give it another try in a moment.",
  invalid: "That sign-in didn't go through. Please try again.",
};

function TelegramWidget() {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // The Telegram Login Widget must be added as a real DOM <script> so it can
    // render its own iframe button — next/script's beforeInteractive won't do
    // it. We inject on mount and clean up on unmount.
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.setAttribute("data-telegram-login", BOT_USERNAME);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-userpic", "true");
    script.setAttribute("data-auth-url", "/api/auth/telegram");
    script.setAttribute("data-request-access", "write");
    container.appendChild(script);

    return () => {
      // Remove the injected script + any iframe button it rendered so a
      // remount (e.g. fast-refresh / navigation) doesn't stack duplicates.
      container.innerHTML = "";
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ minHeight: 48, display: "flex", justifyContent: "center" }}
    />
  );
}

function LoginInner() {
  const params = useSearchParams();
  const errorReason = params.get("error");
  const errorMessage = errorReason
    ? ERROR_COPY[errorReason] || ERROR_COPY.invalid
    : null;

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

          {errorMessage && (
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
              {errorMessage}
            </div>
          )}

          {/* Telegram Login Widget button (renders an iframe on the deployed,
              BotFather-registered domain; on localhost it stays empty). */}
          <div style={{ marginTop: 28 }}>
            <TelegramWidget />
          </div>

          <div
            style={{
              marginTop: 28,
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
