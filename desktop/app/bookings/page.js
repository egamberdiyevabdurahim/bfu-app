import { notFound, redirect } from "next/navigation";
import { getMe } from "@/lib/session";
import { getT } from "@/lib/i18n/server";
import { FLAGS } from "@/lib/flags";
import AppTopBar from "@/components/nav/AppTopBar";
import BookingsList from "@/components/community/BookingsList";
import SiteFooter from "@/components/ui/SiteFooter";

// /bookings — "Your sessions": mentoring sessions the current user is part of,
// both as a learner (booker) and as a mentor (incoming requests to accept /
// decline). Per-user + uncacheable; the client list loads GET /bookings/me on
// mount so it's always fresh after an action.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Sessions — Bright Futures Uzbekistan",
  description: "The mentoring sessions you've booked and the ones you're mentoring.",
};

export default async function BookingsPage() {
  // V1 scope gate: sessions are part of mentoring, which is built but hidden
  // for launch. Flip FLAGS.MENTORING in lib/flags.js to bring this page back —
  // nothing else below has changed.
  if (!FLAGS.MENTORING) notFound();

  const me = await getMe();
  if (!me) redirect("/login");
  const { t } = await getT();

  return (
    <AppTopBar active="sessions" me={me}>
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
            {t("community.bookings.kicker")}
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
            {t("community.bookings.titleLead")}{" "}
            <span
              style={{
                fontFamily: "var(--font-accent)",
                fontStyle: "italic",
                fontWeight: 400,
                color: "var(--amber)",
              }}
            >
              {t("community.bookings.titleAccent")}
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
            {t("community.bookings.subtitle")}
          </p>
        </div>

        <BookingsList />

        <SiteFooter tagline={t("community.bookings.footer")} />
    </AppTopBar>
  );
}
