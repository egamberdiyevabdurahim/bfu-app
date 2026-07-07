// Logged-in top bar for the project-loop pages (create / mine / manage /
// requests). Server component — pure links, no hooks. Mirrors the /home and
// /settings top-bar grammar (brand mark + mono wordmark + ghost nav) rather
// than the public TopBar's "Open in Telegram" CTA, which doesn't fit an authed
// surface. `active` dims the current destination's link.
export default function ProjectsTopBar({ active }) {
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
        {link("/projects/mine", "Your projects", "mine", "◆")}
        {link("/requests", "Applications", "requests", "✉")}
        {link("/projects/new", "Start a project", "new", "+")}
        <a href="/home" className="ch-btn-ghost">
          <span style={{ fontSize: 14 }}>←</span> Home
        </a>
      </div>
    </div>
  );
}
