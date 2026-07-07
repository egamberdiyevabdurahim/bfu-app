// About cell — the project's longer-form description. SERVER (non-interactive,
// passive) info panel, so it uses .ch-cell-static — no hover lift/glow that
// would falsely read as a clickable tile. The parent skips rendering this
// entirely when `about` is null, so it always has content when mounted.
export default function ProjectAboutCell({ about }) {
  if (!about) return null;

  return (
    <div
      className="ch-cell-static"
      style={{ gridColumn: "span 2", display: "flex", flexDirection: "column" }}
    >
      <div className="ch-cell-label">About</div>
      <p
        style={{
          margin: "16px 0 0",
          fontSize: 17,
          lineHeight: 1.65,
          color: "var(--text)",
          whiteSpace: "pre-line",
          overflowWrap: "break-word",
        }}
      >
        {about}
      </p>
    </div>
  );
}
