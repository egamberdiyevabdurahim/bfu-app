import { redirect, notFound } from "next/navigation";
import { asset } from "@/lib/asset";
import { getEvent, getRegions } from "@/lib/bfu-api";
import { getMe } from "@/lib/session";
import { getT } from "@/lib/i18n/server";
import { fmtDate, fmtDateTime } from "@/lib/datetime";
import AppTopBar from "@/components/nav/AppTopBar";
import SiteFooter from "@/components/ui/SiteFooter";
import EventDetailRegister from "@/components/events/EventDetailRegister";

// Event detail page (/web/events/{id}). The event feed cards now link here
// INTERNALLY (the external `link` is a button on this page). AUTHED and
// per-request: GET /events/{id} needs a session and carries my_rsvp, so we gate
// on getMe() (→ /login) and 404 to notFound() for missing / unapproved / deleted
// events. Composed in the Chorsu firelit bento style, matching /p/[id].
export const dynamic = "force-dynamic";

// Type-pill palette — mirrors EventsBrowser's TYPE_STYLE so a hackathon reads the
// same amber on the card and its detail page.
const TYPE_STYLE = {
  hackathon: { color: "var(--amber)", bg: "rgba(232,161,92,0.14)", bd: "rgba(232,161,92,0.34)" },
  grant: { color: "var(--green)", bg: "rgba(127,176,105,0.14)", bd: "rgba(127,176,105,0.34)" },
  scholarship: { color: "var(--green)", bg: "rgba(127,176,105,0.14)", bd: "rgba(127,176,105,0.34)" },
  meetup: { color: "var(--teal-bright)", bg: "rgba(94,197,182,0.14)", bd: "rgba(94,197,182,0.34)" },
};
const DEFAULT_TYPE = { color: "var(--muted-strong)", bg: "var(--surface-2)", bd: "var(--hair)" };

export async function generateMetadata({ params }) {
  const { id } = await params;
  const event = await getEvent(id);
  if (!event) return { title: "Event not found — Bright Futures Uzbekistan" };

  const description = (event.description || "An opportunity on Bright Futures Uzbekistan").slice(0, 160);
  const title = `${event.title} — Bright Futures Uzbekistan`;
  // No per-event OG render exists; reuse the brand mark the app already serves
  // (same pattern as /p/[id]). asset() adds the "/web" basePath.
  const ogImage = asset("/bfu-mark.png");

  return {
    metadataBase: new URL("https://brightfuturesuzbekistan.uz"),
    title,
    description,
    openGraph: {
      title,
      description,
      siteName: "Bright Futures Uzbekistan",
      images: [{ url: ogImage, width: 1200, height: 630 }],
      type: "website",
    },
    twitter: { card: "summary_large_image", title, description, images: [ogImage] },
  };
}

// One label/value fact row inside the facts cell.
function Fact({ glyph, label, children }) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
      <span aria-hidden style={{ flex: "0 0 auto", fontSize: 14, lineHeight: 1.4 }}>
        {glyph}
      </span>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10.5,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "var(--muted)",
          }}
        >
          {label}
        </div>
        <div style={{ marginTop: 3, fontSize: 14.5, color: "var(--text)", lineHeight: 1.45, overflowWrap: "anywhere" }}>
          {children}
        </div>
      </div>
    </div>
  );
}

export default async function EventDetailPage({ params }) {
  const me = await getMe();
  if (!me) redirect("/login");

  const { lang, t } = await getT();
  const { id } = await params;
  const event = await getEvent(id);
  if (!event) notFound();

  const style = TYPE_STYLE[event.type] || DEFAULT_TYPE;
  const starts = fmtDateTime(event.starts_at);
  const deadline = fmtDate(event.deadline);

  // Targeted regions: region_ids null/[] means "all regions / unlimited". A
  // non-empty list resolves to localized region names via GET /regions.
  const regionIds = Array.isArray(event.region_ids) ? event.region_ids : [];
  const regions = regionIds.length ? await getRegions() : [];
  const regionNames = regionIds.length
    ? regions
        .filter((r) => regionIds.includes(r.id))
        .map((r) => r[`name_${lang}`] || r.name_en || r.name_uz || r.name_ru)
        .filter(Boolean)
    : [];

  // Capacity / seats line (only when the event carries a cap).
  let seatsText = null;
  if (event.capacity != null) {
    const left = event.seats_left;
    if (typeof left === "number" && left > 0) {
      seatsText = left === 1
        ? t("community.events.seatsLeftOne")
        : t("community.events.seatsLeft", { n: left });
    } else {
      seatsText = t("community.events.full");
    }
  }

  const cover = event.cover_url ? asset(event.cover_url) : null;

  return (
    <AppTopBar active="events" me={me}>
      <a
        href="/web/events"
        style={{
          display: "inline-block",
          fontFamily: "var(--font-mono)",
          fontSize: 11.5,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--muted-strong)",
          textDecoration: "none",
        }}
      >
        {t("community.events.detail.back")}
      </a>

      {cover ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={cover}
          alt={event.title}
          style={{
            marginTop: 20,
            width: "100%",
            maxHeight: 340,
            objectFit: "cover",
            borderRadius: "var(--radius)",
            border: "1px solid var(--hair)",
            display: "block",
          }}
        />
      ) : null}

      <div style={{ marginTop: cover ? 24 : 28, display: "flex", flexDirection: "column", gap: 14 }}>
        <span
          style={{
            display: "inline-flex",
            alignSelf: "flex-start",
            alignItems: "center",
            padding: "5px 12px",
            borderRadius: "var(--radius-pill)",
            background: style.bg,
            border: `1px solid ${style.bd}`,
            color: style.color,
            fontFamily: "var(--font-mono)",
            fontSize: 10.5,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}
        >
          {event.type || t("community.events.typeFallback")}
        </span>
        <h1
          style={{
            margin: 0,
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: "clamp(30px, 5vw, 46px)",
            lineHeight: 1.08,
            letterSpacing: "-0.02em",
            color: "var(--text)",
          }}
        >
          {event.title}
        </h1>
      </div>

      <div className="ch-grid" style={{ marginTop: 36, alignItems: "start" }}>
        {/* Left column: the register control + the external link button. */}
        <div style={{ gridColumn: "span 2", display: "flex", flexDirection: "column", gap: 14 }}>
          <EventDetailRegister event={event} meId={me.id} />

          {event.link ? (
            <a
              href={event.link}
              target="_blank"
              rel="noopener noreferrer"
              className="ch-btn-primary"
              style={{ width: "100%", justifyContent: "center" }}
            >
              {t("community.events.detail.externalLink")} <span aria-hidden>↗</span>
            </a>
          ) : null}
        </div>

        {/* Facts: when / deadline / where / seats / regions / partner. */}
        <div className="ch-cell-static" style={{ padding: 22, display: "flex", flexDirection: "column", gap: 16 }}>
          {starts ? (
            <Fact glyph="◷" label={t("community.events.detail.starts")}>{starts}</Fact>
          ) : null}
          {deadline ? (
            <Fact glyph="⏰" label={t("community.events.detail.deadline")}>{deadline}</Fact>
          ) : null}
          {event.location ? (
            <Fact glyph="📍" label={t("community.events.detail.locationLabel")}>{event.location}</Fact>
          ) : null}
          {seatsText ? (
            <Fact glyph="◎" label={t("community.events.detail.seatsLabel")}>{seatsText}</Fact>
          ) : null}
          <Fact glyph="◈" label={t("community.events.detail.regionsLabel")}>
            {regionNames.length ? regionNames.join(", ") : t("community.events.detail.allRegions")}
          </Fact>
          {event.partner_id != null ? (
            <Fact glyph="✦" label={t("community.events.detail.partnerLabel")}>
              {event.partner_name || t("community.events.detail.partnerGeneric")}
            </Fact>
          ) : null}
        </div>

        {/* About: the full description. */}
        {event.description ? (
          <div className="ch-cell-static" style={{ gridColumn: "1 / -1", padding: 26 }}>
            <div className="ch-cell-label">{t("community.events.detail.aboutLabel")}</div>
            <p
              style={{
                margin: "14px 0 0",
                fontSize: 15.5,
                lineHeight: 1.65,
                color: "var(--muted-strong)",
                whiteSpace: "pre-wrap",
                overflowWrap: "anywhere",
              }}
            >
              {event.description}
            </p>
          </div>
        ) : null}
      </div>

      <SiteFooter tagline={t("community.events.footer")} />
    </AppTopBar>
  );
}
