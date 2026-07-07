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

// The httpOnly refresh-token cookie name. Set alongside SESSION_COOKIE by the
// login routes. Holds the backend refresh_token (7-day lifetime) so the proxy
// and middleware can silently mint a fresh access token when the short-lived
// access token (30 min) expires.
export const REFRESH_COOKIE = "bfu_refresh";

// One week, in seconds. Both cookies use the same maxAge: the access token's
// JWT `exp` (30 min) is what actually gates auth, but we keep the cookie alive
// for the full refresh window so middleware/proxy can transparently refresh it
// on any request within 7 days.
export const AUTH_MAX_AGE = 60 * 60 * 24 * 7;

// Shared cookie options so every place that writes an auth cookie stays in sync.
// httpOnly (never exposed to client JS), sameSite:'lax' (survives top-level
// nav + same-site fetches), secure only in production (so http://localhost works
// in dev).
function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: AUTH_MAX_AGE,
  };
}

/**
 * Sets BOTH the access (bfu_session) and refresh (bfu_refresh) cookies on the
 * given cookie store, using the shared options above. `cookieStore` is anything
 * with a `.set(name, value, opts)` method — i.e. a NextResponse's `.cookies`, or
 * the object returned by `await cookies()`. If `refreshToken` is falsy we only
 * set the access cookie (some flows may not return a refresh token).
 */
export function setAuthCookies(cookieStore, accessToken, refreshToken) {
  cookieStore.set(SESSION_COOKIE, accessToken, cookieOptions());
  if (refreshToken) {
    cookieStore.set(REFRESH_COOKIE, refreshToken, cookieOptions());
  }
}

/**
 * Deletes BOTH auth cookies on the given cookie store. Works with a
 * NextResponse's `.cookies` or the `await cookies()` store: both expose
 * `.set()`, so we expire the cookies by writing an empty value with maxAge:0 on
 * the same path (more portable than `.delete()`, which the response cookie API
 * has but the async cookies() store historically hasn't in every runtime).
 */
export function clearAuthCookies(cookieStore) {
  const expired = { ...cookieOptions(), maxAge: 0 };
  cookieStore.set(SESSION_COOKIE, "", expired);
  cookieStore.set(REFRESH_COOKIE, "", expired);
}

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
