import { cache } from "react";
import "server-only";

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
