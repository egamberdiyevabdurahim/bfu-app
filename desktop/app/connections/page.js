import { notFound, redirect } from "next/navigation";
import { getMe } from "@/lib/session";
import { getT } from "@/lib/i18n/server";
import { FLAGS } from "@/lib/flags";
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
  // V1 scope gate: the network page is built but hidden for launch. Flip
  // FLAGS.CONNECTIONS in lib/flags.js to bring this page back — nothing else
  // below has changed.
  if (!FLAGS.CONNECTIONS) notFound();

  const me = await getMe();
  if (!me) redirect("/login");

  const { t } = await getT();

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
            {t("people.peopleYouKnow")}
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
            {t("people.yourWord")}{" "}
            <span
              style={{
                fontFamily: "var(--font-accent)",
                fontStyle: "italic",
                fontWeight: 400,
                color: "var(--amber)",
              }}
            >
              {t("people.networkWord")}
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
            {t("people.networkSubtitle")}
          </p>
        </div>

        <ConnectionsList />

        <SiteFooter tagline={t("people.footerTagline")} />
    </AppTopBar>
  );
}
