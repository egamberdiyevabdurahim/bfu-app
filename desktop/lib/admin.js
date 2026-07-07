import "server-only";
import { getToken } from "./session";

const API_BASE = process.env.BFU_API_URL;

if (!API_BASE) {
  // Fail loudly at build/boot time rather than silently fetching from
  // "undefined/admin/..." — matches lib/session.js and lib/bfu-api.js.
  throw new Error("BFU_API_URL environment variable is not set");
}

/**
 * Fetches one admin analytics endpoint with the session Bearer token.
 *
 * Returns a small discriminated result so the dashboard page can branch on the
 * shape of the failure instead of a raw status:
 *   { status: 'noauth' }     — no session cookie, or the backend rejected the
 *                              token as unauthenticated (401). → redirect /login.
 *   { status: 'forbidden' }  — authenticated but not an admin (403). → render the
 *                              graceful "founders & admins only" state.
 *   { status: 'error' }      — network/backend outage or any other non-200.
 *   { status: 'ok', data }   — 200 with the parsed JSON body.
 *
 * `cache: 'no-store'` because this is per-user, cookie-bound data that must
 * never be served from a shared/ISR cache.
 */
async function adminGet(path) {
  const token = await getToken();
  if (!token) return { status: "noauth" };

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch {
    // Network / backend outage — surface as a soft error, not a 500.
    return { status: "error" };
  }

  if (res.status === 401) return { status: "noauth" };
  if (res.status === 403) return { status: "forbidden" };
  if (!res.ok) return { status: "error" };

  try {
    const data = await res.json();
    return { status: "ok", data };
  } catch {
    return { status: "error" };
  }
}

/** GET /admin/stats → { users, projects, regions, schools, learning_centers } */
export function getAdminStats() {
  return adminGet("/admin/stats");
}

/**
 * GET /admin/analytics/regions →
 * { totals:{members,projects,open_projects},
 *   regions:[{id,name_en,name_uz,name_ru,members,projects,open_projects}] }
 * (regions pre-sorted by members desc)
 */
export function getRegions() {
  return adminGet("/admin/analytics/regions");
}

/**
 * GET /admin/analytics/retention?active_days=30 →
 * { active_days, cohorts:[{month:"YYYY-MM"|"older", total, active, retention_pct}] }
 * (newest month first)
 */
export function getRetention(activeDays = 30) {
  return adminGet(`/admin/analytics/retention?active_days=${activeDays}`);
}

/**
 * GET /admin/analytics/skill-gap →
 * { skills:[{skill, demand, supply, gap}] }  (sorted by gap desc, up to 100)
 */
export function getSkillGap() {
  return adminGet("/admin/analytics/skill-gap");
}
