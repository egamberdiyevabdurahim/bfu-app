import { redirect } from "next/navigation";
import { getMe } from "@/lib/session";
import AppTopBar from "@/components/nav/AppTopBar";
import MentorsBrowser from "@/components/community/MentorsBrowser";
import SiteFooter from "@/components/ui/SiteFooter";

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
    <AppTopBar active="mentors" me={me}>
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
            Learn from those ahead of you
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

        <SiteFooter tagline="Every builder was once a beginner." />
    </AppTopBar>
  );
}
