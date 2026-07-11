import Atmosphere from "@/components/Atmosphere";
import SiteFooter from "@/components/ui/SiteFooter";
import AppTopBar from "@/components/nav/AppTopBar";
import AdminSubNav from "@/components/dashboard/AdminSubNav";

// The admin console pages (Users, Projects, Reports, …) render inside the
// left-sidebar AppShell (via AppTopBar), with the AdminSubNav as a secondary tab
// strip. AppShell self-fetches `me` so the sidebar's admin group + profile block
// populate. The graceful non-admin refusal (AdminsOnly) keeps its own standalone
// firelit layout.

// Shared server-rendered shell for the /dashboard/* console pages (Users,
// Projects, Reports, Broadcast). Renders the firelit Atmosphere, the shared
// AppTopBar (active="dashboard"), the admin sub-nav (active tab), and a compact
// hero, then drops `children` (a client leaf) underneath. Keeps every console
// page visually identical to the Overview command-center.
//
// Auth is handled by the page: it awaits getMe(), redirects to /login when
// there's no session, and passes `forbidden` when the user isn't an admin so we
// render the graceful "founders & admins only" card instead of the content.

export default function AdminShell({
  active,
  kicker,
  title,
  titleAccent,
  subtitle,
  forbidden = false,
  children,
}) {
  if (forbidden) return <AdminsOnly />;

  return (
    <AppTopBar active="dashboard">
        <AdminSubNav active={active} />

        <div style={{ marginTop: 8 }}>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "var(--amber)",
            }}
          >
            {kicker}
          </div>
          <h1
            style={{
              margin: "12px 0 0",
              fontFamily: "var(--font-display)",
              fontWeight: 800,
              fontSize: "clamp(32px, 7vw, 48px)",
              lineHeight: 1.04,
              letterSpacing: "-0.02em",
              color: "var(--text)",
            }}
          >
            {title}{" "}
            {titleAccent && (
              <span
                style={{
                  fontFamily: "var(--font-accent)",
                  fontStyle: "italic",
                  fontWeight: 400,
                  color: "var(--amber)",
                }}
              >
                {titleAccent}
              </span>
            )}
          </h1>
          {subtitle && (
            <p
              style={{
                margin: "14px 0 0",
                fontFamily: "var(--font-accent)",
                fontStyle: "italic",
                fontSize: 20,
                lineHeight: 1.35,
                color: "var(--muted)",
                maxWidth: 640,
              }}
            >
              {subtitle}
            </p>
          )}
        </div>

        {children}

        <SiteFooter
          host="brightfuturesuzbekistan.uz · command center"
          tagline="You keep the lamps lit for everyone."
        />
    </AppTopBar>
  );
}

// Graceful "admins only" state — a warm firelit card, not an error. Shown when
// the session is valid but the user isn't an admin. Mirrors the Overview page's
// AdminsOnly so the whole console shares one refusal surface.
function AdminsOnly() {
  return (
    <main style={{ position: "relative", minHeight: "100vh" }}>
      <Atmosphere />
      <div
        style={{
          position: "relative",
          zIndex: 2,
          maxWidth: 720,
          margin: "0 auto",
          padding: "26px 40px 96px",
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "12px 0 8px" }}>
          <img
            src="/bfu-mark.png"
            alt="BFU"
            style={{ height: 38, width: "auto", display: "block", filter: "drop-shadow(0 2px 10px rgba(232,161,92,0.25))" }}
          />
          <div style={{ width: 1, height: 26, background: "var(--hair)" }} />
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "var(--muted)",
            }}
          >
            Bright Futures Uzbekistan
          </span>
        </div>

        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <section
            className="ch-cell-static"
            style={{
              width: "100%",
              padding: 44,
              textAlign: "center",
              background:
                "linear-gradient(150deg, rgba(232,161,92,0.10), rgba(192,86,59,0.05) 60%, var(--surface))",
              borderColor: "rgba(232,161,92,0.32)",
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "var(--amber)",
              }}
            >
              Command center
            </div>
            <h1
              style={{
                margin: "16px 0 0",
                fontFamily: "var(--font-display)",
                fontWeight: 800,
                fontSize: "clamp(30px, 6vw, 40px)",
                lineHeight: 1.05,
                letterSpacing: "-0.02em",
                color: "var(--text)",
              }}
            >
              This room is for{" "}
              <span
                style={{
                  fontFamily: "var(--font-accent)",
                  fontStyle: "italic",
                  fontWeight: 400,
                  color: "var(--amber)",
                }}
              >
                founders &amp; admins
              </span>
            </h1>
            <p
              style={{
                margin: "18px auto 0",
                fontFamily: "var(--font-accent)",
                fontStyle: "italic",
                fontSize: 21,
                lineHeight: 1.4,
                color: "var(--muted)",
                maxWidth: 460,
              }}
            >
              The whole-bazaar view lives behind the counter. Your own workshop
              and the city are wide open — head back and keep building.
            </p>
            <div
              style={{
                marginTop: 28,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <a href="/web/home" className="ch-btn-primary">
                Back to your bazaar <span style={{ fontSize: 14 }}>→</span>
              </a>
              <a href="/web/city" className="ch-btn-ghost">
                <span style={{ fontSize: 15, color: "var(--amber)" }}>✦</span> Wander the city
              </a>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
