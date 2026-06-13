// Thin helpers around the Telegram WebApp SDK with browser fallbacks.
const wa = () => window.Telegram?.WebApp;

function syncViewport() {
  const w = wa();
  if (!w) return;
  const h = w.viewportStableHeight || w.viewportHeight;
  if (h && h > 100) {
    document.documentElement.style.setProperty("--app-h", `${h}px`);
  }
}

export function initTelegram() {
  const w = wa();
  if (!w) return;
  try {
    w.ready();
    w.expand();
    if (typeof w.disableVerticalSwipes === "function") w.disableVerticalSwipes();
    if (typeof w.setHeaderColor === "function") w.setHeaderColor("#0A0A0F");
    if (typeof w.setBackgroundColor === "function") w.setBackgroundColor("#0A0A0F");
    syncViewport();
    if (typeof w.onEvent === "function") {
      w.onEvent("viewportChanged", syncViewport);
    }
  } catch { /* older SDKs */ }
}

// Build a Telegram chat URL that works even without a @username.
// tg://openmessage?user_id= opens the chat directly — but ONLY on the
// Android client; iOS and Desktop silently ignore the scheme, so we only
// emit it there. (tg://user?id= is worse: it fails everywhere unless the
// target is already known to the clicker's client.)
export function tgChatUrl(user) {
  if (user?.tg_username) return `https://t.me/${user.tg_username}`;
  const platform = wa()?.platform;
  if (user?.telegram_id && platform === "android") {
    return `tg://openmessage?user_id=${user.telegram_id}`;
  }
  return null;
}

// Open a chat link safely from inside the Mini App webview.
// Custom tg:// schemes must be navigated via location.href — window.open /
// target=_blank on a custom scheme is unreliable in the iOS WKWebView.
export function openChat(user) {
  const url = tgChatUrl(user);
  if (!url) return false;
  if (url.startsWith("tg://")) {
    window.location.href = url;
    return true;
  }
  const w = wa();
  if (w && typeof w.openTelegramLink === "function") {
    try { w.openTelegramLink(url); return true; } catch { /* fall through */ }
  }
  window.open(url, "_blank", "noopener");
  return true;
}

export function tgAlert(message) {
  const w = wa();
  if (w && typeof w.showAlert === "function") {
    try { w.showAlert(String(message)); return; } catch { /* fall through */ }
  }
  window.alert(message);
}

// Promise<boolean>
export function tgConfirm(message) {
  const w = wa();
  if (w && typeof w.showConfirm === "function") {
    return new Promise((resolve) => {
      try { w.showConfirm(String(message), (ok) => resolve(!!ok)); }
      catch { resolve(window.confirm(message)); }
    });
  }
  return Promise.resolve(window.confirm(message));
}

export function getStartParam() {
  const w = wa();
  return (
    w?.initDataUnsafe?.start_param ||
    new URLSearchParams(window.location.search).get("startapp") ||
    new URLSearchParams(window.location.search).get("tgWebAppStartParam") ||
    null
  );
}

export function shareUrl(url, text = "") {
  const w = wa();
  const share = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
  if (w && typeof w.openTelegramLink === "function") {
    try { w.openTelegramLink(share); return; } catch { /* fall through */ }
  }
  window.open(share, "_blank");
}

export function haptic(kind = "impact") {
  const h = wa()?.HapticFeedback;
  try {
    if (kind === "impact") h?.impactOccurred?.("medium");
    else h?.notificationOccurred?.(kind);
  } catch { /* noop */ }
}
