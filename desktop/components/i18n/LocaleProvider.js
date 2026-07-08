"use client";

import { createContext, useContext, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  LANG_COOKIE,
  LANG_MAX_AGE,
  DEFAULT_LANG,
  normalizeLang,
} from "@/lib/i18n/config";
import { makeT } from "@/lib/i18n/translate";

// The client half of i18n. The server resolves the language from the cookie and
// passes it down as `lang`, so the very first client render matches the server
// render (no hydration mismatch). Switching writes the cookie and calls
// router.refresh(), which re-runs the server components with the new cookie —
// so BOTH server- and client-rendered text change, with no full page reload.

const LocaleContext = createContext({
  lang: DEFAULT_LANG,
  setLang: () => {},
  t: (key) => key,
});

export function LocaleProvider({ lang, children }) {
  const router = useRouter();
  const safeLang = normalizeLang(lang);

  const setLang = useCallback(
    (next) => {
      const nl = normalizeLang(next);
      // path=/ so every route sees it; lax so it survives normal navigation.
      document.cookie = `${LANG_COOKIE}=${nl}; path=/; max-age=${LANG_MAX_AGE}; samesite=lax`;
      router.refresh();
    },
    [router]
  );

  const value = useMemo(
    () => ({ lang: safeLang, setLang, t: makeT(safeLang) }),
    [safeLang, setLang]
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  return useContext(LocaleContext);
}

// The common case: just the translate function.
export function useT() {
  return useContext(LocaleContext).t;
}

// For the switcher and anything that needs the current code + setter.
export function useLang() {
  const { lang, setLang } = useContext(LocaleContext);
  return { lang, setLang };
}
