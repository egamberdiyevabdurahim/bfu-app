import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";

// Clear the httpOnly session cookie and send the user back to the front door
// (`/`, which redirects to /city). Supports GET (a plain <a href> from the
// home TopBar) and POST (form/fetch), so either wiring works.
function endSession(request) {
  const response = NextResponse.redirect(new URL("/", request.url));
  // Delete by setting an expired, empty cookie on the same path.
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
  });
  return response;
}

export function GET(request) {
  return endSession(request);
}

export function POST(request) {
  return endSession(request);
}
