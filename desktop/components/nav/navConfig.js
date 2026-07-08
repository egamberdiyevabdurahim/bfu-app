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

// EXPLORE — the public "wander the bazaar" surfaces. `public: true` marks the
// two surfaces a logged-out visitor can browse (City + Projects); the rest need
// a session.
export const EXPLORE = [
  { key: "city", href: "/city", label: "City", icon: "✦", public: true },
  { key: "projects", href: "/projects", label: "Projects", icon: "◆", public: true },
  { key: "mentors", href: "/mentors", label: "Mentors", icon: "◈", public: false },
  { key: "events", href: "/events", label: "Events", icon: "✧", public: false },
  { key: "partners", href: "/partners", label: "Partners", icon: "⬡", public: false },
];

// YOU — the logged-in member's personal destinations. `badge: "applications"`
// tells AppShell to render the pending-applications count on that row.
export const YOU = [
  { key: "home", href: "/home", label: "Home", icon: "⌂" },
  { key: "projects-mine", href: "/projects/mine", label: "Your projects", icon: "◆" },
  { key: "requests", href: "/requests", label: "Applications", icon: "✒", badge: "applications" },
  { key: "messages", href: "/messages", label: "Messages", icon: "✉", badge: "messages" },
  { key: "favorites", href: "/favorites", label: "Saved", icon: "❥" },
  { key: "connections", href: "/connections", label: "Connections", icon: "❋" },
  { key: "bookings", href: "/bookings", label: "Sessions", icon: "◷" },
  { key: "notifications", href: "/notifications", label: "Notifications", icon: "🔔", badge: "notifications" },
  { key: "settings", href: "/settings", label: "Settings", icon: "✎" },
];

// ADMIN — only rendered for ADMIN_ROLES members.
export const ADMIN = [
  { key: "dashboard", href: "/dashboard", label: "Command center", icon: "▦" },
];

export const ADMIN_ROLES = new Set(["admin", "super_admin"]);

// Resolve a nav item's href against the current user (for any future /u/{id}
// profile link). Returns null when the item can't be resolved (no me.id yet) so
// callers can filter it out.
export function resolveYouHref(item, me) {
  if (item.dynamic === "profile") {
    return me?.id ? `/u/${me.id}` : "/settings";
  }
  return item.href || null;
}
