import { redirect } from "next/navigation";
import { getMe } from "@/lib/session";
import { gradientFor, initials } from "@/lib/avatar";
import AppTopBar from "@/components/nav/AppTopBar";
import { ADMIN_ROLES } from "@/components/nav/navConfig";
import SiteFooter from "@/components/ui/SiteFooter";

// /home reads the httpOnly session cookie, so it can never be statically cached
// or ISR-revalidated — it is per-user and must render fresh each request.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Your bazaar — Bright Futures Uzbekistan",
  description: "Your firelit corner of the city of builders.",
};

// First name for the warm greeting — the display name's first token, falling
// back to the whole name, then a friendly default.
function firstName(me) {
  const name = me?.display_name || me?.name || "";
  const token = name.split(" ").filter(Boolean)[0];
  return token || "builder";
}

// The launchpad tiles. Every area of the product is a labeled, icon-led card so
// a first-time user instantly sees what they can do — nobody needs to know a
// URL. Grouped into "Explore the city" and "Your workshop"; Dashboard is
// appended for admins only. `accent` tints the tile's glow to match the section.
const EXPLORE_TILES = [
  { href: "/city", icon: "✦", label: "City", blurb: "See who's building right now, city by city.", accent: "amber" },
  { href: "/projects", icon: "◆", label: "Projects", blurb: "Browse the teams that are hiring tonight.", accent: "amber" },
  { href: "/connections", icon: "❋", label: "People", blurb: "Discover builders and grow your circle.", accent: "teal" },
  { href: "/mentors", icon: "◈", label: "Mentors", blurb: "Book 15 minutes with someone ahead of you.", accent: "teal" },
  { href: "/events", icon: "✧", label: "Events", blurb: "Find the next hackathon, grant or meetup.", accent: "teal" },
  { href: "/partners", icon: "⬡", label: "Partners", blurb: "Meet the orgs opening doors for builders.", accent: "teal" },
];

// Note: /connections is reached via the "People" tile in EXPLORE_TILES above, so
// we don't repeat a second tile pointing at the same route here.
const YOU_TILES = [
  { href: "/projects/mine", icon: "◆", label: "Your projects", blurb: "The teams you run and the ones you've joined.", accent: "teal" },
  { href: "/requests", icon: "✒", label: "Applications", blurb: "See who's asked to join the projects you've started.", accent: "amber" },
  { href: "/favorites", icon: "❥", label: "Saved", blurb: "Builders and projects you've kept for later.", accent: "amber" },
  { href: "/bookings", icon: "◷", label: "Sessions", blurb: "Your mentor bookings, upcoming and past.", accent: "teal" },
  { href: "/settings", icon: "✎", label: "Settings", blurb: "Edit your profile and preferences.", accent: "amber" },
];

// Accent → (border, glow-background) tokens. Amber for the personal/city warmth,
// teal for the community loop — matching the existing /home palette.
const ACCENTS = {
  amber: {
    border: "rgba(232,161,92,0.26)",
    glow: "linear-gradient(155deg, rgba(255,106,61,0.08), var(--surface) 62%)",
    icon: "var(--amber)",
  },
  teal: {
    border: "rgba(94,197,182,0.26)",
    glow: "linear-gradient(155deg, rgba(18,86,79,0.14), var(--surface) 62%)",
    icon: "var(--teal-bright)",
  },
};

function Tile({ tile }) {
  const a = ACCENTS[tile.accent] || ACCENTS.amber;
  return (
    <a
      href={tile.href}
      className="ch-cell"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        color: "var(--text)",
        textDecoration: "none",
        background: a.glow,
        borderColor: a.border,
        minHeight: 148,
      }}
    >
      <div
        aria-hidden
        style={{
          width: 42,
          height: 42,
          borderRadius: 12,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 20,
          color: a.icon,
          background: "rgba(35,32,25,0.65)",
          border: "1px solid var(--hair)",
        }}
      >
        {tile.icon}
      </div>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: 20,
          letterSpacing: "-0.01em",
          marginTop: 2,
        }}
      >
        {tile.label}
      </div>
      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: "var(--muted-strong)" }}>{tile.blurb}</p>
      <div
        style={{
          marginTop: "auto",
          paddingTop: 6,
          fontFamily: "var(--font-mono)",
          fontSize: 10.5,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: a.icon,
        }}
      >
        Open →
      </div>
    </a>
  );
}

function SectionLabel({ children }) {
  return (
    <div
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        color: "var(--muted-strong)",
        margin: "44px 0 18px",
      }}
    >
      {children}
    </div>
  );
}

export default async function HomePage() {
  const me = await getMe();
  if (!me) redirect("/login");

  const name = me.display_name || me.name || "Builder";
  const seed = me.id ?? 0;
  const isAdmin = ADMIN_ROLES.has(me.role);

  return (
    <AppTopBar active="home" me={me}>
        {/* Welcome hero — Bricolage headline + Instrument-serif accent line. */}
        <div style={{ marginTop: 8 }}>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "var(--amber)",
            }}
          >
            The lamps are lit
          </div>
          <h1
            style={{
              margin: "14px 0 0",
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: "clamp(38px, 8vw, 62px)",
              lineHeight: 1.02,
              letterSpacing: "-0.02em",
              color: "var(--text)",
              overflowWrap: "break-word",
            }}
          >
            Welcome back,{" "}
            <span
              style={{
                fontFamily: "var(--font-accent)",
                fontStyle: "italic",
                fontWeight: 400,
                color: "var(--amber)",
              }}
            >
              {firstName(me)}
            </span>
          </h1>
          <p
            style={{
              margin: "18px 0 0",
              fontFamily: "var(--font-accent)",
              fontStyle: "italic",
              fontSize: "clamp(18px, 2.4vw, 22px)",
              lineHeight: 1.35,
              color: "var(--muted-strong)",
              maxWidth: 560,
            }}
          >
            The bazaar is humming and your workshop is right where you left it.
          </p>
        </div>

        {/* Profile summary + primary CTAs. The profile cell (kept from the
            original /home) spans 2 cols; a start-a-project cell sits beside it. */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 20,
            marginTop: 40,
            alignItems: "stretch",
          }}
          className="home-hero-grid"
        >
          {/* Your profile — spans 2 cols. Whole cell links to /u/{id}. */}
          <a
            href={`/u/${me.id}`}
            className="ch-cell"
            style={{
              gridColumn: "span 2",
              display: "flex",
              flexDirection: "column",
              gap: 20,
              color: "var(--text)",
              textDecoration: "none",
            }}
          >
            <div className="ch-cell-label">Your profile</div>
            <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
              {/* No presence dot here: `me` carries no reliable online signal,
                  so we don't assert a fake "online" state on the viewer's own
                  profile summary. */}
              <div style={{ flex: "0 0 auto" }}>
                <div
                  style={{
                    width: 84,
                    height: 84,
                    borderRadius: "50%",
                    background: gradientFor(seed),
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: "var(--font-display)",
                    fontWeight: 700,
                    fontSize: 30,
                    color: "#160E08",
                    overflow: "hidden",
                    boxShadow:
                      "0 0 0 1px rgba(255,106,61,0.3), 0 16px 40px rgba(255,106,61,0.2)",
                  }}
                >
                  {me.photo_url ? (
                    <img
                      src={me.photo_url}
                      alt={name}
                      style={{
                        width: "100%",
                        height: "100%",
                        borderRadius: "50%",
                        objectFit: "cover",
                      }}
                    />
                  ) : (
                    initials(name)
                  )}
                </div>
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <h2
                    style={{
                      margin: 0,
                      fontFamily: "var(--font-display)",
                      fontWeight: 700,
                      fontSize: 28,
                      letterSpacing: "-0.01em",
                      color: "var(--text)",
                    }}
                  >
                    {name}
                  </h2>
                  {me.checked && (
                    <span
                      role="img"
                      aria-label="Verified"
                      title="Verified"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 24,
                        height: 24,
                        borderRadius: "50%",
                        background: "rgba(127,176,105,0.16)",
                        color: "var(--green)",
                        fontSize: 13,
                      }}
                    >
                      ✓
                    </span>
                  )}
                </div>
                {me.currently_building ? (
                  <div
                    style={{
                      marginTop: 6,
                      fontSize: 18,
                      lineHeight: 1.25,
                      color: "var(--text)",
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "var(--font-accent)",
                        fontStyle: "italic",
                        color: "var(--muted)",
                      }}
                    >
                      building
                    </span>{" "}
                    <span
                      style={{
                        fontFamily: "var(--font-accent)",
                        fontStyle: "italic",
                        color: "var(--amber)",
                      }}
                    >
                      {me.currently_building}
                    </span>
                  </div>
                ) : (
                  <div
                    style={{
                      marginTop: 6,
                      fontFamily: "var(--font-accent)",
                      fontStyle: "italic",
                      fontSize: 17,
                      color: "var(--muted)",
                    }}
                  >
                    What are you building tonight?
                  </div>
                )}
                {me.region?.name_en && (
                  <div
                    style={{
                      marginTop: 12,
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                      color: "var(--muted-strong)",
                    }}
                  >
                    {me.region.name_en}
                  </div>
                )}
              </div>
            </div>
            <div
              style={{
                marginTop: "auto",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "var(--amber)",
              }}
            >
              View your public page →
            </div>
          </a>

          {/* Start a project — the primary "do something now" CTA. */}
          <div
            className="ch-cell"
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              gap: 16,
              color: "var(--text)",
              background:
                "linear-gradient(155deg, rgba(18,86,79,0.16), var(--surface) 62%)",
              borderColor: "rgba(94,197,182,0.26)",
            }}
          >
            <div>
              <div className="ch-cell-label">Build together</div>
              <div
                style={{
                  marginTop: 12,
                  fontFamily: "var(--font-display)",
                  fontWeight: 700,
                  fontSize: 22,
                  letterSpacing: "-0.01em",
                }}
              >
                Start a project
              </div>
              <p style={{ margin: "8px 0 0", fontSize: 13, lineHeight: 1.5, color: "var(--muted)" }}>
                Rally a team around the thing you're building.
              </p>
            </div>
            <a href="/projects/new" className="ch-btn-primary" style={{ justifyContent: "center" }}>
              + New project
            </a>
          </div>
        </div>

        {/* ── Explore the city ── */}
        <SectionLabel>Explore the city</SectionLabel>
        <div className="home-tile-grid">
          {EXPLORE_TILES.map((t) => (
            <Tile key={t.href + t.label} tile={t} />
          ))}
        </div>

        {/* ── Your workshop ── */}
        <SectionLabel>Your workshop</SectionLabel>
        <div className="home-tile-grid">
          {YOU_TILES.map((t) => (
            <Tile key={t.href + t.label} tile={t} />
          ))}
        </div>

        {/* ── For founders & admins ── (admins only) */}
        {isAdmin && (
          <>
            <SectionLabel>For founders &amp; admins</SectionLabel>
            <a
              href="/dashboard"
              className="ch-cell"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 20,
                flexWrap: "wrap",
                color: "var(--text)",
                textDecoration: "none",
                background:
                  "linear-gradient(120deg, rgba(232,161,92,0.10), rgba(192,86,59,0.05) 55%, var(--surface))",
                borderColor: "rgba(232,161,92,0.28)",
              }}
            >
              <div>
                <div
                  style={{
                    fontFamily: "var(--font-display)",
                    fontWeight: 700,
                    fontSize: 24,
                    letterSpacing: "-0.01em",
                  }}
                >
                  <span aria-hidden style={{ color: "var(--amber)", marginRight: 10 }}>
                    ▦
                  </span>
                  Command center
                </div>
                <p
                  style={{
                    margin: "8px 0 0",
                    fontSize: 14,
                    lineHeight: 1.5,
                    color: "var(--muted-strong)",
                    maxWidth: 560,
                  }}
                >
                  The whole bazaar at a glance &mdash; builders, regions, retention and
                  the skills the city still needs.
                </p>
              </div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "var(--amber)",
                  whiteSpace: "nowrap",
                }}
              >
                Open the counter →
              </div>
            </a>
          </>
        )}

        {/* Footer */}
        <SiteFooter tagline="Your workshop is right where you left it." />

      {/* Responsive grids — the launchpad tiles flow from 3 → 2 → 1 columns,
          and the hero grid stacks below ~760px. */}
      <style>{`
        .home-tile-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 20px;
        }
        @media (max-width: 900px) {
          .home-tile-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 760px) {
          .home-hero-grid { grid-template-columns: 1fr !important; }
          .home-hero-grid > a { grid-column: auto !important; }
        }
        @media (max-width: 560px) {
          .home-tile-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </AppTopBar>
  );
}
