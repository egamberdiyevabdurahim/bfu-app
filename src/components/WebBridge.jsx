import { useState, useEffect, useCallback } from "react";
import { useT } from "../i18n";
import { haptic } from "../tg";

// ── Web bridge ────────────────────────────────────────────────────────────────
// A Mini App user on a tablet / laptop / PC has no idea the fuller desktop app
// exists. This is the one quiet pointer to it: a slim, dismissible bar that
// floats above the BottomNav, opens the web app in the system browser, and
// NEVER comes back once dismissed.
//
// It must never nag a phone user — see isBigScreen() for the exact gate.

const WEB_URL = "https://brightfuturesuzbekistan.uz/web";
const DISMISS_KEY = "bfu_web_bridge_dismissed"; // same bfu_* localStorage style as tokens/lang

// Telegram clients that are ALWAYS on a big screen. Note the Mini App webview on
// Telegram Desktop is a small (~420px) window, so a width check alone would miss
// every desktop user — the platform string is the reliable signal there.
// Reported by Telegram: android, android_x, ios, tdesktop, macos, weba, webk, web, unigram.
const BIG_PLATFORMS = new Set(["tdesktop", "macos", "web", "weba", "webk", "unigram"]);

const platform = () => window.Telegram?.WebApp?.platform || "";

// True only when a bigger screen would genuinely be a better experience.
// Two independent signals, OR'd — either alone is sufficient, and a phone trips
// NEITHER (so a phone user can never see the bar):
//   1. Telegram's platform is a desktop/web client (tdesktop / macos / web…).
//      "android" / "android_x" / "ios" never match, so they fall to signal 2.
//   2. The viewport is tablet-sized or larger. LONG side >= 900 AND SHORT side
//      >= 600 — the short-side floor is what excludes a phone held in landscape
//      (an iPhone Pro Max is 932x430, which clears a naive innerWidth >= 900),
//      while still including an Android tablet / iPad in either orientation.
function isBigScreen() {
  if (BIG_PLATFORMS.has(platform())) return true;
  const w = window.innerWidth || 0;
  const h = window.innerHeight || 0;
  return Math.max(w, h) >= 900 && Math.min(w, h) >= 600;
}

const readDismissed = () => {
  try { return localStorage.getItem(DISMISS_KEY) === "1"; } catch { return false; }
};
const writeDismissed = () => {
  try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* ignore */ }
};

// Hand the URL to the SYSTEM browser. A bare <a> would navigate the Mini App
// webview away from itself (killing the app); Telegram's openLink is the
// supported escape hatch, with window.open as the non-Telegram fallback.
function openWeb(url) {
  const w = window.Telegram?.WebApp;
  if (w && typeof w.openLink === "function") {
    try { w.openLink(url); return; } catch { /* fall through */ }
  }
  window.open(url, "_blank", "noopener");
}

// Strings live here, NOT in i18n.jsx (that file is owned elsewhere). Keyed by the
// lang from useT() so the bar follows the app's language switch. Fold into
// i18n.jsx later if preferred — three keys: webBridge.title / .cta / .dismiss.
const COPY = {
  en: {
    title: "On a bigger screen? BFU works on the web too.",
    cta: "Open on the web",
    dismiss: "Dismiss",
  },
  uz: {
    title: "Katta ekrandamisiz? BFU webda ham ishlaydi.",
    cta: "Webda ochish",
    dismiss: "Yopish",
  },
  ru: {
    title: "На большом экране? BFU работает и в вебе.",
    cta: "Открыть в вебе",
    dismiss: "Закрыть",
  },
};

export const WebBridge = () => {
  const { lang } = useT();
  const [big, setBig] = useState(isBigScreen);
  const [dismissed, setDismissed] = useState(readDismissed);

  // Telegram Desktop windows resize, and tablets rotate — re-evaluate the gate.
  useEffect(() => {
    const onResize = () => setBig(isBigScreen());
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);

  const dismiss = useCallback(() => {
    writeDismissed();
    setDismissed(true);
  }, []);

  const open = useCallback(() => {
    haptic();
    openWeb(WEB_URL);
    // They now know the web app exists — the bar has done its job. Persist the
    // dismissal so returning to the Mini App never shows it again.
    dismiss();
  }, [dismiss]);

  if (!big || dismissed) return null;

  const c = COPY[lang] || COPY.en;

  return (
    // Fixed wrapper is pointer-events:none and carries the BottomNav's height as
    // padding, so even if that height ever changes the nav stays fully tappable
    // and the bar can only ever float above it.
    <div
      style={{
        position: "fixed", left: "50%", bottom: 0, transform: "translateX(-50%)",
        width: "100%", maxWidth: 430,
        paddingBottom: "calc(72px + var(--safe-b))",
        zIndex: 99, pointerEvents: "none",
      }}
    >
      <div
        role="region"
        style={{
          pointerEvents: "auto",
          margin: "0 12px",
          display: "flex", alignItems: "center", gap: 10,
          padding: "9px 10px 9px 14px",
          borderRadius: "var(--radius-sm)",
          border: "1px solid var(--hair)",
          background: "rgba(26,24,21,0.94)",
          backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)",
          boxShadow: "0 10px 30px rgba(0,0,0,0.42)",
          animation: "fadeUp 0.4s ease",
        }}
      >
        <span aria-hidden style={{ fontSize: 15, color: "var(--amber)", lineHeight: 1, flexShrink: 0 }}>⌘</span>
        <div
          style={{
            flex: 1, minWidth: 0,
            fontFamily: "var(--font-body)", fontSize: 12.5, lineHeight: 1.35,
            color: "var(--text-2)",
          }}
        >
          {c.title}
        </div>
        <button
          type="button"
          onClick={open}
          style={{
            flexShrink: 0, minHeight: 32,
            padding: "7px 13px",
            borderRadius: "var(--radius-pill)",
            border: "none", cursor: "pointer",
            background: "linear-gradient(135deg, var(--amber), var(--terra))",
            color: "#160E08",
            fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 12,
            whiteSpace: "nowrap",
          }}
        >
          {c.cta}
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label={c.dismiss}
          title={c.dismiss}
          style={{
            flexShrink: 0,
            width: 28, minHeight: 28, height: 28,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "none", border: "none", cursor: "pointer",
            color: "var(--text-3)", fontSize: 15, lineHeight: 1,
          }}
        >
          ✕
        </button>
      </div>
    </div>
  );
};
