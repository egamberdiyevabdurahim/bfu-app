"use client";

import AppNav from "@/components/nav/AppNav";

// Thin compatibility wrapper kept for the many AUTHED pages that import
// AppTopBar and pass only `active` (/home, /settings, projects/*, /mentors,
// /bookings, /events, /partners, /connections, /favorites, /requests,
// /dashboard, /notifications). The real nav now lives in AppNav, which is also
// used (with a server-fetched `me`) by SiteTopBar on public pages.
//
// With no `initialMe`, AppNav self-fetches GET /users/me on mount — the
// original AppTopBar behavior — so these pages need no changes.

export default function AppTopBar({ active }) {
  return <AppNav active={active} />;
}
