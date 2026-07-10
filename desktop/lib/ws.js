// Real-time socket client (desktop side).
//
// ONE shared WebSocket to the backend hub (backend/app/routers/ws.py), kept
// alive while any component is subscribed. The desktop's access token lives in
// an httpOnly cookie the browser JS can't read, so — unlike the Mini App — we
// can't put the token in the first frame directly. Instead we fetch a
// short-lived WS ticket through the authed BFF proxy (GET /ws-ticket, which also
// hands back the absolute wss:// url) and send THAT as the auth token. The BFF
// proxy transparently refreshes the cookie on 401, so a fresh ticket per connect
// naturally rides token rotation.
//
// Best-effort: HTTP polling stays the source of truth, so a dropped socket only
// means falling back to (slower) polling — never data loss.
//
//   import { subscribe, sendTyping, isConnected } from "@/lib/ws";
import { bfu } from "./client-api";

const FALLBACK_WS_URL = "wss://bfu-backend-production.up.railway.app/ws";
const PING_MS = 25000;
const TYPING_THROTTLE_MS = 2000;
const MAX_BACKOFF_MS = 30000;

let ws = null;
let connecting = false;          // guards the async ticket-fetch window
let ready = false;               // server sent {type:"ready"}
let backoff = 1000;
let reconnectTimer = 0;
let pingTimer = 0;
let stableTimer = 0;             // resets backoff only after a connection SURVIVES a while
let lastTypingAt = 0;
let closingForGood = false;

const TICKET_TIMEOUT_MS = 10000; // bound the ticket fetch so a hung request can't wedge reconnect

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

async function open() {
  if (closingForGood || subscribers.size === 0) return;
  if (connecting) return;
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
  connecting = true;

  let ticket, wsUrl;
  try {
    // Bound the fetch: bfu() is a bare fetch() with no timeout, so a black-holed
    // request would otherwise leave `connecting` true forever and permanently
    // wedge reconnect. The race guarantees this await always settles.
    const r = await Promise.race([
      bfu("/ws-ticket"),
      new Promise((_, reject) => setTimeout(() => reject(new Error("ws-ticket timeout")), TICKET_TIMEOUT_MS)),
    ]);
    ticket = r?.ticket;
    wsUrl = r?.ws_url;
  } catch {
    connecting = false;
    scheduleReconnect();
    return;
  }
  // A subscriber may have left while we awaited the ticket.
  if (closingForGood || subscribers.size === 0) { connecting = false; return; }
  if (!ticket) { connecting = false; scheduleReconnect(); return; }
  if (!/^wss?:\/\//i.test(wsUrl || "")) {
    // A relative "/ws" means the backend didn't know its own absolute host
    // (local dev, no RAILWAY_PUBLIC_DOMAIN). Dial localhost in dev, else the
    // known prod host — never present a locally-minted ticket to prod.
    const host = typeof location !== "undefined" ? location.hostname : "";
    wsUrl = (host === "localhost" || host === "127.0.0.1") ? "ws://localhost:8000/ws" : FALLBACK_WS_URL;
  }

  let sock;
  try { sock = new WebSocket(wsUrl); }
  catch { connecting = false; scheduleReconnect(); return; }
  ws = sock;
  connecting = false;
  ready = false;

  sock.onopen = () => {
    // First frame MUST be the auth ticket (see ws.py).
    try { sock.send(JSON.stringify({ type: "auth", token: ticket })); }
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
    notify(msg); // message.new, typing, …
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
