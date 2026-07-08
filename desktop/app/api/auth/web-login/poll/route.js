import { NextResponse } from "next/server";
import { setAuthCookies } from "@/lib/session";

const API_BASE = process.env.BFU_API_URL;

/**
 * GET /api/auth/web-login/poll?nonce=<nonce>
 *
 * The client polls this every couple of seconds while the user is being asked
 * to tap Start in the BFU bot. We forward the nonce to the backend's
 * `GET /auth/web-login/poll` and translate its response into a small, stable
 * status envelope the client can switch on:
 *
 *   { status: "ok" }       — user tapped Start; we've just set the session
 *                            cookie (value = access_token), same shape as
 *                            /api/auth/telegram.
 *   { status: "pending" }  — still waiting.
 *   { status: "expired" }  — backend 410; the nonce timed out. Client re-starts.
 *   { status: "error", reason } — 404 (unknown nonce) / 403 (banned) / anything
 *                            else. Client shows a friendly message.
 *
 * Everything returns HTTP 200 so the client only has to read the JSON body.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const nonce = searchParams.get("nonce");

  if (!nonce) {
    return NextResponse.json(
      { status: "error", reason: "missing_nonce" },
      { status: 200 }
    );
  }

  let res;
  try {
    res = await fetch(
      `${API_BASE}/auth/web-login/poll?nonce=${encodeURIComponent(nonce)}`,
      { cache: "no-store" }
    );
  } catch {
    return NextResponse.json(
      { status: "error", reason: "network" },
      { status: 200 }
    );
  }

  // Expired nonce — tell the client to seamlessly start over.
  if (res.status === 410) {
    return NextResponse.json({ status: "expired" }, { status: 200 });
  }
  // Unknown nonce / banned / other backend error.
  if (res.status === 404) {
    return NextResponse.json(
      { status: "error", reason: "unknown" },
      { status: 200 }
    );
  }
  if (res.status === 403) {
    return NextResponse.json(
      { status: "error", reason: "banned" },
      { status: 200 }
    );
  }
  if (!res.ok) {
    return NextResponse.json(
      { status: "error", reason: `poll_${res.status}` },
      { status: 200 }
    );
  }

  let data;
  try {
    data = await res.json();
  } catch {
    return NextResponse.json(
      { status: "error", reason: "bad_json" },
      { status: 200 }
    );
  }

  // Still waiting for the user to tap Start.
  if (data?.status === "pending") {
    return NextResponse.json({ status: "pending" }, { status: 200 });
  }

  // Handshake complete — mint the httpOnly session + refresh cookies exactly the
  // way /api/auth/telegram does (shared setAuthCookies helper), then report
  // success.
  if (data?.status === "ok") {
    const token = data?.access_token;
    if (!token) {
      return NextResponse.json(
        { status: "error", reason: "no_token" },
        { status: 200 }
      );
    }

    // is_registered tells the client where to land: registered → /home,
    // brand-new → /register. Default to true so an older backend (no field)
    // routes to /home, never traps a real member on the sign-up form.
    const response = NextResponse.json(
      { status: "ok", is_registered: data?.is_registered !== false },
      { status: 200 }
    );
    setAuthCookies(response.cookies, token, data?.refresh_token);
    return response;
  }

  // Any other backend status string — surface as a generic error.
  return NextResponse.json(
    { status: "error", reason: data?.status || "unknown" },
    { status: 200 }
  );
}
