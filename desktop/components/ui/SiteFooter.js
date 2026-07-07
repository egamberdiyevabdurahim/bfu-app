// Shared page footer — the "brightfuturesuzbekistan.uz · <tagline>" strip that
// was copy-pasted inline across ~12 pages (and missing entirely on /requests &
// /settings). Server component; pass a `tagline` (and optionally override the
// host label). flexWrap keeps the host + tagline from colliding on narrow widths.
export default function SiteFooter({
  tagline = "Someone is always building right now.",
  host = "brightfuturesuzbekistan.uz",
}) {
  return (
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
        {host}
      </span>
      <span
        style={{
          fontFamily: "var(--font-accent)",
          fontStyle: "italic",
          fontSize: 18,
          color: "var(--muted)",
        }}
      >
        {tagline}
      </span>
    </div>
  );
}
