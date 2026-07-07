import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  SESSION_COOKIE,
  REFRESH_COOKIE,
  setAuthCookies,
  clearAuthCookies,
} from "@/lib/session";

const API_BASE = process.env.BFU_API_URL;

/**
 * Authenticated backend-for-frontend proxy.
 *
 * Client components fetch `/api/bfu/<path...>?<query>` and this handler forwards
 * the request to `${BFU_API_URL}/<path...>?<query>` AS the logged-in user,
 * attaching `Authorization: Bearer <bfu_session>` from the httpOnly cookie. The
 * browser never sees or handles the token.
 *
 * Refresh: the primary refresh path is middleware.js (runs before this handler
 * and swaps in a fresh access token). This is the belt-and-suspenders fallback:
 * if the BACKEND itself returns 401 (e.g. token revoked, or an edge-case the
 * middleware missed), we try ONE refresh here and retry the request once.
 */

const REFRESH_PATH = "auth/refresh";

// Build the upstream URL: join the [...path] segments with "/" and preserve the
// incoming query string verbatim. The catch-all route param is already split on
// "/" by Next, so there's no traversal risk — we just re-join it.
function upstreamUrl(req, pathSegments) {
  const path = (pathSegments || []).join("/");
  const search = new URL(req.url).search; // includes leading "?" or ""
  return `${API_BASE}/${path}${search}`;
}

// Forward one request to the backend with the given access token. `body` is the
// raw request body string ("" when there is none). Returns the raw fetch
// Response so the caller can inspect status before consuming the body.
function forward(url, method, body, accessToken) {
  const headers = { Authorization: `Bearer ${accessToken}` };
  // Only set a JSON content-type when we actually have a body to send.
  if (body) headers["Content-Type"] = "application/json";
  return fetch(url, {
    method,
    headers,
    body: body || undefined,
    cache: "no-store",
    // Never follow redirects transparently — surface them to the client instead.
    redirect: "manual",
  });
}

// Turn a backend fetch Response into a NextResponse, passing status + body
// through. Empty bodies (204/205 or genuinely empty) yield an empty NextResponse
// with the same status. Optionally accepts a `mutate(res)` callback to set
// cookies on the outgoing response (used after a refresh).
async function passThrough(backendRes, mutate) {
  const status = backendRes.status;

  if (status === 204 || status === 205) {
    const res = new NextResponse(null, { status });
    if (mutate) mutate(res);
    return res;
  }

  const text = await backendRes.text();
  if (!text) {
    const res = new NextResponse(null, { status });
    if (mutate) mutate(res);
    return res;
  }

  // Pass the body through as-is with the backend's content-type (default JSON).
  const contentType =
    backendRes.headers.get("content-type") || "application/json";
  const res = new NextResponse(text, {
    status,
    headers: { "Content-Type": contentType },
  });
  if (mutate) mutate(res);
  return res;
}

async function handle(req, ctx) {
  // Next 16: params is async.
  const { path } = await ctx.params;

  const jar = await cookies();
  const accessToken = jar.get(SESSION_COOKIE)?.value || null;

  // No session cookie at all → the proxy itself rejects (not the backend).
  if (!accessToken) {
    return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  }

  const url = upstreamUrl(req, path);
  const method = req.method;
  // Read the body once as text and pass it through unchanged.
  const body = await req.text();

  let backendRes;
  try {
    backendRes = await forward(url, method, body, accessToken);
  } catch {
    return NextResponse.json(
      { detail: "Upstream request failed" },
      { status: 502 }
    );
  }

  // Happy path (and all non-401 errors): pass straight through.
  if (backendRes.status !== 401) {
    return passThrough(backendRes);
  }

  // --- 401 from the backend: attempt ONE refresh, then retry once. ---
  const refreshToken = jar.get(REFRESH_COOKIE)?.value || null;
  if (!refreshToken) {
    // Nothing to refresh with — clear and surface the 401.
    const res = NextResponse.json(
      { detail: "Not authenticated" },
      { status: 401 }
    );
    clearAuthCookies(res.cookies);
    return res;
  }

  let refreshRes;
  try {
    refreshRes = await fetch(`${API_BASE}/${REFRESH_PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
      cache: "no-store",
    });
  } catch {
    const res = NextResponse.json(
      { detail: "Not authenticated" },
      { status: 401 }
    );
    clearAuthCookies(res.cookies);
    return res;
  }

  if (!refreshRes.ok) {
    const res = NextResponse.json(
      { detail: "Not authenticated" },
      { status: 401 }
    );
    clearAuthCookies(res.cookies);
    return res;
  }

  let tokens;
  try {
    tokens = await refreshRes.json();
  } catch {
    tokens = null;
  }
  const newAccess = tokens?.access_token;
  if (!newAccess) {
    const res = NextResponse.json(
      { detail: "Not authenticated" },
      { status: 401 }
    );
    clearAuthCookies(res.cookies);
    return res;
  }

  // Retry the original request once with the fresh access token. Set the new
  // cookies on THIS response so the browser is up to date going forward.
  let retryRes;
  try {
    retryRes = await forward(url, method, body, newAccess);
  } catch {
    const res = NextResponse.json(
      { detail: "Upstream request failed" },
      { status: 502 }
    );
    setAuthCookies(res.cookies, newAccess, tokens?.refresh_token || refreshToken);
    return res;
  }

  return passThrough(retryRes, (res) => {
    setAuthCookies(res.cookies, newAccess, tokens?.refresh_token || refreshToken);
  });
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const PUT = handle;
export const DELETE = handle;
