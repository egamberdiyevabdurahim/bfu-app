import { NextResponse } from "next/server";
import { clearAuthCookies } from "@/lib/session";

// Clear the httpOnly session + refresh cookies and send the user back to the
// front door (`/`, which redirects to /city). Supports GET (a plain <a href>
// from the home TopBar) and POST (form/fetch), so either wiring works.
function endSession(request) {
  const response = NextResponse.redirect(new URL("/", request.url));
  clearAuthCookies(response.cookies);
  return response;
}

export function GET(request) {
  return endSession(request);
}

export function POST(request) {
  return endSession(request);
}
