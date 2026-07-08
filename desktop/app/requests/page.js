import { redirect } from "next/navigation";
import { getMe } from "@/lib/session";
import { getT } from "@/lib/i18n/server";
import AppTopBar from "@/components/nav/AppTopBar";
import RequestsList from "@/components/projects/RequestsList";
import SiteFooter from "@/components/ui/SiteFooter";

// /requests — "Applications": the founder's inbox of pending applications
// submitted TO the current user's projects (GET /projects/my-requests). Per-user
// + uncacheable. The client list loads on mount and lets the founder accept or
// reject inline.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Applications — Bright Futures Uzbekistan",
  description: "Builders asking to join your projects.",
};

export default async function RequestsPage() {
  const me = await getMe();
  if (!me) redirect("/login");

  const { t } = await getT();

  return (
    <AppTopBar active="requests" me={me}>
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
            {t("projmanage.req_eyebrow")}
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
            {t("projmanage.req_title_prefix")}{" "}
            <span
              style={{
                fontFamily: "var(--font-accent)",
                fontStyle: "italic",
                fontWeight: 400,
                color: "var(--amber)",
              }}
            >
              {t("projmanage.req_title_accent")}
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
            {t("projmanage.req_lede")}
          </p>
        </div>

        <RequestsList />

        <SiteFooter tagline={t("projmanage.req_footer")} />
    </AppTopBar>
  );
}
