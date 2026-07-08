// The pure translation core, usable from BOTH server and client (no React / Next
// imports). Given a language it resolves a dotted key against the catalog with a
// safe fallback chain and interpolates {placeholder} variables.

import { DICT } from "./dict";
import { BASE_LANG } from "./config";

// Replace {name}-style placeholders with values from `vars`. An unmatched
// placeholder is left as-is (visible, so a missing var is obvious in review).
function interpolate(str, vars) {
  if (!vars || typeof str !== "string" || str.indexOf("{") === -1) return str;
  return str.replace(/\{(\w+)\}/g, (m, k) =>
    vars[k] === undefined || vars[k] === null ? m : String(vars[k])
  );
}

/**
 * Resolve `key` for `lang`. Fallback chain: chosen lang → base (en) → the key
 * itself. Never throws — a bad key just renders as the key text, which surfaces
 * gaps loudly instead of blowing up the page.
 */
export function translate(lang, key, vars) {
  const table = DICT[lang] || null;
  let s = table ? table[key] : undefined;
  if (s === undefined) {
    const base = DICT[BASE_LANG] || {};
    s = base[key];
  }
  if (s === undefined) s = key;
  return interpolate(s, vars);
}

/** Bind a `t(key, vars)` function to a single language. */
export function makeT(lang) {
  return (key, vars) => translate(lang, key, vars);
}
