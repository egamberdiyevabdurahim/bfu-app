import { redirect } from "next/navigation";
import { getMe } from "@/lib/session";
import { gradientFor, initials } from "@/lib/avatar";
import Atmosphere from "@/components/Atmosphere";

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

export default async function HomePage() {
  const me = await getMe();
  if (!me) redirect("/login");

  const name = me.display_name || me.name || "Builder";
  const seed = me.id ?? 0;

  return (
    <main style={{ position: "relative", minHeight: "100vh" }}>
      <Atmosphere />

      <div
        style={{
          position: "relative",
          zIndex: 2,
          maxWidth: 1200,
          margin: "0 auto",
          padding: "26px 40px 96px",
        }}
      >
        {/* Home TopBar — brand mark on the left, a "Log out" affordance on the
            right (the public TopBar's "Open in Telegram" CTA doesn't fit a
            logged-in surface). */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 24,
            padding: "12px 0 8px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <img
              src="/bfu-mark.png"
              alt="BFU"
              style={{
                height: 38,
                width: "auto",
                display: "block",
                filter: "drop-shadow(0 2px 10px rgba(232,161,92,0.25))",
              }}
            />
            <div style={{ width: 1, height: 26, background: "var(--hair)" }} />
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: "var(--muted)",
              }}
            >
              Bright Futures Uzbekistan
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <a href="/settings" className="ch-btn-ghost">
              <span style={{ fontSize: 15, color: "var(--amber)" }}>✎</span> Edit profile
            </a>
            <a href="/city" className="ch-btn-ghost">
              <span style={{ fontSize: 15, color: "var(--amber)" }}>✦</span> The city
            </a>
            <a href="/api/auth/logout" className="ch-btn-ghost">
              Log out <span style={{ fontSize: 14 }}>↩</span>
            </a>
          </div>
        </div>

        {/* Welcome hero — Bricolage headline + Instrument-serif accent line. */}
        <div style={{ marginTop: 48 }}>
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
              fontSize: 62,
              lineHeight: 0.98,
              letterSpacing: "-0.02em",
              color: "var(--text)",
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
              fontSize: 22,
              lineHeight: 1.35,
              color: "var(--muted)",
              maxWidth: 560,
            }}
          >
            The bazaar is humming and your workshop is right where you left it.
          </p>
        </div>

        {/* Bento grid — your-profile card (wide) + quick links to /city and
            /projects, reusing the .ch-cell grammar. */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 20,
            marginTop: 44,
            alignItems: "stretch",
          }}
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
              <div style={{ position: "relative", flex: "0 0 auto" }}>
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
                <span
                  style={{
                    position: "absolute",
                    bottom: 4,
                    right: 4,
                    display: "inline-flex",
                    width: 16,
                    height: 16,
                  }}
                >
                  <span className="ch-online-ping" />
                  <span
                    style={{
                      position: "absolute",
                      inset: 0,
                      borderRadius: "50%",
                      background: "var(--ember)",
                      border: "3px solid var(--surface)",
                    }}
                  />
                </span>
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
                      color: "var(--muted)",
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

          {/* Quick link: the city */}
          <a
            href="/city"
            className="ch-cell"
            style={{
              gridColumn: "span 1",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              gap: 16,
              color: "var(--text)",
              textDecoration: "none",
              background:
                "linear-gradient(155deg, rgba(255,106,61,0.08), var(--surface) 62%)",
            }}
          >
            <div className="ch-cell-label">Wander</div>
            <div>
              <div
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 700,
                  fontSize: 24,
                  letterSpacing: "-0.01em",
                }}
              >
                The city
              </div>
              <p
                style={{
                  margin: "8px 0 0",
                  fontSize: 13.5,
                  lineHeight: 1.5,
                  color: "var(--muted)",
                }}
              >
                See who's building right now, city by city.
              </p>
            </div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "var(--amber)",
              }}
            >
              Enter →
            </div>
          </a>

          {/* Quick link: projects */}
          <a
            href="/projects"
            className="ch-cell"
            style={{
              gridColumn: "span 1",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              gap: 16,
              color: "var(--text)",
              textDecoration: "none",
              background:
                "linear-gradient(155deg, rgba(18,86,79,0.14), var(--surface) 62%)",
            }}
          >
            <div className="ch-cell-label">Build together</div>
            <div>
              <div
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 700,
                  fontSize: 24,
                  letterSpacing: "-0.01em",
                }}
              >
                Projects
              </div>
              <p
                style={{
                  margin: "8px 0 0",
                  fontSize: 13.5,
                  lineHeight: 1.5,
                  color: "var(--muted)",
                }}
              >
                Startups and volunteering looking for hands.
              </p>
            </div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "#5EC5B6",
              }}
            >
              Browse →
            </div>
          </a>

          {/* Quick link: the command center — spans the full row. Non-admins who
              click through get the graceful "founders & admins only" state on
              /dashboard (the page gates on the 403 from /admin/stats). */}
          <a
            href="/dashboard"
            className="ch-cell"
            style={{
              gridColumn: "span 4",
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
              <div className="ch-cell-label">For founders &amp; admins</div>
              <div
                style={{
                  marginTop: 10,
                  fontFamily: "var(--font-display)",
                  fontWeight: 700,
                  fontSize: 24,
                  letterSpacing: "-0.01em",
                }}
              >
                Command center
              </div>
              <p
                style={{
                  margin: "8px 0 0",
                  fontSize: 13.5,
                  lineHeight: 1.5,
                  color: "var(--muted)",
                  maxWidth: 560,
                }}
              >
                The whole bazaar at a glance — builders, regions, retention and
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
        </div>

        {/* Footer */}
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
          <span
            style={{
              fontFamily: "var(--font-accent)",
              fontStyle: "italic",
              fontSize: 18,
              color: "var(--muted)",
            }}
          >
            The city never really sleeps.
          </span>
        </div>
      </div>
    </main>
  );
}
