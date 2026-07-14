/**
 * V1 launch scope.
 *
 * BFU's core is one sentence: "find people and build projects in your city."
 * Everything below is fully BUILT, TESTED and still on the server — it's hidden
 * only so a first-time user sees one clear product instead of nine half-empty
 * ones. Nothing is deleted: the backend endpoints, the DB columns and the data
 * all remain. To bring a feature back, flip its flag to `true` and redeploy.
 *
 * Keep this file in sync with desktop/lib/flags.js (the desktop app's copy).
 */
export const FLAGS = {
  // Mentors, mentor slots, bookings / "Sessions". Reads as an education
  // marketplace — a different product from "build with your peers".
  MENTORING: false,

  // Partner organisations (org accounts + their opportunities).
  PARTNERS: false,

  // Saved / favourited projects (the data still accrues, it's just not surfaced).
  SAVED: false,

  // The Connections list page/cell.
  CONNECTIONS: false,

  // Social proof: endorse, vouch, rate + the achievement badges. Gamification
  // needs a community to be about; with a young user base these render empty.
  TRUST: false,

  // AI assists on someone else's profile: "Why you match", "Break the ice",
  // "Translate bio". Clever, but they crowd the one action that matters (Message).
  AI_ASSIST: false,

  // "I'm interested" + "Request intro" — a second, parallel way to reach someone
  // on top of Follow/Message. Two ways to say hello is one too many for V1.
  INTEREST_INTRO: false,

  // Privacy preferences (who-can-DM-me, incognito profile views). Sensible
  // defaults ship already; the settings screen doesn't need to explain them yet.
  PRIVACY_PREFS: false,

  // Per-category notification preferences.
  // ⚠️ RISK: with this off, a user who finds the bot noisy has no in-app way to
  // turn it down — their only lever is to BLOCK the bot, which sets can_message
  // false permanently (see Telegram reachability). If bot notifications ever feel
  // heavy, turn this back on before people start blocking.
  NOTIF_PREFS: false,

  // CV / resume PDF export.
  CV_EXPORT: false,
};

export default FLAGS;
