"use client";

import { useCallback, useEffect, useState } from "react";
import { bfu } from "@/lib/client-api";
import { gradientFor, initials } from "@/lib/avatar";
import { notifEmoji, notifText, notifHref, relTime } from "@/lib/notif";
import { useToast } from "@/components/ui/Toast";

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

function Row({ n }) {
  const href = notifHref(n);
  const inner = (
    <div
      style={{
        display: "flex",
        gap: 14,
        alignItems: "center",
        padding: "14px 16px",
        borderRadius: 14,
        border: "1px solid var(--hair)",
        background: n.is_read ? "var(--surface)" : "rgba(255,106,61,0.07)",
        borderColor: n.is_read ? "var(--hair)" : "rgba(255,106,61,0.28)",
        transition: "border-color 0.18s ease, background 0.18s ease",
      }}
    >
      <ActorIcon n={n} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, lineHeight: 1.4, color: "var(--text)", opacity: n.is_read ? 0.8 : 1 }}>
          <span style={{ marginRight: 6 }} aria-hidden>
            {notifEmoji(n.type)}
          </span>
          {notifText(n)}
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
    </div>
  );
  return href ? (
    <a href={href} style={{ textDecoration: "none", display: "block" }}>
      {inner}
    </a>
  ) : (
    inner
  );
}

export default function NotificationsInbox() {
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
      showToast("Marked all read");
    } catch {
      showToast("Couldn't reach the server", "err");
      load();
    }
  }, [unread, showToast, load]);

  return (
    <div style={{ marginTop: 34 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 18, flexWrap: "wrap" }}>
        <div className="ch-cell-label">
          {state === "ready" && items.length > 0
            ? `${items.length} recent · ${unread} unread`
            : "Your activity"}
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
          Mark all read
        </button>
      </div>

      {state === "loading" ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>
          <span className="ch-spin" aria-hidden style={{ marginRight: 8 }}>
            ◠
          </span>
          Loading your notifications…
        </div>
      ) : state === "error" ? (
        <div
          className="ch-cell"
          style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}
        >
          Couldn&apos;t load your notifications.{" "}
          <button
            type="button"
            onClick={() => {
              setState("loading");
              load();
            }}
            style={{ background: "none", border: "none", color: "var(--amber)", cursor: "pointer", padding: 0, fontSize: "inherit" }}
          >
            Try again
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
            You&apos;re all caught up
          </div>
          <div style={{ fontFamily: "var(--font-accent)", fontStyle: "italic", fontSize: 16, color: "var(--muted)", maxWidth: 380 }}>
            New follows, matches, applications and session updates will land here.
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {items.map((n) => (
            <Row key={n.id} n={n} />
          ))}
        </div>
      )}

      <Toast />
    </div>
  );
}
