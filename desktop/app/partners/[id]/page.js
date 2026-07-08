import { redirect } from "next/navigation";
import { getMe } from "@/lib/session";
import { getT } from "@/lib/i18n/server";
import AppTopBar from "@/components/nav/AppTopBar";
import PartnerDetail from "@/components/community/PartnerDetail";
import SiteFooter from "@/components/ui/SiteFooter";

// /partners/[id] — a partner org's profile + the opportunities they've posted.
// If the current user OWNS this partner (GET /partners/mine matches this id),
// the detail island also shows the "Post an opportunity" form. Authed; the
// server wrapper gates on the session and awaits the dynamic param (Next 16),
// then the client island loads GET /partners/{id} + GET /partners/mine.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Partner — Bright Futures Uzbekistan",
  description: "A partner organisation and the opportunities they offer.",
};

export default async function PartnerPage({ params }) {
  const me = await getMe();
  if (!me) redirect("/login");
  const { id } = await params;
  const { t } = await getT();

  return (
    <AppTopBar active="partners" me={me}>
        <div style={{ marginTop: 8 }}>
          <a
            href="/partners"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--amber)",
              textDecoration: "none",
            }}
          >
            {t("community.partnerDetail.back")}
          </a>
        </div>

        <PartnerDetail partnerId={id} />

        <SiteFooter tagline={t("community.partnerDetail.footer")} />
    </AppTopBar>
  );
}
