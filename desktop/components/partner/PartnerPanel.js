"use client";

import { useT } from "@/components/i18n/LocaleProvider";
import AdminEvents from "@/components/dashboard/AdminEvents";
import SiteFooter from "@/components/ui/SiteFooter";

// The partner org's OWN scoped panel (/partner). A partner is a normal member
// with role="partner" linked to a Partner org; here it manages ONLY its own
// events. It reuses the admin event components verbatim — the SAME AdminEvents /
// EventFormBuilder / EventResponses — pointed at the /partner/* base instead of
// /admin/*, so there is one implementation, not a fork:
//
//   apiBase="/partner"                → list/create/edit + responses/funnel/
//                                       ai-report/csv/lead+score, all org-scoped
//   regionsPath="/regions"            → the public region list (a partner has no
//                                       /admin/regions access)
//   partnersPath={null}               → hide the org picker (it IS its own org;
//                                       the backend forces partner_id server-side)
//   readEventPath=/partner/events/{id}→ scoped single-event read so a NOT-yet-
//                                       approved event still loads its form_schema
//   canApprove / canDelete = false    → moderation + deletion are admin-only
//   variant="partner"                 → partner copy + the "pending review" callout
//
// `org` is GET /partner/me, server-fetched by the page (null on any failure — the
// header just falls back to a generic label, the events below still load).
export default function PartnerPanel({ org = null }) {
  const t = useT();
  // Tolerate either shape: the org directly ({ name, … }) or wrapped
  // ({ partner: { name, … } }, like the older /partners/mine).
  const orgRecord = org?.partner || org || null;
  const orgName = orgRecord?.name || t("partner.panel.org_fallback");

  return (
    <>
      {/* Hero — same grammar as the admin console (mono amber kicker + Bricolage
          headline with an Instrument-serif accent word). */}
      <div style={{ marginTop: 8 }}>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "var(--amber)",
          }}
        >
          {t("partner.panel.kicker")} · {orgName}
        </div>
        <h1
          style={{
            margin: "12px 0 0",
            fontFamily: "var(--font-display)",
            fontWeight: 800,
            fontSize: "clamp(32px, 7vw, 48px)",
            lineHeight: 1.04,
            letterSpacing: "-0.02em",
            color: "var(--text)",
          }}
        >
          {t("partner.panel.title")}{" "}
          <span
            style={{
              fontFamily: "var(--font-accent)",
              fontStyle: "italic",
              fontWeight: 400,
              color: "var(--amber)",
            }}
          >
            {t("partner.panel.title_accent")}
          </span>
        </h1>
        <p
          style={{
            margin: "14px 0 0",
            fontFamily: "var(--font-accent)",
            fontStyle: "italic",
            fontSize: 20,
            lineHeight: 1.35,
            color: "var(--muted)",
            maxWidth: 640,
          }}
        >
          {t("partner.panel.subtitle")}
        </p>
      </div>

      {/* How-it-works — makes the moderation gate clear up front, so a partner is
          never surprised that a fresh event isn't live yet. */}
      <section
        className="ch-cell-static"
        style={{
          marginTop: 24,
          padding: "18px 20px",
          background:
            "linear-gradient(150deg, rgba(232,161,92,0.08), rgba(192,86,59,0.04) 70%, var(--surface))",
          borderColor: "rgba(232,161,92,0.28)",
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10.5,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--amber)",
          }}
        >
          {t("partner.panel.intro_k")}
        </div>
        <p style={{ margin: "8px 0 0", fontSize: 14, lineHeight: 1.6, color: "var(--muted-strong)", maxWidth: 720 }}>
          {t("partner.panel.intro")}
        </p>
      </section>

      {/* The reused admin console, pointed at the partner base. Same component,
          different base — no fork. */}
      <AdminEvents
        apiBase="/partner"
        regionsPath="/regions"
        partnersPath={null}
        readEventPath={(id) => `/partner/events/${id}`}
        canApprove={false}
        canDelete={false}
        variant="partner"
      />

      <SiteFooter
        host="brightfuturesuzbekistan.uz · partner"
        tagline={t("partner.panel.footer")}
      />
    </>
  );
}
