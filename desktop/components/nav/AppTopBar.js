"use client";

import AppShell from "@/components/nav/AppShell";

// Thin compatibility wrapper. The nav is now the left-sidebar AppShell, which
// OWNS the page chrome (the firelit <main>/<Atmosphere>/content container). So
// AppTopBar simply forwards to AppShell — pages pass their content as children:
//
//   <AppTopBar active="mentors" me={me}>{pageContent}</AppTopBar>
//
// With no `me`, AppShell self-fetches GET /users/me on mount (the original
// AppTopBar behavior), so the sidebar's profile block still populates.

export default function AppTopBar({ active, me = null, children }) {
  return (
    <AppShell active={active} me={me}>
      {children}
    </AppShell>
  );
}
