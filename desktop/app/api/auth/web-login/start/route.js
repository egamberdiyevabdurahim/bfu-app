import { NextResponse } from "next/server";

const API_BASE = process.env.BFU_API_URL;

/**
 * POST /api/auth/web-login/start
 *
 * Kicks off the bot deep-link handshake. Proxies to the backend's
 * `POST /auth/web-login/start` (no body) and hands the client back the
 * { nonce, deep_link, expires_in } it needs to open the bot and poll.
 *
 * This is a thin proxy: keeping the backend origin server-side means the
 * browser never learns BFU_API_URL, matching the other auth routes.
 */
export async function POST() {
  let res;
  try {
    res = await fetch(`${API_BASE}/auth/web-login/start`, {
      method: "POST",
      cache: "no-store",
    });
  } catch {
    return NextResponse.json(
      { status: "error", reason: "network" },
      { status: 200 }
    );
  }

  if (!res.ok) {
    return NextResponse.json(
      { status: "error", reason: `start_${res.status}` },
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

  return NextResponse.json(
    {
      nonce: data?.nonce,
      deep_link: data?.deep_link,
      code: data?.code,
      expires_in: data?.expires_in,
    },
    { status: 200 }
  );
}
