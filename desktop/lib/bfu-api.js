import { cache } from "react";
import "server-only";
import { getToken } from "./session";

const API_BASE = process.env.BFU_API_URL;

if (!API_BASE) {
  // Fail loudly at build/boot time rather than silently fetching from
  // "undefined/public/..." in production.
  throw new Error("BFU_API_URL environment variable is not set");
}

/**
 * Fetches a public BFU profile by id. Wrapped in React's cache() so
 * generateMetadata() and the page component share one network call per
 * request instead of fetching twice.
 * Returns null on 404 (profile not found / deleted / unregistered).
 */
export const getPublicProfile = cache(async (id) => {
  const res = await fetch(`${API_BASE}/public/u/${id}/data`, {
    next: { revalidate: 120, tags: [`profile:${id}`] },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`BFU API error ${res.status} fetching profile ${id}`);
  return res.json();
});

/**
 * Fetches the batched, public "building tonight" City/Discovery payload
 * (stats, region clusters of builder cards, serendipity threads) in one
 * round-trip. Wrapped in React's cache() so generateMetadata() and the page
 * component share one network call per request. ISR-cached with revalidate: 60.
 * Pass a regionId to focus the payload on a single region.
 */
export const getCity = cache(async (regionId) => {
  const qs = regionId ? `?region_id=${regionId}` : "";
  const res = await fetch(`${API_BASE}/public/city${qs}`, {
    next: { revalidate: 60, tags: ["city"] },
  });
  if (!res.ok) throw new Error(`BFU API error ${res.status} fetching city`);
  return res.json();
});

/**
 * Fetches the batched, public "projects discovery" payload (stats + the
 * pinned→hiring→newest ordered list of public projects) in one round-trip.
 * Wrapped in React's cache() so generateMetadata() and the page component share
 * one network call per request. ISR-cached with revalidate: 60.
 *
 * Optional `opts` maps to the backend's future server-side filters
 * (`type` = "startup"|"volunteering", `hiring` = true). v1 renders every
 * project and filters client-side, so the page calls this arg-less.
 */
export const getProjects = cache(async (opts = {}) => {
  const qs = new URLSearchParams();
  if (opts.type) qs.set("type", opts.type);
  if (opts.hiring) qs.set("hiring", "true");
  const suffix = qs.toString() ? `?${qs}` : "";
  const res = await fetch(`${API_BASE}/public/projects${suffix}`, {
    next: { revalidate: 60, tags: ["projects"] },
  });
  if (!res.ok) throw new Error(`BFU API error ${res.status} fetching projects`);
  return res.json();
});

/**
 * Fetches the public list of regions (id + localized names + counts) for the
 * profile-editor region dropdown. Public endpoint (no auth). ISR-cached with
 * revalidate: 300 — the region set barely changes. Returns [] on error so a
 * transient backend hiccup never blocks the settings form from rendering.
 */
export const getRegions = cache(async () => {
  try {
    const res = await fetch(`${API_BASE}/public/regions`, {
      next: { revalidate: 300, tags: ["regions"] },
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
});

/**
 * Fetches a public BFU project ("startup"/"volunteering") by id. Wrapped in
 * React's cache() so generateMetadata() and the page component share one
 * network call per request instead of fetching twice. ISR-cached with
 * revalidate: 120.
 * Returns null on 404 (project missing / unapproved / draft / deleted).
 */
export const getProject = cache(async (id) => {
  const res = await fetch(`${API_BASE}/public/project/${id}/data`, {
    next: { revalidate: 120, tags: [`project:${id}`] },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`BFU API error ${res.status} fetching project ${id}`);
  return res.json();
});

/**
 * Fetches one event + its registration form (EventDetailOut) for the event
 * detail page. UNLIKE getProject, GET /events/{id} is AUTHED and per-user (it
 * carries my_rsvp), so this uses the session Bearer token (like getMe) and
 * cache: "no-store" — never a shared/ISR cache. cache()-wrapped so the page and
 * its generateMetadata share one round-trip.
 *
 * Returns null when there's no session, the token is rejected (401/403), or the
 * event is missing / unapproved / deleted (404). The page uses getMe() to tell
 * "not logged in" (→ /login) apart from "not found" (→ notFound()).
 */
export const getEvent = cache(async (id) => {
  const token = await getToken();
  if (!token) return null;
  let res;
  try {
    res = await fetch(`${API_BASE}/events/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch {
    return null;
  }
  if (res.status === 404) return null;
  if (res.status === 401 || res.status === 403) return null;
  if (!res.ok) throw new Error(`BFU API error ${res.status} fetching event ${id}`);
  return res.json();
});
