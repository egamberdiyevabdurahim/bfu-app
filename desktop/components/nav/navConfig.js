// Single source of truth for the site navigation. Shared by the logged-in nav
// (AppNav), the logged-out nav (PublicNav) and the /home launchpad so labels,
// hrefs and accent glyphs never drift apart.
//
// The amber emoji glyphs match the Batches 1–4 accent grammar used across the
// Chorsu surfaces.

// EXPLORE — the primary bar. These are the public "wander the bazaar" surfaces
// plus the community loop. Logged-out visitors see City + Projects + People;
// the full set surfaces for everyone in the responsive menu / launchpad.
export const EXPLORE = [
  { key: "city", href: "/city", label: "City", icon: "✦", public: true },
  { key: "projects", href: "/projects", label: "Projects", icon: "◆", public: true },
  { key: "people", href: "/connections", label: "People", icon: "❋", public: false },
  { key: "mentors", href: "/mentors", label: "Mentors", icon: "◈", public: false },
  { key: "events", href: "/events", label: "Events", icon: "✧", public: false },
  { key: "partners", href: "/partners", label: "Partners", icon: "⬡", public: false },
];

// YOU — the account dropdown on the avatar. Every personal destination lives
// here so a logged-in user can reach all of them in ≤2 clicks from any page.
// `dynamic: "profile"` and `dynamic: "settings"` are resolved against `me` in
// AppNav (Your profile → /u/{me.id}); the rest are static hrefs.
export const YOU = [
  { key: "home", href: "/home", label: "Home", icon: "⌂" },
  { key: "profile", dynamic: "profile", label: "Your profile", icon: "✦" },
  { key: "settings", href: "/settings", label: "Edit profile", icon: "✎" },
  { key: "projects-mine", href: "/projects/mine", label: "Your projects", icon: "◆" },
  { key: "requests", href: "/requests", label: "Applications", icon: "✒" },
  { key: "favorites", href: "/favorites", label: "Saved", icon: "❥" },
  { key: "connections", href: "/connections", label: "Connections", icon: "❋" },
  { key: "bookings", href: "/bookings", label: "Sessions", icon: "◷" },
  { key: "notifications", href: "/notifications", label: "Notifications", icon: "🔔" },
];

export const ADMIN_ROLES = new Set(["admin", "super_admin"]);

// Resolve a YOU item's href against the current user (for the /u/{id} profile
// link). Returns null when the item can't be resolved (no me.id yet) so callers
// can filter it out.
export function resolveYouHref(item, me) {
  if (item.dynamic === "profile") {
    return me?.id ? `/u/${me.id}` : "/settings";
  }
  return item.href || null;
}
