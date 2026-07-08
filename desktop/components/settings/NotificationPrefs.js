"use client";

import { useEffect, useState } from "react";
import { bfu } from "@/lib/client-api";
import { useToast } from "@/lib/useToast";

// The categories rendered under the master switch, in order. Each maps to a
// backend preference key (see app.services.notifications.NOTIF_PREF_KEYS).
const CATEGORIES = [
  { key: "messages", label: "Messages", desc: "When someone sends you a direct message." },
  { key: "interest", label: "Interest & matches", desc: "When someone is interested in you, or you have a new match." },
  { key: "applications", label: "Project applications", desc: "Applications to your projects, and decisions on the ones you send." },
  { key: "project_updates", label: "Project updates", desc: "When a project you're on posts an update." },
  { key: "bookings", label: "Mentor sessions", desc: "Session requests, confirmations and declines." },
  { key: "weekly_digest", label: "Weekly digest", desc: "Your weekly Telegram summary of what's new in the city." },
];

// Opt-out model: every key defaults to enabled. Used to fill any key the server
// omits so a toggle never reads `undefined`.
const DEFAULT_PREFS = {
  messages: true, interest: true, applications: true, project_updates: true,
  bookings: true, weekly_digest: true, telegram_push: true,
};

// role=switch toggle. --ember track when on, --surface-2 / --hair when off.
// The knob uses .ch-toggle-knob so it glides (and snaps under reduced-motion).
function Switch({ on, onToggle, disabled, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      style={{
        flex: "0 0 auto",
        width: 46,
        height: 26,
        borderRadius: 99,
        border: "none",
        padding: 0,
        cursor: disabled ? "default" : "pointer",
        background: on ? "var(--ember)" : "var(--surface-2)",
        boxShadow: on ? "none" : "inset 0 0 0 1px var(--hair)",
        position: "relative",
        transition: "background 0.2s ease",
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <span
        className="ch-toggle-knob"
        aria-hidden
        style={{
          position: "absolute",
          top: 3,
          left: on ? 23 : 3,
          width: 20,
          height: 20,
          borderRadius: "50%",
          background: "#fff",
          boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
        }}
      />
    </button>
  );
}

function Row({ label, desc, on, onToggle, disabled, dim }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 16,
        padding: "15px 0",
        opacity: dim ? 0.5 : 1,
        transition: "opacity 0.2s ease",
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 15, color: "var(--text)" }}>{label}</div>
        <div style={{ marginTop: 3, fontSize: 13, color: "var(--muted-strong)", lineHeight: 1.5 }}>
          {desc}
        </div>
      </div>
      <Switch on={on} onToggle={onToggle} disabled={disabled} label={label} />
    </div>
  );
}

export default function NotificationPrefs({ initialPrefs }) {
  // Seed from SSR when available; otherwise show defaults and fetch on mount.
  const [prefs, setPrefs] = useState(() => ({ ...DEFAULT_PREFS, ...(initialPrefs || {}) }));
  const [loaded, setLoaded] = useState(!!initialPrefs);
  const { toast, flash } = useToast(3200);

  useEffect(() => {
    if (initialPrefs) return; // already hydrated by the server
    let alive = true;
    bfu("/users/me/notification-prefs")
      .then((res) => {
        if (alive && res?.prefs) setPrefs({ ...DEFAULT_PREFS, ...res.prefs });
      })
      .catch(() => {
        /* leave defaults visible; a toggle will surface any real save error */
      })
      .finally(() => {
        if (alive) setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, [initialPrefs]);

  async function toggle(key) {
    const next = !prefs[key];
    const prev = prefs;
    setPrefs({ ...prefs, [key]: next }); // optimistic
    try {
      const res = await bfu("/users/me/notification-prefs", {
        method: "PATCH",
        body: { [key]: next },
      });
      // Reconcile with the server's authoritative resolved map.
      if (res?.prefs) setPrefs({ ...DEFAULT_PREFS, ...res.prefs });
    } catch (err) {
      setPrefs(prev); // revert on failure
      flash(err?.message || "Couldn't save that — try again.", "err");
    }
  }

  const masterOn = prefs.telegram_push;

  return (
    <div className="ch-cell-static" style={{ display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div>
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: 16,
            letterSpacing: "-0.01em",
            color: "var(--text)",
          }}
        >
          Notifications
        </div>
        <div style={{ marginTop: 6, fontSize: 13, color: "var(--muted-strong)", lineHeight: 1.5 }}>
          Choose what reaches your Telegram. Your in-app inbox always keeps everything.
        </div>
      </div>

      {/* Master switch */}
      <div
        style={{
          marginTop: 16,
          padding: 16,
          borderRadius: "var(--radius-sm)",
          background: "var(--surface-2)",
          border: `1px solid ${masterOn ? "rgba(255,106,61,0.30)" : "var(--hair)"}`,
          transition: "border-color 0.2s ease",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 15, color: "var(--text)" }}>Telegram push</div>
            <div style={{ marginTop: 3, fontSize: 13, color: "var(--muted-strong)", lineHeight: 1.5 }}>
              Send notifications to your Telegram. Turn off to only see them in the app.
            </div>
          </div>
          <Switch
            on={masterOn}
            onToggle={() => toggle("telegram_push")}
            disabled={!loaded}
            label="Telegram push"
          />
        </div>
        {!masterOn ? (
          <div
            style={{
              marginTop: 12,
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              color: "var(--amber)",
            }}
          >
            In-app inbox stays on
          </div>
        ) : null}
      </div>

      {/* Category rows */}
      <div style={{ marginTop: 6, display: "flex", flexDirection: "column" }}>
        {CATEGORIES.map((c, i) => (
          <div
            key={c.key}
            style={{ borderTop: i === 0 ? "none" : "1px solid var(--hair)" }}
          >
            <Row
              label={c.label}
              desc={c.desc}
              on={prefs[c.key]}
              onToggle={() => toggle(c.key)}
              disabled={!loaded}
              dim={!masterOn}
            />
          </div>
        ))}
      </div>

      {/* Toast (revert/failure feedback) */}
      {toast ? (
        <div
          className="ch-toast ch-toast-show"
          role="status"
          aria-live="polite"
          style={{
            bottom: 96,
            borderColor: toast.tone === "err" ? "rgba(192,86,59,0.5)" : "rgba(127,176,105,0.5)",
          }}
        >
          <span
            className="ch-toast-tx"
            style={{ color: toast.tone === "err" ? "var(--terra)" : "var(--text)" }}
          >
            {toast.text}
          </span>
        </div>
      ) : null}
    </div>
  );
}
