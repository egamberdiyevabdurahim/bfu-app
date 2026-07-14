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
};

export default FLAGS;
