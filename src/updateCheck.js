// ── Detects a new deploy while the Mini App is open ──────────────────────────
// Telegram's webview caches the app hard, so a builder can sit on a stale build
// for a whole session. We compare the hashed main-bundle filename in the LIVE
// index.html against the one currently running; on a mismatch we fire
// `bfu:update-available` and App shows a "reload" banner.

const BUNDLE_RE = /\/assets\/index-[A-Za-z0-9_-]+\.js/;
let CURRENT = null;

function runningBundle() {
  try {
    for (const el of document.querySelectorAll("script[src]")) {
      const m = (el.getAttribute("src") || "").match(BUNDLE_RE);
      if (m) return m[0];
    }
  } catch { /* ignore */ }
  return null;
}

async function check() {
  try {
    const res = await fetch(`/?_=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return;
    const html = await res.text();
    const m = html.match(BUNDLE_RE);
    const latest = m ? m[0] : null;
    if (latest && CURRENT && latest !== CURRENT) {
      window.dispatchEvent(new CustomEvent("bfu:update-available"));
    }
  } catch { /* offline / transient — ignore */ }
}

export function startUpdateCheck() {
  CURRENT = runningBundle();
  if (!CURRENT) return () => {};        // dev server / can't detect — no-op
  const id = setInterval(check, 90000); // every 90s
  const onVis = () => { if (!document.hidden) check(); };
  window.addEventListener("focus", check);
  document.addEventListener("visibilitychange", onVis);
  return () => {
    clearInterval(id);
    window.removeEventListener("focus", check);
    document.removeEventListener("visibilitychange", onVis);
  };
}
