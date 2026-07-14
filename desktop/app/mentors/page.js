import { notFound, redirect } from "next/navigation";
import { getMe } from "@/lib/session";
import { getT } from "@/lib/i18n/server";
import { FLAGS } from "@/lib/flags";
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
  // V1 scope gate: mentoring is built but hidden for launch. Flip
  // FLAGS.MENTORING in lib/flags.js to bring this page back — nothing else
  // below has changed.
  if (!FLAGS.MENTORING) notFound();

  const me = await getMe();
  if (!me) redirect("/login");
  const { t } = await getT();

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
            {t("community.mentors.kicker")}
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
            {t("community.mentors.titleLead")}{" "}
            <span
              style={{
                fontFamily: "var(--font-accent)",
                fontStyle: "italic",
                fontWeight: 400,
                color: "var(--amber)",
              }}
            >
              {t("community.mentors.titleAccent")}
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
            {t("community.mentors.subtitle")}
          </p>
        </div>

        <MentorsBrowser />

        <SiteFooter tagline={t("community.mentors.footer")} />
    </AppTopBar>
  );
}
