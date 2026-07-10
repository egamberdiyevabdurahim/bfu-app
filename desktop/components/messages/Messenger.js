"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { bfu } from "@/lib/client-api";
import { subscribe as wsSubscribe, sendTyping as wsSendTyping } from "@/lib/ws";
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
// When the realtime socket is connected, new messages arrive by push, so the
// thread poll relaxes to a slow safety-net sweep instead of every 6s.
const THREAD_POLL_SLOW_MS = 30000;

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
  const [threadMembers, setThreadMembers] = useState([]); // for read receipts (✓✓ seen)
  const [replyTo, setReplyTo] = useState(null);   // tapped msg being replied to (live object)
  const [editing, setEditing] = useState(null);   // msg being edited (live object)
  const [openMsgId, setOpenMsgId] = useState(null); // id of the message whose action menu is open
  const [dividerBeforeId, setDividerBeforeId] = useState(null); // "New messages" anchor (a message id)
  const [threadStarted, setThreadStarted] = useState(null); // conversation started_at → context line
  const [threadKind, setThreadKind] = useState(null); // "project" | "dm" from the members response (survives deep-link before the list loads)
  const [peerTyping, setPeerTyping] = useState(null); // name string while the other side is typing (null = nobody)
  const [wsLive, setWsLive] = useState(false); // realtime socket connected

  const threadBodyRef = useRef(null);
  const composerRef = useRef(null);
  const pendingUnreadRef = useRef(0); // unread count snapshotted at open, before mark-read zeroes it
  const atBottomRef = useRef(true); // is the thread scrolled near the bottom? (gates autoscroll)
  const messagesRef = useRef([]); // mirror of `messages` for the poll merge (loadThread doesn't close over it)
  const lastCount = useRef(0); // last message count the autoscroll effect acted on
  const typingTimer = useRef(0); // clears the peer-typing indicator after a lull
  const lastMarkedRef = useRef(null); // newest id we've marked-read (avoids duplicate read POSTs on push)
  // Live ref so the once-registered WS handler always sees the current thread.
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;

  const active = Array.isArray(conversations)
    ? conversations.find((c) => c.id === activeId) || null
    : null;

  // Read receipts: how many *other* members have read a message sent at `iso`.
  // Backend timestamps are naive UTC — normalize both sides identically so the
  // comparison is offset-safe regardless of the viewer's timezone.
  const asMs = (s) => (s ? new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s + "Z").getTime() : NaN);
  const fmtDay = (s) => {
    const ms = asMs(s);
    // Pin to Tashkent so the join/started date matches the app's "all times
    // Tashkent" rule regardless of the viewer's device timezone.
    return Number.isNaN(ms)
      ? ""
      : new Date(ms).toLocaleDateString("en-GB", { timeZone: "Asia/Tashkent", day: "numeric", month: "short" });
  };
  const otherMembers = threadMembers.filter((m) => m.id !== meId);
  const seenBy = (iso) => {
    const t0 = asMs(iso);
    if (Number.isNaN(t0)) return 0;
    let n = 0;
    for (const m of otherMembers) {
      const lr = asMs(m.last_read_at);
      if (!Number.isNaN(lr) && lr >= t0) n++;
    }
    return n;
  };


  // Scroll to a replied-to parent if it's still in the loaded window.
  const scrollToMessage = (id) => {
    const el = threadBodyRef.current?.querySelector(`[data-mid="${id}"]`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  // Context lines shown at the top of a thread: a project chat lists who started
  // it + who joined and when; a DM shows when the conversation began.
  const withDay = (label, iso) => {
    const d = fmtDay(iso);
    return d ? `${label} · ${d}` : label; // no dangling "· " when the date is unknown
  };
  const contextLines = (() => {
    const kind = threadKind || active?.kind; // members-response kind first (survives deep-link before the list loads)
    if (kind === "project") {
      if (!threadMembers.length) return [];
      // Creator first, then members oldest-join first; unknown joined_at sinks below known ones.
      return [...threadMembers]
        .sort((a, b) => {
          if (a.is_creator !== b.is_creator) return a.is_creator ? -1 : 1;
          const av = asMs(a.joined_at);
          const bv = asMs(b.joined_at);
          return (Number.isNaN(av) ? Infinity : av) - (Number.isNaN(bv) ? Infinity : bv);
        })
        .map((m) => ({
          key: m.id,
          text: m.is_creator
            ? withDay(t("messages.started_project", { name: m.display_name }), m.joined_at || threadStarted)
            : withDay(t("messages.joined_team", { name: m.display_name }), m.joined_at),
        }));
    }
    return threadStarted ? [{ key: "dm", text: withDay(t("messages.chat_started"), threadStarted) }] : [];
  })();

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
        if (silent) {
          // Merge, don't clobber: full-replacing here would wipe any "Load
          // earlier" history and snap scroll to the bottom. Update existing rows
          // in place (so others' edits/deletes propagate), keep older
          // paginated-in rows, and append genuinely-new messages.
          const cur = messagesRef.current;
          const curMax = cur.reduce((mx, m) => (m.id > mx ? m.id : mx), 0);
          const oldestIncoming = msgs.length ? msgs[0].id : Infinity;
          // If a burst pushed >30 messages between polls, this newest-30 page has
          // no overlap with what we hold → a blind append would leave a permanent
          // hole. Fall back to a clean full replace (also covers a first-empty thread).
          if (!cur.length || (msgs.length && oldestIncoming > curMax)) {
            setMessages(msgs);
            setHasMore(!!r?.has_more);
          } else {
            const incoming = new Map(msgs.map((m) => [m.id, m]));
            const seen = new Set(cur.map((m) => m.id));
            const merged = cur.map((m) => {
              const inc = incoming.get(m.id);
              if (!inc) return m;
              // Don't let a stale in-flight snapshot resurrect a row we just deleted.
              if (m.deleted && !inc.deleted) return m;
              return { ...m, ...inc };
            });
            for (const m of msgs) if (!seen.has(m.id)) merged.push(m);
            setMessages(merged);
          }
        } else {
          setMessages(msgs);
          setHasMore(!!r?.has_more);
        }
        setThreadState("ready");
        // On the FIRST load, anchor the "New messages" divider to a concrete
        // message id (the first unread), captured BEFORE mark-read zeroes the
        // count. An id (not an index) survives pagination + polling.
        if (!silent) {
          const u = pendingUnreadRef.current || 0;
          pendingUnreadRef.current = 0;
          setDividerBeforeId(u > 0 && msgs.length > 0 ? msgs[Math.max(0, msgs.length - u)]?.id ?? null : null);
        }
        // Mark read only when the newest loaded message actually changed, so
        // idle poll ticks don't POST /read + reload the whole list every interval.
        const newestId = msgs.length ? msgs[msgs.length - 1].id : null;
        if (newestId != null && newestId !== lastMarkedRef.current) {
          lastMarkedRef.current = newestId;
          bfu(`/conversations/${id}/read`, { method: "POST" })
            .then(() => loadList())
            .catch(() => {});
        }
      } catch (e) {
        if (!silent) setThreadState("error");
      }
    },
    [loadList]
  );

  // Roster + per-member last_read_at → drives read receipts. Best-effort;
  // refreshed on open and on each poll tick so "seen" appears as others read.
  const loadMembers = useCallback(async (id) => {
    if (!id) return;
    try {
      const r = await bfu(`/conversations/${id}/members`);
      setThreadMembers(Array.isArray(r?.members) ? r.members : []);
      setThreadStarted(r?.started_at ?? null);
      setThreadKind(r?.kind ?? null);
    } catch {
      /* receipts are non-critical — leave the last known roster */
    }
  }, []);

  // Open a thread: reset state, load the first page + roster.
  useEffect(() => {
    if (!activeId) return;
    setBlockedLocal(false);
    setMenuOpen(false);
    setShowReport(false);
    setThreadMembers([]);
    setThreadStarted(null);
    setThreadKind(null);
    setReplyTo(null);
    setEditing(null);
    setOpenMsgId(null);
    setDraft("");
    setDividerBeforeId(null);
    setPeerTyping(null);
    lastMarkedRef.current = null;
    atBottomRef.current = true; // a freshly opened thread starts pinned to newest
    lastCount.current = 0; // force the autoscroll effect to fire even if the new thread has the same count
    // Snapshot the unread count NOW (before loadThread's mark-read zeroes it) so
    // the "New messages" divider can anchor to the right message.
    const openConv = Array.isArray(conversations) ? conversations.find((c) => c.id === activeId) : null;
    pendingUnreadRef.current = openConv?.unread || 0;
    loadThread(activeId);
    loadMembers(activeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, loadThread, loadMembers]);

  // Safety-net poll for the open thread + live read-receipts. Relaxes to a slow
  // sweep when the realtime socket is connected (messages then push in), and
  // reverts to the fast poll if it drops. Paused while the tab is hidden.
  useEffect(() => {
    if (!activeId) return;
    const period = wsLive ? THREAD_POLL_SLOW_MS : THREAD_POLL_MS;
    let timer = null;
    const start = () => {
      stop();
      timer = window.setInterval(() => {
        loadThread(activeId, { silent: true });
        loadMembers(activeId); // keep "seen" live as others read
      }, period);
    };
    const stop = () => {
      if (timer) window.clearInterval(timer);
      timer = null;
    };
    const onVis = () => {
      if (document.hidden) stop();
      else {
        loadThread(activeId, { silent: true });
        loadMembers(activeId);
        start();
      }
    };
    start();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [activeId, wsLive, loadThread, loadMembers]);

  // ── Realtime socket (one subscription for the whole component) ────────────
  // Injects pushed messages into the open thread + refreshes the list live, and
  // surfaces the other side's typing indicator. Registered once; reads the
  // current conversation via activeIdRef so it never re-subscribes.
  useEffect(() => {
    const off = wsSubscribe((msg) => {
      if (msg.type === "ws.ready") { setWsLive(true); return; }
      if (msg.type === "ws.closed") { setWsLive(false); return; }
      if (msg.type === "message.new") {
        const cid = msg.conversation_id;
        const m = msg.message;
        if (!m || m.id == null) return;
        if (cid === activeIdRef.current) {
          setMessages((cur) => {
            if (cur.some((x) => x.id === m.id)) return cur; // dedupe (incl. our own echo)
            return [...cur, m];
          });
          setPeerTyping(null);
          if (m.sender_id !== meId && m.id !== lastMarkedRef.current) {
            lastMarkedRef.current = m.id;
            bfu(`/conversations/${cid}/read`, { method: "POST" })
              .then(() => scheduleListRefresh())
              .catch(() => {});
          }
        }
        scheduleListRefresh(); // keep previews / unread badges fresh (debounced)
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

  // Autoscroll to the newest message when the count grows — but only if the user
  // is already near the bottom, so a polled-in message doesn't yank them away
  // from history they've scrolled up to read. atBottomRef is kept fresh by the
  // thread body's onScroll and reset to true on each conversation open.
  useEffect(() => {
    messagesRef.current = messages; // keep the poll-merge mirror fresh
    const el = threadBodyRef.current;
    if (!el) return;
    if (messages.length !== lastCount.current) {
      if (atBottomRef.current) el.scrollTop = el.scrollHeight;
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
    setPeerTyping(null);
    router.replace("/messages", { scroll: false });
  }

  // ── Per-message actions (copy / reply / edit / delete) ────────────────────
  async function copyMsg(m) {
    // Explicit guard: `?.` would let a missing clipboard API resolve silently and
    // wrongly flash "Copied". Only claim success when we actually wrote.
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(m.body || "");
        flash(t("messages.copied"));
      } else {
        flash(m.body || ""); // no clipboard API → surface the text so it can be copied by hand
      }
    } catch {
      flash(m.body || "");
    }
    setOpenMsgId(null);
  }

  function startReply(m) {
    setReplyTo(m);
    if (editing) setDraft(""); // leaving an edit → drop its prefilled text so it isn't sent as the reply
    setEditing(null); // reply and edit are mutually exclusive
    setOpenMsgId(null);
    requestAnimationFrame(() => composerRef.current?.focus());
  }

  function startEdit(m) {
    setEditing(m);
    setReplyTo(null);
    setDraft(m.body || ""); // prefill the composer with the existing text
    setOpenMsgId(null);
    requestAnimationFrame(() => composerRef.current?.focus());
  }

  async function doDelete(m) {
    setOpenMsgId(null);
    try {
      // Soft-delete: server keeps the row (returns {ok,id}, not 204) so replies
      // stay intact. Flip locally; the next poll re-affirms deleted:true.
      await bfu(`/conversations/${activeId}/messages/${m.id}`, { method: "DELETE" });
      setMessages((arr) => arr.map((x) => (x.id === m.id ? { ...x, deleted: true, body: "" } : x)));
      loadList();
    } catch (e) {
      flash(e?.message || t("messages.toast_send_failed"), "error");
    }
  }

  function cancelComposerContext() {
    setReplyTo(null);
    if (editing) setDraft(""); // clearing an edit wipes the prefilled draft
    setEditing(null);
  }

  // ── Send (routes to edit vs new; carries reply_to_id) ─────────────────────
  async function send() {
    const text = draft.trim();
    if (!text || sending || !activeId) return;
    setSending(true);
    try {
      if (editing) {
        // EDIT: PATCH body only; merge the returned MessageOut in place.
        const updated = await bfu(`/conversations/${activeId}/messages/${editing.id}`, {
          method: "PATCH",
          body: { body: text },
        });
        setMessages((m) => m.map((x) => (x.id === editing.id ? { ...x, ...updated } : x)));
        setEditing(null);
        setDraft("");
      } else {
        const created = await bfu(`/conversations/${activeId}/messages`, {
          method: "POST",
          body: { body: text, reply_to_id: replyTo?.id ?? null },
        });
        setDraft("");
        setReplyTo(null);
        atBottomRef.current = true; // a self-send always pins to the newest, even if scrolled up
        // Dedupe: the direct-WS echo of our own message may beat this proxied
        // POST response, so guard against a double-append (duplicate React key).
        if (created && created.id) {
          setMessages((m) => (m.some((x) => x.id === created.id) ? m : [...m, created]));
        } else {
          loadThread(activeId, { silent: true });
        }
      }
      // Refresh the left-hand list preview for BOTH paths (editing the newest
      // message changes its last_message text too).
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

  // Close the per-message action menu on outside click / Escape (own state +
  // own wrapper selector so it never conflicts with the header ⋯ menu above).
  useEffect(() => {
    if (!openMsgId) return;
    const onDown = (e) => {
      const el = e.target;
      if (!(el instanceof Element) || !el.closest(".msg-msgmenu-wrap")) setOpenMsgId(null);
    };
    const onKey = (e) => e.key === "Escape" && setOpenMsgId(null);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [openMsgId]);

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
                  <span className="msg-thread-sub" data-typing={peerTyping != null ? "1" : undefined}>
                    {peerTyping != null
                      ? (active.kind === "project" && peerTyping
                          ? t("messages.typing_name", { name: peerTyping })
                          : t("messages.typing"))
                      : active.kind === "project"
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

          <div
            className="msg-thread-body"
            ref={threadBodyRef}
            onScroll={(e) => {
              const el = e.currentTarget;
              atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
            }}
          >
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
            {threadState === "ready" && !hasMore && contextLines.map((c) => (
              <div key={c.key} className="msg-systemline">{c.text}</div>
            ))}
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
                <Fragment key={m.id}>
                  {dividerBeforeId != null && m.id === dividerBeforeId && (
                    <div className="msg-newdivider">{t("messages.new_messages")}</div>
                  )}
                  <div className={`msg-row${mine ? " msg-row-mine" : ""}`} data-mid={m.id}>
                    <div className="msg-bubble-wrap">
                      {showSender && (
                        <span className="msg-sender">{m.sender?.display_name || t("messages.sender_fallback")}</span>
                      )}

                      {m.reply_to && (
                        <button type="button" className="msg-quote" onClick={() => scrollToMessage(m.reply_to.id)}>
                          <span className="msg-quote-name">{m.reply_to.sender_name || t("messages.someone")}</span>
                          <span className="msg-quote-body">{m.reply_to.body || t("messages.deleted_short")}</span>
                        </button>
                      )}

                      <div className={`msg-bubble${mine ? " msg-bubble-mine" : ""}${m.deleted ? " msg-bubble-deleted" : ""}`}>
                        {m.deleted ? t("messages.msg_deleted") : m.body}
                      </div>

                      {!m.deleted && (
                        <div className="msg-msgmenu-wrap">
                          <button
                            type="button"
                            className="msg-msgmenu-trigger"
                            aria-label={t("messages.actions")}
                            aria-haspopup="menu"
                            aria-expanded={openMsgId === m.id}
                            onClick={() => setOpenMsgId(openMsgId === m.id ? null : m.id)}
                          >⋯</button>
                          {openMsgId === m.id && (
                            <div role="menu" className={`msg-menu msg-msgmenu${mine ? " msg-msgmenu-mine" : ""}`}>
                              <button type="button" role="menuitem" className="msg-menu-item" onClick={() => copyMsg(m)}>{t("messages.copy")}</button>
                              <button type="button" role="menuitem" className="msg-menu-item" onClick={() => startReply(m)}>{t("messages.reply")}</button>
                              {mine && (
                                <button type="button" role="menuitem" className="msg-menu-item" onClick={() => startEdit(m)}>{t("messages.edit")}</button>
                              )}
                              {mine && (
                                <button type="button" role="menuitem" className="msg-menu-item msg-menu-danger" onClick={() => doDelete(m)}>{t("messages.delete")}</button>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      <span className="msg-time">
                        {relTime(m.created_at)}
                        {m.edited && !m.deleted && <span className="msg-edited">· {t("messages.edited")}</span>}
                        {mine && !m.deleted && (() => {
                          const n = seenBy(m.created_at);
                          if (active?.kind === "project") {
                            return n > 0 ? (
                              <span className="msg-receipt seen" title={`${t("messages.seen_by")} ${n}`}>✓✓ {n}</span>
                            ) : (
                              <span className="msg-receipt" title={t("messages.sent")}>✓</span>
                            );
                          }
                          return n > 0 ? (
                            <span className="msg-receipt seen" title={t("messages.seen")}>✓✓</span>
                          ) : (
                            <span className="msg-receipt" title={t("messages.sent")}>✓</span>
                          );
                        })()}
                      </span>
                    </div>
                  </div>
                </Fragment>
              );
            })}
          </div>

          {!blockedLocal && (replyTo || editing) && (
            <div className="msg-context">
              <div className="msg-context-text">
                <span className="msg-context-label">
                  {editing
                    ? t("messages.editing")
                    : t("messages.replying_to", { name: replyTo?.sender?.display_name || t("messages.someone") })}
                </span>
                <span className="msg-context-body">{(editing || replyTo)?.body}</span>
              </div>
              <button
                type="button"
                className="msg-context-close"
                aria-label={t("messages.cancel")}
                onClick={cancelComposerContext}
              >✕</button>
            </div>
          )}
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
                  onChange={(e) => { setDraft(e.target.value.slice(0, 4000)); if (activeId) wsSendTyping(activeId); }}
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
                  aria-label={editing ? t("messages.save") : t("messages.send_aria")}
                >
                  {sending ? "…" : editing ? t("messages.save") : t("messages.send")}
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
        .msg-thread-sub[data-typing="1"] { color: var(--teal-bright); }
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
        .msg-bubble-wrap { position: relative; display: flex; flex-direction: column; max-width: 74%; gap: 2px; }
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
        .msg-receipt { margin-left: 5px; font-size: 10px; letter-spacing: -0.5px; color: var(--muted); }
        .msg-receipt.seen { color: var(--teal-bright); }
        .msg-edited { font-family: var(--font-mono); font-size: 10px; color: var(--muted); opacity: 0.8; margin-left: 4px; }
        .msg-bubble-deleted { background: var(--surface-2); border: 1px dashed var(--hair); color: var(--muted); font-style: italic; font-weight: 400; }
        /* in-bubble quoted parent (reply) */
        .msg-quote {
          display: block; text-align: left; cursor: pointer; max-width: 240px;
          border: none; border-left: 2px solid var(--amber); background: var(--surface-2);
          border-radius: var(--radius-sm); padding: 5px 10px; margin-bottom: 1px;
        }
        .msg-quote-name { display: block; font-family: var(--font-mono); font-size: 10px; color: var(--amber); }
        .msg-quote-body { display: block; font-size: 12px; color: var(--muted-strong); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        /* per-message action menu (⋯), floated into the gutter so it never shifts layout */
        .msg-msgmenu-wrap { position: absolute; top: 0; z-index: 6; }
        .msg-row-mine .msg-msgmenu-wrap { left: 0; transform: translateX(-100%); padding-right: 4px; }
        .msg-row:not(.msg-row-mine) .msg-msgmenu-wrap { right: 0; transform: translateX(100%); padding-left: 4px; }
        .msg-msgmenu-trigger {
          opacity: 0; transition: opacity 0.12s; width: 24px; height: 24px; border-radius: 8px;
          border: 1px solid transparent; background: transparent; color: var(--muted); cursor: pointer;
          font-size: 15px; line-height: 1; display: flex; align-items: center; justify-content: center;
        }
        .msg-bubble-wrap:hover .msg-msgmenu-trigger { opacity: 1; }
        .msg-msgmenu-trigger:hover { background: var(--surface-2); color: var(--amber); }
        .msg-msgmenu-trigger:focus-visible { opacity: 1; outline: 2px solid var(--amber); }
        /* Touch/coarse pointers have no hover — keep the trigger reachable. */
        @media (hover: none), (pointer: coarse) { .msg-msgmenu-trigger { opacity: 0.55; } }
        /* Open UPWARD: the actioned message is usually near the bottom of the
           scroll area, where a downward menu would be clipped by overflow. */
        .msg-msgmenu { top: auto; bottom: calc(100% + 4px); }
        .msg-row-mine .msg-msgmenu { right: auto; left: 0; }
        .msg-row:not(.msg-row-mine) .msg-msgmenu { left: auto; right: 0; }
        /* conversation-start / joined-team context lines */
        .msg-systemline {
          align-self: center; max-width: 90%; margin: 2px 0; padding: 2px 10px; text-align: center;
          color: var(--muted); font-family: var(--font-mono); font-size: 10.5px; letter-spacing: 0.02em;
        }
        /* "New messages" unread divider */
        .msg-newdivider {
          align-self: center; margin: 6px 0; padding: 3px 12px; border-radius: 99px;
          background: rgba(255,106,61,0.14); border: 1px solid rgba(255,106,61,0.3); color: var(--ember);
          font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase;
        }
        /* composer reply/edit context banner */
        .msg-context {
          flex: 0 0 auto; display: flex; align-items: center; gap: 8px; margin: 0 14px;
          padding: 6px 10px; border-radius: var(--radius-sm); border-left: 2px solid var(--amber);
          background: var(--surface-2);
        }
        .msg-context-text { flex: 1; min-width: 0; }
        .msg-context-label { display: block; font-family: var(--font-mono); font-size: 10px; color: var(--amber); }
        .msg-context-body { display: block; font-size: 12px; color: var(--muted-strong); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .msg-context-close {
          flex: 0 0 auto; width: 26px; height: 26px; border-radius: 8px; border: 1px solid var(--hair);
          background: var(--surface); color: var(--muted-strong); cursor: pointer; font-size: 13px;
        }
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
