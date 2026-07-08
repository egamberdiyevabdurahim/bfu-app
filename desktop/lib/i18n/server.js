import "server-only";
import { cookies } from "next/headers";
import { LANG_COOKIE, normalizeLang } from "./config";
import { makeT } from "./translate";

// Server-side language resolution. Reads the `bfu_lang` cookie (set by the
// client switcher) so server components render in the chosen language. In
// Next 15+/16 cookies() is async, hence the await.
export async function getServerLang() {
  const store = await cookies();
  return normalizeLang(store.get(LANG_COOKIE)?.value);
}

// Convenience for server components/pages: returns { lang, t } in one call.
//   const { t } = await getT();
//   <h1>{t("home.welcome_prefix")}</h1>
export async function getT() {
  const lang = await getServerLang();
  return { lang, t: makeT(lang) };
}
