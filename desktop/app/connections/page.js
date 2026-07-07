import { redirect } from "next/navigation";
import { getMe } from "@/lib/session";
import AppTopBar from "@/components/nav/AppTopBar";
import ConnectionsList from "@/components/people/ConnectionsList";
import SiteFooter from "@/components/ui/SiteFooter";

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
    <AppTopBar active="people" me={me}>
        {/* Hero */}
        <div style={{ marginTop: 8, marginBottom: 6 }}>
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
              fontSize: "clamp(34px, 6vw, 52px)",
              lineHeight: 1.04,
              letterSpacing: "-0.02em",
              color: "var(--text)",
              overflowWrap: "break-word",
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
          <p
            style={{
              margin: "16px 0 0",
              fontFamily: "var(--font-accent)",
              fontStyle: "italic",
              fontSize: 20,
              lineHeight: 1.35,
              color: "var(--muted-strong)",
              maxWidth: 560,
            }}
          >
            The builders you&rsquo;re connected to and the ones you follow.
          </p>
        </div>

        <ConnectionsList />

        <SiteFooter tagline="Every connection started with a hello." />
    </AppTopBar>
  );
}
