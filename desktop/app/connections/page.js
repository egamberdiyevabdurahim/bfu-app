import { redirect } from "next/navigation";
import { getMe } from "@/lib/session";
import Atmosphere from "@/components/Atmosphere";
import ConnectionsList from "@/components/people/ConnectionsList";

// /connections — "Your network". Per-user + uncacheable. The server wrapper
// gates on the session (unauth → /login); the client list loads
// GET /users/me/connections + GET /users/me/following on mount so it's always
// fresh after a follow/interest without an ISR window.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Your network — Bright Futures Uzbekistan",
  description: "The builders you're connected to and the ones you follow.",
};

export default async function ConnectionsPage() {
  const me = await getMe();
  if (!me) redirect("/login");

  return (
    <main style={{ position: "relative", minHeight: "100vh" }}>
      <Atmosphere />

      <div
        style={{
          position: "relative",
          zIndex: 2,
          maxWidth: 1200,
          margin: "0 auto",
          padding: "26px 40px 96px",
        }}
      >
        {/* Top bar — brand mark + a way home, mirroring the authed surfaces. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 24,
            padding: "12px 0 8px",
          }}
        >
          <a href="/home" style={{ display: "flex", alignItems: "center", gap: 16, textDecoration: "none" }}>
            <img
              src="/bfu-mark.png"
              alt="BFU"
              style={{ height: 38, width: "auto", display: "block", filter: "drop-shadow(0 2px 10px rgba(232,161,92,0.25))" }}
            />
            <div style={{ width: 1, height: 26, background: "var(--hair)" }} />
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: "var(--muted)",
              }}
            >
              Bright Futures Uzbekistan
            </span>
          </a>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <a href="/city" className="ch-btn-ghost">
              <span style={{ fontSize: 15, color: "var(--amber)" }}>✦</span> The city
            </a>
            <a href="/home" className="ch-btn-ghost">
              <span style={{ fontSize: 14 }}>←</span> Home
            </a>
          </div>
        </div>

        {/* Hero */}
        <div style={{ marginTop: 40, marginBottom: 6 }}>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "var(--amber)",
            }}
          >
            The people you know
          </div>
          <h1
            style={{
              margin: "14px 0 0",
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: 52,
              lineHeight: 1.0,
              letterSpacing: "-0.02em",
              color: "var(--text)",
            }}
          >
            Your{" "}
            <span
              style={{
                fontFamily: "var(--font-accent)",
                fontStyle: "italic",
                fontWeight: 400,
                color: "var(--amber)",
              }}
            >
              network
            </span>
          </h1>
        </div>

        <ConnectionsList />

        {/* Footer */}
        <div
          style={{
            marginTop: 60,
            paddingTop: 26,
            borderTop: "1px solid var(--hair)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 20,
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "var(--muted)",
            }}
          >
            brightfuturesuzbekistan.uz
          </span>
          <span
            style={{
              fontFamily: "var(--font-accent)",
              fontStyle: "italic",
              fontSize: 18,
              color: "var(--muted)",
            }}
          >
            Every connection started with a hello.
          </span>
        </div>
      </div>
    </main>
  );
}
