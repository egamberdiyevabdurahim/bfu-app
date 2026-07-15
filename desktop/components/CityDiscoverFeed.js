"use client";

import { useEffect, useRef, useState } from "react";
import { bfu } from "@/lib/client-api";
import { useT } from "@/components/i18n/LocaleProvider";
import BuilderCard from "./BuilderCard";
import InviteModal from "./InviteModal";
import { FLAGS } from "@/lib/flags";

// ── City discover feed — the FLAT, personalized, paginated layer ──────────────
// The desktop parity match for the Mini App's City feed (src/screens/CityScreen.jsx):
// a client component that reads the AUTHED, viewer-personalized GET /users/discover
// (via the bfu() BFF proxy — /city is auth-gated, so the token is always present)
// instead of the cached, viewer-agnostic /public/city clusters. It renders ONLY
// when the reader has engaged a facet / sort / verified toggle / region / search
// in FilterBar; the default bazaar stays the SSR RegionCluster view. FilterBar
// hands us the resolved filter props and swaps us in for the clusters.
//
// Parity with the Mini App feed:
//   • same discover query params (facet → match/online/open_to_work/
//     open_to_volunteering/is_mentor, sort, verified, region_id, skill),
//   • PAGE-sized offset pagination with a "Load more" button + append dedupe,
//   • the ✦ match-% chip per card (BuilderCard renders it when match_pct is set),
//   • an honest empty state (invite / clear filter) so a filtered-to-nothing feed
//     is never a blank body.

const PAGE = 60;

// Map a UserPublic row from GET /users/discover onto the props BuilderCard
// expects (it was written for the /public/city Builder contract, which names a
// few fields differently). Keeping BuilderCard's contract stable means the SSR
// clusters and this feed render byte-identical cards.
function toCardBuilder(u) {
  const r = u.rating || {};
  // BuilderCard wants a scalar rating (or null ⇒ "new"); discover sends
  // { average, count }. Only surface a star when there is a real average.
  const scalarRating =
    r.count > 0 && r.average != null ? Number(r.average).toFixed(1) : null;
  return {
    id: u.id,
    name: u.name,
    display_name: u.display_name,
    checked: u.checked,
    photo_url: u.photo_url,
    online: u.is_online, // discover names it is_online; card wants `online`
    currently_building: u.currently_building,
    skills: (u.analysis && u.analysis.skills) || [],
    // The card's green "looking for" badge is driven by looking_for; discover
    // exposes the two booleans instead. Work reads as the stronger signal.
    looking_for: u.open_to_work
      ? "work"
      : u.open_to_volunteering
        ? "volunteering"
        : "",
    mentor: !!(u.mentor && u.mentor.is_mentor),
    rating: scalarRating,
    // No server "weight" in discover; isNew falls back to rating == null.
    weight: undefined,
    region_id: u.region_id,
    match_pct: u.match_pct, // ✦ chip — only present under the "For you" facet
  };
}

// Translate FilterBar's filter props into the discover query string. Mirrors the
// Mini App's loadUsers() exactly so the two feeds return the same people.
function buildParams({ facet, sort, verified, regionId, search }, offset) {
  const q = { sort, limit: PAGE, offset };
  if (verified) q.verified = true;
  if (regionId) q.region_id = regionId;
  // /users/discover has no free-text `q`; its only text filter is `skill`
  // (exact, case-insensitive token). The search box therefore filters by skill.
  const term = (search || "").trim();
  if (term) q.skill = term;
  if (facet === "foryou") q.match = true;
  else if (facet === "online") q.online = true;
  else if (facet === "cofounder") q.open_to_work = true;
  else if (facet === "volunteer") q.open_to_volunteering = true;
  else if (facet === "mentor" && FLAGS.MENTORING) q.is_mentor = true;
  return q;
}

export default function CityDiscoverFeed({
  facet = "all",
  sort = "recent",
  verified = false,
  regionId = "",
  search = "",
  regionMap = {},
  onClear,
}) {
  const t = useT();
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  // Monotonic request token: a filter change mid-flight must not let a stale
  // response overwrite the fresh one (same guard the Mini App uses).
  const seq = useRef(0);
  // Read people.length without making load() depend on it (keeps the reset
  // effect keyed only on the filters).
  const peopleRef = useRef(people);
  peopleRef.current = people;

  async function load(append = false) {
    const mySeq = ++seq.current;
    const offset = append ? peopleRef.current.length : 0;
    if (append) setLoadingMore(true);
    else {
      setLoading(true);
      setError(false);
    }
    try {
      const res = await bfu("/users/discover", {
        params: buildParams({ facet, sort, verified, regionId, search }, offset),
      });
      if (seq.current !== mySeq) return; // superseded — drop this response
      const list = Array.isArray(res) ? res : [];
      setPeople((cur) => {
        if (!append) return list;
        // A just-registered user can shift the recency window and repeat; dedupe
        // on id so "Load more" never renders the same card twice.
        const seen = new Set(cur.map((u) => u.id));
        return [...cur, ...list.filter((u) => !seen.has(u.id))];
      });
      setHasMore(list.length === PAGE); // a full page back ⇒ probably more
    } catch {
      if (seq.current === mySeq && !append) setError(true);
    }
    if (seq.current !== mySeq) return;
    if (append) setLoadingMore(false);
    else setLoading(false);
  }

  // Any filter change → reload from offset 0. `load` is intentionally omitted
  // from deps (it closes over the current filters, which ARE the deps).
  useEffect(() => {
    load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facet, sort, verified, regionId, search]);

  const empty = !loading && !error && people.length === 0;

  return (
    <div style={{ marginTop: 30 }}>
      {/* Result slab — mirrors the cluster/threads slab header, so the feed reads
          as part of the same surface rather than a bare grid. */}
      {!loading && !error && people.length > 0 && (
        <div className="ch-slab">
          <span className="ch-slab-k">{t("city.discover.kicker")}</span>
          <h2>
            {t(
              people.length === 1
                ? "city.discover.count_one"
                : "city.discover.count_other",
              { n: people.length }
            )}
          </h2>
          <div className="ch-slab-line" />
        </div>
      )}

      {loading ? (
        // Skeleton grid built from the existing .ch-card shell (no new CSS): the
        // firelit wash + rise-in animation read as "loading" without a spinner.
        <div className="ch-grid" aria-busy="true">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="ch-card"
              aria-hidden="true"
              style={{ minHeight: 190, cursor: "default", opacity: 0.55 }}
            >
              <div
                className="ch-card-wash"
                style={{ background: "var(--surface-2)" }}
              />
            </div>
          ))}
        </div>
      ) : error ? (
        <div
          className="ch-empty"
          role="status"
          style={{ minHeight: 240, padding: "40px 28px" }}
        >
          <span className="ch-empty-k">{t("city.discover.kicker")}</span>
          <div className="ch-empty-t" style={{ fontSize: 24 }}>
            {t("city.discover.error")}
          </div>
          <button
            type="button"
            className="ch-btn-primary"
            onClick={() => load(false)}
            style={{ marginTop: 8 }}
          >
            {t("city.discover.retry")}
          </button>
        </div>
      ) : empty ? (
        // Honest filtered-empty state (spec §5): a kicker + headline + the two
        // real exits the rest of the surface uses — clear the filter (returns to
        // the whole city) and invite a friend. Never a blank body.
        <div
          className="ch-empty"
          role="status"
          style={{ minHeight: 260, padding: "40px 28px" }}
        >
          <span className="ch-empty-k">{t("city.filter.empty_k")}</span>
          <div className="ch-empty-t" style={{ fontSize: 24 }}>
            {t("city.filter.empty_t")}
          </div>
          <div className="ch-empty-s">{t("city.filter.empty_s")}</div>
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
              onClick={() => onClear && onClear()}
            >
              {t("city.filter.clear")}
            </button>
            <button
              type="button"
              className="ch-btn-ghost"
              onClick={() => setInviteOpen(true)}
            >
              {t("city.cluster.grace_invite")}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="ch-grid">
            {people.map((u, i) => (
              <BuilderCard
                key={u.id}
                builder={toCardBuilder(u)}
                index={i}
                regionLabel={regionMap[u.region_id] || ""}
              />
            ))}
          </div>

          {hasMore && (
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                marginTop: 26,
              }}
            >
              <button
                type="button"
                className="ch-btn-ghost"
                onClick={() => load(true)}
                disabled={loadingMore}
                style={{ minWidth: 180 }}
              >
                {loadingMore
                  ? t("city.discover.loading_more")
                  : t("city.discover.load_more")}
              </button>
            </div>
          )}
        </>
      )}

      {inviteOpen && <InviteModal onClose={() => setInviteOpen(false)} />}
    </div>
  );
}
