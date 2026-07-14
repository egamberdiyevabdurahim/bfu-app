"use client";

import { useEffect, useRef, useState } from "react";
import BuilderCard from "./BuilderCard";
import InviteModal from "./InviteModal";
import { useT } from "@/components/i18n/LocaleProvider";

// Ports the mockup's region section: the `.slab` header (REGION kicker /
// "{name} tonight" / hairline / "{lit} lit") followed by the `.grid` of
// builder windows (docs/superpowers/mockups/2026-07-06-chorsu-city-discovery.html
// lines 79-82, 192-193). CLIENT component — it reads the locale via useT() and
// (below) drives the grace tile's "see other cities" scroll.
//
// ⚠ The `.grid` wrapper MUST carry `data-cluster`: FilterBar (already built)
// walks `[data-cluster]` nodes to show/hide the `[data-builder]` cards inside
// and to collapse a cluster whose visible count drops to zero. Without it,
// client-side filtering silently no-ops on this section.
//
// Graceful low-count (spec §6): when fewer than 6 builders are lit, append a
// warm trailing tile inviting the reader to be one of the first — the empty
// bazaar should feel like an opening, not a dead end.
//
// The reader is ALREADY REGISTERED by the time they see this, so "be the first"
// on its own is a dead end. The tile therefore carries two real exits:
//   • primary — "Invite a friend" opens <InviteModal /> IN PLACE (link + Copy).
//     It used to be an <a href="/web/settings">, which navigated the reader off
//     the city page into the settings bench just to reach the invite link — the
//     Mini App shows a sheet instead (src/components/InviteSheet.jsx), and the
//     founder flagged the desktop hop as jarring. The modal is mounted only while
//     open, so GET /users/me/invite fires on the click, not on page load.
//   • secondary — "See other cities" → smooth-scrolls to the next region cluster
//     on this same page. Rendered ONLY when another [data-cluster] exists, so it
//     can never be a no-op.

const LOW_COUNT_THRESHOLD = 6;

export default function RegionCluster({ region = {}, nameKey = "name_en" }) {
  const t = useT();
  const people = region.people || [];
  const name = region[nameKey] || region.name_en || region.name || t("city.cluster.this_city");
  const lit = region.lit != null ? region.lit : people.length;
  const small = people.length < LOW_COUNT_THRESHOLD;

  const graceRef = useRef(null);
  // Starts false on the server AND on first client paint (no hydration mismatch),
  // then flips on once we can see whether the page has any sibling cluster.
  const [hasOtherClusters, setHasOtherClusters] = useState(false);
  // Mount-on-open: keeps the invite fetch off the page-load path.
  const [inviteOpen, setInviteOpen] = useState(false);

  useEffect(() => {
    if (!small) return;
    setHasOtherClusters(document.querySelectorAll("[data-cluster]").length > 1);
  }, [small]);

  // Jump to the next region cluster: prefer one that is visible AND actually has
  // builder cards in it (FilterBar hides cards/clusters via [hidden]), so the
  // reader lands somewhere populated rather than on another empty grid. Frames on
  // the cluster's .ch-slab header when there is one.
  function seeOtherCities() {
    const mine = graceRef.current?.closest("[data-cluster]");
    const all = Array.from(document.querySelectorAll("[data-cluster]"));
    const others = all.filter((c) => c !== mine);
    const target =
      others.find((c) => !c.hidden && c.querySelector("[data-builder]:not([hidden])")) ||
      others.find((c) => !c.hidden) ||
      others[0];
    if (!target) return;
    const frame = target.previousElementSibling || target;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    frame.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }

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
          <div className="ch-grace" ref={graceRef}>
            <span className="ch-grace-k">{t("city.cluster.grace_kicker")}</span>
            <div className="ch-grace-t">{t("city.cluster.grace_title")}</div>
            <div className="ch-grace-s">
              {t("city.cluster.grace_sub", { name })}
            </div>

            {/* Two exits, so the honest headline is not a dead end. */}
            <div
              style={{
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                alignItems: "center",
                marginTop: 6,
              }}
            >
              <button
                type="button"
                className="ch-btn-primary"
                onClick={() => setInviteOpen(true)}
              >
                {t("city.cluster.grace_invite")}
              </button>
              {hasOtherClusters && (
                <button type="button" className="ch-btn-ghost" onClick={seeOtherCities}>
                  {t("city.cluster.grace_other")}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {inviteOpen && <InviteModal onClose={() => setInviteOpen(false)} />}
    </>
  );
}
