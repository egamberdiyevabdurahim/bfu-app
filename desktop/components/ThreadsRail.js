"use client";

import { gradientFor } from "../lib/avatar";
import { useT } from "@/components/i18n/LocaleProvider";

// Ports the mockup's `.rail` / `.thread` block
// (docs/superpowers/mockups/2026-07-06-chorsu-city-discovery.html lines 114-123,
// 196-197, 254-264). A CLIENT component: every string here is user-visible copy
// on the public trilingual /city page, so it reads the language through `useT()`
// exactly like its siblings (CityHeader, RegionCluster, BuilderCard). The markup
// itself is still inert — the hover-lift stays pure CSS `:hover` — and the props
// it receives from the server page are plain data, so the boundary is cheap.
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
  const t = useT();

  if (!threads || threads.length === 0) return null;

  return (
    <>
      <div className="ch-slab">
        <span className="ch-slab-k">{t("city.threads.kicker")}</span>
        <h2>{t("city.threads.title")}</h2>
        <div className="ch-slab-line" />
      </div>

      <div className="ch-rail">
        {threads.map((thread, i) => (
          <Thread key={thread.kind || i} thread={thread} index={i} t={t} />
        ))}
      </div>
    </>
  );
}

// Map a thread's machine `kind` to the FilterBar chip key that best expresses
// it, so clicking the thread opens /city already filtered (via FilterBar's
// `?f=` deep-link). Keys MUST match FilterBar's chip keys exactly. Threads with
// no sensible generic chip fall back to "all" (a no-op the FilterBar ignores).
function threadFilterKey(kind) {
  switch (kind) {
    case "new_in_city":
      return "online"; // just-arrived / new builders → "Online now"
    case "rising":
      return "online"; // gaining momentum tonight → the active-now set
    case "open_roles":
      return "open_to_work"; // builders who need collaborators → "Looking for co-founder"
    default:
      // skill_cluster (needs a specific skill slug we can't know here) and any
      // future kind → no sensible generic chip.
      return "all";
  }
}

function Thread({ thread = {}, index = 0, t }) {
  const { title, subtitle, faces = [] } = thread;
  const body = (
    <>
      {thread.kind && <div className="ch-thread-k">{kindLabel(thread.kind, t)}</div>}
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

  // Each thread deep-links back to the city with a real FilterBar filter
  // applied (?f=<key>), so clicking it actually narrows the bazaar instead of
  // just returning to an unfiltered /city. The hover-lift stays pure CSS.
  const href = `/city?f=${threadFilterKey(thread.kind)}`;
  return (
    <a className="ch-thread" href={href}>
      {body}
    </a>
  );
}

// The backend emits a machine `kind` ("rising" | "new_in_city" | "skill_cluster"
// | "open_roles"); the mockup shows a warm human kicker. Only these four kinds
// have translated copy, so we look up an EXPLICIT key rather than building one
// from `kind` — an unknown kind would otherwise miss the catalog and render its
// raw dotted key ("city.threads.kind.whatever") straight onto a public page.
// Any future kind therefore degrades to the old title-case of the machine value.
const THREAD_KIND_KEYS = {
  rising: "city.threads.kind.rising",
  new_in_city: "city.threads.kind.new_in_city",
  skill_cluster: "city.threads.kind.skill_cluster",
  open_roles: "city.threads.kind.open_roles",
};

function kindLabel(kind, t) {
  const key = THREAD_KIND_KEYS[kind];
  if (key) return t(key);
  return String(kind || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
