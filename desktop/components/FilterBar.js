"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

// Ports the mockup's `.filters` chip row
// (docs/superpowers/mockups/2026-07-06-chorsu-city-discovery.html lines 70-76, 177-189).
//
// v1 = CLIENT-SIDE filtering over the already-loaded builder set — no refetch.
// FilterBar wraps the server-rendered region clusters as `children`. Each
// BuilderCard (Task 9) tags itself with data-* attributes; on chip select we
// walk our own subtree and show/hide `[data-builder]` cards, then collapse any
// `[data-cluster]` whose visible-card count drops to zero. This keeps
// BuilderCard/RegionCluster as pure SERVER components (the boundary is intact —
// only this wrapper is a client component).
//
// The chip set is derived from the payload actually loaded:
//   All · Online now (ember dot) · <one chip per region present> ·
//   Looking for co-founder (green dot) · Mentors · up to 4 top skill chips.
//
// FilterBar <-> BuilderCard data-attribute contract (BuilderCard, Task 9, MUST
// emit exactly these on each `[data-builder]` element, inside a `[data-cluster]`):
//   data-online       "1" | "0"
//   data-region       String(region_id)  (or "" when null)
//   data-looking-for  "work" | "volunteering" | "both" | ""   (from builder.looking_for)
//   data-mentor       "1" | "0"           (from builder.mentor)
//   data-skills       comma-joined slug()'d skills             (from builder.skills)
// "Looking for co-founder" maps to looking_for in {work, both} — the Chorsu
// framing of open_to_work, matching the profile's LookingForCell copy. `mentor`
// is now a real field on the /public/city Builder contract.

const ALL = "all";
const ONLINE = "online";
const OPEN_TO_WORK = "open_to_work";
const MENTOR = "mentor";

// Normalize a skill/region token for stable data-attribute matching.
function slug(s) {
  return (s || "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

// Build the ordered chip list from the loaded regions/builders.
function deriveChips(regions, nameKey) {
  const chips = [
    { key: ALL, label: "All" },
    { key: ONLINE, label: "Online now", marker: "ember" },
  ];

  // One chip per region present in the payload (in payload order).
  for (const r of regions || []) {
    const name = (r && (r[nameKey] || r.name_en)) || "";
    if (!name) continue;
    chips.push({ key: `region:${r.id}`, label: name, region: r.id });
  }

  chips.push({ key: OPEN_TO_WORK, label: "Looking for co-founder", marker: "green" });
  chips.push({ key: MENTOR, label: "Mentors" });

  // Up to 4 most common skills across the loaded builders.
  const counts = new Map();
  for (const r of regions || []) {
    for (const p of (r && r.people) || []) {
      for (const s of (p && p.skills) || []) {
        const label = (s || "").toString().trim();
        if (!label) continue;
        const entry = counts.get(label) || { label, n: 0 };
        entry.n += 1;
        counts.set(label, entry);
      }
    }
  }
  const topSkills = Array.from(counts.values())
    .sort((a, b) => b.n - a.n)
    .slice(0, 4);
  for (const s of topSkills) {
    chips.push({ key: `skill:${slug(s.label)}`, label: s.label, skill: slug(s.label) });
  }

  return chips;
}

// Decide whether a single builder card element passes the active filter.
function cardMatches(el, chip) {
  if (!chip || chip.key === ALL) return true;
  if (chip.key === ONLINE) return el.getAttribute("data-online") === "1";
  if (chip.key === OPEN_TO_WORK) {
    const lf = el.getAttribute("data-looking-for") || "";
    return lf === "work" || lf === "both";
  }
  if (chip.key === MENTOR) return el.getAttribute("data-mentor") === "1";
  if (chip.region != null) {
    return el.getAttribute("data-region") === String(chip.region);
  }
  if (chip.skill != null) {
    const skills = (el.getAttribute("data-skills") || "").split(",");
    return skills.includes(chip.skill);
  }
  return true;
}

export default function FilterBar({ regions = [], nameKey = "name_en", children }) {
  const [active, setActive] = useState(ALL);
  const rootRef = useRef(null);
  const searchParams = useSearchParams();

  const chips = useMemo(() => deriveChips(regions, nameKey), [regions, nameKey]);

  // Deep-link support: a `?f=<key>` param (e.g. from a Serendipity thread on the
  // city) opens the page already-filtered. Guard so an absent/`all`/unknown key
  // is a no-op and the default "All" view stands. Runs after the server-rendered
  // clusters are in the DOM (effect fires post-paint), so applyFilter can walk them.
  useEffect(() => {
    const f = searchParams?.get("f");
    if (!f || f === ALL) return;
    if (!chips.some((c) => c.key === f)) return; // unknown chip → no-op
    applyFilter(f);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, chips]);

  function applyFilter(key) {
    setActive(key);
    const root = rootRef.current;
    if (!root) return;
    const chip = chips.find((c) => c.key === key) || { key: ALL };

    // Show/hide each builder card, then collapse empty clusters.
    const clusters = root.querySelectorAll("[data-cluster]");
    if (clusters.length) {
      clusters.forEach((cluster) => {
        const cards = cluster.querySelectorAll("[data-builder]");
        let visible = 0;
        cards.forEach((card) => {
          const ok = cardMatches(card, chip);
          card.hidden = !ok;
          if (ok) visible += 1;
        });
        // If the cluster carries no cards at all (e.g. a small-count grace
        // tile only), never hide it on the "All" view.
        cluster.hidden = cards.length > 0 && visible === 0;
      });
    } else {
      // No cluster wrappers — filter loose builder cards directly.
      root.querySelectorAll("[data-builder]").forEach((card) => {
        card.hidden = !cardMatches(card, chip);
      });
    }
  }

  return (
    <div ref={rootRef}>
      <div
        role="tablist"
        aria-label="Filter builders"
        style={{
          marginTop: 34,
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        {chips.map((chip) => {
          const on = active === chip.key;
          return (
            <button
              key={chip.key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => applyFilter(chip.key)}
              style={{
                padding: "9px 16px",
                borderRadius: "var(--radius-pill)",
                border: on
                  ? "1px solid rgba(232,161,92,0.5)"
                  : "1px solid var(--hair)",
                background: on
                  ? "linear-gradient(135deg, rgba(232,161,92,0.16), rgba(192,86,59,0.12))"
                  : "transparent",
                color: on ? "var(--amber)" : "var(--muted)",
                fontFamily: "var(--font-mono)",
                fontSize: 11.5,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                cursor: "pointer",
                transition: "color 0.16s ease, border-color 0.16s ease, background 0.16s ease",
                display: "inline-flex",
                alignItems: "center",
              }}
            >
              {chip.marker === "ember" && <Marker color="var(--ember)" glow="rgba(255,106,61,0.9)" />}
              {chip.marker === "green" && <Marker color="var(--green)" glow="rgba(127,176,105,0.8)" />}
              {chip.label}
            </button>
          );
        })}
      </div>
      {children}
    </div>
  );
}

// The 7px ember/green presence dot rendered inside a chip (mockup `.f .e` / `.f .g`).
function Marker({ color, glow }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-block",
        width: 7,
        height: 7,
        borderRadius: "50%",
        background: color,
        marginRight: 6,
        boxShadow: `0 0 8px ${glow}`,
        verticalAlign: "middle",
      }}
    />
  );
}
