import { redirect } from "next/navigation";
import { getToken } from "@/lib/session";
import { getAdminStats, getRegions, getRetention, getSkillGap } from "@/lib/admin";
import Atmosphere from "@/components/Atmosphere";
import AppTopBar from "@/components/nav/AppTopBar";
import StatCards from "@/components/dashboard/StatCards";
import RegionHeatmap from "@/components/dashboard/RegionHeatmap";
import RetentionPanel from "@/components/dashboard/RetentionPanel";
import SkillGapPanel from "@/components/dashboard/SkillGapPanel";

// The admin "command center" — screen 6, the finale. SERVER component: it reads
// the httpOnly session cookie and calls the four Bearer-gated /admin endpoints,
// so it is per-user and must never be statically cached or ISR-revalidated.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Command center — Bright Futures Uzbekistan",
  description: "The whole bazaar, at a glance — for founders and admins.",
};

// A calm long weekday, e.g. "Sunday", for the overline. Falls back to "tonight"
// so the header always reads well.
function weekdayLabel() {
  try {
    return new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(new Date());
  } catch {
    return "tonight";
  }
}

export default async function DashboardPage() {
  // Gate 1: no cookie at all → straight to the login door.
  const token = await getToken();
  if (!token) redirect("/login");

  // One batched round of the four admin fetches. Each returns a discriminated
  // { status, data } so we can branch on auth vs forbidden vs error per-panel.
  const [stats, regions, retention, skillGap] = await Promise.all([
    getAdminStats(),
    getRegions(),
    getRetention(30),
    getSkillGap(),
  ]);

  // Gate 2: the token is present but the backend says it's unauthenticated
  // (expired / revoked). Treat like a logged-out visitor.
  if (stats.status === "noauth") redirect("/login");

  // Gate 3: authenticated, but not an admin. Render the graceful, on-brand
  // "founders & admins only" state — NOT an error page.
  if (stats.status === "forbidden") {
    return <AdminsOnly />;
  }

  const weekday = weekdayLabel();

  return (
    <main style={{ position: "relative", minHeight: "100vh" }}>
      <Atmosphere />

      <div
        style={{
          position: "relative",
          zIndex: 2,
          maxWidth: 1200,
          margin: "0 auto",
          padding: "26px 40px 96px",
        }}
      >
        {/* Shared logged-in top bar (Batch 5). The Dashboard nav item only
            appears for admins, and is highlighted here. */}
        <AppTopBar active="dashboard" />

        {/* Command-center hero — overline + Bricolage headline + Instrument-serif sub. */}
        <div style={{ marginTop: 46 }}>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "var(--amber)",
            }}
          >
            Command center · {weekday}
          </div>
          <h1
            style={{
              margin: "14px 0 0",
              fontFamily: "var(--font-display)",
              fontWeight: 800,
              fontSize: 60,
              lineHeight: 0.98,
              letterSpacing: "-0.02em",
              color: "var(--text)",
            }}
          >
            The whole bazaar,{" "}
            <span
              style={{
                fontFamily: "var(--font-accent)",
                fontStyle: "italic",
                fontWeight: 400,
                color: "var(--amber)",
              }}
            >
              at a glance
            </span>
          </h1>
          <p
            style={{
              margin: "16px 0 0",
              fontFamily: "var(--font-accent)",
              fontStyle: "italic",
              fontSize: 22,
              lineHeight: 1.35,
              color: "var(--muted)",
              maxWidth: 620,
            }}
          >
            Who's here, where they're building, who's staying, and what the city
            still needs a hand with.
          </p>
        </div>

        {/* Stat cards — client leaf so the numbers count up. */}
        <StatCards stats={stats.data || {}} />

        {/* Region heatmap — full width. */}
        <div style={{ marginTop: 22 }}>
          <PanelOrNote
            result={regions}
            label="Region heatmap · members"
            render={(data) => <RegionHeatmap payload={data} />}
          />
        </div>

        {/* Retention + skill gap side by side (stacks on narrow viewports). */}
        <div
          style={{
            marginTop: 22,
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: 22,
            alignItems: "start",
          }}
        >
          <PanelOrNote
            result={retention}
            label="Retention · by signup cohort"
            render={(data) => <RetentionPanel payload={data} />}
          />
          <PanelOrNote
            result={skillGap}
            label="Skill gap · what the city needs"
            render={(data) => <SkillGapPanel payload={data} />}
          />
        </div>

        {/* Footer */}
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
            brightfuturesuzbekistan.uz · command center
          </span>
          <span
            style={{
              fontFamily: "var(--font-accent)",
              fontStyle: "italic",
              fontSize: 18,
              color: "var(--muted)",
            }}
          >
            You keep the lamps lit for everyone.
          </span>
        </div>
      </div>
    </main>
  );
}

// Renders a panel from an { status, data } result, or a small on-brand note when
// that single endpoint failed (error/forbidden) even though /admin/stats
// succeeded — so one flaky analytics call can't blank the whole dashboard.
function PanelOrNote({ result, label, render }) {
  if (result?.status === "ok") return render(result.data);
  const quiet =
    result?.status === "forbidden"
      ? "This slice is restricted."
      : "This slice couldn't load just now — it'll refresh on the next visit.";
  return (
    <section className="ch-cell" style={{ padding: 26 }}>
      <div className="ch-cell-label">{label}</div>
      <p
        style={{
          margin: "14px 0 0",
          fontFamily: "var(--font-accent)",
          fontStyle: "italic",
          fontSize: 19,
          color: "var(--muted)",
        }}
      >
        {quiet}
      </p>
    </section>
  );
}

// Graceful "admins only" state — a warm firelit card, not an error. Shown when
// the session is valid but the user isn't an admin (403 on /admin/stats).
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
            style={{
              height: 38,
              width: "auto",
              display: "block",
              filter: "drop-shadow(0 2px 10px rgba(232,161,92,0.25))",
            }}
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

        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <section
            className="ch-cell"
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
                fontSize: 40,
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
                founders & admins
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
              <a href="/home" className="ch-btn-primary">
                Back to your bazaar <span style={{ fontSize: 14 }}>→</span>
              </a>
              <a href="/city" className="ch-btn-ghost">
                <span style={{ fontSize: 15, color: "var(--amber)" }}>✦</span> Wander the city
              </a>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
