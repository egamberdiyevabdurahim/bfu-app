// About cell — the project's longer-form description. SERVER component. The
// parent skips rendering this entirely when `about` is null, so it always has
// content when mounted.
export default function ProjectAboutCell({ about }) {
  if (!about) return null;

  return (
    <div className="ch-cell" style={{ gridColumn: "span 4", display: "flex", flexDirection: "column" }}>
      <div className="ch-cell-label">About</div>
      <p
        style={{
          margin: "16px 0 0",
          fontSize: 17,
          lineHeight: 1.6,
          color: "var(--text)",
          whiteSpace: "pre-line",
        }}
      >
        {about}
      </p>
    </div>
  );
}
