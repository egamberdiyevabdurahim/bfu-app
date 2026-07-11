"use client";

import { useEffect, useState } from "react";
import { bfu } from "@/lib/client-api";
import { useCountUp } from "@/lib/useCountUp";
import { gradientFor, initials } from "@/lib/avatar";
import { relTime } from "@/lib/notif";
import { useT } from "@/components/i18n/LocaleProvider";

// HomeDashboard — the personal /home dashboard body. Renders four stacked
// modules under the server-rendered hero:
//
//   1. "Needs you now" — action cards, each shown only when its count > 0
//      (pending applicants → /requests, unread notifications → /notifications,
//      session requests → /bookings). All-zero → one calm "all caught up" card.
//   2. Profile completeness meter — computed from the server-passed `profile`
//      slice (no fetch). Hidden entirely at 100%.
//   3. Your pulse — stat tiles from GET /projects/mine/funnel totals, or a warm
//      "start your first project" CTA when the founder has no projects.
//   4. The city tonight — live stats + a stack of real builder avatars, from the
//      server-passed (ISR-cached) city slice. Honest/graceful when quiet.
//
// The page stays a server component (auth gate + `me`); this client child owns
// the per-user client fetches and the count-up / progress animations. Every
// fetch is silent-catch: a transient failure renders a calm state, never a crash.

// ── shared bits ───────────────────────────────────────────────────────────────

function Eyebrow({ children, color = "var(--amber)" }) {
  return (
    <div
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        color,
      }}
    >
      {children}
    </div>
  );
}

function Slab({ kicker, title }) {
  return (
    <div className="ch-slab">
      <span className="ch-slab-k">{kicker}</span>
      <h2>{title}</h2>
      <span className="ch-slab-line" />
    </div>
  );
}

// ── Module 1: Needs you now ───────────────────────────────────────────────────

const NEEDS_ACCENTS = {
  ember: {
    glow: "linear-gradient(150deg, rgba(255,106,61,0.13), var(--surface) 60%)",
    border: "rgba(255,106,61,0.34)",
    color: "var(--ember)",
  },
  amber: {
    glow: "linear-gradient(150deg, rgba(232,161,92,0.11), var(--surface) 62%)",
    border: "rgba(232,161,92,0.32)",
    color: "var(--amber)",
  },
};

function NeedsCard({ card }) {
  const a = NEEDS_ACCENTS[card.accent] || NEEDS_ACCENTS.amber;
  return (
    <a
      href={card.href}
      className="ch-cell"
      aria-label={`${card.count} ${card.text}. ${card.cta}.`}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        minHeight: 132,
        color: "var(--text)",
        textDecoration: "none",
        background: a.glow,
        borderColor: a.border,
      }}
    >
      <span
        aria-hidden
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: 46,
          lineHeight: 1,
          letterSpacing: "-0.02em",
          color: a.color,
        }}
      >
        {card.count > 99 ? "99+" : card.count}
      </span>
      <div style={{ fontSize: 15, lineHeight: 1.4, color: "var(--text)" }}>{card.text}</div>
      <div
        style={{
          marginTop: "auto",
          paddingTop: 6,
          fontFamily: "var(--font-mono)",
          fontSize: 10.5,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: a.color,
        }}
      >
        {card.cta} →
      </div>
    </a>
  );
}

function NeedsYouNow() {
  const t = useT();
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState(0);
  const [unread, setUnread] = useState(0);
  const [sessions, setSessions] = useState(0);

  useEffect(() => {
    let alive = true;
    // One parallel batch; each result is independent so a single failure never
    // blocks the others (allSettled). Session requests = incoming mentor
    // bookings still awaiting a reply (status "requested").
    Promise.allSettled([
      bfu("/projects/my-requests"),
      bfu("/users/me/notifications/unread-count"),
      bfu("/bookings/me"),
    ]).then((res) => {
      if (!alive) return;
      const [r1, r2, r3] = res;
      if (r1.status === "fulfilled")
        setPending(Array.isArray(r1.value) ? r1.value.length : 0);
      if (r2.status === "fulfilled") setUnread(Number(r2.value?.unread) || 0);
      if (r3.status === "fulfilled") {
        const mentor = Array.isArray(r3.value?.as_mentor) ? r3.value.as_mentor : [];
        setSessions(mentor.filter((b) => b && b.status === "requested").length);
      }
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!loaded) {
    return (
      <section style={{ marginTop: 40 }} aria-busy="true">
        <Eyebrow>{t("home.needs.eyebrow")}</Eyebrow>
        <div className="hd-needs-grid" style={{ marginTop: 16 }} role="status" aria-label={t("home.needs.loading_aria")}>
          <div className="hd-sk" style={{ minHeight: 132 }} />
          <div className="hd-sk" style={{ minHeight: 132 }} />
        </div>
      </section>
    );
  }

  const cards = [
    pending > 0 && {
      href: "/requests",
      count: pending,
      text: pending === 1 ? t("home.needs.pending_one") : t("home.needs.pending_other"),
      cta: t("home.needs.pending_cta"),
      accent: "ember",
    },
    unread > 0 && {
      href: "/notifications",
      count: unread,
      text: unread === 1 ? t("home.needs.unread_one") : t("home.needs.unread_other"),
      cta: t("home.needs.unread_cta"),
      accent: "amber",
    },
    sessions > 0 && {
      href: "/bookings",
      count: sessions,
      text: sessions === 1 ? t("home.needs.sessions_one") : t("home.needs.sessions_other"),
      cta: t("home.needs.sessions_cta"),
      accent: "amber",
    },
  ].filter(Boolean);

  if (cards.length === 0) {
    return (
      <section style={{ marginTop: 40 }}>
        <div className="ch-grace" style={{ minHeight: 128 }}>
          <span className="ch-grace-k">{t("home.needs.eyebrow")}</span>
          <div className="ch-grace-t">{t("home.needs.grace_title")}</div>
          <div className="ch-grace-s">
            {t("home.needs.grace_sub")}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section style={{ marginTop: 40 }}>
      <Eyebrow>{t("home.needs.eyebrow")}</Eyebrow>
      <div className="hd-needs-grid" style={{ marginTop: 16 }}>
        {cards.map((c) => (
          <NeedsCard key={c.href} card={c} />
        ))}
      </div>
    </section>
  );
}

// ── Module 2: Profile completeness meter ──────────────────────────────────────

// Weighted checks (sum to 100). Bio + photo + skills carry the most weight —
// they're what the city and the AI read first.
function completeness(profile) {
  // Defensive: reads the raw `me` shape (about/currently_building may be null;
  // skills/portfolio_links are arrays; region is an object) OR a pre-shaped slice
  // (skillsCount/linksCount/currentlyBuilding/hasRegion). Never throws on nulls —
  // an undefined field here used to crash the whole /home render.
  const p = profile || {};
  const about = `${p.about ?? ""}`;
  const building = `${p.currentlyBuilding ?? p.currently_building ?? ""}`;
  const skills = Array.isArray(p.skills) ? p.skills.length : Number(p.skillsCount) || 0;
  const links = Array.isArray(p.portfolio_links) ? p.portfolio_links.length : Number(p.linksCount) || 0;
  const hasRegion =
    p.hasRegion ??
    Boolean((p.region && (p.region.id || p.region.name_en || p.region.name)) || p.region_id);

  const checks = [
    { ok: !!p.photo_url, w: 20, id: "photo" },
    { ok: about.length > 0, w: 25, id: "bio" },
    { ok: skills > 0, w: 20, id: "skills" },
    { ok: building.length > 0, w: 15, id: "building" },
    { ok: hasRegion, w: 10, id: "region" },
    { ok: links > 0, w: 10, id: "link" },
  ];
  const pct = checks.filter((c) => c.ok).reduce((a, c) => a + c.w, 0);
  const missing = checks.filter((c) => !c.ok).slice(0, 2);
  return { pct, missing };
}

function ProfileMeter({ profile }) {
  const t = useT();
  const { pct, missing } = completeness(profile);
  const shownPct = useCountUp(pct);
  const [fill, setFill] = useState(0);

  // Animate the bar from 0 → pct after mount (CSS width transition).
  useEffect(() => {
    const id = requestAnimationFrame(() => setFill(pct));
    return () => cancelAnimationFrame(id);
  }, [pct]);

  // A fully-lit profile needs no nudge — hide the module entirely.
  if (pct >= 100) return null;

  return (
    <section style={{ marginTop: 40 }}>
      <div
        className="ch-cell-static"
        style={{ display: "flex", flexDirection: "column", gap: 16, background: "linear-gradient(155deg, rgba(232,161,92,0.06), var(--surface) 60%)" }}
      >
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div className="ch-cell-label">{t("home.profile.label")}</div>
            <div
              style={{
                marginTop: 8,
                fontFamily: "var(--font-display)",
                fontWeight: 700,
                fontSize: 24,
                letterSpacing: "-0.01em",
                color: "var(--text)",
              }}
            >
              {t("home.profile.lit_pre")} <span style={{ color: "var(--amber)" }}>{shownPct}%</span> {t("home.profile.lit_post")}
            </div>
          </div>
          <div
            style={{
              fontFamily: "var(--font-accent)",
              fontStyle: "italic",
              fontSize: 17,
              color: "var(--muted-strong)",
              maxWidth: 320,
              textAlign: "right",
            }}
          >
            {t("home.profile.tagline")}
          </div>
        </div>

        <div className="hd-bar-track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={t("home.profile.progress_aria")}>
          <div className="hd-bar-fill" style={{ width: `${fill}%` }} />
        </div>

        {missing.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10.5,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "var(--muted-strong)",
              }}
            >
              {t("home.profile.to_finish")}
            </span>
            {missing.map((m) => (
              <a
                key={m.id}
                href="/web/settings"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontFamily: "var(--font-mono)",
                  fontSize: 11.5,
                  letterSpacing: "0.02em",
                  padding: "6px 12px",
                  borderRadius: "var(--radius-pill)",
                  background: "var(--surface-2)",
                  border: "1px solid rgba(232,161,92,0.3)",
                  color: "var(--amber)",
                  textDecoration: "none",
                }}
              >
                <span aria-hidden>+</span>
                {t(`home.profile.check_${m.id}`)}
              </a>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// ── Module 3: Your pulse ──────────────────────────────────────────────────────

function PulseTile({ label, value, accent }) {
  const animated = useCountUp(value || 0);
  return (
    <div
      className="ch-cell-static"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: 18,
        background: accent ? "linear-gradient(155deg, rgba(232,161,92,0.09), var(--surface) 62%)" : undefined,
        borderColor: accent ? "rgba(232,161,92,0.3)" : "var(--hair)",
      }}
    >
      <div className="ch-cell-label">{label}</div>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: 30,
          lineHeight: 1,
          letterSpacing: "-0.01em",
          color: accent ? "var(--amber)" : "var(--text)",
        }}
      >
        {animated}
      </div>
    </div>
  );
}

function Pulse({ followerCount }) {
  const t = useT();
  const [state, setState] = useState("loading"); // loading | ready | error
  const [totals, setTotals] = useState(null);

  useEffect(() => {
    let alive = true;
    bfu("/projects/mine/funnel")
      .then((res) => {
        if (!alive) return;
        setTotals(res?.totals || null);
        setState("ready");
      })
      .catch(() => alive && setState("error"));
    return () => {
      alive = false;
    };
  }, []);

  // A funnel outage shouldn't leave a dead section — drop the module silently.
  if (state === "error") return null;

  if (state === "loading") {
    return (
      <section aria-busy="true">
        <Slab kicker={t("home.pulse.kicker")} title={t("home.pulse.title")} />
        <div className="hd-pulse-grid" role="status" aria-label={t("home.pulse.loading_aria")}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="hd-sk" style={{ minHeight: 96 }} />
          ))}
        </div>
      </section>
    );
  }

  const hasProjects = Boolean(totals && totals.project_count);

  if (!hasProjects) {
    return (
      <section>
        <Slab kicker={t("home.pulse.kicker")} title={t("home.pulse.title")} />
        <div className="ch-grace" style={{ minHeight: 160, alignItems: "flex-start", textAlign: "left" }}>
          <span className="ch-grace-k">{t("home.pulse.empty_k")}</span>
          <div className="ch-grace-t">{t("home.pulse.empty_t")}</div>
          <div className="ch-grace-s">
            {t("home.pulse.empty_s")}
          </div>
          <a href="/web/projects/new" className="ch-btn-primary" style={{ marginTop: 14 }}>
            + {t("home.pulse.start")}
          </a>
        </div>
      </section>
    );
  }

  const tiles = [
    { label: t("home.pulse.tile_views"), value: totals.views },
    { label: t("home.pulse.tile_applications"), value: totals.applications },
    { label: t("home.pulse.tile_accepted"), value: totals.accepted },
    { label: t("home.pulse.tile_pending"), value: totals.pending, accent: (totals.pending || 0) > 0 },
  ];
  if (typeof followerCount === "number") {
    tiles.push({ label: t("home.pulse.tile_followers"), value: followerCount });
  }

  return (
    <section>
      <Slab kicker={t("home.pulse.kicker")} title={t("home.pulse.title")} />
      <div className="hd-pulse-grid">
        {tiles.map((tile) => (
          <PulseTile key={tile.label} label={tile.label} value={tile.value} accent={tile.accent} />
        ))}
      </div>
    </section>
  );
}

// ── Module 4: The city tonight ────────────────────────────────────────────────

function CityStat({ value, label, online }) {
  const animated = useCountUp(value || 0);
  return (
    <div>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: 30,
          lineHeight: 1,
          color: online ? "var(--green)" : "var(--text)",
        }}
      >
        {animated}
      </div>
      <div
        style={{
          marginTop: 5,
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          letterSpacing: "0.13em",
          textTransform: "uppercase",
          color: "var(--muted)",
        }}
      >
        {label}
      </div>
    </div>
  );
}

function CityAvatar({ builder }) {
  const grad = gradientFor(builder.id);
  return (
    <span
      title={builder.label}
      style={{
        width: 40,
        height: 40,
        borderRadius: "50%",
        marginLeft: -10,
        flex: "0 0 auto",
        background: grad,
        border: "2px solid var(--surface)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--font-display)",
        fontWeight: 700,
        fontSize: 14,
        color: "#160E08",
        overflow: "hidden",
      }}
    >
      {builder.photo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={builder.photo_url}
          alt=""
          style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }}
        />
      ) : (
        initials(builder.label)
      )}
    </span>
  );
}

function CityTonight({ stats, builders }) {
  const t = useT();
  const online = Number(stats?.online_now) || 0;
  const cities = Number(stats?.cities_lit) || 0;
  const fresh = Number(stats?.new_this_week) || 0;
  const hasBuilders = Array.isArray(builders) && builders.length > 0;
  const quiet = online === 0 && cities === 0 && fresh === 0 && !hasBuilders;

  return (
    <section>
      <Slab kicker={t("home.city.kicker")} title={t("home.city.title")} />
      <a
        href="/web/city"
        className="ch-cell"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 22,
          color: "var(--text)",
          textDecoration: "none",
          background: "linear-gradient(150deg, rgba(18,86,79,0.14), var(--surface) 62%)",
          borderColor: "rgba(94,197,182,0.24)",
        }}
      >
        {quiet ? (
          <div>
            <div
              style={{
                fontFamily: "var(--font-accent)",
                fontStyle: "italic",
                fontSize: 22,
                lineHeight: 1.3,
                color: "var(--text)",
              }}
            >
              {t("home.city.quiet_title")}
            </div>
            <div style={{ marginTop: 8, fontSize: 14, lineHeight: 1.5, color: "var(--muted-strong)" }}>
              {t("home.city.quiet_sub")}
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 34, flexWrap: "wrap" }}>
              <CityStat value={online} label={t("home.city.stat_online")} online />
              <CityStat value={cities} label={t("home.city.stat_cities")} />
              <CityStat value={fresh} label={t("home.city.stat_new")} />
            </div>
            {hasBuilders && (
              <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                <div style={{ display: "flex", paddingLeft: 10 }}>
                  {builders.map((b) => (
                    <CityAvatar key={b.id} builder={b} />
                  ))}
                </div>
                <span
                  style={{
                    fontFamily: "var(--font-accent)",
                    fontStyle: "italic",
                    fontSize: 16,
                    color: "var(--muted-strong)",
                  }}
                >
                  {t("home.city.building_now")}
                </span>
              </div>
            )}
          </>
        )}

        <div
          style={{
            marginTop: 2,
            fontFamily: "var(--font-mono)",
            fontSize: 10.5,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--teal-bright)",
          }}
        >
          {t("home.city.wander")} →
        </div>
      </a>
    </section>
  );
}

// ── Module 5: Who viewed your profile ─────────────────────────────────────────

// One viewer's avatar in the overlapping glance-stack. Links to /u/{id}, shows
// the real name on hover (title), and carries a green online dot when live.
function ViewerAvatar({ v }) {
  const t = useT();
  const grad = gradientFor(v.id);
  return (
    <a
      href={`/web/u/${v.id}`}
      title={v.display_name}
      aria-label={`${v.display_name}${v.is_online ? t("home.viewers.online_suffix") : ""}`}
      style={{ position: "relative", marginLeft: -10, flex: "0 0 auto", textDecoration: "none" }}
    >
      <span
        style={{
          display: "flex",
          width: 42,
          height: 42,
          borderRadius: "50%",
          background: grad,
          border: "2px solid var(--surface)",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: 14,
          color: "#160E08",
          overflow: "hidden",
        }}
      >
        {v.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={v.photo_url}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }}
          />
        ) : (
          initials(v.display_name)
        )}
      </span>
      {v.is_online && <span className="hd-dot" aria-hidden />}
    </a>
  );
}

// A single recent-viewer row: small avatar + name + relative time, whole row
// links to the viewer's profile.
function ViewerRow({ v }) {
  const grad = gradientFor(v.id);
  return (
    <a href={`/web/u/${v.id}`} className="hd-vrow">
      <span className="hd-vrow-av" style={{ background: grad }}>
        {v.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={v.photo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} />
        ) : (
          initials(v.display_name)
        )}
      </span>
      <span className="hd-vrow-name">
        {v.display_name}
        {v.region ? <span className="hd-vrow-region"> · {v.region}</span> : null}
      </span>
      <span className="hd-vrow-time">{relTime(v.viewed_at)}</span>
    </a>
  );
}

function ProfileViewers() {
  const t = useT();
  const [state, setState] = useState("loading"); // loading | ready | error
  const [data, setData] = useState({ count: 0, recent: [] });

  useEffect(() => {
    let alive = true;
    bfu("/users/me/profile-viewers")
      .then((res) => {
        if (!alive) return;
        setData({
          count: Number(res?.count) || 0,
          recent: Array.isArray(res?.recent) ? res.recent : [],
        });
        setState("ready");
      })
      .catch(() => alive && setState("error"));
    return () => {
      alive = false;
    };
  }, []);

  // Silent-catch: a transient failure drops the module rather than crashing.
  if (state === "error") return null;

  if (state === "loading") {
    return (
      <section aria-busy="true">
        <Slab kicker={t("home.viewers.kicker")} title={t("home.viewers.title")} />
        <div className="hd-sk" style={{ minHeight: 132 }} role="status" aria-label={t("home.viewers.loading_aria")} />
      </section>
    );
  }

  const { count, recent } = data;

  // No one's peeked yet → hide the module entirely (keeps the dashboard calm).
  if (count === 0 || recent.length === 0) return null;

  const stack = recent.slice(0, 10);
  const rows = recent.slice(0, 3);
  const headline =
    count === 1 ? t("home.viewers.headline_one") : t("home.viewers.headline_other", { count });

  return (
    <section>
      <Slab kicker={t("home.viewers.kicker")} title={t("home.viewers.title")} />
      <div
        className="ch-cell-static"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 18,
          background: "linear-gradient(150deg, rgba(255,106,61,0.08), var(--surface) 62%)",
          borderColor: "rgba(255,106,61,0.22)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", paddingLeft: 10 }}>
            {stack.map((v) => (
              <ViewerAvatar key={v.id} v={v} />
            ))}
          </div>
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: 18,
              letterSpacing: "-0.01em",
              color: "var(--text)",
            }}
          >
            {headline}
          </span>
        </div>

        <div className="hd-vlist">
          {rows.map((v) => (
            <ViewerRow key={v.id} v={v} />
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────

export default function HomeDashboard({ profile, city }) {
  return (
    <div>
      <NeedsYouNow />
      <ProfileMeter profile={profile} />
      <Pulse followerCount={profile?.follower_count} />
      <ProfileViewers />
      <CityTonight stats={city?.stats} builders={city?.builders} />

      <style>{`
        .hd-needs-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 16px;
        }
        .hd-pulse-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
          gap: 14px;
        }
        .hd-sk {
          position: relative;
          overflow: hidden;
          border-radius: var(--radius);
          border: 1px solid var(--hair);
          background: var(--surface-2);
        }
        .hd-sk::after {
          content: "";
          position: absolute;
          inset: 0;
          transform: translateX(-100%);
          background: linear-gradient(90deg, transparent, rgba(245,241,232,0.06), transparent);
          animation: hd-shimmer 1.5s ease-in-out infinite;
        }
        .hd-bar-track {
          height: 10px;
          border-radius: 99px;
          background: var(--surface-2);
          border: 1px solid var(--hair);
          overflow: hidden;
        }
        .hd-bar-fill {
          height: 100%;
          border-radius: 99px;
          background: linear-gradient(90deg, var(--amber), var(--ember));
          box-shadow: 0 0 18px rgba(255,106,61,0.4);
          transition: width 1.1s cubic-bezier(0.2, 0.9, 0.3, 1);
        }
        .hd-dot {
          position: absolute;
          right: 0;
          bottom: 0;
          width: 11px;
          height: 11px;
          border-radius: 50%;
          background: var(--green);
          border: 2px solid var(--surface);
          box-shadow: 0 0 8px rgba(127,176,105,0.6);
        }
        .hd-vlist {
          display: flex;
          flex-direction: column;
          gap: 2px;
          border-top: 1px solid var(--hair);
          padding-top: 8px;
        }
        .hd-vrow {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 8px 6px;
          border-radius: var(--radius-sm, 8px);
          text-decoration: none;
          color: var(--text);
          transition: background 0.15s ease;
        }
        .hd-vrow:hover { background: var(--surface-2); }
        .hd-vrow-av {
          flex: 0 0 auto;
          width: 30px;
          height: 30px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          font-family: var(--font-display);
          font-weight: 700;
          font-size: 11px;
          color: #160E08;
        }
        .hd-vrow-name {
          flex: 1 1 auto;
          min-width: 0;
          font-size: 14px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .hd-vrow-region { color: var(--muted); }
        .hd-vrow-time {
          flex: 0 0 auto;
          font-family: var(--font-mono);
          font-size: 11px;
          letter-spacing: 0.04em;
          color: var(--muted);
        }
        @keyframes hd-shimmer { 100% { transform: translateX(100%); } }
        @media (max-width: 560px) {
          .hd-needs-grid { grid-template-columns: 1fr; }
        }
        @media (prefers-reduced-motion: reduce) {
          .hd-sk::after { animation: none; }
          .hd-bar-fill { transition: none; }
        }
      `}</style>
    </div>
  );
}
