// Browser-usable client for the authed BFF proxy. Import this from client
// components ("use client") to call the FastAPI backend AS the logged-in user —
// the request goes to /api/bfu/<path>, which attaches the httpOnly Bearer token
// server-side. There is NO 'server-only' here on purpose.
//
//   import { bfu } from "@/lib/client-api";
//   const me = await bfu("/users/me");
//   await bfu("/projects", { method: "POST", body: { title } });
//   const list = await bfu("/search", { params: { q: "web", limit: 20 } });

function buildQuery(params) {
  if (!params) return "";
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined) continue;
    qs.set(key, String(value));
  }
  const s = qs.toString();
  return s ? `?${s}` : "";
}

/**
 * Call the backend through the authed proxy.
 *
 * @param {string} path   Backend path, e.g. "/users/me" (leading slash ok).
 * @param {object} [opts]
 * @param {string} [opts.method="GET"]
 * @param {any}    [opts.body]    JSON-serializable request body.
 * @param {object} [opts.params]  Query params (null/undefined skipped).
 * @returns parsed JSON, or null for 204 No Content.
 * @throws  Error with `.status` set on non-2xx responses.
 */
export async function bfu(path, { method = "GET", body, params } = {}) {
  const query = buildQuery(params);
  const res = await fetch(`/web/api/bfu${path}${query}`, {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return null;

  let json = null;
  try {
    json = await res.json();
  } catch {
    // Non-JSON or empty body — leave json null and fall through to error/return.
  }

  if (!res.ok) {
    const detail = json?.detail ?? null;
    const err = new Error(errorMessage(detail, res.status));
    err.status = res.status;
    // Keep the RAW body too. A 422 from a form endpoint is a structured object
    // (per-question errors keyed by question key), and `new Error(obj)` would
    // flatten it to "[object Object]" — callers that can render field-level
    // errors read `err.detail`; everyone else keeps using `err.message`.
    err.detail = detail;
    throw err;
  }

  return json;
}

// Best-effort human message from a FastAPI error body. `detail` is usually a
// plain string (HTTPException), sometimes a list of {loc,msg} (Pydantic 422),
// sometimes a custom object. Never returns an object — that's what err.detail is
// for.
function errorMessage(detail, status) {
  if (typeof detail === "string" && detail) return detail;
  if (Array.isArray(detail)) {
    const first = detail.find((d) => d && typeof d.msg === "string");
    if (first) return first.msg;
  }
  if (detail && typeof detail === "object") {
    for (const k of ["message", "error", "detail"]) {
      if (typeof detail[k] === "string" && detail[k]) return detail[k];
    }
  }
  return `HTTP ${status}`;
}

// Tiny convenience wrappers.
export const get = (path, params) => bfu(path, { method: "GET", params });
export const post = (path, body, params) =>
  bfu(path, { method: "POST", body, params });
export const patch = (path, body, params) =>
  bfu(path, { method: "PATCH", body, params });
export const put = (path, body, params) =>
  bfu(path, { method: "PUT", body, params });
export const del = (path, params) => bfu(path, { method: "DELETE", params });
