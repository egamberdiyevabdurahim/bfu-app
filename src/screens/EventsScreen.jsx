import { useState, useEffect, useRef } from "react";
import { Page, SkeletonList } from "../components/Shared";
import { Icon } from "../components/Icons";
import { events, regions } from "../api";
import { PartnersModal } from "../components/PartnersModal";
import { EventFormSheet, useEventFormT } from "../components/EventFormSheet";
import { TicketModal, ScannerModal } from "../components/EventCheckin";
import { FLAGS } from "../flags";
import { useT } from "../i18n";
import { openExternal } from "../tg";
import { fmtDate, fmtDateTime } from "../timefmt";

const TYPES = ["foryou", "myrsvps", "all", "hackathon", "grant", "scholarship", "meetup", "other"];

// Bot username for building shareable deep links (t.me/<bot>?startapp=…). Mirrors
// the hardcoded handle in RegionLandingScreen — the one public BFU bot.
const BOT_USERNAME = "BrightFuturesUzbekistan_bot";

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
//
// Events that carry a registration form (`ev.has_form`) divert the FIRST "Going"
// tap into EventFormSheet — the RSVP only lands once the form is submitted and
// the server accepts the answers. Everything else (no-form events, "Interested",
// un-RSVPing by tapping an active pill) is untouched 1-click behaviour.
const RsvpRow = ({ ev, t, tf, onRsvp, onOpenForm }) => {
  const [busy, setBusy] = useState(false);
  // A capacity-full "going" RSVP comes back as "waitlisted" from the server — for
  // toggling and labels, treat it as "already in this event".
  const goingIsh = ev.my_rsvp === "going" || ev.my_rsvp === "waitlisted";
  const set = async (status) => {
    if (busy) return;
    // Form events route EVERY "Going" tap through the sheet: not-registered → fill
    // the form (no optimistic flip until answers land); already-registered → the
    // read-only recap, where withdrawal goes through a confirm (a pill tap must
    // never silently discard submitted answers).
    if (status === "going" && ev.has_form) {
      onOpenForm(ev);
      return;
    }
    setBusy(true);
    const prev = { rsvp_count: ev.rsvp_count, my_rsvp: ev.my_rsvp };
    // Tapping the active Going/Waitlisted pill leaves the event.
    const toggleOff = ev.my_rsvp === status || (status === "going" && ev.my_rsvp === "waitlisted");
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
  // Waitlisted = amber outline (in the event, but not counted as going).
  const waitPill = { background: "transparent", color: "var(--amber)", border: "1px solid var(--amber)", fontWeight: 700 };
  const waitlisted = ev.my_rsvp === "waitlisted";
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button disabled={busy} onClick={() => set("going")} style={{ ...base, ...(waitlisted ? waitPill : pill(ev.my_rsvp === "going")) }}>
          {waitlisted ? "◔ " : ev.my_rsvp === "going" ? "✓ " : ""}
          {waitlisted ? t("events.rsvp.waitlisted") : t("events.rsvp.going")}
        </button>
        {ev.rsvp_count > 0 && (
          <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)" }}>
            {t("events.rsvp.count", { n: ev.rsvp_count })}
          </span>
        )}
      </div>

      {/* Form events say so up front — and, once registered, open the read-only
          registration recap (answers are locked once submitted). */}
      {ev.has_form && (
        goingIsh ? (
          <button onClick={() => onOpenForm(ev)} style={{
            ...base, marginTop: 8, background: "transparent", color: "var(--green)",
            border: "1px solid rgba(127,176,105,0.34)", fontWeight: 600,
          }}>
            ✓ {t("events.viewReg")}
          </button>
        ) : (
          <div style={{
            marginTop: 8, fontFamily: "var(--font-mono)", fontSize: 10.5,
            letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-3)",
          }}>
            ◇ {tf("card.hasForm")}
          </div>
        )
      )}
    </div>
  );
};

// Capacity state for a card. Only rendered for events that HAVE a cap
// (ev.capacity != null); no-capacity events are untouched. Shows "N seats left",
// "Full — waitlist open", or "You're on the waitlist" if this member is on it.
const SeatsLine = ({ ev, t }) => {
  if (ev.capacity == null) return null;
  const waitlisted = ev.my_rsvp === "waitlisted";
  const seatsLeft = ev.seats_left;
  let label;
  let color;
  if (waitlisted) {
    label = `◔ ${t("events.onWaitlist")}`;
    color = "var(--amber)";
  } else if (typeof seatsLeft === "number" && seatsLeft > 0) {
    // Only surface a scarcity count when seats are actually running low (<= 10).
    // With plenty of room the number is noise — render nothing for the count.
    if (seatsLeft > 10) return null;
    label = `◎ ${seatsLeft === 1 ? t("events.seatsLeftOne") : t("events.seatsLeft", { n: seatsLeft })}`;
    color = "var(--green)";
  } else {
    label = `◔ ${t("events.full")}`;
    color = "var(--amber)";
  }
  return (
    <div style={{
      marginTop: 10, fontFamily: "var(--font-mono)", fontSize: 11.5,
      letterSpacing: "0.02em", color,
    }}>
      {label}
    </div>
  );
};

// Firelit event card — the tappable content is the outbound link when `ev.link`
// exists (mirrors desktop); the RSVP row is a sibling below it, always live.
// Deep-linked card glows.
const EventCard = ({ ev, i, highlighted, t, tf, fmt, onRsvp, onOpenForm, onOpenDetail }) => {
  const style = TYPE_STYLE[ev.type] || DEFAULT_TYPE;
  const deadline = ev.deadline ? fmt(ev.deadline) : null;
  // START time = when to actually show up (distinct from `deadline`, the sign-up
  // cutoff). Date + time in Tashkent; only rendered when the backend supplies it.
  const start = ev.starts_at ? fmtDateTime(ev.starts_at) : null;
  const typeLabel = KNOWN_TYPES.includes(ev.type)
    ? t(`events.type.${ev.type}`)
    : (ev.type || t("events.type.other"));

  const containerStyle = {
    position: "relative", display: "block", padding: 18, overflow: "hidden",
    color: "var(--text)", textDecoration: "none",
    border: highlighted ? "1.5px solid var(--amber)" : "1px solid var(--hair)",
    boxShadow: highlighted ? "0 0 24px rgba(232,161,92,0.28)" : "none",
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

      {start && (
        <div style={{
          marginTop: 10, fontFamily: "var(--font-mono)", fontSize: 11.5,
          letterSpacing: "0.02em", color: "var(--teal-bright)",
        }}>
          ◷ {t("events.starts", { d: start })}
        </div>
      )}

      {ev.location && (
        <div style={{
          marginTop: 8, fontSize: 12.5, color: "var(--text-3)", lineHeight: 1.4,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          📍 {ev.location}
        </div>
      )}

      <SeatsLine ev={ev} t={t} />

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

      <div style={{
        marginTop: 14, fontFamily: "var(--font-mono)", fontSize: 11,
        letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--amber)",
      }}>
        {t("events.detail.viewDetails")} →
      </div>
    </>
  );

  // The card body opens the in-app DETAIL view (title/description/location/
  // dates/regions/link + register). The external link lives inside detail now, so
  // a tap never leaves the app unexpectedly. The RSVP row stays a live sibling.
  return (
    <div className="ch-cell-static" style={containerStyle}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => onOpenDetail(ev)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpenDetail(ev); } }}
        style={{ display: "block", color: "inherit", cursor: "pointer" }}
      >
        {inner}
      </div>
      <RsvpRow ev={ev} t={t} tf={tf} onRsvp={onRsvp} onOpenForm={onOpenForm} />
    </div>
  );
};

// Small labelled meta row for the detail view (glyph + label + value).
const MetaRow = ({ glyph, label, value, color }) => (
  <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
    <span aria-hidden style={{ flex: "0 0 auto", fontSize: 13, color: color || "var(--text-3)" }}>{glyph}</span>
    <div style={{ minWidth: 0 }}>
      <div style={{
        fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em",
        textTransform: "uppercase", color: "var(--text-3)",
      }}>{label}</div>
      <div style={{ fontSize: 14, color: "var(--text)", lineHeight: 1.45, marginTop: 2 }}>{value}</div>
    </div>
  </div>
);

// Uppercase mono section label shared by detail blocks (About / Location on map).
const SectionLabel = ({ children }) => (
  <div style={{
    fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: "0.14em",
    textTransform: "uppercase", color: "var(--text-3)", marginBottom: 8,
  }}>{children}</div>
);

// Embedded OpenStreetMap + navigation deep links. Only mounted when the event
// carries coordinates (lat && lng from GET /events/{id}). The map tiles come from
// OSM's export iframe; the three buttons hand a native maps URL to the system
// browser via openExternal (they leave Telegram, so never a bare <a>).
const MapBlock = ({ lat, lng, t }) => {
  const bbox = `${lng - 0.008}%2C${lat - 0.006}%2C${lng + 0.008}%2C${lat + 0.006}`;
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lng}`;
  const nav = [
    { label: "Yandex", url: `https://yandex.com/maps/?pt=${lng},${lat}&z=17&l=map` },
    { label: "2GIS",   url: `https://2gis.uz/geo/${lng},${lat}` },
    { label: "Google", url: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}` },
  ];
  return (
    <div style={{ marginTop: 22 }}>
      <SectionLabel>{t("events.detail.mapLabel")}</SectionLabel>
      <iframe
        title={t("events.detail.mapLabel")}
        src={src}
        loading="lazy"
        style={{
          display: "block", width: "100%", height: 180, border: "1px solid var(--hair)",
          borderRadius: "var(--radius-sm)",
        }}
      />
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        {nav.map((n) => (
          <button key={n.label} onClick={() => openExternal(n.url)} className="btn-ghost" style={{
            flex: 1, padding: "9px 4px", fontSize: 12.5, fontWeight: 600, textAlign: "center",
          }}>{n.label}</button>
        ))}
      </div>
    </div>
  );
};

// Full-screen event detail (parity with the desktop). Tapping a card opens this;
// it fetches the full event (description, region_ids, location, link, form_schema)
// via GET /events/{id}, resolves targeted region ids to localized names, and hosts
// the register / read-only action by reusing RsvpRow. `seed` is the live list item
// (authoritative for my_rsvp / rsvp_count after a toggle) painted immediately.
const EventDetail = ({ seed, t, tf, onClose, onRsvp, onOpenForm, me }) => {
  const { lang } = useT();
  const [full, setFull] = useState(null);      // fetched content fields
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);
  const [regionNames, setRegionNames] = useState(null); // null = still resolving
  const [copied, setCopied] = useState(false); // browser-fallback share confirmation
  const [ticketOpen, setTicketOpen] = useState(false); // attendee QR ticket overlay
  const [scanOpen, setScanOpen] = useState(false);     // staff scanner overlay
  // Staff check-in gate. admin/boss/super_admin use the /admin router; the owning
  // partner uses /partner. Ownership is proved by successfully PRE-LOADING the
  // roster: null=probing, false=not authorised (hide), array=authorised (show).
  const role = me?.role;
  const isAdminish = role === "admin" || role === "boss" || role === "super_admin";
  const isPartner = role === "partner";
  const canStaff = isAdminish || isPartner;
  const checkinBase = isPartner ? "partner" : "admin";
  const [roster, setRoster] = useState(null);

  useEffect(() => { load(); /* eslint-disable-line */ }, [seed?.id]);

  // Pre-load the check-in roster for staff — doubles as the ownership gate (a
  // non-owning partner 403/404s here, so the scan button never appears for them).
  useEffect(() => {
    const id = seed?.id;
    if (!canStaff || !id) { setRoster(null); return; }
    let alive = true;
    events.checkinRoster(id, checkinBase)
      .then((r) => { if (alive) setRoster(Array.isArray(r) ? r : []); })
      .catch(() => { if (alive) setRoster(false); });
    return () => { alive = false; };
  }, [seed?.id, canStaff, checkinBase]);

  const load = async () => {
    setLoading(true); setErr(false);
    try {
      const data = await events.get(seed.id);
      setFull(data);
      const ids = Array.isArray(data?.region_ids) ? data.region_ids : [];
      if (ids.length) {
        try {
          const list = await regions.list();
          const byId = new Map((Array.isArray(list) ? list : []).map((r) => [r.id, r]));
          setRegionNames(ids.map((id) => {
            const r = byId.get(id);
            return r ? (r[`name_${lang}`] || r.name_en || r.name_uz || r.name_ru || "") : "";
          }).filter(Boolean));
        } catch { setRegionNames([]); }
      } else {
        setRegionNames([]); // empty/null = all regions (unlimited)
      }
    } catch { setErr(true); }
    setLoading(false);
  };

  // Content from the fetch; volatile RSVP state always from the live seed so the
  // action button stays in sync with the feed after a toggle.
  const ev = {
    ...(full || {}), ...seed,
    my_rsvp: seed.my_rsvp, rsvp_count: seed.rsvp_count, seats_left: seed.seats_left,
    capacity: full?.capacity ?? seed.capacity,
  };
  const style = TYPE_STYLE[ev.type] || DEFAULT_TYPE;
  const typeLabel = KNOWN_TYPES.includes(ev.type) ? t(`events.type.${ev.type}`) : (ev.type || t("events.type.other"));
  const start = ev.starts_at ? fmtDateTime(ev.starts_at) : null;
  const deadline = ev.deadline ? fmtDate(ev.deadline) : null;
  // Targeted-regions label: resolved names, or "All regions" when unlimited.
  const regionsLabel = regionNames == null
    ? null
    : (regionNames.length ? regionNames.join(", ") : t("events.detail.allRegions"));
  // Partner is defensive — the current EventOut payload omits it, but render it
  // the moment the backend starts sending a name/id (desktop parity).
  const partnerLabel = ev.partner_name || (ev.partner_id ? t("events.detail.partnerGeneric") : null);
  const hasGeo = ev.lat != null && ev.lng != null;

  // Share = a deep link that reopens this event inside the Mini App. Prefer
  // Telegram's native share sheet; outside Telegram, copy the link + flash "Copied".
  const shareEvent = () => {
    const link = `https://t.me/${BOT_USERNAME}?startapp=event_${ev.id}`;
    const w = window.Telegram?.WebApp;
    if (w && typeof w.openTelegramLink === "function") {
      try {
        w.openTelegramLink(
          `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(ev.title || "")}`,
        );
        return;
      } catch { /* fall through to clipboard */ }
    }
    try { navigator.clipboard?.writeText(link); } catch { /* blocked */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <>
    <div style={{
      position: "fixed", inset: 0, zIndex: 320, background: "var(--bg)",
      maxWidth: 480, margin: "0 auto", display: "flex", flexDirection: "column",
    }}>
      {/* Header — close + kicker */}
      <div style={{
        flex: "0 0 auto", padding: "calc(var(--safe-t) + 14px) 16px 12px",
        borderBottom: "1px solid var(--hair)", background: "var(--surface)",
        display: "flex", alignItems: "center", gap: 12,
      }}>
        <button onClick={onClose} aria-label={t("common.back")} style={{
          width: 38, height: 38, borderRadius: 11, border: "1px solid var(--hair)",
          background: "var(--surface-2)", color: "var(--text-2)", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}><Icon name="arrow_left" size={17} /></button>
        <div style={{
          fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.14em",
          textTransform: "uppercase", color: "var(--amber)",
        }}>{t("events.kicker")}</div>
      </div>

      {/* Body */}
      <div style={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
        {ev.cover_url && (
          <img src={ev.cover_url} alt="" style={{ display: "block", width: "100%", height: 190, objectFit: "cover" }} />
        )}
        <div style={{ padding: "18px 20px calc(var(--safe-b) + 24px)" }}>
          <span style={{
            display: "inline-flex", alignItems: "center", padding: "5px 11px",
            borderRadius: "var(--radius-pill)", background: style.bg, border: `1px solid ${style.bd}`,
            color: style.color, fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase",
          }}>{typeLabel}</span>

          <h1 style={{
            margin: "14px 0 0", fontFamily: "var(--font-display)", fontWeight: 700,
            fontSize: 24, lineHeight: 1.18, letterSpacing: "-0.01em", color: "var(--text)",
          }}>{ev.title}</h1>

          <SeatsLine ev={ev} t={t} />

          {ev.matched?.length > 0 && (
            <div style={{ marginTop: 10, fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.02em", color: "var(--green)" }}>
              ✨ {t("events.matches", { tags: ev.matched.join(", ") })}
            </div>
          )}

          {/* Meta rows — starts / deadline / location / regions / partner */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 18 }}>
            {start && <MetaRow glyph="◷" color="var(--teal-bright)" label={t("events.detail.startsLabel")} value={start} />}
            {deadline && <MetaRow glyph="⏰" color="var(--amber)" label={t("events.detail.deadlineLabel")} value={deadline} />}
            {ev.location && <MetaRow glyph="📍" label={t("events.locationLabel")} value={ev.location} />}
            {regionsLabel && <MetaRow glyph="◎" label={t("events.detail.regions")} value={regionsLabel} />}
            {partnerLabel && <MetaRow glyph="◆" label={t("events.detail.partner")} value={partnerLabel} />}
          </div>

          {err && !full && (
            <div style={{ marginTop: 18, color: "var(--terra)", fontSize: 13.5, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              {t("events.detail.loadError")}
              <button className="btn-ghost" onClick={load}>{tf("retry")}</button>
            </div>
          )}

          {ev.description && (
            <div style={{ marginTop: 22 }}>
              <div style={{
                fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: "0.14em",
                textTransform: "uppercase", color: "var(--text-3)", marginBottom: 8,
              }}>{t("events.detail.about")}</div>
              <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6, color: "var(--text-2)", whiteSpace: "pre-wrap" }}>
                {ev.description}
              </p>
            </div>
          )}

          {/* Map + navigation deep links — only when the event carries coordinates. */}
          {hasGeo && <MapBlock lat={ev.lat} lng={ev.lng} t={t} />}

          {loading && !full && (
            <div style={{ textAlign: "center", padding: 24, color: "var(--text-3)" }}>
              <Icon name="loader" size={20} color="var(--amber)" />
            </div>
          )}

          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 22 }}>
            {ev.link && (
              <a href={ev.link} target="_blank" rel="noopener noreferrer" className="btn-ghost" style={{
                display: "inline-flex", alignItems: "center", gap: 8, textDecoration: "none",
              }}>
                <Icon name="link" size={15} /> {t("events.open")}
              </a>
            )}
            <button onClick={shareEvent} className="btn-ghost" style={{
              display: "inline-flex", alignItems: "center", gap: 8,
            }}>
              <Icon name="link" size={15} /> {copied ? t("events.detail.copied") : t("events.detail.share")}
            </button>
          </div>

          {/* Register / read-only action — same component as the card. */}
          <RsvpRow ev={ev} t={t} tf={tf} onRsvp={onRsvp} onOpenForm={onOpenForm} />

          {/* 🎫 Attendee ticket — the QR + code door staff scan. Only for a
              member who is actually going (going OR waitlisted). */}
          {(ev.my_rsvp === "going" || ev.my_rsvp === "waitlisted") && (
            <button onClick={() => setTicketOpen(true)} className="btn-primary" style={{
              marginTop: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}>
              🎫 {t("events.ticket.openBtn")}
            </button>
          )}

          {/* 📷 Staff check-in — shown once the roster pre-load proves the viewer
              owns/manages this event (admin/boss/super_admin, or owning partner). */}
          {canStaff && Array.isArray(roster) && (
            <button onClick={() => setScanOpen(true)} className="btn-ghost" style={{
              marginTop: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%",
            }}>
              📷 {t("events.scan.openBtn")}
            </button>
          )}
        </div>
      </div>
    </div>

    {ticketOpen && <TicketModal event={ev} onClose={() => setTicketOpen(false)} />}
    {scanOpen && (
      <ScannerModal
        event={ev}
        base={checkinBase}
        initialRoster={Array.isArray(roster) ? roster : null}
        onClose={() => setScanOpen(false)}
      />
    )}
    </>
  );
};

export const EventsScreen = ({ onBack, embedded = false, deepLinkEventId = null, me = null }) => {
  const { t } = useT();
  const tf = useEventFormT();   // registration-form strings (local map, see EventFormSheet)
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  // A deep-linked event (from a notification) opens on "all" so the target card
  // is actually in the loaded list — the "For you" radar rarely contains your own event.
  const [type, setType] = useState(deepLinkEventId ? "all" : "foryou");
  const [partnersOpen, setPartnersOpen] = useState(false);
  const [formEvent, setFormEvent] = useState(null);  // event whose registration form is open
  const [detailId, setDetailId] = useState(null);    // event whose full detail view is open
  const autoOpened = useRef(null);                   // deep-link event we've already auto-opened

  useEffect(() => { load(); /* eslint-disable-line */ }, [type]);
  useEffect(() => { if (deepLinkEventId) setType("all"); }, [deepLinkEventId]);

  // Deep link → open the event's detail AND its registration straight away (the
  // form sheet if it carries one; otherwise the detail's RSVP row is the focus).
  // Registered users land on their read-only registration recap. Guarded by a ref
  // so closing it doesn't re-trigger, and survives auth/onboarding because the
  // pending id lives in App state until we're mounted here.
  useEffect(() => {
    if (!deepLinkEventId || loading) return;
    if (autoOpened.current === deepLinkEventId) return;
    const ev = list.find((e) => e.id === deepLinkEventId);
    if (!ev) return;
    autoOpened.current = deepLinkEventId;
    setDetailId(ev.id);
    if (ev.has_form) setFormEvent(ev);
  }, [deepLinkEventId, loading, list]);

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

  // The form sheet submitted successfully → the server response carries the
  // authoritative rsvp_count/my_rsvp. Fall back to "going" if the backend ever
  // answers with a bare 200.
  const onFormDone = (id, r = {}) => {
    const patch = { my_rsvp: r.my_rsvp ?? "going" };
    if (typeof r.rsvp_count === "number") patch.rsvp_count = r.rsvp_count;
    onRsvp(id, patch);
  };

  const fmt = (iso) => fmtDate(iso) || "—"; // Tashkent-time, UTC-safe

  // Optional Instrument-Serif italic subtitle. `translate()` echoes the raw key
  // when a string is missing, so only render once the key is actually wired.
  const subText = t("events.sub");

  return (
    <Page>
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "calc(var(--safe-t) + 16px) 20px 8px" }}>
        {/* Action row — back (standalone only) + Partners (FLAGS.PARTNERS).
            When embedded AND Partners is off the row holds nothing, so skip it
            entirely rather than leave an empty 18px spacer. */}
        {(!embedded || FLAGS.PARTNERS) && (
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
          {FLAGS.PARTNERS && (
            <button onClick={() => setPartnersOpen(true)} className="btn-ghost" style={{
              display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 15px", fontSize: 13, flexShrink: 0,
            }}>
              <Icon name="briefcase" size={15} /> {t("partners.title")}
            </button>
          )}
        </div>
        )}

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
                  tf={tf}
                  fmt={fmt}
                  onRsvp={onRsvp}
                  onOpenForm={setFormEvent}
                  onOpenDetail={(e) => setDetailId(e.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {FLAGS.PARTNERS && partnersOpen && <PartnersModal onClose={() => setPartnersOpen(false)} />}

      {/* Full event detail — reads the live list item so its action stays in sync
          with the feed after a toggle; closes back to the feed. */}
      {detailId != null && (() => {
        const seed = list.find((e) => e.id === detailId);
        if (!seed) return null;
        return (
          <EventDetail
            seed={seed}
            t={t}
            tf={tf}
            me={me}
            onClose={() => setDetailId(null)}
            onRsvp={onRsvp}
            onOpenForm={setFormEvent}
          />
        );
      })()}

      {/* Registration form — closing it is safe: every keystroke is already in
          localStorage, so reopening restores the half-filled form. Painted above
          the detail overlay (higher z-index). */}
      {formEvent && (
        <EventFormSheet
          event={formEvent}
          onClose={() => setFormEvent(null)}
          onDone={(r) => onFormDone(formEvent.id, r)}
        />
      )}
    </Page>
  );
};
