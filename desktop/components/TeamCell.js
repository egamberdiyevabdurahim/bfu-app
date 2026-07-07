import Link from "next/link";
import { gradientFor, initials } from "@/lib/avatar";

// Team cell — overlapping/stacked seeded avatars of the project's team, each
// linking to that member's /u/[id] profile, with a "{team_count} building
// together" line. SERVER component. Falls back to a warm "Just the founder so
// far" grace state when team_count === 0.
export default function TeamCell({ team, teamCount }) {
  const members = Array.isArray(team) ? team : [];
  const count = typeof teamCount === "number" ? teamCount : members.length;

  const empty = count === 0;

  // Show up to 6 stacked faces; any remainder collapses into a +N chip.
  const preview = members.slice(0, 6);
  const extra = Math.max(0, count - preview.length);

  return (
    <div
      className="ch-cell-static"
      style={{ gridColumn: "span 2", display: "flex", flexDirection: "column" }}
    >
      <div className="ch-cell-label">Team</div>

      {empty ? (
        <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 6 }}>
          <p
            style={{
              margin: 0,
              fontFamily: "var(--font-accent)",
              fontStyle: "italic",
              fontSize: 22,
              lineHeight: 1.3,
              color: "var(--text)",
            }}
          >
            Just the founder so far
          </p>
          <p style={{ margin: 0, fontSize: 14, color: "var(--muted-strong)", lineHeight: 1.5 }}>
            The fire&rsquo;s just been lit — this could be where you come in.
          </p>
        </div>
      ) : (
        <>
          <div style={{ marginTop: 20, display: "flex", alignItems: "center" }}>
            {preview.map((m, i) => (
              <Link
                key={m.id}
                href={`/u/${m.id}`}
                title={m.display_name}
                style={{
                  position: "relative",
                  width: 48,
                  height: 48,
                  borderRadius: "50%",
                  background: gradientFor(m.id),
                  border: "2px solid var(--surface)",
                  marginLeft: i === 0 ? 0 : -14,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "var(--font-display)",
                  fontWeight: 700,
                  fontSize: 16,
                  color: "#160E08",
                  textDecoration: "none",
                  overflow: "hidden",
                  zIndex: i + 1,
                }}
              >
                {m.photo_url ? (
                  <img
                    src={m.photo_url}
                    alt={m.display_name}
                    style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }}
                  />
                ) : (
                  initials(m.display_name)
                )}
                {m.checked && (
                  <span
                    role="img"
                    aria-label="Verified"
                    style={{
                      position: "absolute",
                      bottom: -1,
                      right: -1,
                      width: 16,
                      height: 16,
                      borderRadius: "50%",
                      background: "var(--green)",
                      border: "2px solid var(--surface)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 10,
                      color: "#160E08",
                      fontWeight: 900,
                    }}
                  >
                    ✓
                  </span>
                )}
              </Link>
            ))}
            {extra > 0 && (
              <div
                title={`${extra} more ${extra === 1 ? "teammate" : "teammates"}`}
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: "50%",
                  background: "var(--surface-2)",
                  border: "2px solid var(--surface)",
                  marginLeft: -14,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "var(--font-mono)",
                  fontWeight: 700,
                  fontSize: 13,
                  color: "var(--muted-strong)",
                }}
              >
                +{extra}
              </div>
            )}
          </div>

          <div style={{ marginTop: 18, fontSize: 15, color: "var(--text)" }}>
            <span style={{ fontFamily: "var(--font-mono)", color: "var(--amber)" }}>{count}</span>{" "}
            building together
          </div>
        </>
      )}
    </div>
  );
}
