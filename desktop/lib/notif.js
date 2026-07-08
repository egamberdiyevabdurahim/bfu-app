// Single source of truth for rendering an in-app notification: its icon, its
// human text, and where a click should take you. Mirrors the Vite Mini App's
// InboxModal (src/components/InboxModal.jsx) so meaning stays identical across
// surfaces, but resolves to desktop routes (/u/{id}, /p/{id}, /bookings, …).
//
// Backend shape (GET /users/me/notifications → { unread, items: [...] }):
//   { id, type, is_read, created_at,
//     actor:      { id, display_name, photo_url } | null,
//     project:    { id, name, type }              | null,
//     actor_id:   number | null,   // flat, for /u/{id}
//     actor_name: string | null,   // the REAL display name, or null (no actor)
//     link:       string | null }  // server-computed relative href
// actor_name/link are the preferred inputs (added so rows show a real name and
// are clickable); we fall back to the nested actor/project when they're absent
// (e.g. an older backend). The backend notification model documents the type
// set; the live types emitted are: interest, mutual, intro, new_follower,
// application, accepted, declined, rate_prompt, project_update, booking_request,
// booking_confirmed, booking_declined.

// Type → emoji glyph shown when there is no actor avatar (and as a small badge
// alongside the actor). Matches the Mini App's TYPE_EMOJI table.
export const NOTIF_EMOJI = {
  mutual: "🎉",
  interest: "💜",
  intro: "👋",
  new_follower: "➕",
  application: "🔔",
  accepted: "✅",
  declined: "📭",
  rate_prompt: "⭐",
  project_update: "📣",
  booking_request: "📅",
  booking_confirmed: "✅",
  booking_declined: "🚫",
  removed_from_project: "🚪",
  message: "✉️",
};

/** Emoji for a notification type, falling back to a generic bell. */
export function notifEmoji(type) {
  return NOTIF_EMOJI[type] || "🔔";
}

/** The actor's real display name, or null when there is no actor. Prefers the
 * flat `actor_name` the backend now sends; falls back to the nested actor. */
function actorName(n) {
  return n.actor_name || n.actor?.display_name || null;
}

/**
 * Human, English one-liner for a notification. Kept parallel to the Mini App's
 * localized strings (the desktop app is English-only today). Uses the REAL
 * actor name when we have one; when the actor is unknown it uses a neutral
 * phrasing rather than the bare word "Someone".
 */
export function notifText(n) {
  const name = actorName(n); // real name, or null
  const proj = n.project?.name || "a project";
  switch (n.type) {
    case "mutual":
      return name ? `You and ${name} are a match — say hello.` : `You have a new match — say hello.`;
    case "interest":
      return name ? `${name} is interested in connecting.` : `A builder is interested in connecting.`;
    case "intro":
      return name ? `${name} sent you an intro.` : `You received a new intro.`;
    case "new_follower":
      return name ? `${name} started following you.` : `You have a new follower.`;
    case "application":
      return name ? `${name} applied to ${proj}.` : `New application to ${proj}.`;
    case "accepted":
      return `You were accepted to ${proj}.`;
    case "declined":
      return `Your application to ${proj} wasn't accepted this time.`;
    case "rate_prompt":
      return `${proj} wrapped up — rate the people you built with.`;
    case "project_update":
      return `${proj} posted an update.`;
    case "removed_from_project":
      return `You're no longer on the team for ${proj}.`;
    case "booking_request":
      return name ? `${name} requested a session with you.` : `You have a new session request.`;
    case "booking_confirmed":
      return name ? `${name} confirmed your session.` : `Your session was confirmed.`;
    case "booking_declined":
      return name ? `${name} declined your session request.` : `Your session request was declined.`;
    case "message":
      return name ? `${name} sent you a message.` : `You have a new message.`;
    default:
      return name || "You have a new notification.";
  }
}

/**
 * Where a click on this notification should go. Prefers the server-computed
 * `link` (always present on the current backend); falls back to deriving it
 * client-side for older payloads:
 * - project-scoped items (application/accepted/declined/project_update/
 *   rate_prompt) → the project page /p/{id}
 * - booking items → /bookings
 * - person items (interest/mutual/intro/new_follower) → the actor /u/{id}
 */
export function notifHref(n) {
  if (n.link) return n.link;
  switch (n.type) {
    case "application":
    case "accepted":
    case "declined":
    case "project_update":
    case "rate_prompt":
    case "removed_from_project":
      return n.project?.id ? `/p/${n.project.id}` : null;
    case "booking_request":
    case "booking_confirmed":
    case "booking_declined":
      return "/bookings";
    case "interest":
    case "mutual":
    case "intro":
    case "new_follower":
      return n.actor?.id ? `/u/${n.actor.id}` : null;
    case "message":
      // The exact thread comes from the server `link` (/messages?c={id}); this
      // fallback just opens the messenger.
      return "/messages";
    default:
      return n.actor?.id ? `/u/${n.actor.id}` : null;
  }
}

/**
 * Compact relative time ("just now", "5m", "3h", "2d", "Apr 4") from an ISO
 * timestamp. Backend `created_at` is UTC without a trailing Z, so we normalise.
 */
export function relTime(iso) {
  if (!iso) return "";
  // Backend emits naive UTC (no offset). Date.parse() of a tz-less string uses
  // LOCAL time (e.g. +5h in Uzbekistan), which makes a just-sent item read "5h".
  // So force-UTC by appending Z when there's no timezone marker.
  const hasTz = /[zZ]$|[+-]\d\d:?\d\d$/.test(iso);
  let ms = Date.parse(hasTz ? iso : `${iso}Z`);
  if (Number.isNaN(ms)) ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "";
  const diff = Date.now() - ms;
  const sec = Math.max(0, Math.floor(diff / 1000));
  if (sec < 45) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d`;
  try {
    return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}
