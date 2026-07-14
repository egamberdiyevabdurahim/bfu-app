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
// application, accepted, declined, rate_prompt, session_rate_prompt,
// project_update, removed_from_project, message, booking_request,
// booking_confirmed, booking_declined, event_rsvp, event_reminder
// (see backend/app/services/notifications.py TYPE_TO_PREF for the full set).

import { FLAGS } from "@/lib/flags";
import { handleFor } from "@/lib/handle";

// Notification types belonging to a feature that is hidden for the V1 launch
// (see lib/flags.js). A hidden feature's UI is gone while its flag is off —
// mentoring's /bookings 404s, the endorse/vouch/rate controls are unmounted, the
// "I'm interested" / "Request intro" buttons are unmounted — so an OLD
// notification of one of these types, still sitting in someone's inbox from
// before the launch, must not be rendered at all: it is a row for a feature the
// user can neither reach nor act on. They are FILTERED OUT (see isVisibleNotif /
// visibleNotifs) rather than deleted, and the emoji / text / link tables below
// are kept fully intact.
//
// Each type is listed under the ONE flag that owns it — the flag whose feature
// is the only thing that can produce it — so flipping a flag back to true
// restores exactly that feature's rows and nothing else:
//   MENTORING      → mentors/slots/bookings   (backend: routers/mentors.py)
//   TRUST          → endorse / vouch / rate   (backend: routers/projects.py close → rate_prompt)
//   INTEREST_INTRO → "I'm interested" ping + "Request intro"
//                    (backend: routers/users.py soft_interest → interest|mutual,
//                     request_intro → intro; both are unreachable in V1 because
//                     PersonActions renders those buttons only under the flag)
// Mirrors the Mini App's InboxModal BOOKING_TYPES / RATING_TYPES split.
const FEATURE_TYPES = {
  MENTORING: ["booking_request", "booking_confirmed", "booking_declined"],
  TRUST: ["rate_prompt", "session_rate_prompt"],
  INTEREST_INTRO: ["interest", "mutual", "intro"],
};

// type → the flag that owns it. Inverted from FEATURE_TYPES once, at module
// load, so the two can never drift apart.
const TYPE_FLAG = Object.fromEntries(
  Object.entries(FEATURE_TYPES).flatMap(([flag, types]) => types.map((type) => [type, flag]))
);

/**
 * Is this notification's feature live? False for items whose flag is off, which
 * means the row must not be rendered at all. Apply to every notification list
 * before rendering it — visibleNotifs() does that for a whole array.
 */
export function isVisibleNotif(n) {
  const flag = TYPE_FLAG[n?.type];
  return !flag || FLAGS[flag] === true;
}

/**
 * Drop hidden-feature notifications from a freshly-fetched list. Callers that
 * render GET /users/me/notifications should pass `res.items` through this.
 */
export function visibleNotifs(items) {
  return (Array.isArray(items) ? items : []).filter(isVisibleNotif);
}

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
  session_rate_prompt: "⭐",
  project_update: "📣",
  booking_request: "📅",
  booking_confirmed: "✅",
  booking_declined: "🚫",
  removed_from_project: "🚪",
  message: "✉️",
  event_rsvp: "🎟️",
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
 * Human one-liner for a notification. This is a plain module (no React), so it
 * can't call a hook — the caller passes its `t` (from useT()) in. Strings live
 * in the "inbox" dict; {name}/{proj} are interpolated. Uses the REAL actor name
 * when we have one; when the actor is unknown it uses a neutral phrasing rather
 * than the bare word "Someone".
 */
export function notifText(n, t) {
  const name = actorName(n); // real name, or null
  const proj = n.project?.name || t("inbox.a_project");
  switch (n.type) {
    case "mutual":
      return name ? t("inbox.notif_mutual_named", { name }) : t("inbox.notif_mutual");
    case "interest":
      return name ? t("inbox.notif_interest_named", { name }) : t("inbox.notif_interest");
    case "intro":
      return name ? t("inbox.notif_intro_named", { name }) : t("inbox.notif_intro");
    case "new_follower":
      return name ? t("inbox.notif_follower_named", { name }) : t("inbox.notif_follower");
    case "application":
      return name ? t("inbox.notif_application_named", { name, proj }) : t("inbox.notif_application", { proj });
    case "accepted":
      return t("inbox.notif_accepted", { proj });
    case "declined":
      return t("inbox.notif_declined", { proj });
    case "rate_prompt":
      return t("inbox.notif_rate_prompt", { proj });
    case "project_update":
      return t("inbox.notif_project_update", { proj });
    case "removed_from_project":
      return t("inbox.notif_removed", { proj });
    case "booking_request":
      return name ? t("inbox.notif_booking_request_named", { name }) : t("inbox.notif_booking_request");
    case "booking_confirmed":
      return name ? t("inbox.notif_booking_confirmed_named", { name }) : t("inbox.notif_booking_confirmed");
    case "booking_declined":
      return name ? t("inbox.notif_booking_declined_named", { name }) : t("inbox.notif_booking_declined");
    case "message":
      return name ? t("inbox.notif_message_named", { name }) : t("inbox.notif_message");
    case "event_rsvp":
      return name ? t("inbox.notif_event_rsvp_named", { name }) : t("inbox.notif_event_rsvp");
    default:
      return name || t("inbox.notif_default");
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
  // A hidden-feature item has nowhere to go (the server still sends
  // link="/bookings", but that route 404s while FLAGS.MENTORING is false), so it
  // is never a link. visibleNotifs() should already have dropped it; this is the
  // backstop that guarantees no dead link if one is rendered anyway.
  if (!isVisibleNotif(n)) return null;
  // The desktop is basePath-hosted under /web; prefix every internal target
  // (both server-provided n.link and the derived fallbacks) once, here.
  const p = _notifTarget(n);
  return p ? `/web${p}` : null;
}

function _notifTarget(n) {
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
      return n.actor?.id ? `/u/${handleFor(n.actor.id)}` : null;
    case "message":
      // The exact thread comes from the server `link` (/messages?c={id}); this
      // fallback just opens the messenger.
      return "/messages";
    case "event_rsvp":
      return n.event_id ? `/events?e=${n.event_id}` : "/events";
    default:
      return n.actor?.id ? `/u/${handleFor(n.actor.id)}` : null;
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
