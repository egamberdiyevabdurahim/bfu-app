import { redirect } from "next/navigation";
import { getMe } from "@/lib/session";
import Atmosphere from "@/components/Atmosphere";
import CommunityTopBar from "@/components/community/CommunityTopBar";
import MentorsBrowser from "@/components/community/MentorsBrowser";

// /mentors — book a 15-minute session with an experienced builder, and (if you
// are a mentor) offer + manage your own slots. Per-user + uncacheable: the
// server wrapper gates on the session (unauth → /login); the client browser
// loads GET /mentors + GET /users/me on mount so it's always fresh.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Mentors — Bright Futures Uzbekistan",
  description: "Book a session with an experienced builder, or open your own calendar.",
};

export default async function MentorsPage() {
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
        <CommunityTopBar active="mentors" />

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
            Learn from those ahead of you
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
              mentors
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
            Fifteen honest minutes with someone a few steps down the road.
          </p>
        </div>

        <MentorsBrowser />

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
            Every builder was once a beginner.
          </span>
        </div>
      </div>
    </main>
  );
}
