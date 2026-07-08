import { useState, useEffect, useRef, useCallback } from "react";
import { messages as msgApi } from "../api";
import { Icon } from "./Icons";
import { useT } from "../i18n";

// ── Mobile in-app Messenger (1:1 DMs + project team chats) ────────────────────
// Full-screen overlay port of the desktop Messenger (desktop/components/messages/
// Messenger.js). Single column: conversation LIST ↔ THREAD (back arrow). Polls
// the list every ~15s and the open thread every ~6s (both paused when hidden).
// Backend app/routers/messages.py via api.messages (see src/api.js).

const LIST_POLL_MS = 15000;
const THREAD_POLL_MS = 6000;
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

// Compact relative time ("now", "5m", "3h", "2d", else short date).
const relTime = (iso) => {
  if (!iso) return "";
  // The backend serializes naive UTC datetimes (no timezone suffix); without
  // this, new Date() reads them as local time and a just-sent message shows
  // hours old in +05 Tashkent. Append 'Z' when no tz info is present.
  let str = String(iso);
  if (!/[zZ]|[+-]\d\d:?\d\d$/.test(str)) str += "Z";
  const then = new Date(str).getTime();
  if (!Number.isFinite(then)) return "";
  const s = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (s < 45) return "now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  try { return new Date(str).toLocaleDateString(undefined, { month: "short", day: "numeric" }); }
  catch { return `${d}d`; }
};

// Absolute short date ("Jul 5") for join/started lines — Z-normalized like relTime.
const fmtDay = (iso) => {
  if (!iso) return "";
  let str = String(iso); if (!/[zZ]|[+-]\d\d:?\d\d$/.test(str)) str += "Z";
  try { return new Date(str).toLocaleDateString(undefined, { month: "short", day: "numeric" }); }
  catch { return ""; }
};

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

  const bodyRef = useRef(null);
  const composerRef = useRef(null);
  const toastTimer = useRef(0);

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
        setMessages((cur) => {
          if (cur.length === 0) return incoming;
          const seen = new Set(cur.map((m) => m.id));
          const fresh = incoming.filter((m) => !seen.has(m.id));
          return fresh.length ? [...cur, ...fresh] : cur;
        });
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

  useEffect(() => {
    if (!activeId) return;
    setBlockedLocal(false); setMenuOpen(false); setShowReport(false);
    lastMarkedId.current = null;
    setThreadMembers(null);
    msgApi.members(activeId).then(setThreadMembers).catch(() => setThreadMembers(null));
    loadThread(activeId);
    let timer = null;
    const start = () => { stop(); timer = window.setInterval(() => loadThread(activeId, { silent: true }), THREAD_POLL_MS); };
    const stop = () => { if (timer) window.clearInterval(timer); timer = null; };
    const onVis = () => { if (document.hidden) stop(); else { loadThread(activeId, { silent: true }); start(); } };
    start();
    document.addEventListener("visibilitychange", onVis);
    return () => { stop(); document.removeEventListener("visibilitychange", onVis); };
  }, [activeId, loadThread]);

  // Autoscroll to newest when count grows.
  const lastCount = useRef(0);
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    if (messages.length !== lastCount.current) {
      el.scrollTop = el.scrollHeight;
      lastCount.current = messages.length;
    }
  }, [messages]);

  const openConversation = (id) => setActiveId(id);
  const backToList = () => { setActiveId(null); setMessages([]); setThreadMembers(null); lastCount.current = 0; lastMarkedId.current = null; };

  async function send() {
    const text = draft.trim();
    if (!text || sending || !activeId) return;
    setSending(true);
    try {
      const created = await msgApi.send(activeId, text);
      setDraft("");
      if (created && created.id) setMessages((m) => [...m, created]);
      else loadThread(activeId, { silent: true });
      loadList();
      requestAnimationFrame(() => composerRef.current?.focus());
    } catch (e) {
      if (e?.status === 429) flash(t("msg.tooFast"), "error");
      else if (e?.status === 403) { setBlockedLocal(true); flash(t("msg.unavailable"), "error"); }
      else flash(e?.message || t("msg.sendFailed"), "error");
    } finally {
      setSending(false);
    }
  }

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
                textTransform: "uppercase", color: "var(--muted-strong)",
              }}>
                {active?.kind === "project" ? t("msg.teamChat")
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
        <div ref={bodyRef} style={{
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
            return (
              <div key={m.id} style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start" }}>
                <div style={{ display: "flex", flexDirection: "column", maxWidth: "78%", gap: 2, alignItems: mine ? "flex-end" : "flex-start" }}>
                  {showSender && (
                    <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--amber)", padding: "0 4px" }}>
                      {m.sender?.display_name || t("msg.someone")}
                    </span>
                  )}
                  <div style={{
                    padding: "10px 14px", borderRadius: 16, fontSize: 14.5, lineHeight: 1.45,
                    whiteSpace: "pre-wrap", wordBreak: "break-word",
                    ...(mine
                      ? { borderTopRightRadius: 6, background: "linear-gradient(135deg, rgba(232,161,92,0.92), rgba(255,106,61,0.85))", border: "1px solid rgba(232,161,92,0.5)", color: "#1A1206", fontWeight: 500 }
                      : { borderTopLeftRadius: 6, background: "var(--surface-2)", border: "1px solid var(--hair)", color: "var(--text)" }),
                  }}>{m.body}</div>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--muted)", padding: "0 4px" }}>{relTime(m.created_at)}</span>
                </div>
              </div>
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
          flex: "0 0 auto", display: "flex", gap: 10, padding: "12px 14px calc(var(--safe-b, 0px) + 12px)",
          borderTop: "1px solid var(--hair)", alignItems: "flex-end", background: "var(--surface)",
        }}>
          {blockedLocal ? (
            <div style={{ flex: 1, textAlign: "center", color: "var(--muted-strong)", fontSize: 13.5, padding: 6 }}>
              {t("msg.blockedNote")}{" "}<LinkBtn onClick={toggleBlock}>{t("msg.unblock")}</LinkBtn>
            </div>
          ) : (
            <>
              <textarea
                ref={composerRef} value={draft}
                onChange={(e) => setDraft(e.target.value.slice(0, MAX_BODY))}
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
                {sending ? "…" : t("msg.send")}
              </button>
            </>
          )}
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

// Centered "system" line for join/started context (Telegram-style).
const SystemLine = ({ children }) => (
  <div style={{
    alignSelf: "center", maxWidth: "90%", textAlign: "center", padding: "5px 13px", borderRadius: 99,
    background: "var(--surface-2)", border: "1px solid var(--hair)", color: "var(--muted-strong)",
    fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.02em", lineHeight: 1.45,
  }}>{children}</div>
);
