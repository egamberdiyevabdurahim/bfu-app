import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";

const API_BASE = process.env.BFU_API_URL;

if (!API_BASE) {
  // Fail loudly at build/boot time rather than silently fetching from
  // "undefined/users/me" — matches lib/bfu-api.js.
  throw new Error("BFU_API_URL environment variable is not set");
}

// The httpOnly session cookie name. Set by the /api/auth/telegram route handler,
// cleared by /api/auth/logout. Holds the backend access_token so SSR pages can
// read it via next/headers cookies().
export const SESSION_COOKIE = "bfu_session";

/**
 * Reads the access_token from the httpOnly `bfu_session` cookie. Server-only
 * (uses next/headers). Returns null when there is no session.
 */
export async function getToken() {
  const jar = await cookies();
  return jar.get(SESSION_COOKIE)?.value || null;
}

/**
 * Fetches the currently-authenticated user (`GET /users/me`) using the Bearer
 * token from the session cookie. cache()-wrapped so a page and its metadata
 * share one round-trip per request. Returns null when there is no token or the
 * token is rejected (401/403) — the caller (e.g. /home) redirects to /login.
 *
 * `cache: "no-store"` because this is per-user, cookie-bound data that must
 * never be served from a shared/ISR cache.
 */
export const getMe = cache(async () => {
  const token = await getToken();
  if (!token) return null;

  let res;
  try {
    res = await fetch(`${API_BASE}/users/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch {
    // Network/backend outage — treat as "not logged in" so the page can fall
    // back to /login rather than throwing a 500.
    return null;
  }

  if (res.status === 401 || res.status === 403) return null;
  if (!res.ok) return null;
  return res.json();
});
