import { FLAGS } from "@/lib/flags";
import { handleFor } from "@/lib/handle";

// Single source of truth for the site navigation. Consumed by the logged-in
// left-sidebar shell (AppShell) so labels, hrefs and accent glyphs never drift
// apart. The amber emoji glyphs match the Batches 1–4 accent grammar used across
// the Chorsu surfaces.
//
// IMPORTANT (active-state correctness): every href must be UNIQUE across all
// groups. AppShell derives the highlighted row from the current pathname by the
// longest-matching href, so a duplicate href would make two rows fight for the
// highlight. That is exactly why the old redundant "People" → /connections item
// was removed from EXPLORE; /connections now lives ONCE, as "Connections" in YOU.
//
// ── V1 LAUNCH SCOPE ──────────────────────────────────────────────────────────
// The rows below are ALL still here; the ones outside V1 are simply filtered out
// of the exported EXPLORE / YOU by `visible()`. Two kinds of hidden row:
//
//   flag: "MENTORING"  → hidden while FLAGS.MENTORING is false. Flip the flag in
//                        lib/flags.js to true and the row is back. That's it.
//   folded: "..."      → NOT flag-gated: the row is gone for good because its
//                        surface now lives inside another page. The route itself
//                        still works, it just has no sidebar row of its own.
//
// Nothing is deleted, so re-enabling is always a one-line change.

// EXPLORE — the public "wander the bazaar" surfaces. `public: true` marks the
// two surfaces a logged-out visitor can browse (City + Projects); the rest need
// a session.
const ALL_EXPLORE = [
  { key: "city", href: "/city", label: "City", icon: "✦", public: true },
  { key: "projects", href: "/projects", label: "Projects", icon: "◆", public: true },
  { key: "mentors", href: "/mentors", label: "Mentors", icon: "◈", public: false, flag: "MENTORING" },
  { key: "events", href: "/events", label: "Events", icon: "✧", public: false },
  { key: "partners", href: "/partners", label: "Partners", icon: "⬡", public: false, flag: "PARTNERS" },
];

// YOU — the logged-in member's personal destinations. `badge: "applications"`
// tells AppShell to render the pending-applications count on that row (only
// meaningful while the row is visible).
const ALL_YOU = [
  { key: "home", href: "/home", label: "Home", icon: "⌂" },
  { key: "projects-mine", href: "/projects/mine", label: "Your projects", icon: "◆" },
  {
    key: "requests",
    href: "/requests",
    label: "Applications",
    icon: "✒",
    badge: "applications",
    // Applications now live INSIDE the "Your projects" page (/projects/mine),
    // which is where you go to act on them. /requests still resolves — it just
    // isn't a top-level destination any more.
    folded: "/projects/mine",
  },
  { key: "messages", href: "/messages", label: "Messages", icon: "✉", badge: "messages" },
  { key: "favorites", href: "/favorites", label: "Saved", icon: "❥", flag: "SAVED" },
  { key: "connections", href: "/connections", label: "Connections", icon: "❋", flag: "CONNECTIONS" },
  { key: "bookings", href: "/bookings", label: "Sessions", icon: "◷", flag: "MENTORING" },
  { key: "notifications", href: "/notifications", label: "Notifications", icon: "🔔", badge: "notifications" },
  { key: "settings", href: "/settings", label: "Settings", icon: "✎" },
];

// A row shows when it isn't folded into another page and its flag (if any) is on.
function visible(item) {
  if (item.folded) return false;
  if (item.flag) return FLAGS[item.flag] === true;
  return true;
}

// V1 sidebar → EXPLORE: City, Projects, Events · YOU: Home, Your projects,
// Messages, Notifications, Settings.
export const EXPLORE = ALL_EXPLORE.filter(visible);
export const YOU = ALL_YOU.filter(visible);

// ADMIN — only rendered for ADMIN_ROLES members.
export const ADMIN = [
  { key: "dashboard", href: "/dashboard", label: "Command center", icon: "▦" },
];

export const ADMIN_ROLES = new Set(["admin", "super_admin"]);

// PARTNER — only rendered for role === PARTNER_ROLE members. A partner is NOT an
// admin: it never sees the "Command center", only its OWN scoped panel over its
// own events (create/edit forms, read responses/funnel/leads/AI/CSV). The route
// is role-gated in app/partner/page.js (a non-partner is sent away) and every
// /partner/* API route is org-scoped server-side.
export const PARTNER = [
  { key: "partner-panel", href: "/partner", label: "Partner panel", icon: "⬡" },
];

export const PARTNER_ROLE = "partner";

// Resolve a nav item's href against the current user (for any future /u/{id}
// profile link). Returns null when the item can't be resolved (no me.id yet) so
// callers can filter it out.
export function resolveYouHref(item, me) {
  if (item.dynamic === "profile") {
    return me?.id ? `/u/${handleFor(me.id)}` : "/settings";
  }
  return item.href || null;
}
