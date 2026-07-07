// Logged-in top bar for the community-loop pages (mentors / sessions / events /
// partners — Batch 4). Server component — pure links, no hooks. Mirrors the
// /home, /settings and ProjectsTopBar grammar (brand mark + mono wordmark +
// ghost nav). `active` dims + rings the current destination's link.
export default function CommunityTopBar({ active }) {
  const link = (href, label, key, accentIcon) => (
    <a
      href={href}
      className="ch-btn-ghost"
      style={active === key ? { borderColor: "var(--amber)", background: "rgba(35,32,25,0.9)" } : undefined}
    >
      {accentIcon ? <span style={{ fontSize: 15, color: "var(--amber)" }}>{accentIcon}</span> : null}
      {label}
    </a>
  );

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 24,
        padding: "12px 0 8px",
      }}
    >
      <a href="/home" style={{ display: "flex", alignItems: "center", gap: 16, textDecoration: "none" }}>
        <img
          src="/bfu-mark.png"
          alt="BFU"
          style={{ height: 38, width: "auto", display: "block", filter: "drop-shadow(0 2px 10px rgba(232,161,92,0.25))" }}
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
      </a>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        {link("/mentors", "Mentors", "mentors", "◈")}
        {link("/bookings", "Sessions", "bookings", "◷")}
        {link("/events", "Events", "events", "✦")}
        {link("/partners", "Partners", "partners", "⬡")}
        <a href="/home" className="ch-btn-ghost">
          <span style={{ fontSize: 14 }}>←</span> Home
        </a>
      </div>
    </div>
  );
}
