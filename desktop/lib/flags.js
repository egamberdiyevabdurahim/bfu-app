/**
 * V1 launch scope. (Desktop copy — keep in sync with src/flags.js.)
 *
 * BFU's core is one sentence: "find people and build projects in your city."
 * Everything below is fully BUILT, TESTED and still on the server — it's hidden
 * only so a first-time user sees one clear product instead of nine half-empty
 * ones. Nothing is deleted: the backend endpoints, the DB columns and the data
 * all remain. To bring a feature back, flip its flag to `true` and redeploy.
 *
 * Gating rules:
 *   - nav rows: filter them out of navConfig / the command palette
 *   - whole pages: call notFound() at the top of the page component, so the
 *     route can't be reached by typing the URL either
 *   - embedded UI (a badge on a card, a button on a profile): plain `&&` guards
 */
export const FLAGS = {
  // Mentors, mentor slots, bookings / "Sessions". Reads as an education
  // marketplace — a different product from "build with your peers".
  MENTORING: false,

  // Partner organisations (org accounts + their opportunities).
  PARTNERS: false,

  // Saved / favourited projects (the data still accrues, it's just not surfaced).
  SAVED: false,

  // The Connections list page.
  CONNECTIONS: false,

  // Social proof: endorse, vouch, rate + the achievement badges. Gamification
  // needs a community to be about; with a young user base these render empty.
  TRUST: false,
};

export default FLAGS;
