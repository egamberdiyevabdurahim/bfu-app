"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useT } from "@/components/i18n/LocaleProvider";
import InviteModal from "./InviteModal";
import { FLAGS } from "@/lib/flags";

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
function deriveChips(regions, nameKey, t) {
  const chips = [
    { key: ALL, label: t("city.filter.all") },
    { key: ONLINE, label: t("city.filter.online"), marker: "ember" },
  ];

  // One chip per region present in the payload (in payload order).
  for (const r of regions || []) {
    const name = (r && (r[nameKey] || r.name_en)) || "";
    if (!name) continue;
    chips.push({ key: `region:${r.id}`, label: name, region: r.id });
  }

  chips.push({ key: OPEN_TO_WORK, label: t("city.filter.cofounder"), marker: "green" });
  // V1: the Mentors chip is hidden. Flip FLAGS.MENTORING to `true` and it comes
  // back here; cardMatches() below still knows how to match it, and the
  // data-mentor attribute is still emitted by BuilderCard.
  if (FLAGS.MENTORING) {
    chips.push({ key: MENTOR, label: t("city.filter.mentors") });
  }

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
  const t = useT();
  const [active, setActive] = useState(ALL);
  // TRUE once a real (non-"All") chip has hidden every builder card on the page.
  // FilterBar is the only component that can know this: it is the thing doing the
  // hiding, and it hides by walking the DOM, so no server-rendered ancestor can
  // see the outcome. Before this existed, that state painted a blank body —
  // every [data-cluster] hidden, nothing left to say so.
  const [noMatch, setNoMatch] = useState(false);
  const rootRef = useRef(null);
  const searchParams = useSearchParams();

  const chips = useMemo(() => deriveChips(regions, nameKey, t), [regions, nameKey, t]);

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

    // Builder cards left standing across the WHOLE page after this filter — the
    // number the no-results state below is gated on.
    let totalVisible = 0;

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
        totalVisible += visible;
        // If the cluster carries no cards at all (e.g. a small-count grace
        // tile only), never hide it on the "All" view — the grace tile IS the
        // content there. Under a real filter it has nothing to say about the
        // chip the reader picked, so it collapses with everything else and the
        // no-results tile below speaks for the page instead.
        cluster.hidden = visible === 0 && (cards.length > 0 || chip.key !== ALL);
      });
    } else {
      // No cluster wrappers — filter loose builder cards directly.
      root.querySelectorAll("[data-builder]").forEach((card) => {
        const ok = cardMatches(card, chip);
        card.hidden = !ok;
        if (ok) totalVisible += 1;
      });
    }

    // Only a REAL chip can raise the no-results state. On "All" every card is
    // shown, so totalVisible === 0 there would mean the city holds no builders at
    // all — and that payload never reaches FilterBar (app/city/page.js renders
    // <CityEmpty /> instead of us). Gating on `key !== ALL` is exactly what keeps
    // the "Clear filter" button below honest: it can only ever be offered while a
    // non-All chip is selected, so pressing it always changes something.
    setNoMatch(key !== ALL && totalVisible === 0);
  }

  return (
    <div ref={rootRef}>
      <div
        role="tablist"
        aria-label={t("city.filter.aria")}
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

      {/* PATH (a): the active chip matched nothing, so every [data-cluster] above
          is now hidden and the body would otherwise be BLANK — no message, no way
          back. Reuses the app's `ch-empty` treatment (app/projects/page.js), sized
          down since it sits under a live chip row rather than owning the page.
          Never rendered on "All" (see applyFilter), so "Clear filter" is always a
          real action: it resets the chips to All, which always brings cards back. */}
      {noMatch && (
        <div
          className="ch-empty"
          role="status"
          style={{ minHeight: 220, padding: "36px 28px", marginTop: 26 }}
        >
          <span className="ch-empty-k">{t("city.filter.empty_k")}</span>
          <div className="ch-empty-t" style={{ fontSize: 22 }}>
            {t("city.filter.empty_t")}
          </div>
          <div className="ch-empty-s">{t("city.filter.empty_s")}</div>
          <button
            type="button"
            className="ch-btn-primary"
            onClick={() => applyFilter(ALL)}
            style={{ marginTop: 8 }}
          >
            {t("city.filter.clear")}
          </button>
        </div>
      )}
    </div>
  );
}

// ── PATH (b): the city holds NO builders at all ──────────────────────────────
// Rendered by app/city/page.js INSTEAD of <FilterBar> + clusters when the payload
// carries zero people across every region (`regions: []` — including the
// EMPTY_CITY backend-outage fallback — or regions whose `people` are all empty).
// Until now that mapped an empty array and shipped a blank body: RegionCluster's
// low-count grace tile can't rescue it, because that tile lives INSIDE a cluster
// and with no builders there is no cluster to put it in.
//
// It lives in THIS file rather than its own because it is the city page's other
// client island: the tile needs state (the invite dialog) and app/city/page.js is
// a server component that can't hold any.
//
// Two real exits — the same pair the Mini App's EmptyCity (src/screens/CityScreen.jsx)
// and the grace tile (RegionCluster.js) give:
//   • primary — "Invite a friend" opens <InviteModal /> IN PLACE (link + Copy),
//     mounted only while open so GET /users/me/invite fires on the click, never on
//     page load. Same component the grace tile uses; invite is not rebuilt here.
//   • secondary — "Browse projects" → /projects, the populated neighbour surface.
//     If /projects is empty too it renders its OWN empty state with a "Start a
//     project" CTA, so the escape can never chain into another dead end.
// Both work for every reader of this state: /city is auth-gated in middleware.js,
// so nobody sees this screen logged-out — the invite fetch and the /projects link
// are live, not no-ops.
export function CityEmpty() {
  const t = useT();
  const [inviteOpen, setInviteOpen] = useState(false);

  return (
    <div style={{ marginTop: 40 }}>
      <div className="ch-empty">
        <span className="ch-empty-k">{t("city.empty.kicker")}</span>
        <div className="ch-empty-t">{t("city.empty.title")}</div>
        <div className="ch-empty-s">{t("city.empty.sub")}</div>

        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            justifyContent: "center",
            marginTop: 8,
          }}
        >
          <button
            type="button"
            className="ch-btn-primary"
            onClick={() => setInviteOpen(true)}
          >
            {/* Same string the grace tile uses — one invite label for the surface. */}
            {t("city.cluster.grace_invite")}
          </button>
          {/* next/link applies the "/web" basePath automatically; a plain <a>
              would have to spell out "/web/projects". */}
          <Link href="/projects" className="ch-btn-ghost">
            {t("city.empty.projects")}
          </Link>
        </div>
      </div>

      {inviteOpen && <InviteModal onClose={() => setInviteOpen(false)} />}
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
