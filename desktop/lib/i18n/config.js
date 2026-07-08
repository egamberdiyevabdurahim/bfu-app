// Language configuration shared by the server and client halves of the i18n
// system. No React / Next imports here so it is safe to import from anywhere
// (server components, client components, route handlers, middleware).

// Supported UI languages, in switcher order. Uzbek (Latin) is primary — the
// audience is Uzbekistan — with Russian and English alongside.
export const LANGS = ["uz", "ru", "en"];

// The default when no cookie is set. English DURING the i18n rollout so an
// un-switched visitor always sees a fully coherent app (no half-translated
// surfaces). Flip to "uz" once member-facing coverage is reviewed — a one-line
// change; the audience is Uzbekistan so that is the intended end state.
export const DEFAULT_LANG = "en";

// The base authoring language: every key is written in `en` first and the
// translation fallback chain ends here (see translate.js). Missing uz/ru keys
// therefore degrade to English rather than to a raw key.
export const BASE_LANG = "en";

// Cookie the chosen language is stored in. NON-httpOnly on purpose: the client
// switcher writes it and the server reads it via next/headers on the next
// render, so both halves agree without a round-trip.
export const LANG_COOKIE = "bfu_lang";

// One year, in seconds — the language is a durable preference.
export const LANG_MAX_AGE = 60 * 60 * 24 * 365;

// Native names (shown in the switcher menu) and short codes (shown on the pill).
export const LANG_LABELS = { uz: "O‘zbekcha", ru: "Русский", en: "English" };
export const LANG_SHORT = { uz: "UZ", ru: "RU", en: "EN" };

// Coerce any value to a supported language, falling back to the default.
export function normalizeLang(value) {
  return LANGS.includes(value) ? value : DEFAULT_LANG;
}
