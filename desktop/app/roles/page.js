import { getT } from "@/lib/i18n/server";
import SiteTopBar from "@/components/nav/SiteTopBar";
import OpenRolesBrowser from "@/components/OpenRolesBrowser";
import SiteFooter from "@/components/ui/SiteFooter";

// /roles — every OPEN role across all live projects, searchable (parity with the
// Mini App's OpenRolesScreen). A normal authed discovery surface: the route is
// session-gated in middleware.js (like /projects and /events), and OpenRolesBrowser
// loads GET /roles through the authed BFF proxy on mount.
//
// SiteTopBar reads the session cookie via getMe(), so this route must render
// per-request — same reason /projects sets it.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Open roles — Bright Futures Uzbekistan",
  description:
    "Every open role across the startups and volunteering projects being built across Uzbekistan.",
};

export default async function RolesPage() {
  const { t } = await getT();

  return (
    <SiteTopBar active="roles" maxWidth={1280}>
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
          {t("roles.kicker")}
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
          {t("roles.titleLead")}{" "}
          <span
            style={{
              fontFamily: "var(--font-accent)",
              fontStyle: "italic",
              fontWeight: 400,
              color: "var(--amber)",
            }}
          >
            {t("roles.titleAccent")}
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
          {t("roles.subtitle")}
        </p>
      </div>

      <OpenRolesBrowser />

      <SiteFooter tagline={t("roles.footer")} />
    </SiteTopBar>
  );
}
