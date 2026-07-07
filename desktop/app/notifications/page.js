import { redirect } from "next/navigation";
import { getMe } from "@/lib/session";
import AppTopBar from "@/components/nav/AppTopBar";
import NotificationsInbox from "@/components/nav/NotificationsInbox";

// /notifications — the full inbox. Per-user + uncacheable: the server wrapper
// gates on the session (unauth → /login), then the client list loads
// GET /users/me/notifications on mount so it's always fresh.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Notifications — Bright Futures Uzbekistan",
  description: "Follows, matches, applications and session updates — all in one place.",
};

export default async function NotificationsPage() {
  const me = await getMe();
  if (!me) redirect("/login");

  return (
    <AppTopBar active="notifications" me={me}>
      <div style={{ maxWidth: 820, margin: "0 auto" }}>
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
            Everything that happened while you were building
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
              notifications
            </span>
          </h1>
        </div>

        <NotificationsInbox />

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
            The city keeps a light on for you.
          </span>
        </div>
      </div>
    </AppTopBar>
  );
}
