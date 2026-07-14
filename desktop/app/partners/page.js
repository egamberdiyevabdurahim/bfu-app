import { notFound, redirect } from "next/navigation";
import { getMe } from "@/lib/session";
import { getT } from "@/lib/i18n/server";
import { FLAGS } from "@/lib/flags";
import AppTopBar from "@/components/nav/AppTopBar";
import PartnersList from "@/components/community/PartnersList";
import SiteFooter from "@/components/ui/SiteFooter";

// /partners — the directory of partner organisations (universities, incubators,
// companies) that back young builders. Authed; the server wrapper gates on the
// session (unauth → /login). The client list loads GET /partners on mount.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Partners — Bright Futures Uzbekistan",
  description: "The organisations backing the next generation of builders.",
};

export default async function PartnersPage() {
  // V1 scope gate: partners is built but hidden for launch. Flip FLAGS.PARTNERS
  // in lib/flags.js to bring this page back — nothing else below has changed.
  if (!FLAGS.PARTNERS) notFound();

  const me = await getMe();
  if (!me) redirect("/login");
  const { t } = await getT();

  return (
    <AppTopBar active="partners" me={me}>
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
            {t("community.partners.kicker")}
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
            {t("community.partners.titleLead")}{" "}
            <span
              style={{
                fontFamily: "var(--font-accent)",
                fontStyle: "italic",
                fontWeight: 400,
                color: "var(--amber)",
              }}
            >
              {t("community.partners.titleAccent")}
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
            {t("community.partners.subtitle")}
          </p>
        </div>

        <PartnersList />

        <SiteFooter tagline={t("community.partners.footer")} />
    </AppTopBar>
  );
}
