import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";

const API_BASE = process.env.BFU_API_URL;

// One week, in seconds — matches the auth spec's cookie maxAge.
const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

// The Telegram Login Widget's own fields (data-auth-url flow). Telegram appends
// these to our URL as query params after the user approves in the popup.
const WIDGET_FIELDS = [
  "id",
  "first_name",
  "last_name",
  "username",
  "photo_url",
  "auth_date",
  "hash",
];

/**
 * GET /api/auth/telegram
 *
 * The Telegram Login Widget (configured with data-auth-url pointing here)
 * redirects the browser to this handler with the signed auth fields as query
 * params. We forward them as JSON to the backend, which verifies the HMAC
 * signature. On success we mint the httpOnly session cookie and land the user
 * on /home; on any failure we bounce back to /login with a friendly reason.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);

  // Collect the widget fields that are present. `id` and `auth_date` come back
  // as numbers to the backend model, so coerce those two; the rest stay strings.
  const payload = {};
  for (const field of WIDGET_FIELDS) {
    const value = searchParams.get(field);
    if (value === null) continue;
    payload[field] = field === "id" || field === "auth_date" ? Number(value) : value;
  }

  // No signed fields at all → someone hit this route directly. Send them to
  // login to start over.
  if (!payload.hash || !payload.id) {
    return redirectToLogin(request, "invalid");
  }

  let res;
  try {
    res = await fetch(`${API_BASE}/auth/telegram-widget`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
  } catch {
    return redirectToLogin(request, "network");
  }

  if (res.status === 404) return redirectToLogin(request, "unregistered");
  if (res.status === 403) return redirectToLogin(request, "banned");
  if (!res.ok) return redirectToLogin(request, "invalid");

  let data;
  try {
    data = await res.json();
  } catch {
    return redirectToLogin(request, "invalid");
  }

  const token = data?.access_token;
  if (!token) return redirectToLogin(request, "invalid");

  // Success: set the httpOnly session cookie and land on the personalized home.
  const response = NextResponse.redirect(new URL("/home", request.url));
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_MAX_AGE,
  });
  return response;
}

function redirectToLogin(request, reason) {
  const url = new URL("/login", request.url);
  url.searchParams.set("error", reason);
  return NextResponse.redirect(url);
}
