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
            The projects you tapped the heart on — a quiet shelf of things worth coming back to.
          </p>
        </div>

        <FavoritesList />

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
            The best ideas are worth a second look.
          </span>
        </div>
    </AppTopBar>
  );
}
