import { redirect } from "next/navigation";
import { getMe } from "@/lib/session";
import { getT } from "@/lib/i18n/server";
import AppTopBar from "@/components/nav/AppTopBar";
import MyProjectsList from "@/components/projects/MyProjectsList";
import SiteFooter from "@/components/ui/SiteFooter";

// /projects/mine — "Your projects". Per-user + uncacheable. The server wrapper
// gates on the session and passes meId down; the client list loads
// GET /projects/mine on mount (with a loading state) so the list is always fresh
// after a create/edit/delete without an ISR window.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Your projects — Bright Futures Uzbekistan",
  description: "The projects you've started and the teams you've joined.",
};

export default async function MyProjectsPage() {
  const { t } = await getT();
  const me = await getMe();
  if (!me) redirect("/login");

  return (
    <AppTopBar active="projects-mine" me={me}>
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
            {t("projects.mine_overline")}
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
            {t("projects.mine_your")}{" "}
            <span
              style={{
                fontFamily: "var(--font-accent)",
                fontStyle: "italic",
                fontWeight: 400,
                color: "var(--amber)",
              }}
            >
              {t("projects.mine_projects")}
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
            {t("projects.mine_sub")}
          </p>
        </div>

        <MyProjectsList meId={me.id} />

        <SiteFooter tagline={t("projects.mine_footer_tagline")} />
    </AppTopBar>
  );
}
