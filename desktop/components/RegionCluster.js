import BuilderCard from "./BuilderCard";

// Ports the mockup's region section: the `.slab` header (REGION kicker /
// "{name} tonight" / hairline / "{lit} lit") followed by the `.grid` of
// builder windows (docs/superpowers/mockups/2026-07-06-chorsu-city-discovery.html
// lines 79-82, 192-193). SERVER component — no hooks, pure markup.
//
// ⚠ The `.grid` wrapper MUST carry `data-cluster`: FilterBar (already built)
// walks `[data-cluster]` nodes to show/hide the `[data-builder]` cards inside
// and to collapse a cluster whose visible count drops to zero. Without it,
// client-side filtering silently no-ops on this section.
//
// Graceful low-count (spec §6): when fewer than 6 builders are lit, append a
// warm trailing tile inviting the reader to be one of the first — the empty
// bazaar should feel like an opening, not a dead end.

const LOW_COUNT_THRESHOLD = 6;

export default function RegionCluster({ region = {}, nameKey = "name_en" }) {
  const people = region.people || [];
  const name = region[nameKey] || region.name_en || region.name || "This city";
  const lit = region.lit != null ? region.lit : people.length;
  const small = people.length < LOW_COUNT_THRESHOLD;

  return (
    <>
      <div className="ch-slab">
        <span className="ch-slab-k">Region</span>
        <h2>{name} tonight</h2>
        <div className="ch-slab-line" />
        <span className="ch-slab-k">{lit} lit</span>
      </div>

      <div className="ch-grid" data-cluster={String(region.id ?? "")}>
        {people.map((builder, i) => (
          <BuilderCard
            key={builder.id ?? i}
            builder={builder}
            index={i}
            regionLabel={name}
          />
        ))}

        {small && (
          <div className="ch-grace">
            <span className="ch-grace-k">Early tonight</span>
            <div className="ch-grace-t">The bazaar is small tonight.</div>
            <div className="ch-grace-s">
              Be one of the first to light up {name} — the city grows around whoever
              shows up.
            </div>
          </div>
        )}
      </div>
    </>
  );
}
