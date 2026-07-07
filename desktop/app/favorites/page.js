import { redirect } from "next/navigation";
import { getMe } from "@/lib/session";
import AppTopBar from "@/components/nav/AppTopBar";
import FavoritesList from "@/components/projects/FavoritesList";

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
              fontSize: 52,
              lineHeight: 1.0,
              letterSpacing: "-0.02em",
              color: "var(--text)",
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
        </div>

        <FavoritesList />
    </AppTopBar>
  );
}
