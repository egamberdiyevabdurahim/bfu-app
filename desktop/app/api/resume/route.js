import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, REFRESH_COOKIE, setAuthCookies } from "@/lib/session";

const API_BASE = process.env.BFU_API_URL;

// The CV/resume is a PDF *binary*. The generic /api/bfu/* proxy passes bodies
// through `Response.text()`, which decodes bytes as UTF-8 and re-encodes them —
// fine for JSON, but it corrupts binary like a PDF. So the resume gets its own
// server route that streams the raw bytes with the correct Content-Type, still
// attaching the httpOnly Bearer token server-side (the browser never sees it).
//
// One-shot refresh mirrors the proxy: if the backend 401s, refresh once and
// retry, persisting the fresh cookies on the streamed response.

async function fetchResume(token) {
  return fetch(`${API_BASE}/users/me/resume`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
    redirect: "manual",
  });
}

function pdfResponse(arrayBuffer, upstream, mutate) {
  const disp =
    upstream.headers.get("content-disposition") ||
    'attachment; filename="BFU-CV.pdf"';
  const res = new NextResponse(arrayBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": disp,
      "Cache-Control": "no-store",
    },
  });
  if (mutate) mutate(res);
  return res;
}

export async function GET() {
  const jar = await cookies();
  const accessToken = jar.get(SESSION_COOKIE)?.value || null;
  if (!accessToken) {
    return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  }

  let upstream;
  try {
    upstream = await fetchResume(accessToken);
  } catch {
    return NextResponse.json({ detail: "Upstream request failed" }, { status: 502 });
  }

  if (upstream.status === 200) {
    return pdfResponse(await upstream.arrayBuffer(), upstream);
  }

  // --- 401: try ONE refresh, then retry once. ---
  if (upstream.status !== 401) {
    return NextResponse.json(
      { detail: "Could not generate CV" },
      { status: upstream.status }
    );
  }

  const refreshToken = jar.get(REFRESH_COOKIE)?.value || null;
  if (!refreshToken) {
    return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  }

  let tokens = null;
  try {
    const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
      cache: "no-store",
    });
    if (refreshRes.ok) tokens = await refreshRes.json();
  } catch {
    tokens = null;
  }
  const newAccess = tokens?.access_token;
  if (!newAccess) {
    return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  }

  let retry;
  try {
    retry = await fetchResume(newAccess);
  } catch {
    return NextResponse.json({ detail: "Upstream request failed" }, { status: 502 });
  }
  if (retry.status !== 200) {
    return NextResponse.json(
      { detail: "Could not generate CV" },
      { status: retry.status }
    );
  }
  return pdfResponse(await retry.arrayBuffer(), retry, (res) => {
    setAuthCookies(res.cookies, newAccess, tokens?.refresh_token || refreshToken);
  });
}
