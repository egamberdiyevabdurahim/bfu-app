import { redirect } from "next/navigation";
import { getMe } from "@/lib/session";
import { getRegions } from "@/lib/bfu-api";
import { getT } from "@/lib/i18n/server";
import AppTopBar from "@/components/nav/AppTopBar";
import CreateProjectForm from "@/components/projects/CreateProjectForm";
import SiteFooter from "@/components/ui/SiteFooter";

// /projects/new — the "start a project" surface. Reads the httpOnly session
// cookie (per-user), so it can never be cached.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Start a project — Bright Futures Uzbekistan",
  description: "Light a new window in the city — a startup or a volunteering effort.",
};

export default async function NewProjectPage() {
  const me = await getMe();
  if (!me) redirect("/login");

  const { t } = await getT();

  // Region options for the multi-select (public, ISR-cached).
  const regions = await getRegions();

  return (
    <AppTopBar active="projects-mine" me={me}>
        <div style={{ marginTop: 8, marginBottom: 34 }}>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "var(--amber)",
            }}
          >
            {t("projmanage.new_eyebrow")}
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
            {t("projmanage.new_title_prefix")}{" "}
            <span
              style={{
                fontFamily: "var(--font-accent)",
                fontStyle: "italic",
                fontWeight: 400,
                color: "var(--amber)",
              }}
            >
              {t("projmanage.new_title_accent")}
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
            {t("projmanage.new_lede")}
          </p>
        </div>

        <CreateProjectForm regions={regions} mode="create" />

        <SiteFooter tagline={t("projmanage.new_footer")} />
    </AppTopBar>
  );
}
