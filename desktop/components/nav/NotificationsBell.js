"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { bfu } from "@/lib/client-api";
import { gradientFor, initials } from "@/lib/avatar";
import { notifEmoji, notifText, notifHref, relTime } from "@/lib/notif";
import { useT } from "@/components/i18n/LocaleProvider";

// The unread badge + dropdown that lives in the shared AppTopBar. Polls
// GET /users/me/notifications/unread-count every 30s (and on mount); opening
// the dropdown loads GET /users/me/notifications. "Mark all read" POSTs
// …/notifications/read and clears the badge optimistically. "See all" → the
// full /notifications inbox.

const POLL_MS = 30000;

// A small round avatar for the actor, or the type emoji when there is no actor.
function NotifIcon({ n }) {
  const actor = n.actor;
  if (actor) {
    const name = actor.display_name || "?";
    return (
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: "50%",
          flex: "0 0 auto",
          background: gradientFor(actor.id ?? 0),
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: 13,
          color: "#160E08",
          overflow: "hidden",
        }}
      >
        {actor.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={actor.photo_url}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          initials(name)
        )}
      </div>
    );
  }
  return (
    <div
      style={{
        width: 34,
        height: 34,
        borderRadius: "50%",
        flex: "0 0 auto",
        background: "rgba(35,32,25,0.9)",
        border: "1px solid var(--hair)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 16,
      }}
    >
      {notifEmoji(n.type)}
    </div>
  );
}

export default function NotificationsBell() {
  const t = useT();
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(null); // null = not yet loaded
  const wrapRef = useRef(null);

  const loadCount = useCallback(async () => {
    try {
      const r = await bfu("/users/me/notifications/unread-count");
      setUnread(Number(r?.unread) || 0);
    } catch {
      // Silent — a transient failure shouldn't disrupt the top bar.
    }
  }, []);

  // Poll the unread count on mount + every 30s. Pause polling while the tab is
  // hidden (cheap + polite), resume + refresh on focus.
  useEffect(() => {
    loadCount();
    let timer = null;
    const start = () => {
      stop();
      timer = window.setInterval(loadCount, POLL_MS);
    };
    const stop = () => {
      if (timer) window.clearInterval(timer);
      timer = null;
    };
    const onVis = () => {
      if (document.hidden) {
        stop();
      } else {
        loadCount();
        start();
      }
    };
    start();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [loadCount]);

  // Close the dropdown on outside-click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = useCallback(async () => {
    const next = !open;
    setOpen(next);
    if (next) {
      // Refresh the list every time the dropdown opens.
      try {
        const r = await bfu("/users/me/notifications", { params: { limit: 8 } });
        setItems(Array.isArray(r?.items) ? r.items : []);
        if (typeof r?.unread === "number") setUnread(r.unread);
      } catch {
        setItems([]);
      }
    }
  }, [open]);

  const markAllRead = useCallback(async () => {
    // Optimistic: clear the badge + flag items read immediately.
    setUnread(0);
    setItems((prev) => (prev ? prev.map((n) => ({ ...n, is_read: true })) : prev));
    try {
      await bfu("/users/me/notifications/read", { method: "POST" });
    } catch {
      // Re-sync on failure so the badge reflects reality.
      loadCount();
    }
  }, [loadCount]);

  const badge = unread > 99 ? "99+" : String(unread);

  return (
    <div ref={wrapRef} style={{ position: "relative", flex: "0 0 auto" }}>
      <button
        type="button"
        onClick={toggle}
        aria-label={unread ? t("inbox.bell_aria_unread", { unread }) : t("inbox.bell_aria")}
        aria-haspopup="true"
        aria-expanded={open}
        className="ch-btn-ghost"
        style={{
          position: "relative",
          padding: "10px 12px",
          borderColor: open ? "var(--amber)" : undefined,
          background: open ? "rgba(35,32,25,0.9)" : undefined,
        }}
      >
        <span style={{ fontSize: 16, lineHeight: 1 }} aria-hidden>
          🔔
        </span>
        {unread > 0 && (
          <span
            aria-hidden
            style={{
              position: "absolute",
              top: -5,
              right: -5,
              minWidth: 18,
              height: 18,
              padding: "0 5px",
              borderRadius: 99,
              background: "linear-gradient(135deg, var(--ember), var(--terra))",
              color: "#160E08",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 700,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 2px 10px rgba(255,106,61,0.5)",
            }}
          >
            {/* Reuse the existing ping halo (auto-disabled under reduced-motion). */}
            <span
              className="ch-online-ping"
              style={{ background: "var(--ember)", opacity: 0.5 }}
            />
            <span style={{ position: "relative" }}>{badge}</span>
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 10px)",
            right: 0,
            width: 340,
            maxWidth: "calc(100vw - 32px)",
            background: "var(--surface)",
            border: "1px solid var(--hair)",
            borderRadius: 16,
            boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
            zIndex: 80,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 14px",
              borderBottom: "1px solid var(--hair)",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 700,
                fontSize: 15,
                color: "var(--text)",
              }}
            >
              {t("inbox.dropdown_title")}
            </span>
            <button
              type="button"
              onClick={markAllRead}
              disabled={unread === 0}
              style={{
                background: "none",
                border: "none",
                cursor: unread === 0 ? "default" : "pointer",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                letterSpacing: "0.04em",
                color: unread === 0 ? "var(--muted)" : "var(--amber)",
                opacity: unread === 0 ? 0.5 : 1,
                padding: 0,
              }}
            >
              {t("inbox.mark_all_read")}
            </button>
          </div>

          <div style={{ maxHeight: 360, overflowY: "auto" }}>
            {items === null ? (
              <div style={{ padding: 24, textAlign: "center", color: "var(--muted)" }}>
                <span className="ch-spin" aria-hidden style={{ marginRight: 8 }}>
                  ◠
                </span>
                {t("inbox.dropdown_loading")}
              </div>
            ) : items.length === 0 ? (
              <div
                style={{
                  padding: "28px 20px",
                  textAlign: "center",
                  color: "var(--muted)",
                  fontFamily: "var(--font-accent)",
                  fontStyle: "italic",
                  fontSize: 15,
                }}
              >
                {t("inbox.dropdown_empty")}
              </div>
            ) : (
              items.map((n) => {
                const href = notifHref(n);
                const inner = (
                  <div
                    style={{
                      display: "flex",
                      gap: 11,
                      alignItems: "center",
                      padding: "11px 14px",
                      borderBottom: "1px solid var(--hair)",
                      background: n.is_read ? "transparent" : "rgba(255,106,61,0.06)",
                    }}
                  >
                    <NotifIcon n={n} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 13,
                          lineHeight: 1.4,
                          color: "var(--text)",
                          opacity: n.is_read ? 0.75 : 1,
                        }}
                      >
                        <span style={{ marginRight: 5 }} aria-hidden>
                          {notifEmoji(n.type)}
                        </span>
                        {notifText(n, t)}
                      </div>
                      <div
                        style={{
                          marginTop: 2,
                          fontFamily: "var(--font-mono)",
                          fontSize: 10,
                          letterSpacing: "0.04em",
                          color: "var(--muted)",
                        }}
                      >
                        {relTime(n.created_at)}
                      </div>
                    </div>
                    {!n.is_read && (
                      <span
                        aria-hidden
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 99,
                          background: "var(--ember)",
                          flexShrink: 0,
                        }}
                      />
                    )}
                  </div>
                );
                return href ? (
                  <a
                    key={n.id}
                    href={href}
                    style={{ textDecoration: "none", display: "block" }}
                    onClick={() => setOpen(false)}
                  >
                    {inner}
                  </a>
                ) : (
                  <div key={n.id}>{inner}</div>
                );
              })
            )}
          </div>

          <a
            href="/notifications"
            onClick={() => setOpen(false)}
            style={{
              display: "block",
              textAlign: "center",
              padding: "11px 14px",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--amber)",
              textDecoration: "none",
            }}
          >
            {t("inbox.see_all")} →
          </a>
        </div>
      )}
    </div>
  );
}
