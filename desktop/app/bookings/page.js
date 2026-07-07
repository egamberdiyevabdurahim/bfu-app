import { redirect } from "next/navigation";
import { getMe } from "@/lib/session";
import Atmosphere from "@/components/Atmosphere";
import CommunityTopBar from "@/components/community/CommunityTopBar";
import BookingsList from "@/components/community/BookingsList";

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
  const me = await getMe();
  if (!me) redirect("/login");

  return (
    <main style={{ position: "relative", minHeight: "100vh" }}>
      <Atmosphere />

      <div
        style={{
          position: "relative",
          zIndex: 2,
          maxWidth: 1000,
          margin: "0 auto",
          padding: "26px 40px 96px",
        }}
      >
        <CommunityTopBar active="bookings" />

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
            Fifteen minutes, well spent
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
              sessions
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
            The conversations you've lined up — and the ones people want with you.
          </p>
        </div>

        <BookingsList />

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
            The best advice arrives on time.
          </span>
        </div>
      </div>
    </main>
  );
}
