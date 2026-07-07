"use client";

import { useEffect, useState } from "react";
import { bfu } from "@/lib/client-api";
import { gradientFor, initials } from "@/lib/avatar";
import { useToast } from "@/lib/useToast";

// Sessions (Batch 4). Loads GET /bookings/me →
//   { as_mentee:[row], as_mentor:[row] }
// where row = { id, slot_id, status, note, start_at, other:{id,display_name,
//   photo_url}, created_at }.
//
// Actions are PATCH /bookings/{id} { action } — verbs confirmed in the backend
// router (mentors.py:act_on_booking):
//   • mentor → "confirm" | "decline"   (only on a "requested" booking)
//   • mentee → "cancel"                (on "requested" or "confirmed")
// A finalized booking (declined/cancelled/confirmed-then-cancelled) can't be
// acted on again — the UI hides the buttons for terminal statuses.

const STATUS = {
  requested: { label: "Requested", color: "var(--amber)", bg: "rgba(232,161,92,0.14)", bd: "rgba(232,161,92,0.34)" },
  confirmed: { label: "Confirmed", color: "var(--green)", bg: "rgba(127,176,105,0.14)", bd: "rgba(127,176,105,0.34)" },
  declined: { label: "Declined", color: "var(--terra)", bg: "rgba(192,86,59,0.12)", bd: "rgba(192,86,59,0.3)" },
  cancelled: { label: "Cancelled", color: "var(--muted-strong)", bg: "var(--surface-2)", bd: "var(--hair)" },
};

function fmtWhen(iso) {
  if (!iso) return "Time TBA";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function StatusPill({ status }) {
  const s = STATUS[status] || STATUS.cancelled;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "4px 11px",
        borderRadius: "var(--radius-pill)",
        background: s.bg,
        border: `1px solid ${s.bd}`,
        color: s.color,
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
      }}
    >
      {s.label}
    </span>
  );
}

function Avatar({ id, name, photo, size = 44 }) {
  const [broken, setBroken] = useState(false);
  const showImg = photo && !broken;
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        flex: "0 0 auto",
        background: gradientFor(id),
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--font-display)",
        fontWeight: 800,
        fontSize: size * 0.36,
        color: "#160E08",
        overflow: "hidden",
      }}
    >
      {showImg ? (
        <img
          src={photo}
          alt={name}
          onError={() => setBroken(true)}
          style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }}
        />
      ) : (
        initials(name)
      )}
    </div>
  );
}

function Row({ booking, role, onAct, busy }) {
  const other = booking.other || {};
  const name = other.display_name || "A builder";
  const canMentorAct = role === "mentor" && booking.status === "requested";
  const canMenteeCancel = role === "mentee" && (booking.status === "requested" || booking.status === "confirmed");

  return (
    <div className="ch-cell-static" style={{ display: "flex", alignItems: "center", gap: 16, padding: 18, flexWrap: "wrap" }}>
      <Avatar id={other.id} name={name} photo={other.photo_url} />
      <div style={{ flex: 1, minWidth: 180 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {other.id != null ? (
            <a
              href={`/u/${other.id}`}
              style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 17, color: "var(--text)", textDecoration: "none" }}
            >
              {name}
            </a>
          ) : (
            <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 17, color: "var(--text)" }}>{name}</span>
          )}
          <StatusPill status={booking.status} />
        </div>
        <div style={{ marginTop: 4, fontSize: 13, color: "var(--muted-strong)", fontFamily: "var(--font-mono)", letterSpacing: "0.04em" }}>
          {fmtWhen(booking.start_at)}
        </div>
        {booking.note ? (
          <div style={{ marginTop: 6, fontSize: 14, lineHeight: 1.5, color: "var(--muted)", fontStyle: "italic" }}>
            “{booking.note}”
          </div>
        ) : null}
      </div>

      {(canMentorAct || canMenteeCancel) ? (
        <div style={{ display: "flex", gap: 10 }}>
          {canMentorAct ? (
            <>
              <button
                type="button"
                onClick={() => onAct(booking, "confirm")}
                disabled={busy === booking.id}
                className="ch-btn-primary"
                style={{ padding: "9px 16px", fontSize: 13, opacity: busy === booking.id ? 0.6 : 1 }}
              >
                Confirm
              </button>
              <button
                type="button"
                onClick={() => onAct(booking, "decline")}
                disabled={busy === booking.id}
                style={{
                  padding: "9px 14px",
                  fontSize: 13,
                  borderRadius: "var(--radius-pill)",
                  background: "rgba(192,86,59,0.1)",
                  border: "1px solid rgba(192,86,59,0.3)",
                  color: "var(--terra)",
                  cursor: busy === booking.id ? "default" : "pointer",
                  opacity: busy === booking.id ? 0.6 : 1,
                }}
              >
                Decline
              </button>
            </>
          ) : null}
          {canMenteeCancel ? (
            <button
              type="button"
              onClick={() => onAct(booking, "cancel")}
              disabled={busy === booking.id}
              style={{
                padding: "9px 14px",
                fontSize: 13,
                borderRadius: "var(--radius-pill)",
                background: "rgba(192,86,59,0.1)",
                border: "1px solid rgba(192,86,59,0.3)",
                color: "var(--terra)",
                cursor: busy === booking.id ? "default" : "pointer",
                opacity: busy === booking.id ? 0.6 : 1,
              }}
            >
              Cancel
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Empty({ title, body }) {
  return (
    <div className="ch-grace" style={{ minHeight: 150 }}>
      <span className="ch-grace-k">Nothing here yet</span>
      <div className="ch-grace-t">{title}</div>
      <div className="ch-grace-s">{body}</div>
    </div>
  );
}

export default function BookingsList() {
  const [state, setState] = useState("loading"); // loading | ready | error
  const [asMentee, setAsMentee] = useState([]);
  const [asMentor, setAsMentor] = useState([]);
  const [busy, setBusy] = useState(null);
  const { toast, flash } = useToast();

  useEffect(() => {
    let alive = true;
    bfu("/bookings/me")
      .then((res) => {
        if (!alive) return;
        setAsMentee(Array.isArray(res?.as_mentee) ? res.as_mentee : []);
        setAsMentor(Array.isArray(res?.as_mentor) ? res.as_mentor : []);
        setState("ready");
      })
      .catch(() => alive && setState("error"));
    return () => {
      alive = false;
    };
  }, []);

  // Optimistically flip the acted-on booking to its resulting status in the
  // correct list, then reconcile from the server's returned status.
  async function act(booking, action) {
    setBusy(booking.id);
    const resultGuess = action === "confirm" ? "confirmed" : action === "decline" ? "declined" : "cancelled";
    const setter = action === "cancel" ? setAsMentee : setAsMentor;
    const prevMentee = asMentee;
    const prevMentor = asMentor;
    setter((cur) => cur.map((b) => (b.id === booking.id ? { ...b, status: resultGuess } : b)));
    try {
      const res = await bfu(`/bookings/${booking.id}`, { method: "PATCH", body: { action } });
      const finalStatus = res?.status || resultGuess;
      setter((cur) => cur.map((b) => (b.id === booking.id ? { ...b, status: finalStatus } : b)));
      flash(
        action === "confirm" ? "Session confirmed." : action === "decline" ? "Request declined." : "Session cancelled."
      );
    } catch (e) {
      setAsMentee(prevMentee);
      setAsMentor(prevMentor);
      flash(e?.message || "Couldn't update the session.", "err");
    } finally {
      setBusy(null);
    }
  }

  if (state === "loading") {
    return (
      <div style={{ marginTop: 28, color: "var(--muted-strong)", fontSize: 14 }} role="status" aria-live="polite">
        <span className="ch-spin" aria-hidden style={{ marginRight: 8 }}>◠</span>
        Loading your sessions…
      </div>
    );
  }
  if (state === "error") {
    return (
      <div style={{ marginTop: 28, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }} role="status" aria-live="polite">
        <span style={{ color: "var(--terra)", fontSize: 14 }}>Couldn't load your sessions.</span>
        <button type="button" onClick={() => window.location.reload()} className="ch-btn-ghost">
          Try again
        </button>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 24 }}>
      {/* Incoming — only meaningful once you're a mentor with requests. Hidden
          entirely when you've never received one, to keep a learner's page clean. */}
      {asMentor.length > 0 ? (
        <section style={{ marginBottom: 8 }}>
          <div className="ch-slab" style={{ marginTop: 8 }}>
            <span className="ch-slab-k">You mentor</span>
            <h2>Requests to you</h2>
            <span className="ch-slab-line" />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
            {asMentor.map((b) => (
              <Row key={b.id} booking={b} role="mentor" onAct={act} busy={busy} />
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <div className="ch-slab" style={{ marginTop: asMentor.length > 0 ? 44 : 8 }}>
          <span className="ch-slab-k">You're learning</span>
          <h2>Your sessions</h2>
          <span className="ch-slab-line" />
        </div>
        {asMentee.length === 0 ? (
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
            <Empty
              title="You haven't booked a session yet."
              body="Find someone a few steps ahead of you and grab 15 minutes of their time."
            />
            <a href="/mentors" className="ch-btn-primary" style={{ marginTop: 16, display: "inline-flex" }}>
              Browse mentors →
            </a>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
            {asMentee.map((b) => (
              <Row key={b.id} booking={b} role="mentee" onAct={act} busy={busy} />
            ))}
          </div>
        )}
      </section>

      {toast ? (
        <div
          className="ch-toast ch-toast-show"
          role="status"
          style={{ borderColor: toast.tone === "err" ? "rgba(192,86,59,0.5)" : "rgba(127,176,105,0.5)" }}
        >
          <span className="ch-toast-tx" style={{ color: toast.tone === "err" ? "var(--terra)" : "var(--text)" }}>
            {toast.text}
          </span>
        </div>
      ) : null}
    </div>
  );
}
