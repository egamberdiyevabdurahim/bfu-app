import { redirect } from "next/navigation";
import { getMe } from "@/lib/session";
import { getT } from "@/lib/i18n/server";
import AppTopBar from "@/components/nav/AppTopBar";
import EventsBrowser from "@/components/community/EventsBrowser";
import SiteFooter from "@/components/ui/SiteFooter";

// /events — hackathons, grants, scholarships and meetups. Authed (per-user "For
// you" feed needs the session); the server wrapper gates on the session
// (unauth → /login). The client browser loads GET /events (and GET
// /events/for-me on the "For you" tab) on mount.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Events — Bright Futures Uzbekistan",
  description: "Hackathons, grants, scholarships and meetups for builders.",
};

export default async function EventsPage({ searchParams }) {
  const me = await getMe();
  if (!me) redirect("/login");
  const { t } = await getT();
  // Deep-link target from a notification link "/events?e={id}" → highlight it.
  const highlightEventId = Number(searchParams?.e) || null;

  return (
    <AppTopBar active="events" me={me}>
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
            {t("community.events.kicker")}
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
            {t("community.events.titleLead")}{" "}
            <span
              style={{
                fontFamily: "var(--font-accent)",
                fontStyle: "italic",
                fontWeight: 400,
                color: "var(--amber)",
              }}
            >
              {t("community.events.titleAccent")}
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
            {t("community.events.subtitle")}
          </p>
        </div>

        <EventsBrowser highlightEventId={highlightEventId} />

        <SiteFooter tagline={t("community.events.footer")} />
    </AppTopBar>
  );
}
