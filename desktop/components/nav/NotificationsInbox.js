"use client";

import { useCallback, useEffect, useState } from "react";
import { bfu } from "@/lib/client-api";
import { gradientFor, initials } from "@/lib/avatar";
import { notifEmoji, notifText, notifHref, relTime } from "@/lib/notif";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/components/i18n/LocaleProvider";

// The full /notifications inbox list. Loads GET /users/me/notifications on
// mount (newest-first from the backend), renders each with icon / text / time /
// link, distinguishes unread, and offers "Mark all read" (POST …/read).

function ActorIcon({ n }) {
  const actor = n.actor;
  if (actor) {
    return (
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: "50%",
          flex: "0 0 auto",
          background: gradientFor(actor.id ?? 0),
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: 16,
          color: "#160E08",
          overflow: "hidden",
        }}
      >
        {actor.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={actor.photo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          initials(actor.display_name || "?")
        )}
      </div>
    );
  }
  return (
    <div
      style={{
        width: 44,
        height: 44,
        borderRadius: "50%",
        flex: "0 0 auto",
        background: "rgba(35,32,25,0.9)",
        border: "1px solid var(--hair)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 20,
      }}
    >
      {notifEmoji(n.type)}
    </div>
  );
}

function Row({ n, t }) {
  const href = notifHref(n);
  const linkable = Boolean(href);
  const [hover, setHover] = useState(false);
  const inner = (
    <div
      style={{
        display: "flex",
        gap: 14,
        alignItems: "center",
        padding: "14px 16px",
        borderRadius: 14,
        border: "1px solid var(--hair)",
        background:
          hover && linkable
            ? "rgba(255,106,61,0.12)"
            : n.is_read
            ? "var(--surface)"
            : "rgba(255,106,61,0.07)",
        borderColor:
          hover && linkable
            ? "rgba(255,106,61,0.5)"
            : n.is_read
            ? "var(--hair)"
            : "rgba(255,106,61,0.28)",
        cursor: linkable ? "pointer" : "default",
        transition: "border-color 0.18s ease, background 0.18s ease",
      }}
    >
      <ActorIcon n={n} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, lineHeight: 1.4, color: "var(--text)", opacity: n.is_read ? 0.8 : 1 }}>
          <span style={{ marginRight: 6 }} aria-hidden>
            {notifEmoji(n.type)}
          </span>
          {notifText(n, t)}
        </div>
        <div
          style={{
            marginTop: 3,
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: "0.04em",
            color: "var(--muted)",
          }}
        >
          {relTime(n.created_at)}
        </div>
      </div>
      {!n.is_read && (
        <span aria-hidden style={{ width: 9, height: 9, borderRadius: 99, background: "var(--ember)", flexShrink: 0 }} />
      )}
      {linkable && (
        <span
          aria-hidden
          style={{
            color: "var(--muted)",
            fontSize: 20,
            lineHeight: 1,
            flexShrink: 0,
            opacity: hover ? 1 : 0.45,
            transform: hover ? "translateX(2px)" : "none",
            transition: "opacity 0.18s ease, transform 0.18s ease",
          }}
        >
          ›
        </span>
      )}
    </div>
  );
  return href ? (
    <a
      href={href}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ textDecoration: "none", display: "block" }}
    >
      {inner}
    </a>
  ) : (
    inner
  );
}

export default function NotificationsInbox() {
  const t = useT();
  const [state, setState] = useState("loading"); // loading | ready | error
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const { showToast, Toast } = useToast();

  const load = useCallback(async () => {
    try {
      const r = await bfu("/users/me/notifications", { params: { limit: 100 } });
      setItems(Array.isArray(r?.items) ? r.items : []);
      setUnread(Number(r?.unread) || 0);
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const markAllRead = useCallback(async () => {
    if (unread === 0) return;
    setUnread(0);
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
    try {
      await bfu("/users/me/notifications/read", { method: "POST" });
      showToast(t("inbox.marked_all_read"));
    } catch {
      showToast(t("inbox.server_unreachable"), "err");
      load();
    }
  }, [unread, showToast, load, t]);

  return (
    <div style={{ marginTop: 34 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 18, flexWrap: "wrap" }}>
        <div className="ch-cell-label">
          {state === "ready" && items.length > 0
            ? t("inbox.count_summary", { count: items.length, unread })
            : t("inbox.your_activity")}
        </div>
        <button
          type="button"
          onClick={markAllRead}
          disabled={unread === 0}
          className="ch-btn-ghost"
          style={{ opacity: unread === 0 ? 0.5 : 1, cursor: unread === 0 ? "default" : "pointer" }}
        >
          <span style={{ color: "var(--amber)" }} aria-hidden>
            ✓
          </span>
          {t("inbox.mark_all_read")}
        </button>
      </div>

      {state === "loading" ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>
          <span className="ch-spin" aria-hidden style={{ marginRight: 8 }}>
            ◠
          </span>
          {t("inbox.loading")}
        </div>
      ) : state === "error" ? (
        <div
          className="ch-cell"
          style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}
        >
          {t("inbox.load_error")}{" "}
          <button
            type="button"
            onClick={() => {
              setState("loading");
              load();
            }}
            style={{ background: "none", border: "none", color: "var(--amber)", cursor: "pointer", padding: 0, fontSize: "inherit" }}
          >
            {t("inbox.try_again")}
          </button>
        </div>
      ) : items.length === 0 ? (
        <div
          className="ch-cell"
          style={{ textAlign: "center", padding: "56px 24px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}
        >
          <div style={{ fontSize: 40 }} aria-hidden>
            🌙
          </div>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 22, color: "var(--text)" }}>
            {t("inbox.caught_up_title")}
          </div>
          <div style={{ fontFamily: "var(--font-accent)", fontStyle: "italic", fontSize: 16, color: "var(--muted)", maxWidth: 380 }}>
            {t("inbox.empty_desc")}
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {items.map((n) => (
            <Row key={n.id} n={n} t={t} />
          ))}
        </div>
      )}

      <Toast />
    </div>
  );
}
