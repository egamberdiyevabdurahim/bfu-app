const STACK_GRADIENTS = [
  "linear-gradient(140deg,#E8A15C,#C0563B)",
  "linear-gradient(140deg,#F0B429,#C0563B)",
  "linear-gradient(140deg,#5EC5B6,#12564F)",
  "linear-gradient(140deg,#7FB069,#12564F)",
];

function initials(name) {
  const parts = (name || "?").split(" ").filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export default function ConnectionsCell({ collaborators, followerCount, region }) {
  const preview = collaborators?.preview || [];
  const extra = Math.max(0, (collaborators?.count || 0) - preview.length);

  return (
    <div className="ch-cell" style={{ gridColumn: "span 4", display: "flex", alignItems: "center",
      justifyContent: "space-between", gap: 24, padding: "26px 28px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <div style={{ display: "flex" }}>
          {preview.map((p, i) => (
            <div key={p.id} style={{ width: 44, height: 44, borderRadius: "50%",
              background: STACK_GRADIENTS[i % STACK_GRADIENTS.length], border: "2px solid var(--surface)",
              marginLeft: i === 0 ? 0 : -14, display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15, color: "#160E08" }}>
              {initials(p.display_name)}
            </div>
          ))}
          {extra > 0 && (
            <div style={{ width: 44, height: 44, borderRadius: "50%", background: "var(--surface-2)",
              border: "2px solid var(--surface)", marginLeft: -14, display: "flex", alignItems: "center",
              justifyContent: "center", fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 13,
              color: "var(--muted)" }}>
              +{extra}
            </div>
          )}
        </div>
        <div>
          <div style={{ fontSize: 15, color: "var(--text)" }}>
            <span style={{ fontFamily: "var(--font-mono)", color: "var(--amber)" }}>
              {followerCount}
            </span>{" "}
            connections
          </div>
          {region && (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.1em",
              color: "var(--muted)", marginTop: 4 }}>
              {region.name_en}
            </div>
          )}
        </div>
      </div>
      <button className="ch-btn-ghost">See all →</button>
    </div>
  );
}
