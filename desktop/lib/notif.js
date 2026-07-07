// Single source of truth for rendering an in-app notification: its icon, its
// human text, and where a click should take you. Mirrors the Vite Mini App's
// InboxModal (src/components/InboxModal.jsx) so meaning stays identical across
// surfaces, but resolves to desktop routes (/u/{id}, /p/{id}, /bookings, …).
//
// Backend shape (GET /users/me/notifications → { unread, items: [...] }):
//   { id, type, is_read, created_at,
//     actor:   { id, display_name, photo_url } | null,
//     project: { id, name, type }              | null }
// The backend notification model documents the type set; the live types emitted
// are: interest, mutual, intro, new_follower, application, accepted, declined,
// rate_prompt, project_update, booking_request, booking_confirmed,
// booking_declined.

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
};

/** Emoji for a notification type, falling back to a generic bell. */
export function notifEmoji(type) {
  return NOTIF_EMOJI[type] || "🔔";
}

/**
 * Human, English one-liner for a notification. Kept parallel to the Mini App's
 * localized strings (the desktop app is English-only today). `actor`/`project`
 * are the hydrated refs from the payload.
 */
export function notifText(n) {
  const name = n.actor?.display_name || "Someone";
  const proj = n.project?.name || "a project";
  switch (n.type) {
    case "mutual":
      return `You and ${name} are a match — say hello.`;
    case "interest":
      return `${name} is interested in connecting.`;
    case "intro":
      return `${name} sent you an intro.`;
    case "new_follower":
      return `${name} started following you.`;
    case "application":
      return `${name} applied to ${proj}.`;
    case "accepted":
      return `You were accepted to ${proj}.`;
    case "declined":
      return `Your application to ${proj} wasn't accepted this time.`;
    case "rate_prompt":
      return `${proj} wrapped up — rate the people you built with.`;
    case "project_update":
      return `${proj} posted an update.`;
    case "booking_request":
      return `${name} requested a session with you.`;
    case "booking_confirmed":
      return `${name} confirmed your session.`;
    case "booking_declined":
      return `${name} declined your session request.`;
    default:
      return name;
  }
}

/**
 * Where a click on this notification should go, or null if it isn't linkable.
 * - project-scoped items (application/accepted/declined/project_update/
 *   rate_prompt) → the project page /p/{id}
 * - booking items → /bookings
 * - person items (interest/mutual/intro/new_follower) → the actor /u/{id}
 */
export function notifHref(n) {
  switch (n.type) {
    case "application":
    case "accepted":
    case "declined":
    case "project_update":
    case "rate_prompt":
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
  let ms = Date.parse(iso);
  if (Number.isNaN(ms)) {
    // Backend emits naive UTC (no offset); append Z and retry.
    ms = Date.parse(`${iso}Z`);
  }
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
