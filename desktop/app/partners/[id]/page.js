import { redirect } from "next/navigation";
import { getMe } from "@/lib/session";
import Atmosphere from "@/components/Atmosphere";
import CommunityTopBar from "@/components/community/CommunityTopBar";
import PartnerDetail from "@/components/community/PartnerDetail";

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

  return (
    <main style={{ position: "relative", minHeight: "100vh" }}>
      <Atmosphere />

      <div
        style={{
          position: "relative",
          zIndex: 2,
          maxWidth: 1000,
          margin: "0 auto",
          padding: "26px 40px 96px",
        }}
      >
        <CommunityTopBar active="partners" />

        <div style={{ marginTop: 32 }}>
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
            ← All partners
          </a>
        </div>

        <PartnerDetail partnerId={id} />

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
            brightfuturesuzbekistan.uz
          </span>
          <span style={{ fontFamily: "var(--font-accent)", fontStyle: "italic", fontSize: 18, color: "var(--muted)" }}>
            Opportunity, made local.
          </span>
        </div>
      </div>
    </main>
  );
}
