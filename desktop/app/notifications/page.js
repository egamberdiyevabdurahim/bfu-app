import { redirect } from "next/navigation";
import { getMe } from "@/lib/session";
import { getT } from "@/lib/i18n/server";
import AppTopBar from "@/components/nav/AppTopBar";
import NotificationsInbox from "@/components/nav/NotificationsInbox";
import SiteFooter from "@/components/ui/SiteFooter";

// /notifications — the full inbox. Per-user + uncacheable: the server wrapper
// gates on the session (unauth → /login), then the client list loads
// GET /users/me/notifications on mount so it's always fresh.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Notifications — Bright Futures Uzbekistan",
  description: "Follows, matches, applications and session updates — all in one place.",
};

export default async function NotificationsPage() {
  const me = await getMe();
  if (!me) redirect("/login");
  const { t } = await getT();

  return (
    <AppTopBar active="notifications" me={me}>
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
            {t("inbox.page_eyebrow")}
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
            {t("inbox.page_title_prefix")}{" "}
            <span
              style={{
                fontFamily: "var(--font-accent)",
                fontStyle: "italic",
                fontWeight: 400,
                color: "var(--amber)",
              }}
            >
              {t("inbox.page_title_accent")}
            </span>
          </h1>
        </div>

        {/* Constrain only the inbox column for readability; the header + footer
            stay full-width like every sibling page. */}
        <div style={{ maxWidth: 820 }}>
          <NotificationsInbox />
        </div>

        <SiteFooter tagline={t("inbox.page_footer_tagline")} />
    </AppTopBar>
  );
}
