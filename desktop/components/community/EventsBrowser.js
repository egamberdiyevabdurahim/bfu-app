"use client";

import { useEffect, useRef, useState } from "react";
import { bfu } from "@/lib/client-api";
import { useToast } from "@/lib/useToast";
import { Toast } from "@/components/ui/Toast";
import { useT } from "@/components/i18n/LocaleProvider";
import { fmtDate, fmtDateTime } from "@/lib/datetime";
import EventFormModal from "@/components/events/EventFormModal";

// Events (Batch 4). Two feeds:
//   GET /events         → EventOut[] { id, type, title, description, link,
//                                      cover_url, deadline, starts_at, region_id,
//                                      created_at, has_form }
//   GET /events/for-me  → same fields + { matched:[tag], score } (relevance-ranked
//                         against the user's AI tags + region — the "For you" tab)
// Rendered as Chorsu event cards; each card links out to `link` when present.
//
// REGISTRATION FORMS. An event may carry a `form_schema` (questions authored by an
// admin, so they're data — changing them needs no deploy). The feed only carries the
// boolean `has_form`; the questions themselves come from GET /events/{id} inside the
// modal. Behaviour mirrors the Mini App exactly:
//   • has_form false → the 1-click RSVP below is UNCHANGED,
//   • has_form true  → "Going" opens EventFormModal and you are only going once
//                      POST /events/{id}/rsvp {status:"going", answers} succeeds,
//   • "Interested"   → never opens the form, in either case.

const TYPE_STYLE = {
  hackathon: { color: "var(--amber)", bg: "rgba(232,161,92,0.14)", bd: "rgba(232,161,92,0.34)" },
  grant: { color: "var(--green)", bg: "rgba(127,176,105,0.14)", bd: "rgba(127,176,105,0.34)" },
  scholarship: { color: "var(--green)", bg: "rgba(127,176,105,0.14)", bd: "rgba(127,176,105,0.34)" },
  meetup: { color: "var(--teal-bright)", bg: "rgba(94,197,182,0.14)", bd: "rgba(94,197,182,0.34)" },
};
const DEFAULT_TYPE = { color: "var(--muted-strong)", bg: "var(--surface-2)", bd: "var(--hair)" };

// DEADLINE = the sign-up cutoff (date-only). Rendered in Tashkent via the shared
// helper: a bare new Date on a naive-UTC "…T00:00:00" could print the PREVIOUS
// day for a 00:00–04:59 Tashkent deadline.
function fmtDeadline(iso) {
  return fmtDate(iso) || null;
}

// START time = when the event actually happens (distinct from `deadline`). The
// backend serializes NAIVE-UTC timestamps, so this renders date + time in
// Tashkent via the shared helper — matching the Mini App so both apps agree on
// the wall-clock start.
function fmtStart(iso) {
  return fmtDateTime(iso) || null;
}

// RSVP / Interested toggles + "N going" — a sibling BELOW the card's outbound
// <a>, so a tap never triggers the external nav. Optimistic; server reconciles.
//
// The one exception to "optimistic" is a form event's "Going": nothing is patched
// until the form comes back accepted, because the server may reject the answers.
function RsvpRow({ ev, onRsvp, onOpenForm }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const set = async (status) => {
    if (busy) return;
    // Form gate. "Going" on a form event hands off to the modal — both when
    // registering and when already going (reopen → prefilled → re-submit
    // overwrites). Un-RSVP for those events lives inside the modal, so the pill
    // never silently throws away someone's submitted answers.
    // "Interested" is never gated.
    if (status === "going" && ev.has_form) {
      onOpenForm?.(ev);
      return;
    }
    setBusy(true);
    const prev = { rsvp_count: ev.rsvp_count, my_rsvp: ev.my_rsvp };
    // A full-capacity "going" is stored as "waitlisted" — tapping the active
    // Going/Waitlisted pill on a no-form event still leaves the event.
    const toggleOff = ev.my_rsvp === status || (status === "going" && ev.my_rsvp === "waitlisted");
    const nextStatus = toggleOff ? null : status;
    const delta = (nextStatus === "going" ? 1 : 0) - (ev.my_rsvp === "going" ? 1 : 0);
    onRsvp(ev.id, { my_rsvp: nextStatus, rsvp_count: Math.max(0, (ev.rsvp_count || 0) + delta) });
    try {
      const r = toggleOff
        ? await bfu(`/events/${ev.id}/rsvp`, { method: "DELETE" })
        : await bfu(`/events/${ev.id}/rsvp`, { method: "POST", body: { status } });
      onRsvp(ev.id, { rsvp_count: r.rsvp_count, my_rsvp: r.my_rsvp });
    } catch {
      onRsvp(ev.id, prev);
    } finally {
      setBusy(false);
    }
  };
  const base = {
    fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.06em",
    borderRadius: "var(--radius-pill)", fontSize: 11.5, padding: "8px 15px", cursor: "pointer",
    transition: "background 0.15s ease, color 0.15s ease",
  };
  const pill = (active) => active
    ? { background: "var(--amber)", color: "#160E08", border: "1px solid var(--amber)", fontWeight: 800, boxShadow: "0 4px 14px rgba(232,161,92,0.28)" }
    : { background: "var(--surface-2)", color: "var(--muted-strong)", border: "1px solid var(--hair)", fontWeight: 500 };
  const waitPill = { background: "transparent", color: "var(--amber)", border: "1px solid var(--amber)", fontWeight: 800 };
  const waitlisted = ev.my_rsvp === "waitlisted";
  const goingIsh = ev.my_rsvp === "going" || waitlisted;
  return (
    <div style={{ padding: "14px 28px 24px" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button
          type="button"
          disabled={busy}
          onClick={() => set("going")}
          style={{ ...base, ...(waitlisted ? waitPill : pill(ev.my_rsvp === "going")) }}
        >
          {waitlisted ? "◔ " : ev.my_rsvp === "going" ? "✓ " : ""}
          {waitlisted
            ? t("community.events.rsvpWaitlisted")
            : ev.has_form && ev.my_rsvp !== "going"
              ? t("community.events.rsvpRegister")
              : t("community.events.rsvpGoing")}
        </button>
        <button type="button" disabled={busy} onClick={() => set("interested")} style={{ ...base, ...pill(ev.my_rsvp === "interested") }}>
          {ev.my_rsvp === "interested" ? "✓ " : ""}{t("community.events.rsvpInterested")}
        </button>
        {ev.rsvp_count > 0 ? (
          <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--muted)" }}>
            {t("community.events.goingCount", { n: ev.rsvp_count })}
          </span>
        ) : null}
      </div>

      {/* Say out loud that this one asks questions — and, once registered, that the
          answers are still editable. Otherwise "Going" looks like a 1-click pill
          that unexpectedly opens a 30-question dialog. */}
      {ev.has_form ? (
        <div
          style={{
            marginTop: 10,
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: "0.04em",
            color: "var(--muted)",
          }}
        >
          {goingIsh ? (
            <button
              type="button"
              onClick={() => onOpenForm?.(ev)}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
                font: "inherit",
                color: "var(--amber)",
                textDecoration: "underline",
                textUnderlineOffset: 3,
              }}
            >
              {t("community.events.editAnswers")}
            </button>
          ) : (
            <span>◇ {t("community.events.hasForm")}</span>
          )}
        </div>
      ) : null}
    </div>
  );
}

// Capacity state, mirroring the Mini App card. Only for events that carry a cap
// (ev.capacity != null) — no-capacity events show nothing. "N seats left",
// "Full — waitlist open", or "You're on the waitlist" for a waitlisted member.
function SeatsLine({ ev, t }) {
  if (ev.capacity == null) return null;
  const waitlisted = ev.my_rsvp === "waitlisted";
  const seatsLeft = ev.seats_left;
  let label;
  let color;
  if (waitlisted) {
    label = `◔ ${t("community.events.onWaitlist")}`;
    color = "var(--amber)";
  } else if (typeof seatsLeft === "number" && seatsLeft > 0) {
    label = `◎ ${seatsLeft === 1 ? t("community.events.seatsLeftOne") : t("community.events.seatsLeft", { n: seatsLeft })}`;
    color = "var(--green)";
  } else {
    label = `◔ ${t("community.events.full")}`;
    color = "var(--amber)";
  }
  return (
    <div style={{ marginTop: 10, fontFamily: "var(--font-mono)", fontSize: 12, letterSpacing: "0.04em", color }}>
      {label}
    </div>
  );
}

function EventCard({ ev, onRsvp, onOpenForm, highlighted }) {
  const t = useT();
  const style = TYPE_STYLE[ev.type] || DEFAULT_TYPE;
  const deadline = fmtDeadline(ev.deadline);
  const start = fmtStart(ev.starts_at);
  const ref = useRef(null);
  useEffect(() => {
    if (highlighted && ref.current) ref.current.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlighted]);
  const inner = (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "5px 11px",
            borderRadius: "var(--radius-pill)",
            background: style.bg,
            border: `1px solid ${style.bd}`,
            color: style.color,
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}
        >
          {ev.type || t("community.events.typeFallback")}
        </span>
        {deadline ? (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--amber)", letterSpacing: "0.04em" }}>
            {t("community.events.by", { date: deadline })}
          </span>
        ) : null}
      </div>

      <h3
        style={{
          margin: "14px 0 0",
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: 20,
          lineHeight: 1.2,
          letterSpacing: "-0.01em",
          color: "var(--text)",
        }}
      >
        {ev.title}
      </h3>

      {start ? (
        <div
          style={{
            marginTop: 10,
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            letterSpacing: "0.04em",
            color: "var(--teal-bright)",
          }}
        >
          ◷ {t("community.events.starts", { date: start })}
        </div>
      ) : null}

      <SeatsLine ev={ev} t={t} />

      {ev.description ? (
        <p
          style={{
            margin: "8px 0 0",
            fontSize: 14,
            lineHeight: 1.55,
            color: "var(--muted)",
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {ev.description}
        </p>
      ) : null}

      {Array.isArray(ev.matched) && ev.matched.length ? (
        <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 6 }}>
          {ev.matched.map((m, i) => (
            <span
              key={`${m}-${i}`}
              className="ch-tag"
              style={{ color: "var(--green)", borderColor: "rgba(127,176,105,0.34)", background: "rgba(127,176,105,0.1)" }}
            >
              {m}
            </span>
          ))}
        </div>
      ) : null}

      {ev.link ? (
        <div
          style={{
            marginTop: 16,
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "var(--amber)",
          }}
        >
          {t("community.openDetails")}
        </div>
      ) : null}
    </>
  );

  // The whole card is ONE tile (outer .ch-cell for the hover glow when linkable,
  // else .ch-cell-static). The body is a plain block link over the content; the
  // RSVP row sits below it inside the same tile but OUTSIDE the <a>, so its clicks
  // never trigger the outbound nav.
  const contentStyle = { display: "block", padding: "28px 28px 0", color: "var(--text)", textDecoration: "none" };
  const body = ev.link ? (
    <a href={ev.link} target="_blank" rel="noopener noreferrer" style={{ ...contentStyle, cursor: "pointer" }}>
      {inner}
    </a>
  ) : (
    <div style={contentStyle}>{inner}</div>
  );
  return (
    <div
      ref={ref}
      className={ev.link ? "ch-cell" : "ch-cell-static"}
      style={{
        padding: 0, overflow: "hidden",
        ...(highlighted ? { border: "1.5px solid var(--amber)", boxShadow: "0 0 24px rgba(232,161,92,0.28)" } : null),
      }}
    >
      {body}
      <RsvpRow ev={ev} onRsvp={onRsvp} onOpenForm={onOpenForm} />
    </div>
  );
}

export default function EventsBrowser({ highlightEventId = null, meId = null }) {
  const t = useT();
  const { toast, flash } = useToast(3200);
  // The event whose registration form is open. Mounting the modal IS opening it —
  // the schema fetch lives in its mount effect, so no event's questions are
  // requested on page load.
  const [formEvent, setFormEvent] = useState(null);
  const [tab, setTab] = useState("all"); // all | forme | mine
  const [state, setState] = useState("loading"); // loading | ready | error
  const [all, setAll] = useState(null);
  const [forme, setForme] = useState(null);
  const [mine, setMine] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  const cacheFor = (tb) => (tb === "all" ? all : tb === "forme" ? forme : mine);
  const setCacheFor = (tb, v) => (tb === "all" ? setAll(v) : tb === "forme" ? setForme(v) : setMine(v));
  const pathFor = (tb) => (tb === "all" ? "/events" : tb === "forme" ? "/events/for-me" : "/events/mine/rsvps");

  useEffect(() => {
    let alive = true;
    if (cacheFor(tab) !== null) {
      setState("ready");
      return undefined;
    }
    setState("loading");
    bfu(pathFor(tab))
      .then((res) => {
        if (!alive) return;
        setCacheFor(tab, Array.isArray(res) ? res : []);
        setState("ready");
      })
      .catch(() => alive && setState("error"));
    return () => {
      alive = false;
    };
  }, [tab, all, forme, mine, reloadKey]);

  const list = cacheFor(tab);

  // Re-attempt the current tab: clear its cache so the effect refetches.
  function retry() {
    setCacheFor(tab, null);
    setReloadKey((k) => k + 1);
  }

  // After an RSVP toggle, patch that event across the loaded "all"/"forme" tabs so
  // counts + button state stay consistent. For "mine" (Going): patch in place while
  // you're viewing it, but otherwise INVALIDATE its cache so it refetches fresh next
  // open — an in-place patch can't add a newly-RSVP'd event or drop an un-RSVP'd one.
  function onRsvp(id, patch) {
    const upd = (arr) => (Array.isArray(arr) ? arr.map((e) => (e.id === id ? { ...e, ...patch } : e)) : arr);
    setAll(upd);
    setForme(upd);
    if (tab === "mine") setMine(upd);
    else setMine(null);
  }

  const TABS = [
    { id: "all", label: t("community.events.tabAll") },
    { id: "forme", label: t("community.events.tabForMe") },
    { id: "mine", label: t("community.events.tabMine") },
  ];

  return (
    <div style={{ marginTop: 24 }}>
      {/* Real segmented control: one container, filled active pill distinct from hover. */}
      <div
        role="tablist"
        aria-label={t("community.events.tablistAria")}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: 4,
          borderRadius: "var(--radius-pill)",
          border: "1px solid var(--hair)",
          background: "var(--surface-2)",
          flexWrap: "wrap",
        }}
      >
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.id)}
              style={{
                // Active segment is deliberately larger + solid-amber filled so
                // the chosen side clearly dominates the inactive one at a glance.
                padding: active ? "11px 22px" : "8px 16px",
                borderRadius: "var(--radius-pill)",
                border: "none",
                cursor: "pointer",
                fontFamily: "var(--font-mono)",
                fontSize: active ? 13.5 : 12,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                background: active ? "var(--amber)" : "transparent",
                color: active ? "#160E08" : "var(--muted-strong)",
                fontWeight: active ? 800 : 500,
                boxShadow: active ? "0 6px 18px rgba(232,161,92,0.32)" : "none",
                transition: "background 0.15s ease, color 0.15s ease, padding 0.15s ease, font-size 0.15s ease, box-shadow 0.15s ease",
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div role="status" aria-live="polite">
        {state === "loading" ? (
          <div style={{ marginTop: 28, color: "var(--muted-strong)", fontSize: 14 }}>
            <span className="ch-spin" aria-hidden style={{ marginRight: 8 }}>◠</span>
            {t("community.events.loading")}
          </div>
        ) : state === "error" ? (
          <div style={{ marginTop: 28, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <span style={{ color: "var(--terra)", fontSize: 14 }}>{t("community.events.loadError")}</span>
            <button type="button" onClick={retry} className="ch-btn-ghost">
              {t("community.tryAgain")}
            </button>
          </div>
        ) : !list || list.length === 0 ? (
          <div className="ch-grace" style={{ marginTop: 24 }}>
            <span className="ch-grace-k">{t("community.events.emptyKicker")}</span>
            <div className="ch-grace-t">
              {tab === "forme"
                ? t("community.events.emptyTitleForMe")
                : tab === "mine"
                  ? t("community.events.emptyTitleMine")
                  : t("community.events.emptyTitleAll")}
            </div>
            <div className="ch-grace-s">
              {tab === "forme"
                ? t("community.events.emptyBodyForMe")
                : t("community.events.emptyBodyAll")}
            </div>
            {tab === "forme" ? (
              <a href="/web/settings" className="ch-btn-ghost" style={{ marginTop: 14 }}>
                {t("community.events.completeProfile")}
              </a>
            ) : null}
          </div>
        ) : (
          <div className="ch-grid" style={{ marginTop: 24 }}>
            {list.map((ev) => (
              <EventCard
                key={ev.id}
                ev={ev}
                onRsvp={onRsvp}
                onOpenForm={setFormEvent}
                highlighted={highlightEventId === ev.id}
              />
            ))}
          </div>
        )}
      </div>

      {/* Registration form. Mounted only while open (lazy by construction). It owns
          the whole "going" transition for form events: the feed is patched via
          onRsvp only after the SERVER accepts the answers. */}
      {formEvent ? (
        <EventFormModal
          event={formEvent}
          meId={meId}
          onRsvp={onRsvp}
          onClose={(reason) => {
            setFormEvent(null);
            if (reason === "registered") flash(t("community.events.form.toastRegistered"), "ok");
            else if (reason === "updated") flash(t("community.events.form.toastUpdated"), "ok");
            else if (reason === "withdrawn") flash(t("community.events.form.toastWithdrawn"), "ok");
          }}
        />
      ) : null}

      <Toast toast={toast} />
    </div>
  );
}
