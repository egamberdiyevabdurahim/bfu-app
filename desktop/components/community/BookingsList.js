"use client";

import { useEffect, useState } from "react";
import { bfu } from "@/lib/client-api";
import { gradientFor, initials } from "@/lib/avatar";
import { useToast } from "@/lib/useToast";
import { useT } from "@/components/i18n/LocaleProvider";
import StarInput from "@/components/projects/StarInput";

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
  requested: { color: "var(--amber)", bg: "rgba(232,161,92,0.14)", bd: "rgba(232,161,92,0.34)" },
  confirmed: { color: "var(--green)", bg: "rgba(127,176,105,0.14)", bd: "rgba(127,176,105,0.34)" },
  declined: { color: "var(--terra)", bg: "rgba(192,86,59,0.12)", bd: "rgba(192,86,59,0.3)" },
  cancelled: { color: "var(--muted-strong)", bg: "var(--surface-2)", bd: "var(--hair)" },
};

function fmtWhen(iso, t) {
  if (!iso) return t ? t("community.bookings.timeTba") : "Time TBA";
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
  const t = useT();
  const key = STATUS[status] ? status : "cancelled";
  const s = STATUS[key];
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
      {t(`community.bookings.status.${key}`)}
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

function Row({ booking, role, onAct, busy, onSetLink, onRate }) {
  const t = useT();
  const other = booking.other || {};
  const name = other.display_name || t("community.builderFallback");
  const canMentorAct = role === "mentor" && booking.status === "requested";
  const canMenteeCancel = role === "mentee" && (booking.status === "requested" || booking.status === "confirmed");
  const [linkVal, setLinkVal] = useState(booking.meeting_link || "");
  // Only reserve the wrapped full-width line when a block will actually render
  // (else a confirmed-but-linkless mentee row shows an empty gap).
  const showExtras =
    (role === "mentee" && booking.status === "confirmed" && booking.meeting_link) ||
    (role === "mentor" && booking.status === "confirmed") ||
    (role === "mentee" && (booking.can_rate || booking.my_rating));

  return (
    <div className="ch-cell-static" style={{ display: "flex", alignItems: "center", gap: 16, padding: 18, flexWrap: "wrap" }}>
      <Avatar id={other.id} name={name} photo={other.photo_url} />
      <div style={{ flex: 1, minWidth: 180 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {other.id != null ? (
            <a
              href={`/web/u/${other.id}`}
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
          {fmtWhen(booking.start_at, t)}
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
                {t("community.bookings.confirm")}
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
                {t("community.bookings.decline")}
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
              {t("community.bookings.cancel")}
            </button>
          ) : null}
        </div>
      ) : null}

      {/* Meeting link + post-session rating (wraps to a full-width row below). */}
      {showExtras ? (
        <div style={{ flexBasis: "100%", display: "flex", flexDirection: "column", gap: 10, marginTop: 2 }}>
          {booking.status === "confirmed" && role === "mentee" && booking.meeting_link ? (
            <a href={booking.meeting_link} target="_blank" rel="noopener noreferrer" className="ch-btn-primary"
              style={{ alignSelf: "flex-start", padding: "9px 16px", fontSize: 13, textDecoration: "none" }}>
              🎥 {t("community.bookings.joinCall")}
            </a>
          ) : null}
          {booking.status === "confirmed" && role === "mentor" ? (
            <div style={{ display: "flex", gap: 8, maxWidth: 460 }}>
              <input
                value={linkVal}
                onChange={(e) => setLinkVal(e.target.value)}
                placeholder={t("community.bookings.linkPh")}
                style={{ flex: 1, minWidth: 0, background: "var(--surface-2)", border: "1px solid var(--hair)",
                  borderRadius: "var(--radius-sm)", color: "var(--text)", padding: "9px 12px", fontSize: 13 }}
              />
              <button type="button" onClick={() => onSetLink(booking, linkVal)} className="ch-btn-ghost"
                style={{ flex: "0 0 auto" }}>{t("community.bookings.saveLink")}</button>
            </div>
          ) : null}
          {role === "mentee" && (booking.can_rate || booking.my_rating) ? (
            <div>
              <div style={{ fontSize: 12, color: "var(--muted-strong)", marginBottom: 4 }}>
                {booking.my_rating ? t("community.bookings.yourRating") : t("community.bookings.rateSession")}
              </div>
              <StarInput value={booking.my_rating?.stars || 0} onChange={(n) => onRate(booking, n)} size={22} />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Empty({ title, body }) {
  const t = useT();
  return (
    <div className="ch-grace" style={{ minHeight: 150 }}>
      <span className="ch-grace-k">{t("community.bookings.emptyKicker")}</span>
      <div className="ch-grace-t">{title}</div>
      <div className="ch-grace-s">{body}</div>
    </div>
  );
}

export default function BookingsList() {
  const t = useT();
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
        action === "confirm" ? t("community.bookings.confirmed") : action === "decline" ? t("community.bookings.declined") : t("community.bookings.cancelled")
      );
    } catch (e) {
      setAsMentee(prevMentee);
      setAsMentor(prevMentor);
      flash(e?.message || t("community.bookings.updateError"), "err");
    } finally {
      setBusy(null);
    }
  }

  async function setLink(booking, url) {
    try {
      const res = await bfu(`/bookings/${booking.id}/meeting-link`, { method: "PATCH", body: { url } });
      setAsMentor((cur) => cur.map((b) => (b.id === booking.id ? { ...b, meeting_link: res?.meeting_link ?? null } : b)));
      flash(t("community.bookings.linkSaved"));
    } catch (e) {
      flash(e?.message || t("community.bookings.updateError"), "err");
    }
  }

  async function rate(booking, stars) {
    try {
      await bfu(`/bookings/${booking.id}/rating`, { method: "POST", body: { stars } });
      // note is a full replace server-side; this simple UI sends stars only → note clears
      setAsMentee((cur) => cur.map((b) => (b.id === booking.id ? { ...b, my_rating: { stars, note: null }, can_rate: false } : b)));
      flash(t("community.bookings.rated"));
    } catch (e) {
      flash(e?.message || t("community.bookings.updateError"), "err");
    }
  }

  if (state === "loading") {
    return (
      <div style={{ marginTop: 28, color: "var(--muted-strong)", fontSize: 14 }} role="status" aria-live="polite">
        <span className="ch-spin" aria-hidden style={{ marginRight: 8 }}>◠</span>
        {t("community.bookings.loading")}
      </div>
    );
  }
  if (state === "error") {
    return (
      <div style={{ marginTop: 28, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }} role="status" aria-live="polite">
        <span style={{ color: "var(--terra)", fontSize: 14 }}>{t("community.bookings.loadError")}</span>
        <button type="button" onClick={() => window.location.reload()} className="ch-btn-ghost">
          {t("community.tryAgain")}
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
            <span className="ch-slab-k">{t("community.bookings.mentorKicker")}</span>
            <h2>{t("community.bookings.mentorTitle")}</h2>
            <span className="ch-slab-line" />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
            {asMentor.map((b) => (
              <Row key={b.id} booking={b} role="mentor" onAct={act} busy={busy} onSetLink={setLink} onRate={rate} />
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <div className="ch-slab" style={{ marginTop: asMentor.length > 0 ? 44 : 8 }}>
          <span className="ch-slab-k">{t("community.bookings.learningKicker")}</span>
          <h2>{t("community.bookings.yourSessionsTitle")}</h2>
          <span className="ch-slab-line" />
        </div>
        {asMentee.length === 0 ? (
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
            <Empty
              title={t("community.bookings.emptyTitle")}
              body={t("community.bookings.emptyBody")}
            />
            <a href="/web/mentors" className="ch-btn-primary" style={{ marginTop: 16, display: "inline-flex" }}>
              {t("community.bookings.browseMentors")}
            </a>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
            {asMentee.map((b) => (
              <Row key={b.id} booking={b} role="mentee" onAct={act} busy={busy} onSetLink={setLink} onRate={rate} />
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
