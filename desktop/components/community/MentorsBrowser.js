"use client";

import { useEffect, useState } from "react";
import { bfu } from "@/lib/client-api";
import { gradientFor, initials } from "@/lib/avatar";
import { useToast } from "@/lib/useToast";

// Mentors browser (Batch 4). Loads GET /mentors → each is
//   { id, display_name, photo_url, bio, topics:[], open_slots:int }.
// Booking a session:
//   GET  /mentors/{id}/slots      → { slots:[{id,start_at,status,duration_min}] }
//   POST /bookings {slot_id,note} → { ok, id, status:"requested" }
// The logged-in user's own mentoring (offer + delete slots) lives in a separate
// section, gated on `isMentor` (from GET /users/me → me.mentor.is_mentor):
//   POST   /mentors/me/slots {start_at}  (ISO-8601; server drops tz → naive UTC)
//   DELETE /mentors/me/slots/{slotId}
//
// start_at is sent as a full ISO-8601 string. The <input type="datetime-local">
// value is local wall-clock ("YYYY-MM-DDTHH:mm"); we convert to a real Date and
// send .toISOString() so the instant is unambiguous, then render slot times back
// in the viewer's locale.

function Avatar({ id, name, photo, size = 52 }) {
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

// A friendly, locale-aware rendering of an ISO instant.
function fmtWhen(iso) {
  if (!iso) return "";
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

function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div
      className="ch-toast ch-toast-show"
      role="status"
      style={{ borderColor: toast.tone === "err" ? "rgba(192,86,59,0.5)" : "rgba(127,176,105,0.5)" }}
    >
      <span className="ch-toast-tx" style={{ color: toast.tone === "err" ? "var(--terra)" : "var(--text)" }}>
        {toast.text}
      </span>
    </div>
  );
}

// ── Book-a-session panel: opens under a mentor card, loads their slots, lets
//    you pick one + add an optional note, then POST /bookings. Optimistic
//    "requested" per slot.
function BookPanel({ mentor, onBooked, flash, requested, onRequested }) {
  const [state, setState] = useState("loading"); // loading | ready | error
  const [slots, setSlots] = useState([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(null);
  const noteId = `book-note-${mentor.id}`;

  const load = () => {
    setState("loading");
    let alive = true;
    bfu(`/mentors/${mentor.id}/slots`)
      .then((res) => {
        if (!alive) return;
        setSlots(Array.isArray(res?.slots) ? res.slots : []);
        setState("ready");
      })
      .catch(() => alive && setState("error"));
    return () => {
      alive = false;
    };
  };

  useEffect(load, [mentor.id]);

  async function book(slot) {
    setBusy(slot.id);
    // Optimistic: mark as requested immediately (lifted to the parent so
    // re-opening the panel still shows this slot as already requested).
    onRequested(slot.id, true);
    try {
      await bfu("/bookings", { method: "POST", body: { slot_id: slot.id, note: note.trim() || undefined } });
      flash("Session requested — the mentor will confirm.");
      onBooked?.();
    } catch (e) {
      onRequested(slot.id, false);
      flash(e?.message || "Couldn't request that slot.", "err");
    } finally {
      setBusy(null);
    }
  }

  // Show open slots plus any this viewer just requested (so the "Requested ✓"
  // chip stays visible even though the server now reports them non-open).
  const open = slots.filter((s) => s.status === "open" || requested[s.id]);

  return (
    <div
      style={{
        marginTop: 16,
        paddingTop: 16,
        borderTop: "1px solid var(--hair)",
      }}
    >
      {state === "loading" ? (
        <div style={{ color: "var(--muted-strong)", fontSize: 13 }}>
          <span className="ch-spin" aria-hidden style={{ marginRight: 8 }}>◠</span>
          Loading open slots…
        </div>
      ) : state === "error" ? (
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ color: "var(--terra)", fontSize: 13 }}>Couldn't load slots.</span>
          <button type="button" onClick={load} className="ch-btn-ghost" style={{ fontSize: 12, padding: "6px 12px" }}>
            Try again
          </button>
        </div>
      ) : open.length === 0 ? (
        <div style={{ color: "var(--muted-strong)", fontFamily: "var(--font-accent)", fontStyle: "italic", fontSize: 15 }}>
          No open slots right now. Follow them and check back soon.
        </div>
      ) : (
        <>
          <label
            htmlFor={noteId}
            style={{
              display: "block",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--muted-strong)",
              marginBottom: 8,
            }}
          >
            A note for the mentor (optional)
          </label>
          <textarea
            id={noteId}
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 200))}
            placeholder="What would you like to talk about?"
            rows={2}
            style={{
              width: "100%",
              resize: "vertical",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--hair)",
              background: "var(--surface-2)",
              color: "var(--text)",
              padding: "10px 12px",
              fontFamily: "var(--font-body)",
              fontSize: 14,
              marginBottom: 12,
              boxSizing: "border-box",
            }}
          />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {open.map((slot) => {
              const done = requested[slot.id];
              return (
                <button
                  key={slot.id}
                  type="button"
                  onClick={() => book(slot)}
                  disabled={busy === slot.id || done}
                  aria-label={done ? `Requested ${fmtWhen(slot.start_at)}` : `Request slot ${fmtWhen(slot.start_at)}`}
                  style={{
                    padding: "9px 14px",
                    fontSize: 13,
                    borderRadius: "var(--radius-pill)",
                    // Amber = pending/requested (matches "booked" on the mentor
                    // side and the Requested pill on /bookings).
                    border: done ? "1px solid rgba(232,161,92,0.4)" : "1px solid var(--hair)",
                    background: done ? "rgba(232,161,92,0.14)" : "var(--surface-2)",
                    color: done ? "var(--amber)" : "var(--text)",
                    cursor: busy === slot.id || done ? "default" : "pointer",
                    fontFamily: "var(--font-body)",
                    opacity: busy === slot.id ? 0.6 : 1,
                    transition: "all 0.15s ease",
                  }}
                >
                  {done ? "Requested ✓" : fmtWhen(slot.start_at)}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ── Your mentoring: offer future slots + delete open ones. Only rendered when
//    the current user is a mentor.
function MyMentoring({ flash }) {
  const [state, setState] = useState("loading");
  const [slots, setSlots] = useState([]);
  const [when, setWhen] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    // The mentor sees ALL their non-cancelled slots via their own id — but we
    // don't know it here, so we read /users/me for the id, then their slots.
    setState("loading");
    bfu("/users/me")
      .then((me) => {
        if (!alive) return null;
        return bfu(`/mentors/${me.id}/slots`);
      })
      .then((res) => {
        // Only bail on unmount — a falsy/empty slots response must still land
        // in "ready" (empty), or the spinner hangs forever.
        if (!alive) return;
        setSlots(Array.isArray(res?.slots) ? res.slots : []);
        setState("ready");
      })
      .catch(() => alive && setState("error"));
    return () => {
      alive = false;
    };
  }, []);

  async function offer(e) {
    e.preventDefault();
    if (!when) return;
    const d = new Date(when);
    if (Number.isNaN(d.getTime())) {
      flash("Pick a valid date and time.", "err");
      return;
    }
    if (d.getTime() <= Date.now()) {
      flash("Slot must be in the future.", "err");
      return;
    }
    setBusy(true);
    try {
      const res = await bfu("/mentors/me/slots", { method: "POST", body: { start_at: d.toISOString() } });
      const newSlot = { id: res.id, start_at: d.toISOString(), status: "open", duration_min: 15 };
      setSlots((cur) => [...cur, newSlot].sort((a, b) => new Date(a.start_at) - new Date(b.start_at)));
      setWhen("");
      flash("Slot published — mentees can book it now.");
    } catch (err) {
      flash(err?.message || "Couldn't publish that slot.", "err");
    } finally {
      setBusy(false);
    }
  }

  async function remove(slot) {
    if (slot.status === "booked") {
      flash("That slot is booked — decline the booking to free it.", "err");
      return;
    }
    const prev = slots;
    setSlots((cur) => cur.filter((s) => s.id !== slot.id));
    try {
      await bfu(`/mentors/me/slots/${slot.id}`, { method: "DELETE" });
      flash("Slot removed.");
    } catch (err) {
      setSlots(prev);
      flash(err?.message || "Couldn't remove that slot.", "err");
    }
  }

  return (
    <section style={{ marginTop: 8 }}>
      <div className="ch-slab">
        <span className="ch-slab-k">You mentor here</span>
        <h2>Offer your time</h2>
        <span className="ch-slab-line" />
      </div>

      <div className="ch-cell-static" style={{ marginTop: 4 }}>
        <form onSubmit={offer} style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
          <div>
            <label
              htmlFor="new-slot-when"
              style={{
                display: "block",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--muted-strong)",
                marginBottom: 8,
              }}
            >
              New 15-minute slot
            </label>
            <input
              id="new-slot-when"
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              style={{
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--hair)",
                background: "var(--surface-2)",
                color: "var(--text)",
                padding: "10px 12px",
                fontFamily: "var(--font-body)",
                fontSize: 14,
                colorScheme: "dark",
              }}
            />
          </div>
          <button
            type="submit"
            className="ch-btn-primary"
            disabled={busy || !when || state !== "ready"}
            style={{ opacity: busy || !when || state !== "ready" ? 0.6 : 1 }}
          >
            {busy ? "Publishing…" : "Publish slot"}
          </button>
        </form>

        <div style={{ marginTop: 20 }}>
          {state === "loading" ? (
            <div style={{ color: "var(--muted-strong)", fontSize: 13 }}>
              <span className="ch-spin" aria-hidden style={{ marginRight: 8 }}>◠</span>
              Loading your slots…
            </div>
          ) : state === "error" ? (
            <div style={{ color: "var(--terra)", fontSize: 13 }}>Couldn't load your slots. Refresh to try again.</div>
          ) : slots.length === 0 ? (
            <div style={{ color: "var(--muted-strong)", fontFamily: "var(--font-accent)", fontStyle: "italic", fontSize: 16 }}>
              No slots yet. Publish one above and mentees can request it.
            </div>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {slots.map((s) => {
                const booked = s.status === "booked";
                return (
                  <div
                    key={s.id}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px 8px 8px 14px",
                      borderRadius: "var(--radius-pill)",
                      border: booked ? "1px solid rgba(232,161,92,0.4)" : "1px solid var(--hair)",
                      background: booked ? "rgba(232,161,92,0.12)" : "var(--surface-2)",
                    }}
                  >
                    <span style={{ fontSize: 13, color: booked ? "var(--amber)" : "var(--text)" }}>
                      {fmtWhen(s.start_at)}
                      {booked ? " · booked" : ""}
                    </span>
                    {!booked ? (
                      <button
                        type="button"
                        onClick={() => remove(s)}
                        title="Remove slot"
                        aria-label="Remove slot"
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: "50%",
                          border: "1px solid var(--hair)",
                          background: "transparent",
                          color: "var(--muted-strong)",
                          cursor: "pointer",
                          lineHeight: 1,
                          fontSize: 14,
                        }}
                      >
                        ×
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export default function MentorsBrowser() {
  const [state, setState] = useState("loading"); // loading | ready | error
  const [mentors, setMentors] = useState([]);
  const [isMentor, setIsMentor] = useState(false);
  const [meId, setMeId] = useState(null); // viewer's own id → mark their own mentor card "This is you"
  const [openId, setOpenId] = useState(null); // which mentor's BookPanel is open
  const [requestedSlots, setRequestedSlots] = useState({}); // slotId -> true, lifted so re-opening a panel keeps requested state
  const { toast, flash } = useToast();

  useEffect(() => {
    let alive = true;
    Promise.all([
      bfu("/mentors").catch(() => []),
      bfu("/users/me").catch(() => null),
    ])
      .then(([list, me]) => {
        if (!alive) return;
        setMentors(Array.isArray(list) ? list : []);
        setIsMentor(Boolean(me?.mentor?.is_mentor));
        setMeId(me?.id ?? null);
        setState("ready");
      })
      .catch(() => alive && setState("error"));
    return () => {
      alive = false;
    };
  }, []);

  if (state === "loading") {
    return (
      <div style={{ marginTop: 28, color: "var(--muted-strong)", fontSize: 14 }} role="status" aria-live="polite">
        <span className="ch-spin" aria-hidden style={{ marginRight: 8 }}>◠</span>
        Loading mentors…
      </div>
    );
  }
  if (state === "error") {
    return (
      <div style={{ marginTop: 28, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }} role="status" aria-live="polite">
        <span style={{ color: "var(--terra)", fontSize: 14 }}>Couldn't load mentors.</span>
        <button type="button" onClick={() => window.location.reload()} className="ch-btn-ghost">
          Try again
        </button>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 24 }}>
      {isMentor ? <MyMentoring flash={flash} /> : null}

      <div className="ch-slab" style={{ marginTop: isMentor ? 44 : 8 }}>
        <span className="ch-slab-k">Book a session</span>
        <h2>Mentors in the city</h2>
        <span className="ch-slab-line" />
      </div>

      {mentors.length === 0 ? (
        <div className="ch-grace" style={{ marginTop: 18 }}>
          <span className="ch-grace-k">Quiet for now</span>
          <div className="ch-grace-t">No mentors are open yet.</div>
          <div className="ch-grace-s">
            As experienced builders join and open their calendars, they'll appear
            here for you to book a 15-minute session.
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 18 }}>
          {mentors.map((m) => {
            const name = m.display_name || "A builder";
            const isOpen = openId === m.id;
            const isSelf = meId != null && m.id === meId;
            return (
              <div key={m.id} className="ch-cell-static" style={{ padding: 22 }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
                  <Avatar id={m.id} name={name} photo={m.photo_url} />
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <a
                      href={`/u/${m.id}`}
                      style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 19, color: "var(--text)", textDecoration: "underline", textDecorationColor: "transparent", textUnderlineOffset: 3, transition: "text-decoration-color 0.15s ease" }}
                      onMouseEnter={(e) => (e.currentTarget.style.textDecorationColor = "var(--amber)")}
                      onMouseLeave={(e) => (e.currentTarget.style.textDecorationColor = "transparent")}
                    >
                      {name}
                    </a>
                    {m.bio ? (
                      <p style={{ margin: "6px 0 0", fontSize: 14, lineHeight: 1.55, color: "var(--muted)" }}>{m.bio}</p>
                    ) : null}
                    {Array.isArray(m.topics) && m.topics.length ? (
                      <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {m.topics.map((t, i) => (
                          <span key={`${t}-${i}`} className="ch-tag">{t}</span>
                        ))}
                      </div>
                    ) : null}
                    <div
                      style={{
                        marginTop: 12,
                        fontFamily: "var(--font-mono)",
                        fontSize: 11,
                        letterSpacing: "0.08em",
                        color: m.open_slots > 0 ? "var(--green)" : "var(--muted-strong)",
                      }}
                    >
                      {m.open_slots > 0 ? `${m.open_slots} open slot${m.open_slots === 1 ? "" : "s"}` : "No open slots"}
                    </div>
                  </div>
                  {isSelf ? (
                    <span
                      aria-label="This is your mentor profile"
                      style={{
                        whiteSpace: "nowrap",
                        padding: "9px 16px",
                        borderRadius: "var(--radius-pill)",
                        border: "1px solid rgba(232,161,92,0.4)",
                        background: "rgba(232,161,92,0.14)",
                        color: "var(--amber)",
                        fontFamily: "var(--font-mono)",
                        fontSize: 12,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                      }}
                    >
                      This is you
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setOpenId(isOpen ? null : m.id)}
                      className={isOpen ? "ch-btn-ghost" : "ch-btn-primary"}
                      aria-expanded={isOpen}
                      style={{ whiteSpace: "nowrap" }}
                    >
                      {isOpen ? "Close" : "Book a session"}
                    </button>
                  )}
                </div>

                {isOpen && !isSelf ? (
                  <BookPanel
                    mentor={m}
                    flash={flash}
                    requested={requestedSlots}
                    onRequested={(slotId, on) =>
                      setRequestedSlots((r) => {
                        if (on) return { ...r, [slotId]: true };
                        const n = { ...r };
                        delete n[slotId];
                        return n;
                      })
                    }
                    onBooked={() => {
                      // Reflect one fewer open slot optimistically.
                      setMentors((cur) =>
                        cur.map((x) => (x.id === m.id ? { ...x, open_slots: Math.max(0, (x.open_slots || 0) - 1) } : x))
                      );
                    }}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      <Toast toast={toast} />
    </div>
  );
}
