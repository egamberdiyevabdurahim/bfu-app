import { useState, useEffect, useRef, useCallback, Fragment } from "react";
import { messages as msgApi } from "../api";
import { subscribe as wsSubscribe, sendTyping as wsSendTyping } from "../ws";
import { Icon } from "./Icons";
import { useT } from "../i18n";
import { relTime, fmtDay } from "../timefmt";

// ── Mobile in-app Messenger (1:1 DMs + project team chats) ────────────────────
// Full-screen overlay port of the desktop Messenger (desktop/components/messages/
// Messenger.js). Single column: conversation LIST ↔ THREAD (back arrow). Polls
// the list every ~15s and the open thread every ~6s (both paused when hidden).
// Backend app/routers/messages.py via api.messages (see src/api.js).

const LIST_POLL_MS = 15000;
const THREAD_POLL_MS = 6000;
// When the realtime socket is connected, new messages arrive by push — so the
// thread poll relaxes to a slow safety-net sweep instead of hammering every 6s.
const THREAD_POLL_SLOW_MS = 30000;
const MAX_BODY = 4000;

const CARD_GRADIENTS = [
  "linear-gradient(135deg, #FF6A3D, #C0563B)",
  "linear-gradient(135deg, #E8A15C, #C0563B)",
  "linear-gradient(135deg, #5EC5B6, #12564F)",
  "linear-gradient(135deg, #7FB069, #12564F)",
  "linear-gradient(135deg, #E8A15C, #FF6A3D)",
];
const gradientFor = (id) => CARD_GRADIENTS[Math.abs(Number(id) || 0) % CARD_GRADIENTS.length];
const initialsOf = (name) =>
  ((name || "?").trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?");

// relTime + fmtDay now come from ../timefmt (Asia/Tashkent, UTC-safe).

const convTitle = (c, t) =>
  c.kind === "project"
    ? (c.project?.name || t("msg.teamChat"))
    : (c.other?.display_name || t("msg.conversation"));

// Round avatar (photo or gradient + initials) / project glyph.
const Av = ({ id, name, photoUrl, size = 46, project }) =>
  project ? (
    <div aria-hidden style={{
      width: size, height: size, borderRadius: 13, flex: "0 0 auto",
      background: "linear-gradient(140deg, rgba(94,197,182,0.22), rgba(18,86,79,0.35))",
      border: "1px solid rgba(94,197,182,0.3)", display: "flex", alignItems: "center",
      justifyContent: "center", color: "var(--teal-bright)", fontSize: size * 0.42,
    }}>◆</div>
  ) : (
    <div style={{
      width: size, height: size, borderRadius: "50%", flex: "0 0 auto", background: gradientFor(id),
      display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
      fontFamily: "var(--font-display)", fontWeight: 700, fontSize: size * 0.38, color: "#160E08",
    }}>
      {photoUrl ? <img src={photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initialsOf(name)}
    </div>
  );

export const MessagesScreen = ({ meId, initialConversationId = null, onClose }) => {
  const { t } = useT();

  const [conversations, setConversations] = useState(null); // null=loading
  const [listState, setListState] = useState("loading");    // loading|ready|error
  const [activeId, setActiveId] = useState(initialConversationId);

  const [messages, setMessages] = useState([]);
  const [threadMembers, setThreadMembers] = useState(null); // {kind, members, started_at}
  const [threadState, setThreadState] = useState("idle");   // idle|loading|ready|error
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [blockedLocal, setBlockedLocal] = useState(false);
  const [toast, setToast] = useState(null);                 // {text,tone}
  const [actionMsg, setActionMsg] = useState(null);         // message tapped → action sheet
  const [replyingTo, setReplyingTo] = useState(null);       // message being replied to
  const [editing, setEditing] = useState(null);             // message being edited
  const [peerTyping, setPeerTyping] = useState(null);       // {name} while the other side types
  const [wsLive, setWsLive] = useState(false);              // realtime socket connected

  const bodyRef = useRef(null);
  const composerRef = useRef(null);
  const toastTimer = useRef(0);
  const typingTimer = useRef(0);
  // Live refs so the (once-registered) WS handler always sees current values
  // without re-subscribing on every activeId/message change.
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;

  const active = Array.isArray(conversations)
    ? conversations.find((c) => c.id === activeId) || null
    : null;

  const flash = (text, tone = "ok") => {
    setToast({ text, tone });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  };
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  // Drive Telegram's native header BackButton: back = thread→list, else close.
  // (Keeps the in-UI ‹ arrow too for clarity.) Re-registers as activeId changes;
  // hides on unmount so it doesn't leak to the screen underneath.
  useEffect(() => {
    const bb = window.Telegram?.WebApp?.BackButton;
    if (!bb) return;
    bb.show();
    const handler = () => { if (activeId) backToList(); else onClose?.(); };
    bb.onClick(handler);
    return () => { try { bb.offClick(handler); } catch { /* older TG */ } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);
  useEffect(() => {
    const bb = window.Telegram?.WebApp?.BackButton;
    return () => { try { bb?.hide(); } catch { /* older TG */ } };
  }, []);

  // ── Conversation list (mount + poll) ────────────────────────────────────────
  const loadList = useCallback(async () => {
    try {
      const r = await msgApi.conversations();
      setConversations(Array.isArray(r) ? r : []);
      setListState("ready");
    } catch {
      setListState((s) => (s === "ready" ? "ready" : "error"));
    }
  }, []);

  // Coalesce list refreshes: a busy chat pushes many message.new frames, and a
  // per-frame loadList() (an ~8-query endpoint) would negate the point of push.
  const listRefreshTimer = useRef(0);
  const scheduleListRefresh = useCallback(() => {
    clearTimeout(listRefreshTimer.current);
    listRefreshTimer.current = setTimeout(() => loadList(), 1200);
  }, [loadList]);
  useEffect(() => () => clearTimeout(listRefreshTimer.current), []);

  useEffect(() => {
    loadList();
    let timer = null;
    const start = () => { stop(); timer = window.setInterval(loadList, LIST_POLL_MS); };
    const stop = () => { if (timer) window.clearInterval(timer); timer = null; };
    const onVis = () => { if (document.hidden) stop(); else { loadList(); start(); } };
    start();
    document.addEventListener("visibilitychange", onVis);
    return () => { stop(); document.removeEventListener("visibilitychange", onVis); };
  }, [loadList]);

  // ── Thread (load + mark read + poll) ────────────────────────────────────────
  // The silent 6s poll must NOT clobber paginated history: on a poll we APPEND
  // only genuinely-new messages (by id) and leave hasMore/scroll alone, so
  // "Load earlier" pages survive. markRead + the list/badge refresh only fire
  // when the newest message id actually changes (not on every idle poll).
  const lastMarkedId = useRef(null);
  const loadThread = useCallback(async (id, { silent } = {}) => {
    if (!id) return;
    if (!silent) setThreadState("loading");
    try {
      const r = await msgApi.thread(id, { limit: 30 });
      const incoming = Array.isArray(r?.messages) ? r.messages : [];
      if (silent) {
        // Merge, don't clobber (mirrors the desktop): update existing rows in
        // place so peers' edits/deletes propagate, keep paginated-in history,
        // and append genuinely-new messages. A >30-message burst has no overlap
        // with what we hold, so full-replace to stay contiguous (else a
        // blind append leaves a permanent hole).
        const cur = messagesRef.current;
        const curMax = cur.reduce((mx, m) => (m.id > mx ? m.id : mx), 0);
        const oldestIncoming = incoming.length ? incoming[0].id : Infinity;
        if (!cur.length || (incoming.length && oldestIncoming > curMax)) {
          setMessages(incoming);
          setHasMore(!!r?.has_more);
        } else {
          const incMap = new Map(incoming.map((m) => [m.id, m]));
          const seen = new Set(cur.map((m) => m.id));
          const merged = cur.map((m) => {
            const inc = incMap.get(m.id);
            if (!inc) return m;
            if (m.deleted && !inc.deleted) return m; // don't resurrect a locally-deleted row
            return { ...m, ...inc };
          });
          for (const m of incoming) if (!seen.has(m.id)) merged.push(m);
          setMessages(merged);
        }
      } else {
        setMessages(incoming);
        setHasMore(!!r?.has_more);
      }
      setThreadState("ready");
      const newestId = incoming.length ? incoming[incoming.length - 1].id : null;
      if (newestId != null && newestId !== lastMarkedId.current) {
        lastMarkedId.current = newestId;
        msgApi.markRead(id).then(() => {
          loadList();
          window.dispatchEvent(new CustomEvent("bfu:messages-read"));
        }).catch(() => {});
      }
    } catch {
      if (!silent) setThreadState("error");
    }
  }, [loadList]);

  // Open a thread: reset state, fetch membership, load the first page.
  useEffect(() => {
    if (!activeId) return;
    setBlockedLocal(false); setMenuOpen(false); setShowReport(false);
    setPeerTyping(null);
    lastMarkedId.current = null;
    atBottomRef.current = true; // freshly opened thread starts pinned to newest
    lastCount.current = 0;      // force the autoscroll effect to fire on open
    setThreadMembers(null);
    msgApi.members(activeId).then((r) => {
      setThreadMembers(r);
      if (r?.kind === "dm") setBlockedLocal(!!r.blocked); // rehydrate block state
    }).catch(() => setThreadMembers(null));
    loadThread(activeId);
  }, [activeId, loadThread]);

  // Safety-net poll for the open thread. Relaxes to a slow sweep when the
  // realtime socket is live (new messages then arrive by push), and reverts to
  // the fast poll if the socket drops. Paused while the tab is hidden.
  useEffect(() => {
    if (!activeId) return;
    const period = wsLive ? THREAD_POLL_SLOW_MS : THREAD_POLL_MS;
    let timer = null;
    const start = () => { stop(); timer = window.setInterval(() => loadThread(activeId, { silent: true }), period); };
    const stop = () => { if (timer) window.clearInterval(timer); timer = null; };
    const onVis = () => { if (document.hidden) stop(); else { loadThread(activeId, { silent: true }); start(); } };
    start();
    document.addEventListener("visibilitychange", onVis);
    return () => { stop(); document.removeEventListener("visibilitychange", onVis); };
  }, [activeId, wsLive, loadThread]);

  // ── Realtime socket (one subscription for the whole screen) ─────────────────
  // Injects pushed messages into the open thread + refreshes the list live, and
  // surfaces the other side's typing indicator. Registered once; reads the
  // current conversation via activeIdRef so it never needs to re-subscribe.
  useEffect(() => {
    const off = wsSubscribe((msg) => {
      if (msg.type === "ws.ready") { setWsLive(true); return; }
      if (msg.type === "ws.closed") { setWsLive(false); return; }
      if (msg.type === "message.new") {
        const cid = msg.conversation_id;
        const m = msg.message;
        if (!m || m.id == null) return;
        if (cid === activeIdRef.current) {
          setMessages((cur) => (cur.some((x) => x.id === m.id) ? cur : [...cur, m]));
          setPeerTyping(null);
          if (m.sender_id !== meId && m.id !== lastMarkedId.current) {
            lastMarkedId.current = m.id;
            msgApi.markRead(cid).then(() => {
              scheduleListRefresh();
              window.dispatchEvent(new CustomEvent("bfu:messages-read"));
            }).catch(() => {});
          }
        }
        scheduleListRefresh(); // keep previews / unread badges fresh (debounced)
        return;
      }
      if (msg.type === "read") {
        // Someone read the thread → bump their last_read_at so my ✓ flips to ✓✓
        // live (receipts derive from threadMembers' last_read_at).
        if (msg.conversation_id === activeIdRef.current) {
          setThreadMembers((tm) => {
            if (!tm || !Array.isArray(tm.members)) return tm;
            return { ...tm, members: tm.members.map((m) =>
              m.id === msg.user_id ? { ...m, last_read_at: msg.last_read_at } : m) };
          });
        }
        return;
      }
      if (msg.type === "typing") {
        if (msg.conversation_id === activeIdRef.current && msg.user_id !== meId) {
          setPeerTyping(msg.sender_name || "");
          clearTimeout(typingTimer.current);
          typingTimer.current = setTimeout(() => setPeerTyping(null), 5000);
        }
        return;
      }
    });
    return () => { off(); clearTimeout(typingTimer.current); };
  }, [meId, scheduleListRefresh]);

  // Autoscroll to newest when the count grows — but ONLY if the user is already
  // near the bottom, so a pushed/polled message doesn't yank them away from
  // history they've scrolled up to read (matches the desktop). atBottomRef is
  // kept fresh by the body's onScroll and reset true on open / self-send.
  const messagesRef = useRef([]); // mirror for the silent poll-merge decision
  const atBottomRef = useRef(true);
  const lastCount = useRef(0);
  useEffect(() => {
    messagesRef.current = messages;
    const el = bodyRef.current;
    if (!el) return;
    if (messages.length !== lastCount.current) {
      if (atBottomRef.current) el.scrollTop = el.scrollHeight;
      lastCount.current = messages.length;
    }
  }, [messages]);

  const openConversation = (id) => setActiveId(id);
  const backToList = () => {
    setActiveId(null); setMessages([]); setThreadMembers(null);
    setReplyingTo(null); setEditing(null); setDraft(""); setPeerTyping(null);
    lastCount.current = 0; lastMarkedId.current = null;
  };

  async function send() {
    const text = draft.trim();
    if (!text || sending || !activeId) return;
    setSending(true);
    try {
      if (editing) {
        // Save an edit in place.
        const updated = await msgApi.editMessage(activeId, editing.id, text);
        setMessages((m) => m.map((x) => (x.id === editing.id ? { ...x, ...updated } : x)));
        setEditing(null); setDraft("");
      } else {
        const created = await msgApi.send(activeId, text, replyingTo?.id);
        setDraft(""); setReplyingTo(null);
        atBottomRef.current = true; // a self-send always pins to the newest
        // Dedupe: the direct-WS echo of our own message may beat this proxied
        // POST response, so guard against a double-append (duplicate React key).
        if (created && created.id) setMessages((m) => (m.some((x) => x.id === created.id) ? m : [...m, created]));
        else loadThread(activeId, { silent: true });
        loadList();
      }
      requestAnimationFrame(() => composerRef.current?.focus());
    } catch (e) {
      if (e?.status === 429) flash(t("msg.tooFast"), "error");
      else if (e?.status === 403) { setBlockedLocal(true); flash(t("msg.unavailable"), "error"); }
      else flash(e?.message || t("msg.sendFailed"), "error");
    } finally {
      setSending(false);
    }
  }

  // Message actions (from the tap sheet).
  const copyMsg = async (m) => {
    try { await navigator.clipboard?.writeText(m.body || ""); flash(t("msg.copied")); }
    catch { flash(m.body || ""); }
    setActionMsg(null);
  };
  const startReply = (m) => { setReplyingTo(m); setEditing(null); setActionMsg(null); requestAnimationFrame(() => composerRef.current?.focus()); };
  const startEdit = (m) => { setEditing(m); setReplyingTo(null); setDraft(m.body || ""); setActionMsg(null); requestAnimationFrame(() => composerRef.current?.focus()); };
  const doDelete = async (m) => {
    setActionMsg(null);
    try {
      await msgApi.deleteMessage(activeId, m.id);
      setMessages((arr) => arr.map((x) => (x.id === m.id ? { ...x, deleted: true, body: "" } : x)));
      loadList();
    } catch (e) { flash(e?.message || t("msg.sendFailed"), "error"); }
  };

  const onComposerKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  async function loadOlder() {
    if (!activeId || loadingMore || !hasMore || messages.length === 0) return;
    setLoadingMore(true);
    const before = messages[0]?.id;
    const el = bodyRef.current;
    const prevH = el ? el.scrollHeight : 0;
    try {
      const r = await msgApi.thread(activeId, { before, limit: 30 });
      const older = Array.isArray(r?.messages) ? r.messages : [];
      setHasMore(!!r?.has_more);
      if (older.length) {
        setMessages((m) => [...older, ...m]);
        requestAnimationFrame(() => {
          const el2 = bodyRef.current;
          if (el2) el2.scrollTop = el2.scrollHeight - prevH;
        });
      }
    } catch { /* keep what we have */ }
    finally { setLoadingMore(false); }
  }

  async function toggleBlock() {
    if (!active || active.kind !== "dm" || !active.other) return;
    const otherId = active.other.id;
    setMenuOpen(false);
    try {
      if (blockedLocal) { await msgApi.unblock(otherId); setBlockedLocal(false); flash(t("msg.unblocked")); }
      else { await msgApi.block(otherId); setBlockedLocal(true); flash(t("msg.blocked")); }
    } catch (e) { flash(e?.message || t("msg.blockFailed"), "error"); }
  }

  async function submitReport() {
    const incoming = [...messages].reverse().find((m) => m.sender_id !== meId);
    if (!incoming) { flash(t("msg.nothingReport")); setShowReport(false); return; }
    try {
      await msgApi.reportMessage(incoming.id, reportReason.trim() || null);
      setShowReport(false); setReportReason(""); setMenuOpen(false);
      flash(t("msg.reportSent"));
    } catch (e) { flash(e?.message || t("msg.reportFailed"), "error"); }
  }

  const isDm = active?.kind === "dm";
  const showThread = !!activeId;

  // Read receipts: how many OTHER members have read a message (last_read_at at
  // or after the message's time). DM → 0/1 (✓/✓✓); project → "seen by N".
  const msOf = (iso) => {
    if (!iso) return 0;
    let s = String(iso); if (!/[zZ]|[+-]\d\d:?\d\d$/.test(s)) s += "Z";
    const ts = new Date(s).getTime();
    return Number.isFinite(ts) ? ts : 0;
  };
  const otherMembers = (threadMembers?.members || []).filter((mm) => mm.id !== meId);
  const seenCount = (iso) => {
    const ts = msOf(iso);
    return otherMembers.filter((mm) => mm.last_read_at && msOf(mm.last_read_at) >= ts).length;
  };
  // Index of the first unread message (from the list's unread count at open),
  // so we can drop a "new messages" divider before it.
  const unreadStart = active?.unread > 0 ? Math.max(0, messages.length - active.unread) : -1;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 300, background: "var(--bg)",
      "--muted": "#A8A093", "--muted-strong": "#C6BEAF",
      display: "flex", flexDirection: "column",
      maxWidth: 430, margin: "0 auto",
    }}>
      {/* Header */}
      <div style={{
        flex: "0 0 auto", display: "flex", alignItems: "center", gap: 12,
        padding: "calc(var(--safe-t) + 12px) 16px 12px", borderBottom: "1px solid var(--hair)",
        background: "var(--surface)",
      }}>
        {showThread ? (
          <>
            <IconBtn label={t("msg.back")} onClick={backToList}><span style={{ fontSize: 22, lineHeight: 1 }}>‹</span></IconBtn>
            <Av
              id={active?.other?.id} name={convTitle(active || {}, t)} photoUrl={active?.other?.photo_url}
              size={38} project={active?.kind === "project"}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15.5, color: "var(--text)",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}>{convTitle(active || {}, t)}</div>
              <div style={{
                fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.08em",
                textTransform: "uppercase", color: peerTyping != null ? "var(--teal-bright)" : "var(--muted-strong)",
              }}>
                {peerTyping != null
                  ? (active?.kind === "project" && peerTyping ? t("msg.typingName", { name: peerTyping }) : t("msg.typing"))
                  : active?.kind === "project" ? t("msg.teamChat")
                    : active?.other?.is_online ? t("msg.onlineNow") : t("msg.dm")}
              </div>
            </div>
            {isDm && active?.other && (
              <div style={{ position: "relative" }} className="msg-menu-wrap">
                <IconBtn label="⋯" onClick={() => setMenuOpen((v) => !v)}>
                  <span style={{ fontSize: 20, lineHeight: 1 }}>⋯</span>
                </IconBtn>
                {menuOpen && (
                  <div role="menu" style={{
                    position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 20,
                    background: "var(--surface)", border: "1px solid var(--hair)", borderRadius: 12,
                    boxShadow: "0 20px 50px rgba(0,0,0,0.5)", padding: 6, minWidth: 150,
                  }}>
                    <MenuItem onClick={toggleBlock}>{blockedLocal ? t("msg.unblock") : t("msg.block")}</MenuItem>
                    <MenuItem danger onClick={() => { setShowReport(true); setMenuOpen(false); }}>{t("msg.report")}</MenuItem>
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            <div style={{ flex: 1, fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 20, color: "var(--text)" }}>
              {t("msg.title")}
            </div>
            <IconBtn label={t("common.close")} onClick={onClose}><Icon name="x" size={18} /></IconBtn>
          </>
        )}
      </div>

      {/* Report composer (DM) */}
      {showThread && showReport && (
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--hair)", display: "flex", flexDirection: "column", gap: 8 }}>
          <textarea
            value={reportReason} onChange={(e) => setReportReason(e.target.value)}
            placeholder={t("msg.reportPlaceholder")} rows={2}
            style={{
              width: "100%", resize: "vertical", borderRadius: "var(--radius-sm)", border: "1px solid var(--hair)",
              background: "var(--surface-2)", color: "var(--text)", padding: "10px 12px", fontSize: 13,
              fontFamily: "var(--font-body)",
            }}
          />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <GhostBtn onClick={() => setShowReport(false)}>{t("common.cancel")}</GhostBtn>
            <GhostBtn danger onClick={submitReport}>{t("msg.sendReport")}</GhostBtn>
          </div>
        </div>
      )}

      {/* Body */}
      {showThread ? (
        <div ref={bodyRef}
          onScroll={(e) => {
            const el = e.currentTarget;
            atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
          }}
          style={{
            flex: "1 1 auto", overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 8,
          }}>
          {threadState === "loading" && <Hint>{t("msg.loadingMessages")}</Hint>}
          {threadState === "error" && (
            <Hint tone="error">{t("msg.threadError")}{" "}
              <LinkBtn onClick={() => loadThread(activeId)}>{t("common.retry")}</LinkBtn>
            </Hint>
          )}
          {threadState === "ready" && hasMore && (
            <div style={{ textAlign: "center", padding: "4px 0 12px" }}>
              <LinkBtn onClick={loadOlder} disabled={loadingMore}>
                {loadingMore ? t("msg.loadingShort") : t("msg.loadEarlier")}
              </LinkBtn>
            </div>
          )}
          {/* Membership context — who joined the team & when (project), or when
              the chat started (DM). Shows at the very top, above the first message. */}
          {threadState === "ready" && threadMembers && !hasMore && (
            <div style={{ display: "flex", flexDirection: "column", gap: 5, padding: "2px 0 10px" }}>
              {threadMembers.kind === "project"
                ? (threadMembers.members || []).map((m) => (
                    <SystemLine key={m.id}>
                      {m.is_creator
                        ? t("msg.startedProject", { name: m.display_name, date: fmtDay(m.joined_at) })
                        : t("msg.joinedTeam", { name: m.display_name, date: fmtDay(m.joined_at) })}
                    </SystemLine>
                  ))
                : (threadMembers.started_at ? (
                    <SystemLine>{t("msg.chatStarted", { date: fmtDay(threadMembers.started_at) })}</SystemLine>
                  ) : null)}
            </div>
          )}
          {threadState === "ready" && messages.length === 0 && (
            <div style={{ padding: "40px 24px 0", textAlign: "center", color: "var(--muted-strong)", fontSize: 14 }}>
              {t("msg.sayHello")}
            </div>
          )}
          {messages.map((m, i) => {
            const mine = m.sender_id === meId;
            const prev = messages[i - 1];
            const showSender = active?.kind === "project" && !mine && (!prev || prev.sender_id !== m.sender_id);
            const seen = mine && !m.deleted ? seenCount(m.created_at) : 0;
            return (
              <Fragment key={m.id}>
                {unreadStart > 0 && i === unreadStart && (
                  <div style={{ alignSelf: "center", margin: "6px 0", padding: "3px 12px", borderRadius: 99,
                    background: "rgba(255,106,61,0.14)", border: "1px solid rgba(255,106,61,0.3)", color: "var(--ember)",
                    fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                    {t("msg.newMessages")}
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start" }}>
                  <div
                    onClick={() => { if (!m.deleted) setActionMsg(m); }}
                    style={{ display: "flex", flexDirection: "column", maxWidth: "78%", gap: 2,
                      alignItems: mine ? "flex-end" : "flex-start", cursor: m.deleted ? "default" : "pointer" }}>
                    {showSender && (
                      <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--amber)", padding: "0 4px" }}>
                        {m.sender?.display_name || t("msg.someone")}
                      </span>
                    )}
                    {m.reply_to && (
                      <div style={{ maxWidth: "100%", padding: "5px 10px", marginBottom: 1, borderRadius: 10,
                        borderLeft: "2px solid var(--amber)", background: "var(--surface-2)", opacity: 0.9 }}>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--amber)" }}>
                          {m.reply_to.sender_name || t("msg.someone")}
                        </div>
                        <div style={{ fontSize: 12, color: "var(--muted-strong)", whiteSpace: "nowrap",
                          overflow: "hidden", textOverflow: "ellipsis", maxWidth: 220 }}>
                          {m.reply_to.body || t("msg.deletedShort")}
                        </div>
                      </div>
                    )}
                    <div style={{
                      padding: "10px 14px", borderRadius: 16, fontSize: 14.5, lineHeight: 1.45,
                      whiteSpace: "pre-wrap", wordBreak: "break-word",
                      ...(m.deleted
                        ? { background: "var(--surface-2)", border: "1px dashed var(--hair)", color: "var(--muted)", fontStyle: "italic" }
                        : mine
                          ? { borderTopRightRadius: 6, background: "linear-gradient(135deg, rgba(232,161,92,0.92), rgba(255,106,61,0.85))", border: "1px solid rgba(232,161,92,0.5)", color: "#1A1206", fontWeight: 500 }
                          : { borderTopLeftRadius: 6, background: "var(--surface-2)", border: "1px solid var(--hair)", color: "var(--text)" }),
                    }}>{m.deleted ? t("msg.deleted") : m.body}</div>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--muted)", padding: "0 4px", display: "inline-flex", alignItems: "center", gap: 4 }}>
                      {relTime(m.created_at)}
                      {m.edited && !m.deleted && <span style={{ opacity: 0.8 }}>· {t("msg.edited")}</span>}
                      {mine && !m.deleted && (
                        <span title={seen ? t("msg.seen") : t("msg.sent")} style={{ color: seen ? "var(--teal-bright)" : "var(--muted)", fontWeight: 700 }}>
                          {seen ? (active?.kind === "project" ? `✓✓ ${seen}` : "✓✓") : "✓"}
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              </Fragment>
            );
          })}
        </div>
      ) : (
        <div style={{ flex: "1 1 auto", overflowY: "auto", padding: 8 }}>
          {listState === "loading" && conversations === null && <Hint>{t("msg.loadingConversations")}</Hint>}
          {listState === "error" && (
            <Hint tone="error">{t("msg.listError")}{" "}<LinkBtn onClick={loadList}>{t("common.retry")}</LinkBtn></Hint>
          )}
          {Array.isArray(conversations) && conversations.length === 0 && (
            <div style={{ padding: "48px 28px", textAlign: "center" }}>
              <div style={{ fontSize: 40 }} aria-hidden>✉️</div>
              <p style={{ margin: "12px 0 0", color: "var(--muted-strong)", fontSize: 14, lineHeight: 1.55 }}>
                {t("msg.emptyList")}
              </p>
            </div>
          )}
          {Array.isArray(conversations) && conversations.map((c) => {
            const title = convTitle(c, t);
            const preview = c.last_message?.body || t("msg.noPreview");
            const when = c.last_message?.created_at ? relTime(c.last_message.created_at) : "";
            return (
              <button key={c.id} type="button" onClick={() => openConversation(c.id)} style={{
                display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left",
                padding: "11px 12px", border: "none", background: "transparent", borderRadius: 14, cursor: "pointer",
              }}>
                <span style={{ position: "relative", flex: "0 0 auto" }}>
                  <Av id={c.other?.id} name={title} photoUrl={c.other?.photo_url} size={46} project={c.kind === "project"} />
                  {c.kind === "dm" && c.other?.is_online && (
                    <span aria-hidden style={{
                      position: "absolute", right: -1, bottom: -1, width: 12, height: 12, borderRadius: "50%",
                      background: "var(--green)", border: "2px solid var(--surface)", boxShadow: "0 0 6px rgba(127,176,105,0.7)",
                    }} />
                  )}
                </span>
                <span style={{ flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
                  <span style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                    <span style={{
                      fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14.5, color: "var(--text)",
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0,
                    }}>{title}</span>
                    {when && <span style={{ flex: "0 0 auto", fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--muted)" }}>{when}</span>}
                  </span>
                  <span style={{
                    fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    color: c.unread > 0 ? "var(--text)" : "var(--muted)", fontWeight: c.unread > 0 ? 600 : 400,
                  }}>{preview}</span>
                </span>
                {c.unread > 0 && (
                  <span style={{
                    flex: "0 0 auto", minWidth: 20, height: 20, padding: "0 6px", borderRadius: 99,
                    background: "linear-gradient(135deg, var(--ember), var(--terra))", color: "#160E08",
                    fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    boxShadow: "0 2px 10px rgba(255,106,61,0.45)",
                  }}>{c.unread > 99 ? "99+" : c.unread}</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Composer (thread only) */}
      {showThread && (
        <div style={{
          flex: "0 0 auto", padding: "10px 14px calc(var(--safe-b, 0px) + 12px)",
          borderTop: "1px solid var(--hair)", background: "var(--surface)",
        }}>
          {(replyingTo || editing) && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, padding: "6px 10px",
              borderRadius: 10, borderLeft: "2px solid var(--amber)", background: "var(--surface-2)" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--amber)" }}>
                  {editing ? t("msg.editing") : t("msg.replyingTo", { name: replyingTo?.sender?.display_name || t("msg.someone") })}
                </div>
                <div style={{ fontSize: 12, color: "var(--muted-strong)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {(editing || replyingTo)?.body}
                </div>
              </div>
              <button type="button" aria-label={t("common.close")}
                onClick={() => { setReplyingTo(null); if (editing) setDraft(""); setEditing(null); }}
                style={{ flex: "0 0 auto", width: 26, height: 26, borderRadius: 8, border: "1px solid var(--hair)",
                  background: "var(--surface)", color: "var(--muted-strong)", cursor: "pointer", fontSize: 13 }}>✕</button>
            </div>
          )}
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
          {blockedLocal ? (
            <div style={{ flex: 1, textAlign: "center", color: "var(--muted-strong)", fontSize: 13.5, padding: 6 }}>
              {t("msg.blockedNote")}{" "}<LinkBtn onClick={toggleBlock}>{t("msg.unblock")}</LinkBtn>
            </div>
          ) : (
            <>
              <textarea
                ref={composerRef} value={draft}
                onChange={(e) => { setDraft(e.target.value.slice(0, MAX_BODY)); if (activeId) wsSendTyping(activeId); }}
                onKeyDown={onComposerKey} placeholder={t("msg.composerPlaceholder")} rows={1} disabled={sending}
                style={{
                  flex: "1 1 auto", resize: "none", maxHeight: 120, minHeight: 44, borderRadius: 14,
                  border: "1px solid var(--hair)", background: "var(--surface-2)", color: "var(--text)",
                  padding: "12px 14px", fontSize: 14.5, lineHeight: 1.4, fontFamily: "var(--font-body)",
                }}
              />
              <button type="button" onClick={send} disabled={sending || !draft.trim()} aria-label={t("msg.send")}
                className="btn-primary" style={{
                  flex: "0 0 auto", width: "auto", padding: "12px 20px", opacity: sending || !draft.trim() ? 0.6 : 1,
                }}>
                {sending ? "…" : (editing ? t("msg.save") : t("msg.send"))}
              </button>
            </>
          )}
          </div>
        </div>
      )}

      {/* Message action sheet (tap a message) */}
      {actionMsg && (
        <div onClick={() => setActionMsg(null)} style={{
          position: "fixed", inset: 0, zIndex: 420, background: "rgba(0,0,0,0.5)",
          display: "flex", alignItems: "flex-end",
        }}>
          <div onClick={(e) => e.stopPropagation()} style={{
            width: "100%", maxWidth: 430, margin: "0 auto", background: "var(--surface)",
            borderTopLeftRadius: 20, borderTopRightRadius: 20, border: "1px solid var(--hair)",
            padding: "8px 10px calc(var(--safe-b, 0px) + 14px)",
          }}>
            <div style={{ width: 40, height: 4, background: "var(--hair)", borderRadius: 99, margin: "4px auto 8px" }} />
            <SheetItem onClick={() => copyMsg(actionMsg)}>📋 {t("msg.copy")}</SheetItem>
            <SheetItem onClick={() => startReply(actionMsg)}>↩ {t("msg.reply")}</SheetItem>
            {actionMsg.sender_id === meId && !actionMsg.deleted && (
              <SheetItem onClick={() => startEdit(actionMsg)}>✎ {t("msg.edit")}</SheetItem>
            )}
            {actionMsg.sender_id === meId && !actionMsg.deleted && (
              <SheetItem danger onClick={() => doDelete(actionMsg)}>🗑 {t("msg.delete")}</SheetItem>
            )}
          </div>
        </div>
      )}

      {toast?.text && (
        <div role="status" aria-live="polite" style={{
          position: "fixed", left: "50%", bottom: 84, transform: "translateX(-50%)", zIndex: 400,
          background: "var(--surface)", border: `1px solid ${toast.tone === "error" ? "rgba(192,86,59,0.5)" : "rgba(255,106,61,0.4)"}`,
          borderRadius: 12, padding: "10px 16px", maxWidth: 320, boxShadow: "0 16px 40px rgba(0,0,0,0.5)",
        }}>
          <b style={{ color: toast.tone === "error" ? "var(--terra)" : "var(--ember)", fontSize: 13.5 }}>{toast.text}</b>
        </div>
      )}
    </div>
  );
};

const IconBtn = ({ children, label, onClick }) => (
  <button type="button" aria-label={label} title={label} onClick={onClick} style={{
    flex: "0 0 auto", width: 38, height: 38, borderRadius: 11, border: "1px solid var(--hair)",
    background: "var(--surface-2)", color: "var(--muted-strong)", cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
  }}>{children}</button>
);

const MenuItem = ({ children, onClick, danger }) => (
  <button type="button" role="menuitem" onClick={onClick} style={{
    display: "block", width: "100%", textAlign: "left", padding: "9px 12px", border: "none",
    background: "transparent", color: danger ? "var(--terra)" : "var(--text)", fontSize: 14,
    borderRadius: 8, cursor: "pointer", fontFamily: "var(--font-body)",
  }}>{children}</button>
);

const GhostBtn = ({ children, onClick, danger }) => (
  <button type="button" onClick={onClick} style={{
    padding: "8px 14px", borderRadius: "var(--radius-sm)", background: "var(--surface-2)",
    border: `1px solid ${danger ? "rgba(192,86,59,0.35)" : "var(--hair)"}`,
    color: danger ? "var(--terra)" : "var(--text)", fontSize: 13, cursor: "pointer", fontFamily: "var(--font-body)",
  }}>{children}</button>
);

const LinkBtn = ({ children, onClick, disabled }) => (
  <button type="button" onClick={onClick} disabled={disabled} style={{
    background: "none", border: "none", color: "var(--amber)", fontSize: 13.5, cursor: disabled ? "default" : "pointer",
    textDecoration: "underline", textUnderlineOffset: 2, padding: 0, opacity: disabled ? 0.6 : 1, fontFamily: "var(--font-body)",
  }}>{children}</button>
);

const Hint = ({ children, tone }) => (
  <div style={{ color: tone === "error" ? "var(--terra)" : "var(--muted-strong)", fontSize: 13.5, padding: 16, textAlign: "center" }}>
    {children}
  </div>
);

// One row in the tap-a-message action sheet.
const SheetItem = ({ children, onClick, danger }) => (
  <button type="button" onClick={onClick} style={{
    display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left",
    padding: "13px 14px", border: "none", background: "transparent", borderRadius: 12, cursor: "pointer",
    color: danger ? "var(--terra)" : "var(--text)", fontSize: 15, fontWeight: 600, fontFamily: "var(--font-body)",
  }}>{children}</button>
);

// Centered "system" line for join/started context (Telegram-style).
const SystemLine = ({ children }) => (
  <div style={{
    alignSelf: "center", maxWidth: "90%", textAlign: "center", padding: "5px 13px", borderRadius: 99,
    background: "var(--surface-2)", border: "1px solid var(--hair)", color: "var(--muted-strong)",
    fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.02em", lineHeight: 1.45,
  }}>{children}</div>
);
