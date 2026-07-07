import { NextResponse } from "next/server";

// NOTE: middleware runs in the Edge runtime and can't import `server-only`
// modules (lib/session.js is server-only), so the cookie names + options are
// duplicated here. Keep them in sync with lib/session.js.
const SESSION_COOKIE = "bfu_session";
const REFRESH_COOKIE = "bfu_refresh";
const AUTH_MAX_AGE = 60 * 60 * 24 * 7; // 7 days, seconds

const BFU_API_URL = process.env.BFU_API_URL;

// Refresh proactively when the access token has less than this many seconds of
// life left (or is already expired / missing). 60s of slack absorbs clock skew
// and in-flight request latency.
const REFRESH_SKEW_SECONDS = 60;

/**
 * Middleware: keeps the authed surfaces (SSR pages + the /api/bfu proxy) alive
 * by silently refreshing the short-lived (30 min) access token BEFORE it
 * expires, using the 7-day refresh token. This is the PRIMARY refresh path; the
 * proxy has its own belt-and-suspenders fallback for backend-side 401s.
 *
 * Fast path: if a valid access token with >60s of life is present, we do NOT
 * touch the network — just `NextResponse.next()`.
 */
export async function middleware(req) {
  const accessToken = req.cookies.get(SESSION_COOKIE)?.value || null;
  const isApi = req.nextUrl.pathname.startsWith("/api/bfu");

  const exp = accessToken ? readJwtExp(accessToken) : null;
  const nowSec = Math.floor(Date.now() / 1000);

  // Fast path: token present and comfortably fresh → no network call.
  if (exp !== null && exp - nowSec > REFRESH_SKEW_SECONDS) {
    return NextResponse.next();
  }

  // Otherwise the access token is missing, unreadable, or expiring soon.
  const refreshToken = req.cookies.get(REFRESH_COOKIE)?.value || null;

  if (!refreshToken) {
    return unauthenticated(req, isApi);
  }

  let tokens = null;
  try {
    const refreshRes = await fetch(`${BFU_API_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
      cache: "no-store",
    });
    if (refreshRes.ok) {
      tokens = await refreshRes.json();
    }
  } catch {
    tokens = null;
  }

  const newAccess = tokens?.access_token;
  if (!newAccess) {
    return unauthenticated(req, isApi);
  }
  const newRefresh = tokens?.refresh_token || refreshToken;

  // Forward the fresh access token to the downstream handler THIS request (so
  // the server component / proxy reads the new token, not the stale cookie),
  // AND set both cookies on the browser response for subsequent requests.
  const requestHeaders = new Headers(req.headers);
  const forwardedCookie = buildForwardedCookieHeader(
    req.headers.get("cookie") || "",
    newAccess,
    newRefresh
  );
  requestHeaders.set("cookie", forwardedCookie);

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  setCookie(res, SESSION_COOKIE, newAccess);
  setCookie(res, REFRESH_COOKIE, newRefresh);
  return res;
}

// For /api/bfu/* return a JSON 401; for page routes redirect to /login. Either
// way, clear the (now useless) auth cookies on the response.
function unauthenticated(req, isApi) {
  let res;
  if (isApi) {
    res = NextResponse.json({ detail: "Session expired" }, { status: 401 });
  } else {
    res = NextResponse.redirect(new URL("/login", req.url));
  }
  clearCookie(res, SESSION_COOKIE);
  clearCookie(res, REFRESH_COOKIE);
  return res;
}

// --- helpers ---

// Read the `exp` (seconds since epoch) from a JWT WITHOUT verifying the
// signature — we only need the expiry to decide whether to refresh. Returns null
// on any malformed input (treated as "expired" by the caller).
function readJwtExp(jwt) {
  try {
    const parts = jwt.split(".");
    if (parts.length !== 3) return null;
    const json = base64UrlDecode(parts[1]);
    const payload = JSON.parse(json);
    return typeof payload.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
}

// base64url → utf-8 string, using globalThis.atob (available in the Edge/
// middleware runtime).
function base64UrlDecode(segment) {
  let b64 = segment.replace(/-/g, "+").replace(/_/g, "/");
  // Restore padding that base64url strips.
  const pad = b64.length % 4;
  if (pad === 2) b64 += "==";
  else if (pad === 3) b64 += "=";
  else if (pad === 1) throw new Error("malformed base64url");
  return globalThis.atob(b64);
}

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax",
  path: "/",
  secure: process.env.NODE_ENV === "production",
};

function setCookie(res, name, value) {
  res.cookies.set(name, value, { ...COOKIE_OPTS, maxAge: AUTH_MAX_AGE });
}

function clearCookie(res, name) {
  res.cookies.set(name, "", { ...COOKIE_OPTS, maxAge: 0 });
}

// Rewrite the incoming Cookie header so the freshly-refreshed access + refresh
// tokens replace the stale ones for THIS request's downstream handler. Preserves
// every other cookie untouched.
function buildForwardedCookieHeader(cookieHeader, newAccess, newRefresh) {
  const pairs = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .filter(Boolean)
    .filter((c) => {
      const name = c.split("=")[0];
      return name !== SESSION_COOKIE && name !== REFRESH_COOKIE;
    });
  pairs.push(`${SESSION_COOKIE}=${newAccess}`);
  pairs.push(`${REFRESH_COOKIE}=${newRefresh}`);
  return pairs.join("; ");
}

// Only run on the authed surfaces. Public routes (/, /city, /u, /p, /projects,
// /login) are intentionally excluded so they stay fast + never redirect.
// /settings + /api/resume are authed like /home: they get the same proactive
// token refresh so an about-to-expire (but refreshable) session isn't bounced
// to /login mid-edit or when downloading the CV.
export const config = {
  matcher: [
    "/home",
    "/home/:path*",
    "/settings",
    "/settings/:path*",
    "/dashboard/:path*",
    "/api/bfu/:path*",
    "/api/resume",
  ],
};
