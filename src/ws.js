/**
 * Real-time socket client (Mini App side).
 *
 * ONE shared WebSocket to the backend hub (backend/app/routers/ws.py), kept
 * alive while any screen is subscribed. Vercel rewrites can't tunnel a
 * long-lived socket, so we dial Railway DIRECTLY via VITE_WS_URL (the HTTP API
 * still goes same-origin through the rewrites).
 *
 * The Mini App can read its own access JWT (localStorage), so auth is the first
 * frame: `{type:"auth", token}` — no ticket round-trip (that's the desktop's
 * problem, whose token is an httpOnly cookie).
 *
 * Contract for consumers:
 *   const off = subscribe(msg => { ... });   // msg = {type, ...} from server
 *   off();                                    // unsubscribe (closes socket when last leaves)
 *   sendTyping(conversationId);               // throttled typing ping
 *   isConnected();                            // true once the server said "ready"
 *
 * The socket is BEST-EFFORT: HTTP polling remains the source of truth, so a
 * dropped socket only means we fall back to (slower) polling, never data loss.
 */
import { storage } from "./api";

const WS_URL =
  import.meta.env.VITE_WS_URL ||
  (import.meta.env.DEV ? "ws://localhost:8000/ws" : "wss://bfu-backend-production.up.railway.app/ws");

const PING_MS = 25000;          // keep-alive so idle proxies don't cut us
const TYPING_THROTTLE_MS = 2000; // client-side (server also caps ~2.5s)
const MAX_BACKOFF_MS = 30000;

let ws = null;
let ready = false;               // server sent {type:"ready"}
let backoff = 1000;
let reconnectTimer = 0;
let pingTimer = 0;
let stableTimer = 0;             // resets backoff only after a connection SURVIVES a while
let lastTypingAt = 0;
let closingForGood = false;

const subscribers = new Set();

const notify = (msg) => {
  for (const fn of subscribers) {
    try { fn(msg); } catch { /* a bad handler must not kill the socket */ }
  }
};

const clearTimers = () => {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = 0; }
  if (pingTimer) { clearInterval(pingTimer); pingTimer = 0; }
  if (stableTimer) { clearTimeout(stableTimer); stableTimer = 0; }
};

function scheduleReconnect() {
  if (closingForGood || subscribers.size === 0 || reconnectTimer) return;
  const delay = Math.min(backoff, MAX_BACKOFF_MS) * (0.75 + Math.random() * 0.5); // jitter
  reconnectTimer = setTimeout(() => {
    reconnectTimer = 0;
    backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
    open();
  }, delay);
}

function open() {
  if (closingForGood || subscribers.size === 0) return;
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

  const token = storage.getAccess();
  if (!token) { scheduleReconnect(); return; } // not signed in yet — try again later

  let sock;
  try { sock = new WebSocket(WS_URL); }
  catch { scheduleReconnect(); return; }
  ws = sock;
  ready = false;

  sock.onopen = () => {
    // First frame MUST be auth (see ws.py). Re-read the token at send time in
    // case it was refreshed between construction and open.
    try { sock.send(JSON.stringify({ type: "auth", token: storage.getAccess() || token })); }
    catch { /* onclose will handle */ }
  };

  sock.onmessage = (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "ready") {
      ready = true;
      // Only reset the backoff once the connection has SURVIVED a stable window —
      // a server that accepts+ready's then drops immediately must still back off.
      if (stableTimer) clearTimeout(stableTimer);
      stableTimer = setTimeout(() => { backoff = 1000; stableTimer = 0; }, 8000);
      notify({ type: "ws.ready" });
      return;
    }
    if (msg.type === "pong") return;
    notify(msg);                  // message.new, typing, …
  };

  sock.onclose = () => {
    ready = false;
    if (ws === sock) ws = null;
    if (pingTimer) { clearInterval(pingTimer); pingTimer = 0; }
    if (stableTimer) { clearTimeout(stableTimer); stableTimer = 0; } // died before stable → keep backoff growing
    notify({ type: "ws.closed" });
    scheduleReconnect();
  };

  sock.onerror = () => { try { sock.close(); } catch { /* ignore */ } };

  // Keep-alive ping loop (independent of ready — cheap no-op if not open yet).
  if (pingTimer) clearInterval(pingTimer);
  pingTimer = setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      try { ws.send(JSON.stringify({ type: "ping" })); } catch { /* ignore */ }
    }
  }, PING_MS);
}

/** Subscribe to server frames. Opens the shared socket on first subscriber,
 *  closes it when the last one leaves. Returns an unsubscribe fn. */
export function subscribe(fn) {
  subscribers.add(fn);
  if (subscribers.size === 1) {
    closingForGood = false;
    backoff = 1000;
    open();
  }
  return () => {
    subscribers.delete(fn);
    if (subscribers.size === 0) {
      closingForGood = true;
      clearTimers();
      ready = false;
      const sock = ws; ws = null;
      if (sock) { try { sock.close(); } catch { /* ignore */ } }
    }
  };
}

/** Throttled typing ping for a conversation (no-op if the socket isn't ready). */
export function sendTyping(conversationId) {
  if (!ready || !ws || ws.readyState !== WebSocket.OPEN) return;
  if (typeof conversationId !== "number") return;
  const now = Date.now();
  if (now - lastTypingAt < TYPING_THROTTLE_MS) return;
  lastTypingAt = now;
  try { ws.send(JSON.stringify({ type: "typing", conversation_id: conversationId })); }
  catch { /* ignore */ }
}

export const isConnected = () => ready;
