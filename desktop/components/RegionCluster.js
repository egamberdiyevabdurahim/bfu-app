"use client";

import BuilderCard from "./BuilderCard";
import { useT } from "@/components/i18n/LocaleProvider";

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
  const t = useT();
  const people = region.people || [];
  const name = region[nameKey] || region.name_en || region.name || t("city.cluster.this_city");
  const lit = region.lit != null ? region.lit : people.length;
  const small = people.length < LOW_COUNT_THRESHOLD;

  return (
    <>
      <div className="ch-slab">
        <span className="ch-slab-k">{t("city.cluster.region_kicker")}</span>
        <h2>{t("city.cluster.tonight", { name })}</h2>
        <div className="ch-slab-line" />
        <span className="ch-slab-k">{t("city.cluster.lit", { n: lit })}</span>
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
            <span className="ch-grace-k">{t("city.cluster.grace_kicker")}</span>
            <div className="ch-grace-t">{t("city.cluster.grace_title")}</div>
            <div className="ch-grace-s">
              {t("city.cluster.grace_sub", { name })}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
