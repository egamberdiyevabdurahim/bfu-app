import { useState, useEffect } from "react";
import { Page, SkeletonList } from "../components/Shared";
import { Icon } from "../components/Icons";
import { events } from "../api";
import { PartnersModal } from "../components/PartnersModal";
import { useT } from "../i18n";
import { fmtDate } from "../timefmt";

const TYPES = ["foryou", "myrsvps", "all", "hackathon", "grant", "scholarship", "meetup", "other"];

// Type → Chorsu accent, mirrored from the desktop EventsBrowser TYPE_STYLE so the
// hackathon/grant/scholarship/meetup pills read the same warm-firelit language.
const TYPE_STYLE = {
  hackathon:   { color: "var(--amber)",       bg: "rgba(232,161,92,0.14)", bd: "rgba(232,161,92,0.34)" },
  grant:       { color: "var(--green)",       bg: "rgba(127,176,105,0.14)", bd: "rgba(127,176,105,0.34)" },
  scholarship: { color: "var(--green)",       bg: "rgba(127,176,105,0.14)", bd: "rgba(127,176,105,0.34)" },
  meetup:      { color: "var(--teal-bright)", bg: "rgba(94,197,182,0.14)",  bd: "rgba(94,197,182,0.34)" },
};
const DEFAULT_TYPE = { color: "var(--text-2)", bg: "var(--surface-2)", bd: "var(--hair)" };
const KNOWN_TYPES = ["hackathon", "grant", "scholarship", "meetup", "other"];

// RSVP / Interested toggles + "N going" social proof. Lives OUTSIDE the card's
// outbound <a>, so a tap never triggers the external nav. Optimistic; the server
// response (rsvp_count/my_rsvp) reconciles.
const RsvpRow = ({ ev, t, onRsvp }) => {
  const [busy, setBusy] = useState(false);
  const set = async (status) => {
    if (busy) return;
    setBusy(true);
    const prev = { rsvp_count: ev.rsvp_count, my_rsvp: ev.my_rsvp };
    const toggleOff = ev.my_rsvp === status;
    const nextStatus = toggleOff ? null : status;
    const delta = (nextStatus === "going" ? 1 : 0) - (ev.my_rsvp === "going" ? 1 : 0);
    onRsvp(ev.id, { my_rsvp: nextStatus, rsvp_count: Math.max(0, (ev.rsvp_count || 0) + delta) });
    try {
      const r = toggleOff ? await events.unrsvp(ev.id) : await events.rsvp(ev.id, status);
      onRsvp(ev.id, { rsvp_count: r.rsvp_count, my_rsvp: r.my_rsvp });
    } catch {
      onRsvp(ev.id, prev); // revert (err.status===404 ⇒ event gone)
    } finally {
      setBusy(false);
    }
  };
  const base = {
    fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.06em",
    borderRadius: "var(--radius-pill)", fontSize: 11, padding: "7px 13px", cursor: "pointer",
    transition: "background 0.15s ease, color 0.15s ease",
  };
  const pill = (active) => active
    ? { background: "var(--amber)", color: "#160E08", border: "1px solid var(--amber)", fontWeight: 700, boxShadow: "0 4px 14px rgba(232,161,92,0.28)" }
    : { background: "var(--surface-2)", color: "var(--text-2)", border: "1px solid var(--hair)", fontWeight: 500 };
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 14 }}>
      <button disabled={busy} onClick={() => set("going")} style={{ ...base, ...pill(ev.my_rsvp === "going") }}>
        {ev.my_rsvp === "going" ? "✓ " : ""}{t("events.rsvp.going")}
      </button>
      <button disabled={busy} onClick={() => set("interested")} style={{ ...base, ...pill(ev.my_rsvp === "interested") }}>
        {ev.my_rsvp === "interested" ? "✓ " : ""}{t("events.rsvp.interested")}
      </button>
      {ev.rsvp_count > 0 && (
        <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)" }}>
          {t("events.rsvp.count", { n: ev.rsvp_count })}
        </span>
      )}
    </div>
  );
};

// Firelit event card — the tappable content is the outbound link when `ev.link`
// exists (mirrors desktop); the RSVP row is a sibling below it, always live.
// Deep-linked card glows.
const EventCard = ({ ev, i, highlighted, t, fmt, onRsvp }) => {
  const style = TYPE_STYLE[ev.type] || DEFAULT_TYPE;
  const deadline = ev.deadline ? fmt(ev.deadline) : null;
  const typeLabel = KNOWN_TYPES.includes(ev.type)
    ? t(`events.type.${ev.type}`)
    : (ev.type || t("events.type.other"));

  const containerStyle = {
    position: "relative", display: "block", padding: 18, overflow: "hidden",
    color: "var(--text)", textDecoration: "none",
    border: highlighted ? "1.5px solid var(--amber)" : "1px solid var(--hair)",
    boxShadow: highlighted ? "0 0 24px rgba(232,161,92,0.28)" : "none",
    cursor: ev.link ? "pointer" : "default",
    animation: `fadeUp ${(0.08 + i * 0.05).toFixed(2)}s ease both`,
  };

  const inner = (
    <>
      {ev.cover_url && (
        <img
          src={ev.cover_url}
          alt=""
          style={{ display: "block", width: "calc(100% + 36px)", height: 150, objectFit: "cover", margin: "-18px -18px 14px" }}
        />
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <span style={{
          display: "inline-flex", alignItems: "center", padding: "5px 11px",
          borderRadius: "var(--radius-pill)", background: style.bg, border: `1px solid ${style.bd}`,
          color: style.color, fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase",
        }}>
          {typeLabel}
        </span>
        {deadline && (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--amber)", letterSpacing: "0.03em" }}>
            {t("events.deadline", { d: deadline })}
          </span>
        )}
      </div>

      <h3 style={{
        margin: "14px 0 0", fontFamily: "var(--font-display)", fontWeight: 700,
        fontSize: 18, lineHeight: 1.2, letterSpacing: "-0.01em", color: "var(--text)",
      }}>
        {ev.title}
      </h3>

      {ev.matched?.length > 0 && (
        <div style={{ marginTop: 8, fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.02em", color: "var(--green)" }}>
          ✨ {t("events.matches", { tags: ev.matched.join(", ") })}
        </div>
      )}

      {ev.description && (
        <p style={{
          margin: "8px 0 0", fontSize: 13.5, lineHeight: 1.55, color: "var(--text-2)",
          display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden",
        }}>
          {ev.description}
        </p>
      )}

      {ev.link && (
        <div style={{
          marginTop: 14, fontFamily: "var(--font-mono)", fontSize: 11,
          letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--amber)",
        }}>
          {t("events.open")}
        </div>
      )}
    </>
  );

  return (
    <div className="ch-cell-static" style={containerStyle}>
      {ev.link ? (
        <a href={ev.link} target="_blank" rel="noopener noreferrer"
           style={{ display: "block", color: "inherit", textDecoration: "none", cursor: "pointer" }}>
          {inner}
        </a>
      ) : inner}
      <RsvpRow ev={ev} t={t} onRsvp={onRsvp} />
    </div>
  );
};

export const EventsScreen = ({ onBack, embedded = false, deepLinkEventId = null }) => {
  const { t } = useT();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  // A deep-linked event (from a notification) opens on "all" so the target card
  // is actually in the loaded list — the "For you" radar rarely contains your own event.
  const [type, setType] = useState(deepLinkEventId ? "all" : "foryou");
  const [partnersOpen, setPartnersOpen] = useState(false);

  useEffect(() => { load(); /* eslint-disable-line */ }, [type]);
  useEffect(() => { if (deepLinkEventId) setType("all"); }, [deepLinkEventId]);

  const load = async () => {
    setLoading(true);
    try {
      let res;
      if (type === "foryou") res = await events.forMe();        // Opportunity Radar
      else if (type === "myrsvps") res = await events.myRsvps(); // mine, upcoming-first
      else res = await events.list(type === "all" ? {} : { type });
      setList(Array.isArray(res) ? res : []);
    } catch (e) { setList([]); }
    setLoading(false);
  };

  // Update rsvp_count / my_rsvp for one card in place after an RSVP toggle.
  const onRsvp = (id, patch) =>
    setList((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));

  const fmt = (iso) => fmtDate(iso) || "—"; // Tashkent-time, UTC-safe

  // Optional Instrument-Serif italic subtitle. `translate()` echoes the raw key
  // when a string is missing, so only render once the key is actually wired.
  const subText = t("events.sub");

  return (
    <Page>
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "calc(var(--safe-t) + 16px) 20px 8px" }}>
        {/* Action row — back (standalone only) + Partners */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: embedded ? "flex-end" : "space-between", gap: 12, marginBottom: 18 }}>
          {!embedded && (
            <button onClick={onBack} aria-label={t("common.back")} style={{
              background: "var(--surface-2)", border: "1px solid var(--hair)", borderRadius: "var(--radius-pill)",
              width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", color: "var(--text-2)", flexShrink: 0,
            }}>
              <Icon name="arrow_left" size={17} />
            </button>
          )}
          <button onClick={() => setPartnersOpen(true)} className="btn-ghost" style={{
            display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 15px", fontSize: 13, flexShrink: 0,
          }}>
            <Icon name="briefcase" size={15} /> {t("partners.title")}
          </button>
        </div>

        {/* Header — mono eyebrow + Bricolage title + italic sub */}
        <div style={{ marginBottom: 18 }}>
          <div className="ch-eyebrow" style={{ color: "var(--amber)" }}>{t("events.kicker")}</div>
          <h1 className="ch-h1" style={{ fontSize: "clamp(30px, 9vw, 40px)" }}>{t("events.title")}</h1>
          {subText !== "events.sub" && <p className="ch-sub">{subText}</p>}
        </div>

        {/* Filter rail — Chorsu mono pills, horizontally scrollable */}
        <div style={{ display: "flex", gap: 8, overflowX: "auto", scrollbarWidth: "none", margin: "0 -20px", padding: "2px 20px 4px" }}>
          {TYPES.map(ty => {
            const on = type === ty;
            return (
              <button key={ty} onClick={() => setType(ty)} style={{
                flexShrink: 0, padding: "8px 15px", borderRadius: "var(--radius-pill)",
                fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase",
                background: on ? "var(--amber)" : "var(--surface-2)",
                color: on ? "#160E08" : "var(--text-2)",
                border: on ? "1px solid var(--amber)" : "1px solid var(--hair)",
                fontWeight: on ? 700 : 500, cursor: "pointer", whiteSpace: "nowrap",
                boxShadow: on ? "0 6px 16px rgba(232,161,92,0.28)" : "none",
                transition: "background 0.15s ease, color 0.15s ease",
              }}>
                {ty === "all" ? t("events.filterAll") : ty === "foryou" ? t("events.foryou") : ty === "myrsvps" ? t("events.myRsvps") : t(`events.type.${ty}`)}
              </button>
            );
          })}
        </div>

        {/* Feed */}
        <div style={{ marginTop: 18 }}>
          {loading ? (
            <div style={{ margin: "0 -20px" }}><SkeletonList count={4} /></div>
          ) : list.length === 0 ? (
            <div className="ch-grace">
              <span className="ch-grace-k">{t("events.kicker")}</span>
              <div className="ch-grace-t">{t("events.empty")}</div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {list.map((ev, i) => (
                <EventCard
                  key={ev.id}
                  ev={ev}
                  i={i}
                  highlighted={deepLinkEventId === ev.id}
                  t={t}
                  fmt={fmt}
                  onRsvp={onRsvp}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {partnersOpen && <PartnersModal onClose={() => setPartnersOpen(false)} />}
    </Page>
  );
};
