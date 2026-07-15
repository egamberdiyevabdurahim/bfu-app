"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useT, useLang } from "@/components/i18n/LocaleProvider";
import InviteModal from "./InviteModal";
import CityDiscoverFeed from "./CityDiscoverFeed";
import { FLAGS } from "@/lib/flags";

// ── City toolbar + hybrid view switch ─────────────────────────────────────────
// The flagship City page keeps its SSR "bazaar" (region clusters, passed in as
// `children`) as the DEFAULT view. This bar sits above it with the Mini App's
// full discovery controls — facets · sort · verified · region · skill search.
//
// The moment the reader engages ANY control (a facet other than "All", a sort
// other than "recent", the verified toggle, a region, or a search term) the page
// switches to <CityDiscoverFeed>: a FLAT, personalized, paginated feed off the
// authed GET /users/discover (match %, online-accurate, sortable, offset paging)
// — everything the cached /public/city clusters can't do. Clearing every control
// returns to the SSR clusters instantly (they stay mounted, just hidden), so the
// richer default is never lost and nothing refetches to get back to it.
//
// The header (AmbientTicker + CityHeader) lives OUTSIDE this component in
// app/city/page.js, so toggling views never touches it.

const ALL = "all";

// The facet chip set. Each key maps to a real /users/discover param in
// CityDiscoverFeed.buildParams(); "For you" (match=true) is the personalized
// rank. MENTOR stays gated on FLAGS.MENTORING (hidden in V1) — same as the Mini
// App — and its is_mentor param is likewise only sent when the flag is on.
function facetChips(t) {
  const chips = [
    { key: ALL, label: t("city.filter.all") },
    { key: "foryou", label: `✦ ${t("city.filter.foryou")}` },
    { key: "online", label: t("city.filter.online"), marker: "ember" },
    { key: "cofounder", label: t("city.filter.cofounder"), marker: "green" },
    { key: "volunteer", label: t("city.filter.volunteer") },
  ];
  if (FLAGS.MENTORING) chips.push({ key: "mentor", label: t("city.filter.mentors") });
  return chips;
}

// Map a ThreadsRail / Serendipity `?f=<key>` deep-link to a facet. The rail emits
// "online" / "open_to_work" / "all"; older links may carry "mentor" / "match" /
// "open_to_volunteering". Region + skill deep-links are handled separately below.
function facetFromDeepLink(f) {
  switch (f) {
    case "online":
      return "online";
    case "open_to_work":
      return "cofounder";
    case "open_to_volunteering":
      return "volunteer";
    case "match":
    case "foryou":
      return "foryou";
    case "mentor":
      return FLAGS.MENTORING ? "mentor" : null;
    default:
      return null;
  }
}

export default function FilterBar({ regions = [], regionOptions = [], children }) {
  const t = useT();
  const { lang } = useLang();
  const searchParams = useSearchParams();

  const [facet, setFacet] = useState(ALL);
  const [sort, setSort] = useState("recent");
  const [verified, setVerified] = useState(false);
  const [regionId, setRegionId] = useState("");
  // The search box is debounced: `searchInput` tracks keystrokes, `search` is the
  // settled value that actually drives the view switch + the discover fetch, so
  // typing doesn't flip to the feed (or refetch) on every character.
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const id = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(id);
  }, [searchInput]);

  const chips = useMemo(() => facetChips(t), [t]);

  // id → localized region name, for the region <select> and the feed cards' foot.
  const regionMap = useMemo(() => {
    const m = {};
    for (const r of regionOptions || []) {
      const name =
        (lang === "uz" ? r.name_uz : lang === "ru" ? r.name_ru : r.name_en) ||
        r.name_en ||
        r.name ||
        "";
      if (name) m[r.id] = name;
    }
    return m;
  }, [regionOptions, lang]);

  const regionList = useMemo(
    () =>
      Object.entries(regionMap).sort((a, b) =>
        String(a[1]).localeCompare(String(b[1]))
      ),
    [regionMap]
  );

  // Deep-link support (?f=…) — opens the page already narrowed. facet / region: /
  // skill: are all honored; "all"/absent/unknown is a no-op (SSR clusters stand).
  useEffect(() => {
    const f = searchParams?.get("f");
    if (!f || f === ALL) return;
    if (f.startsWith("region:")) {
      const id = f.slice("region:".length);
      if (id) setRegionId(id);
      return;
    }
    if (f.startsWith("skill:")) {
      const s = f.slice("skill:".length);
      if (s) {
        setSearchInput(s);
        setSearch(s);
      }
      return;
    }
    const fc = facetFromDeepLink(f);
    if (fc) setFacet(fc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Any engaged control ⇒ show the discover feed. The pristine default (All /
  // recent / not-verified / no region / no search) keeps the SSR clusters.
  const discoverActive =
    facet !== ALL ||
    sort !== "recent" ||
    verified ||
    regionId !== "" ||
    search !== "";

  function clearAll() {
    setFacet(ALL);
    setSort("recent");
    setVerified(false);
    setRegionId("");
    setSearchInput("");
    setSearch("");
  }

  return (
    <div>
      {/* Facet chip row */}
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
          const on = facet === chip.key;
          return (
            <button
              key={chip.key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setFacet(chip.key)}
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
                transition:
                  "color 0.16s ease, border-color 0.16s ease, background 0.16s ease",
                display: "inline-flex",
                alignItems: "center",
              }}
            >
              {chip.marker === "ember" && (
                <Marker color="var(--ember)" glow="rgba(255,106,61,0.9)" />
              )}
              {chip.marker === "green" && (
                <Marker color="var(--green)" glow="rgba(127,176,105,0.8)" />
              )}
              {chip.label}
            </button>
          );
        })}
      </div>

      {/* Controls row — search · region · sort · verified */}
      <div
        style={{
          marginTop: 12,
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder={t("city.filter.search_ph")}
          aria-label={t("city.filter.search_aria")}
          style={{
            flex: "1 1 220px",
            minWidth: 180,
            background: "var(--surface-2)",
            border: `1px solid ${searchInput ? "var(--amber)" : "var(--hair)"}`,
            borderRadius: "var(--radius-pill)",
            padding: "10px 16px",
            fontSize: 13,
            color: "var(--text)",
            outline: "none",
          }}
        />

        {regionList.length > 0 && (
          <select
            value={regionId}
            onChange={(e) => setRegionId(e.target.value)}
            aria-label={t("city.filter.region_aria")}
            style={ctrlStyle(regionId !== "")}
          >
            <option value="">{t("city.filter.all_regions")}</option>
            {regionList.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        )}

        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          aria-label={t("city.filter.sort_aria")}
          style={ctrlStyle(sort !== "recent")}
        >
          <option value="recent">{t("city.sort.recent")}</option>
          <option value="verified">{t("city.sort.verified")}</option>
          <option value="name">{t("city.sort.name")}</option>
        </select>

        <button
          type="button"
          aria-pressed={verified}
          onClick={() => setVerified((v) => !v)}
          style={{
            padding: "10px 16px",
            borderRadius: "var(--radius-pill)",
            border: verified
              ? "1px solid rgba(232,161,92,0.5)"
              : "1px solid var(--hair)",
            background: verified
              ? "linear-gradient(135deg, rgba(232,161,92,0.16), rgba(192,86,59,0.12))"
              : "var(--surface-2)",
            color: verified ? "var(--amber)" : "var(--muted)",
            fontFamily: "var(--font-mono)",
            fontSize: 11.5,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          {t("city.filter.verified_only")}
        </button>

        {discoverActive && (
          <button
            type="button"
            onClick={clearAll}
            style={{
              padding: "10px 14px",
              borderRadius: "var(--radius-pill)",
              border: "1px solid var(--hair)",
              background: "transparent",
              color: "var(--muted)",
              fontFamily: "var(--font-mono)",
              fontSize: 11.5,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {t("city.filter.clear")}
          </button>
        )}
      </div>

      {/* SSR region clusters — the DEFAULT bazaar. Kept mounted (just hidden)
          while the discover feed is up, so returning is instant and no cluster
          data is refetched. */}
      <div
        style={{ display: discoverActive ? "none" : undefined }}
        aria-hidden={discoverActive}
      >
        {children}
      </div>

      {/* The flat, personalized, paginated discover feed — swaps in for the
          clusters the moment any control is engaged. */}
      {discoverActive && (
        <CityDiscoverFeed
          facet={facet}
          sort={sort}
          verified={verified}
          regionId={regionId}
          search={search}
          regionMap={regionMap}
          onClear={clearAll}
        />
      )}
    </div>
  );
}

// Shared look for the <select> controls (region / sort): amber edge when the
// control is off its default, hair edge otherwise.
function ctrlStyle(active) {
  return {
    background: "var(--surface-2)",
    border: `1px solid ${active ? "var(--amber)" : "var(--hair)"}`,
    borderRadius: "var(--radius-pill)",
    padding: "10px 14px",
    fontSize: 13,
    color: active ? "var(--text)" : "var(--muted-strong)",
    appearance: "none",
    cursor: "pointer",
    maxWidth: 220,
  };
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
