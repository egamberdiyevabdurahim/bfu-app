import { redirect } from "next/navigation";
import { getMe } from "@/lib/session";
import AppTopBar from "@/components/nav/AppTopBar";
import FavoritesList from "@/components/projects/FavoritesList";
import SiteFooter from "@/components/ui/SiteFooter";

// /favorites — "Saved". Per-user + uncacheable. The server wrapper gates on the
// session (unauth → /login); the client list loads GET /projects/favorites on
// mount so it's always fresh after a heart toggle without an ISR window.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Saved — Bright Futures Uzbekistan",
  description: "The projects you've kept to come back to.",
};

export default async function FavoritesPage() {
  const me = await getMe();
  if (!me) redirect("/login");

  return (
    <AppTopBar active="favorites" me={me}>
        <div style={{ marginTop: 8, marginBottom: 30 }}>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "var(--amber)",
            }}
          >
            Your quiet shelf
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
            Saved{" "}
            <span
              style={{
                fontFamily: "var(--font-accent)",
                fontStyle: "italic",
                fontWeight: 400,
                color: "var(--amber)",
              }}
            >
              projects
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
            The projects you tapped the heart on &mdash; things worth coming back to.
          </p>
        </div>

        <FavoritesList />

        <SiteFooter tagline="The best ideas are worth a second look." />
    </AppTopBar>
  );
}
