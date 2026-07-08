"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { bfu } from "@/lib/client-api";
import { gradientFor, initials } from "@/lib/avatar";
import { relTime } from "@/lib/notif";
import { useToast } from "@/lib/useToast";
import { useT } from "@/components/i18n/LocaleProvider";

// The in-app messenger. Two-pane on desktop (conversation list left, thread
// right); single-column on mobile (list → thread with a back arrow). Reads
// ?c={id} to open a specific conversation. Polls the open thread every ~6s and
// the conversation list / unread every ~15s (both paused while the tab hidden).
//
// Backend (app/routers/messages.py), all via the authed /api/bfu proxy:
//   GET  /conversations                         → [{id,kind,other,project,last_message,unread}]
//   GET  /conversations/{id}/messages?before=&limit=  → {messages:[...], has_more}
//   POST /conversations/{id}/messages {body}    → created message (429 = too fast)
//   POST /conversations/{id}/read               → clears my unread
//   POST /users/{id}/block  /  DELETE same      → block / unblock (DM)
//   POST /messages/{id}/report {reason?}        → file a report

const LIST_POLL_MS = 15000;
const THREAD_POLL_MS = 6000;

function Avatar({ id, name, photoUrl, size = 40 }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        flex: "0 0 auto",
        background: gradientFor(id ?? 0),
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--font-display)",
        fontWeight: 700,
        fontSize: size * 0.38,
        color: "#160E08",
        overflow: "hidden",
      }}
    >
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        initials(name || "?")
      )}
    </div>
  );
}

function ProjectGlyph({ size = 40 }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 12,
        flex: "0 0 auto",
        background: "linear-gradient(140deg, rgba(94,197,182,0.22), rgba(18,86,79,0.35))",
        border: "1px solid rgba(94,197,182,0.3)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--teal-bright)",
        fontSize: size * 0.42,
      }}
      aria-hidden
    >
      ◆
    </div>
  );
}

function convTitle(c, t) {
  if (c.kind === "project") return c.project?.name || t("messages.team_chat");
  return c.other?.display_name || t("messages.conversation_fallback");
}

export default function Messenger({ meId }) {
  const t = useT();
  const router = useRouter();
  const params = useSearchParams();
  const { toast, flash } = useToast(3200);

  const [conversations, setConversations] = useState(null); // null=loading
  const [listState, setListState] = useState("loading"); // loading|ready|error
  const [activeId, setActiveId] = useState(null);

  const [messages, setMessages] = useState([]);
  const [threadState, setThreadState] = useState("idle"); // idle|loading|ready|error
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [blockedLocal, setBlockedLocal] = useState(false);

  const threadBodyRef = useRef(null);
  const composerRef = useRef(null);

  const active = Array.isArray(conversations)
    ? conversations.find((c) => c.id === activeId) || null
    : null;

  // ── Load conversation list (mount + poll) ─────────────────────────────────
  const loadList = useCallback(async () => {
    try {
      const r = await bfu("/conversations");
      setConversations(Array.isArray(r) ? r : []);
      setListState("ready");
    } catch (e) {
      setListState((s) => (s === "ready" ? "ready" : "error"));
    }
  }, []);

  useEffect(() => {
    loadList();
    let timer = null;
    const start = () => {
      stop();
      timer = window.setInterval(loadList, LIST_POLL_MS);
    };
    const stop = () => {
      if (timer) window.clearInterval(timer);
      timer = null;
    };
    const onVis = () => {
      if (document.hidden) stop();
      else {
        loadList();
        start();
      }
    };
    start();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [loadList]);

  // ── Sync active conversation from ?c= ─────────────────────────────────────
  useEffect(() => {
    const c = params.get("c");
    if (c) {
      const n = Number(c);
      if (!Number.isNaN(n)) setActiveId(n);
    }
  }, [params]);

  // ── Load messages for the active conversation (+ mark read + poll) ────────
  const loadThread = useCallback(
    async (id, { silent } = {}) => {
      if (!id) return;
      if (!silent) setThreadState("loading");
      try {
        const r = await bfu(`/conversations/${id}/messages`, { params: { limit: 30 } });
        const msgs = Array.isArray(r?.messages) ? r.messages : [];
        setMessages(msgs);
        setHasMore(!!r?.has_more);
        setThreadState("ready");
        // Mark read — best effort; then refresh the list badge.
        bfu(`/conversations/${id}/read`, { method: "POST" })
          .then(() => loadList())
          .catch(() => {});
      } catch (e) {
        if (!silent) setThreadState("error");
      }
    },
    [loadList]
  );

  useEffect(() => {
    if (!activeId) return;
    setBlockedLocal(false);
    setMenuOpen(false);
    setShowReport(false);
    loadThread(activeId);
    let timer = null;
    const start = () => {
      stop();
      timer = window.setInterval(() => loadThread(activeId, { silent: true }), THREAD_POLL_MS);
    };
    const stop = () => {
      if (timer) window.clearInterval(timer);
      timer = null;
    };
    const onVis = () => {
      if (document.hidden) stop();
      else {
        loadThread(activeId, { silent: true });
        start();
      }
    };
    start();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [activeId, loadThread]);

  // Autoscroll to the newest message when the message count grows.
  const lastCount = useRef(0);
  useEffect(() => {
    const el = threadBodyRef.current;
    if (!el) return;
    if (messages.length !== lastCount.current) {
      el.scrollTop = el.scrollHeight;
      lastCount.current = messages.length;
    }
  }, [messages]);

  function openConversation(id) {
    setActiveId(id);
    // Reflect in the URL without a full navigation so refresh/deep-link works.
    router.replace(`/messages?c=${id}`, { scroll: false });
  }

  function backToList() {
    setActiveId(null);
    router.replace("/messages", { scroll: false });
  }

  // ── Send ──────────────────────────────────────────────────────────────────
  async function send() {
    const text = draft.trim();
    if (!text || sending || !activeId) return;
    setSending(true);
    try {
      const created = await bfu(`/conversations/${activeId}/messages`, {
        method: "POST",
        body: { body: text },
      });
      setDraft("");
      if (created && created.id) {
        setMessages((m) => [...m, created]);
      } else {
        loadThread(activeId, { silent: true });
      }
      loadList();
      // Keep focus in the composer for a fast back-and-forth.
      requestAnimationFrame(() => composerRef.current?.focus());
    } catch (e) {
      if (e?.status === 429) {
        flash(t("messages.toast_too_fast"), "error");
      } else if (e?.status === 403) {
        setBlockedLocal(true);
        flash(t("messages.toast_unavailable"), "error");
      } else {
        flash(e?.message || t("messages.toast_send_failed"), "error");
      }
    } finally {
      setSending(false);
    }
  }

  function onComposerKey(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  async function loadOlder() {
    if (!activeId || loadingMore || !hasMore || messages.length === 0) return;
    setLoadingMore(true);
    const before = messages[0]?.id;
    const el = threadBodyRef.current;
    const prevH = el ? el.scrollHeight : 0;
    try {
      const r = await bfu(`/conversations/${activeId}/messages`, {
        params: { before, limit: 30 },
      });
      const older = Array.isArray(r?.messages) ? r.messages : [];
      setHasMore(!!r?.has_more);
      if (older.length) {
        setMessages((m) => [...older, ...m]);
        // Preserve scroll position after prepending.
        requestAnimationFrame(() => {
          const el2 = threadBodyRef.current;
          if (el2) el2.scrollTop = el2.scrollHeight - prevH;
        });
      }
    } catch {
      /* keep what we have */
    } finally {
      setLoadingMore(false);
    }
  }

  // ── Block / unblock / report (DM only) ────────────────────────────────────
  async function toggleBlock() {
    if (!active || active.kind !== "dm" || !active.other) return;
    const otherId = active.other.id;
    setMenuOpen(false);
    try {
      if (blockedLocal) {
        await bfu(`/users/${otherId}/block`, { method: "DELETE" });
        setBlockedLocal(false);
        flash(t("messages.toast_unblocked"));
      } else {
        await bfu(`/users/${otherId}/block`, { method: "POST" });
        setBlockedLocal(true);
        flash(t("messages.toast_blocked"));
      }
    } catch (e) {
      flash(e?.message || t("messages.toast_block_failed"), "error");
    }
  }

  async function submitReport() {
    // Report the most recent message NOT sent by me.
    const incoming = [...messages].reverse().find((m) => m.sender_id !== meId);
    if (!incoming) {
      flash(t("messages.toast_nothing_report"));
      setShowReport(false);
      return;
    }
    try {
      await bfu(`/messages/${incoming.id}/report`, {
        method: "POST",
        body: { reason: reportReason.trim() || null },
      });
      setShowReport(false);
      setReportReason("");
      setMenuOpen(false);
      flash(t("messages.toast_report_sent"));
    } catch (e) {
      flash(e?.message || t("messages.toast_report_failed"), "error");
    }
  }

  // Close the header menu on outside click / Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e) => {
      const t = e.target;
      if (!(t instanceof Element) || !t.closest(".msg-menu-wrap")) setMenuOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  // ── Render: conversation list ─────────────────────────────────────────────
  const ListPane = (
    <div className="msg-list">
      <div className="msg-list-head">
        <span className="ch-cell-label" style={{ margin: 0 }}>{t("messages.list_heading")}</span>
      </div>
      <div className="msg-list-body">
        {listState === "loading" && conversations === null && (
          <div className="msg-hint">
            <span className="ch-spin" aria-hidden>◠</span> {t("messages.loading_conversations")}
          </div>
        )}
        {listState === "error" && (
          <div className="msg-hint" style={{ color: "var(--terra)" }}>
            {t("messages.list_load_error")}{" "}
            <button type="button" className="msg-linkbtn" onClick={loadList}>{t("messages.retry")}</button>
          </div>
        )}
        {Array.isArray(conversations) && conversations.length === 0 && (
          <div className="msg-empty">
            <div style={{ fontSize: 34 }} aria-hidden>✉️</div>
            <p style={{ margin: "10px 0 0", color: "var(--muted-strong)", fontSize: 14, lineHeight: 1.5 }}>
              {t("messages.empty_list_pre")}
              <b style={{ color: "var(--amber)" }}>{t("messages.empty_list_cta")}</b>
              {t("messages.empty_list_post")}
            </p>
          </div>
        )}
        {Array.isArray(conversations) &&
          conversations.map((c) => {
            const on = c.id === activeId;
            const title = convTitle(c, t);
            const preview = c.last_message?.body || t("messages.no_messages_preview");
            const when = c.last_message?.created_at ? relTime(c.last_message.created_at) : "";
            return (
              <button
                key={c.id}
                type="button"
                className="msg-conv"
                data-on={on ? "1" : undefined}
                onClick={() => openConversation(c.id)}
              >
                <span className="msg-conv-av">
                  {c.kind === "project" ? (
                    <ProjectGlyph size={44} />
                  ) : (
                    <Avatar id={c.other?.id} name={title} photoUrl={c.other?.photo_url} size={44} />
                  )}
                  {c.kind === "dm" && c.other?.is_online && <span className="msg-dot" aria-hidden />}
                </span>
                <span className="msg-conv-main">
                  <span className="msg-conv-top">
                    <span className="msg-conv-name">{title}</span>
                    {when && <span className="msg-conv-time">{when}</span>}
                  </span>
                  <span className="msg-conv-prev" data-unread={c.unread > 0 ? "1" : undefined}>
                    {preview}
                  </span>
                </span>
                {c.unread > 0 && <span className="msg-unread">{c.unread > 99 ? "99+" : c.unread}</span>}
              </button>
            );
          })}
      </div>
    </div>
  );

  // ── Render: thread ────────────────────────────────────────────────────────
  const isDm = active?.kind === "dm";
  const ThreadPane = (
    <div className="msg-thread">
      {!activeId ? (
        <div className="msg-thread-empty">
          <div style={{ fontSize: 44 }} aria-hidden>💬</div>
          <p style={{ margin: "12px 0 0", color: "var(--muted-strong)", fontSize: 15 }}>
            {t("messages.thread_empty_select")}
          </p>
        </div>
      ) : (
        <>
          <div className="msg-thread-head">
            <button type="button" className="msg-back" onClick={backToList} aria-label={t("messages.back_aria")}>
              ‹
            </button>
            {active && (
              <>
                <span className="msg-thread-av">
                  {active.kind === "project" ? (
                    <ProjectGlyph size={38} />
                  ) : (
                    <Avatar id={active.other?.id} name={convTitle(active, t)} photoUrl={active.other?.photo_url} size={38} />
                  )}
                </span>
                <div className="msg-thread-id">
                  {isDm && active.other ? (
                    <a href={`/u/${active.other.id}`} className="msg-thread-name msg-thread-link">
                      {active.other.display_name}
                    </a>
                  ) : (
                    <span className="msg-thread-name">{convTitle(active, t)}</span>
                  )}
                  <span className="msg-thread-sub">
                    {active.kind === "project"
                      ? t("messages.team_chat")
                      : active.other?.is_online
                        ? t("messages.online_now")
                        : t("messages.direct_message")}
                  </span>
                </div>
              </>
            )}
            {isDm && active?.other && (
              <div className="msg-menu-wrap">
                <button
                  type="button"
                  className="msg-more"
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  onClick={() => setMenuOpen((v) => !v)}
                >
                  ⋯
                </button>
                {menuOpen && (
                  <div role="menu" className="msg-menu">
                    <button type="button" role="menuitem" className="msg-menu-item" onClick={toggleBlock}>
                      {blockedLocal ? t("messages.unblock") : t("messages.block")}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="msg-menu-item msg-menu-danger"
                      onClick={() => { setShowReport(true); setMenuOpen(false); }}
                    >
                      {t("messages.report")}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {showReport && (
            <div className="msg-report">
              <textarea
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                placeholder={t("messages.report_placeholder")}
                rows={2}
                className="msg-report-ta"
              />
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button type="button" className="msg-btn-ghost" onClick={() => setShowReport(false)}>{t("messages.cancel")}</button>
                <button type="button" className="msg-btn-ghost msg-btn-danger" onClick={submitReport}>{t("messages.send_report")}</button>
              </div>
            </div>
          )}

          <div className="msg-thread-body" ref={threadBodyRef}>
            {threadState === "loading" && (
              <div className="msg-hint"><span className="ch-spin" aria-hidden>◠</span> {t("messages.loading_messages")}</div>
            )}
            {threadState === "error" && (
              <div className="msg-hint" style={{ color: "var(--terra)" }}>
                {t("messages.thread_load_error")}{" "}
                <button type="button" className="msg-linkbtn" onClick={() => loadThread(activeId)}>{t("messages.retry")}</button>
              </div>
            )}
            {threadState === "ready" && hasMore && (
              <div style={{ textAlign: "center", padding: "4px 0 12px" }}>
                <button type="button" className="msg-linkbtn" onClick={loadOlder} disabled={loadingMore}>
                  {loadingMore ? t("messages.loading_short") : t("messages.load_earlier")}
                </button>
              </div>
            )}
            {threadState === "ready" && messages.length === 0 && (
              <div className="msg-empty" style={{ paddingTop: 40 }}>
                <p style={{ margin: 0, color: "var(--muted-strong)", fontSize: 14 }}>
                  {t("messages.thread_empty_hello")}
                </p>
              </div>
            )}
            {messages.map((m, i) => {
              const mine = m.sender_id === meId;
              const prev = messages[i - 1];
              const showSender = active?.kind === "project" && !mine && (!prev || prev.sender_id !== m.sender_id);
              return (
                <div key={m.id} className={`msg-row${mine ? " msg-row-mine" : ""}`}>
                  <div className="msg-bubble-wrap">
                    {showSender && (
                      <span className="msg-sender">{m.sender?.display_name || t("messages.sender_fallback")}</span>
                    )}
                    <div className={`msg-bubble${mine ? " msg-bubble-mine" : ""}`}>{m.body}</div>
                    <span className="msg-time">{relTime(m.created_at)}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="msg-composer">
            {blockedLocal ? (
              <div className="msg-blocked-note">
                {t("messages.blocked_note")}{" "}
                <button type="button" className="msg-linkbtn" onClick={toggleBlock}>{t("messages.unblock")}</button>
              </div>
            ) : (
              <>
                <textarea
                  ref={composerRef}
                  className="msg-input"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value.slice(0, 4000))}
                  onKeyDown={onComposerKey}
                  placeholder={t("messages.composer_placeholder")}
                  rows={1}
                  disabled={sending}
                />
                <button
                  type="button"
                  className="ch-btn-primary msg-send"
                  onClick={send}
                  disabled={sending || !draft.trim()}
                  aria-label={t("messages.send_aria")}
                >
                  {sending ? "…" : t("messages.send")}
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );

  return (
    <div className="msg-shell" data-view={activeId ? "thread" : "list"}>
      {ListPane}
      {ThreadPane}

      {toast?.text && (
        <div
          className="ch-toast ch-toast-show"
          role="status"
          aria-live="polite"
          style={{ border: `1px solid ${toast.tone === "error" ? "rgba(192,86,59,0.5)" : "rgba(255,106,61,0.4)"}` }}
        >
          <span className="ch-toast-tx">
            <b style={{ color: toast.tone === "error" ? "var(--terra)" : "var(--ember)" }}>{toast.text}</b>
          </span>
        </div>
      )}

      <style>{`
        .msg-shell {
          display: grid;
          grid-template-columns: 340px 1fr;
          gap: 16px;
          height: min(72vh, 760px);
          min-height: 460px;
        }
        .msg-list, .msg-thread {
          border: 1px solid var(--hair);
          background: var(--surface);
          border-radius: var(--radius);
          overflow: hidden;
          display: flex;
          flex-direction: column;
          min-height: 0;
        }
        /* ── List ── */
        .msg-list-head { padding: 16px 18px 10px; border-bottom: 1px solid var(--hair); flex: 0 0 auto; }
        .msg-list-body { flex: 1 1 auto; overflow-y: auto; padding: 8px; scrollbar-width: thin; }
        .msg-list-body::-webkit-scrollbar { width: 6px; }
        .msg-list-body::-webkit-scrollbar-thumb { background: var(--hair); border-radius: 9px; }
        .msg-conv {
          display: flex;
          align-items: center;
          gap: 12px;
          width: 100%;
          text-align: left;
          padding: 10px 12px;
          border: none;
          background: transparent;
          border-radius: 14px;
          cursor: pointer;
          transition: background 0.15s ease;
        }
        .msg-conv:hover { background: var(--surface-2); }
        .msg-conv[data-on="1"] { background: rgba(232,161,92,0.12); }
        .msg-conv-av { position: relative; flex: 0 0 auto; }
        .msg-dot {
          position: absolute; right: -1px; bottom: -1px;
          width: 12px; height: 12px; border-radius: 50%;
          background: var(--green); border: 2px solid var(--surface);
          box-shadow: 0 0 6px rgba(127,176,105,0.7);
        }
        .msg-conv-main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
        .msg-conv-top { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
        .msg-conv-name {
          font-family: var(--font-display); font-weight: 700; font-size: 14.5px; color: var(--text);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0;
        }
        .msg-conv-time { flex: 0 0 auto; font-family: var(--font-mono); font-size: 10.5px; color: var(--muted); }
        .msg-conv-prev {
          font-size: 13px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .msg-conv-prev[data-unread="1"] { color: var(--text); font-weight: 600; }
        .msg-unread {
          flex: 0 0 auto; min-width: 20px; height: 20px; padding: 0 6px; border-radius: 99px;
          background: linear-gradient(135deg, var(--ember), var(--terra)); color: #160E08;
          font-family: var(--font-mono); font-size: 10px; font-weight: 700;
          display: inline-flex; align-items: center; justify-content: center;
          box-shadow: 0 2px 10px rgba(255,106,61,0.45);
        }
        /* ── Thread ── */
        .msg-thread-empty, .msg-thread-body, .msg-list-body, .msg-empty { min-height: 0; }
        .msg-thread-empty {
          flex: 1 1 auto; display: flex; flex-direction: column; align-items: center; justify-content: center;
          text-align: center; padding: 30px;
        }
        .msg-thread-head {
          display: flex; align-items: center; gap: 12px; padding: 12px 16px;
          border-bottom: 1px solid var(--hair); flex: 0 0 auto;
        }
        .msg-back {
          display: none; flex: 0 0 auto; width: 34px; height: 34px; border-radius: 10px;
          border: 1px solid var(--hair); background: var(--surface-2); color: var(--text);
          font-size: 22px; line-height: 1; cursor: pointer;
        }
        .msg-thread-av { flex: 0 0 auto; }
        .msg-thread-id { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; }
        .msg-thread-name {
          font-family: var(--font-display); font-weight: 700; font-size: 15.5px; color: var(--text);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .msg-thread-link { text-decoration: none; }
        .msg-thread-link:hover { color: var(--amber); }
        .msg-thread-sub { font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted-strong); }
        .msg-menu-wrap { position: relative; flex: 0 0 auto; }
        .msg-more {
          width: 34px; height: 34px; border-radius: 10px; border: 1px solid var(--hair);
          background: var(--surface-2); color: var(--muted-strong); font-size: 18px; cursor: pointer;
        }
        .msg-more:hover { border-color: var(--amber); color: var(--amber); }
        .msg-menu {
          position: absolute; top: calc(100% + 6px); right: 0; z-index: 20;
          background: var(--surface); border: 1px solid var(--hair); border-radius: 12px;
          box-shadow: 0 20px 50px rgba(0,0,0,0.5); padding: 6px; min-width: 140px;
        }
        .msg-menu-item {
          display: block; width: 100%; text-align: left; padding: 9px 12px; border: none;
          background: transparent; color: var(--text); font-size: 14px; border-radius: 8px; cursor: pointer;
        }
        .msg-menu-item:hover { background: var(--surface-2); }
        .msg-menu-danger { color: var(--terra); }
        .msg-report { padding: 12px 16px; border-bottom: 1px solid var(--hair); display: flex; flex-direction: column; gap: 8px; }
        .msg-report-ta {
          width: 100%; resize: vertical; border-radius: var(--radius-sm); border: 1px solid var(--hair);
          background: var(--surface-2); color: var(--text); padding: 10px 12px; font-size: 13px; font-family: var(--font-body);
        }
        .msg-thread-body { flex: 1 1 auto; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 8px; scrollbar-width: thin; }
        .msg-thread-body::-webkit-scrollbar { width: 6px; }
        .msg-thread-body::-webkit-scrollbar-thumb { background: var(--hair); border-radius: 9px; }
        .msg-row { display: flex; }
        .msg-row-mine { justify-content: flex-end; }
        .msg-bubble-wrap { display: flex; flex-direction: column; max-width: 74%; gap: 2px; }
        .msg-row-mine .msg-bubble-wrap { align-items: flex-end; }
        .msg-sender { font-size: 11px; font-family: var(--font-mono); color: var(--amber); padding: 0 4px; }
        .msg-bubble {
          padding: 10px 14px; border-radius: 16px; border-top-left-radius: 6px;
          background: var(--surface-2); border: 1px solid var(--hair); color: var(--text);
          font-size: 14.5px; line-height: 1.45; white-space: pre-wrap; word-break: break-word;
        }
        .msg-bubble-mine {
          border-top-left-radius: 16px; border-top-right-radius: 6px;
          background: linear-gradient(135deg, rgba(232,161,92,0.9), rgba(255,106,61,0.82));
          border: 1px solid rgba(232,161,92,0.5); color: #1A1206; font-weight: 500;
        }
        .msg-time { font-family: var(--font-mono); font-size: 10px; color: var(--muted); padding: 0 4px; }
        .msg-composer { flex: 0 0 auto; display: flex; gap: 10px; padding: 12px 14px; border-top: 1px solid var(--hair); align-items: flex-end; }
        .msg-input {
          flex: 1 1 auto; resize: none; max-height: 140px; min-height: 44px;
          border-radius: 14px; border: 1px solid var(--hair); background: var(--surface-2);
          color: var(--text); padding: 12px 14px; font-size: 14.5px; line-height: 1.4; font-family: var(--font-body);
        }
        .msg-input:focus { outline: none; border-color: var(--amber); }
        .msg-send { flex: 0 0 auto; padding: 12px 20px; }
        .msg-blocked-note { flex: 1; text-align: center; color: var(--muted-strong); font-size: 13.5px; padding: 6px; }
        .msg-hint { color: var(--muted-strong); font-size: 13.5px; padding: 16px; text-align: center; }
        .msg-empty { padding: 24px; text-align: center; }
        .msg-linkbtn { background: none; border: none; color: var(--amber); font-size: 13.5px; cursor: pointer; text-decoration: underline; text-underline-offset: 2px; padding: 0; }
        .msg-linkbtn:disabled { opacity: 0.6; cursor: default; }
        .msg-btn-ghost {
          padding: 8px 14px; border-radius: var(--radius-sm); background: var(--surface-2);
          border: 1px solid var(--hair); color: var(--text); font-size: 13px; cursor: pointer;
        }
        .msg-btn-danger { color: var(--terra); border-color: rgba(192,86,59,0.35); }

        /* ── Mobile: single column, toggle panes ── */
        @media (max-width: 860px) {
          .msg-shell { grid-template-columns: 1fr; height: min(78vh, 720px); }
          .msg-back { display: inline-flex; }
          .msg-shell[data-view="list"] .msg-thread { display: none; }
          .msg-shell[data-view="thread"] .msg-list { display: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          .msg-conv, .msg-input { transition: none !important; }
        }
      `}</style>
    </div>
  );
}
