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
//
// V1: "Applications" is FOLDED INTO this page — it no longer has its own nav row.
// The /requests inbox (accept/decline the builders who applied) still exists and
// still works, so this page carries the only entry point into it: the card below
// the header. No pending count here on purpose — this is a server component and
// the count would cost a fresh round-trip; the per-project pending counts already
// render on each owned card in MyProjectsList.
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

        {/* Entry point into the applications inbox (/requests). Note the "/web"
            prefix: a plain <a> does NOT get basePath applied automatically. */}
        <a
          href="/web/requests"
          className="ch-cell"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 16,
            padding: 22,
            marginBottom: 30,
            textDecoration: "none",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 220 }}>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: "var(--amber)",
              }}
            >
              {t("projmanage.req_eyebrow")}
            </span>
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 700,
                fontSize: 20,
                letterSpacing: "-0.01em",
                color: "var(--text)",
              }}
            >
              {t("nav.requests")}
            </span>
            <span style={{ fontSize: 14, color: "var(--muted-strong)" }}>
              {t("projmanage.req_lede")}
            </span>
          </div>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--amber)" }}>
            {t("projects.open_arrow")} →
          </span>
        </a>

        <MyProjectsList meId={me.id} />

        <SiteFooter tagline={t("projects.mine_footer_tagline")} />
    </AppTopBar>
  );
}
