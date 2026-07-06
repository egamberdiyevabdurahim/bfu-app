import { gradientFor } from "../lib/avatar";

// Ports the mockup's `.rail` / `.thread` block
// (docs/superpowers/mockups/2026-07-06-chorsu-city-discovery.html lines 114-123,
// 196-197, 254-264) into a SERVER component. Pure markup — the hover-lift is CSS
// `:hover`, so no client boundary is crossed.
//
// A "Serendipity" slab header + a horizontal-scroll rail of thread cards. Each
// thread carries: kicker (teal), title, subtitle, and a stack of overlapping
// faces. Faces are seeded gradients (`gradientFor(face.gradient_seed)`) with the
// builder's initials — never real photos here, keeping the rail lightweight and
// viewer-agnostic per the /public/city contract.
//
// Renders nothing when there are no threads, so a quiet night simply omits the
// section rather than showing an empty rail.

export default function ThreadsRail({ threads = [] }) {
  if (!threads || threads.length === 0) return null;

  return (
    <>
      <div className="ch-slab">
        <span className="ch-slab-k">Serendipity</span>
        <h2>Threads from here</h2>
        <div className="ch-slab-line" />
      </div>

      <div className="ch-rail">
        {threads.map((thread, i) => (
          <Thread key={thread.kind || i} thread={thread} index={i} />
        ))}
      </div>
    </>
  );
}

function Thread({ thread = {}, index = 0 }) {
  const { title, subtitle, faces = [], href } = thread;
  const body = (
    <>
      {thread.kind && <div className="ch-thread-k">{kindLabel(thread.kind)}</div>}
      <h3>{title}</h3>
      {subtitle && <p>{subtitle}</p>}
      {faces.length > 0 && (
        <div className="ch-thread-faces">
          {faces.map((f, j) => (
            <span
              key={f.id ?? j}
              style={{ background: gradientFor(f.gradient_seed ?? f.id ?? index + j) }}
            >
              {f.initials || "?"}
            </span>
          ))}
        </div>
      )}
    </>
  );

  // Threads point at a destination (defaults to /city); an anchor keeps the
  // whole card clickable while the hover-lift stays pure CSS.
  return (
    <a className="ch-thread" href={href || "/city"}>
      {body}
    </a>
  );
}

// The backend emits a machine `kind` ("rising" | "new_in_city" | "skill_cluster"
// | "open_roles"); the mockup shows a warm human kicker. Map to that voice, with
// a graceful title-case fallback for any future kind.
function kindLabel(kind) {
  switch (kind) {
    case "rising":
      return "Rising tonight";
    case "new_in_city":
      return "New in your city";
    case "skill_cluster":
      return "Same problem";
    case "open_roles":
      return "They need what you have";
    default:
      return String(kind || "")
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
  }
}
