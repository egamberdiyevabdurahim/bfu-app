export default function TopBar() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
      gap: 24, padding: "12px 0 8px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <img src="/bfu-mark.png" alt="BFU" style={{ height: 38, width: "auto", display: "block",
          filter: "drop-shadow(0 2px 10px rgba(232,161,92,0.25))" }} />
        <div style={{ width: 1, height: 26, background: "var(--hair)" }} />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.16em",
          textTransform: "uppercase", color: "var(--muted)" }}>Bright Futures Uzbekistan</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button className="ch-btn-ghost">
          <span style={{ fontSize: 15, color: "var(--amber)" }}>✦</span> Save to your list
        </button>
        <a href="#" className="ch-btn-primary">
          Open in Telegram <span style={{ fontSize: 14 }}>↗</span>
        </a>
      </div>
    </div>
  );
}
