import { redirect } from "next/navigation";
import { getMe } from "@/lib/session";
import Atmosphere from "@/components/Atmosphere";
import CommunityTopBar from "@/components/community/CommunityTopBar";
import EventsBrowser from "@/components/community/EventsBrowser";

// /events — hackathons, grants, scholarships and meetups. Authed (per-user "For
// you" feed needs the session); the server wrapper gates on the session
// (unauth → /login). The client browser loads GET /events (and GET
// /events/for-me on the "For you" tab) on mount.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Events — Bright Futures Uzbekistan",
  description: "Hackathons, grants, scholarships and meetups for builders.",
};

export default async function EventsPage() {
  const me = await getMe();
  if (!me) redirect("/login");

  return (
    <main style={{ position: "relative", minHeight: "100vh" }}>
      <Atmosphere />

      <div
        style={{
          position: "relative",
          zIndex: 2,
          maxWidth: 1100,
          margin: "0 auto",
          padding: "26px 40px 96px",
        }}
      >
        <CommunityTopBar active="events" />

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
            Doors worth walking through
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
            The{" "}
            <span
              style={{
                fontFamily: "var(--font-accent)",
                fontStyle: "italic",
                fontWeight: 400,
                color: "var(--amber)",
              }}
            >
              opportunities
            </span>
          </h1>
          <p
            style={{
              margin: "16px 0 0",
              fontFamily: "var(--font-accent)",
              fontStyle: "italic",
              fontSize: 20,
              lineHeight: 1.35,
              color: "var(--muted)",
              maxWidth: 560,
            }}
          >
            Hackathons, grants, scholarships and meetups — some picked just for you.
          </p>
        </div>

        <EventsBrowser />

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
          <span style={{ fontFamily: "var(--font-accent)", fontStyle: "italic", fontSize: 18, color: "var(--muted)" }}>
            The right door, at the right time.
          </span>
        </div>
      </div>
    </main>
  );
}
