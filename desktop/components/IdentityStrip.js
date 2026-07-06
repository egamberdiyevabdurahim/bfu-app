function initials(name) {
  const parts = (name || "?").split(" ").filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export default function IdentityStrip({ profile }) {
  const roleParts = [
    profile.region?.name_en,
    profile.stats?.projects_founded > 0 ? "Founder" : null,
  ].filter(Boolean);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 30, marginTop: 44 }}>
      <div style={{ position: "relative", flex: "0 0 auto" }}>
        <div style={{ width: 128, height: 128, borderRadius: "50%",
          background: "linear-gradient(140deg,#E8A15C,#C0563B)", display: "flex",
          alignItems: "center", justifyContent: "center", fontFamily: "var(--font-display)",
          fontWeight: 700, fontSize: 46, color: "#160E08",
          boxShadow: "0 0 0 1px rgba(255,106,61,0.3), 0 20px 50px rgba(255,106,61,0.22)" }}>
          {profile.photo_url ? (
            <img src={profile.photo_url} alt={profile.name} style={{ width: "100%", height: "100%",
              borderRadius: "50%", objectFit: "cover" }} />
          ) : initials(profile.name)}
        </div>
        <span style={{ position: "absolute", bottom: 8, right: 8, display: "inline-flex",
          width: 20, height: 20 }}>
          <span className="ch-online-ping" />
          <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "var(--ember)",
            border: "3px solid var(--bg)" }} />
        </span>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <h1 style={{ margin: 0, fontFamily: "var(--font-display)", fontWeight: 700,
            fontSize: 60, lineHeight: 0.98, letterSpacing: "-0.02em", color: "var(--text)" }}>
            {profile.name}
          </h1>
          {profile.checked && (
            <span title="Verified" style={{ display: "inline-flex", alignItems: "center",
              justifyContent: "center", width: 30, height: 30, borderRadius: "50%",
              background: "rgba(127,176,105,0.16)", color: "var(--green)", fontSize: 16, marginTop: 6 }}>✓</span>
          )}
        </div>
        {profile.currently_building && (
          <div style={{ marginTop: 8, fontSize: 40, lineHeight: 1.05, color: "var(--text)" }}>
            <span style={{ fontFamily: "var(--font-accent)", fontStyle: "italic", color: "var(--muted)" }}>
              is building
            </span>{" "}
            <span style={{ fontFamily: "var(--font-accent)", fontStyle: "italic", color: "var(--amber)" }}>
              {profile.currently_building}
            </span>
          </div>
        )}
        <div style={{ marginTop: 16, fontFamily: "var(--font-mono)", fontSize: 12, letterSpacing: "0.16em",
          textTransform: "uppercase", color: "var(--muted)", display: "flex", alignItems: "center",
          gap: 10, flexWrap: "wrap" }}>
          {roleParts.map((part, i) => (
            <span key={part} style={{ display: "contents" }}>
              {i > 0 && <span style={{ color: "var(--hair)" }}>/</span>}
              <span>{part}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
