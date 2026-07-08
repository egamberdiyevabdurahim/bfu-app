import { useState, useEffect, useRef } from "react";
import { Page, SkeletonList } from "../components/Shared";
import { Icon } from "../components/Icons";
import { users } from "../api";
import { UserProfileModal } from "../components/UserProfileModal";
import { InboxModal } from "../components/InboxModal";
import { SearchModal } from "../components/SearchModal";
import { MapModal } from "../components/MapModal";
import { OpenRolesScreen } from "./OpenRolesScreen";
import { useT } from "../i18n";

// ── Chorsu "Bazaar" City / Discovery ("building tonight") ─────────────────────
// Mobile port of the desktop City page (desktop/app/city/page.js + CityHeader /
// RegionCluster / BuilderCard). The AUTHED people feed (users.discover) mapped
// onto the firelit builder-window cards. Same data + logic as the old
// DiscoverScreen — only the skin changed.

// Firelit round icon button (search / map / briefcase / bell), carried over.
const ICON_BTN = {
  background: "var(--surface-2)", border: "1px solid var(--hair)", borderRadius: 99,
  width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center",
  cursor: "pointer", color: "var(--muted-strong)", flexShrink: 0,
};

// Warm per-person gradient derived from the numeric id (mirrors the desktop
// gradientFor / AvatarEl ember palette). Deterministic so a builder keeps tone.
const CARD_GRADIENTS = [
  "linear-gradient(135deg, #FF6A3D, #C0563B)", // ember → terra
  "linear-gradient(135deg, #E8A15C, #C0563B)", // amber → terra
  "linear-gradient(135deg, #5EC5B6, #12564F)", // teal-bright → teal
  "linear-gradient(135deg, #7FB069, #12564F)", // green → teal
  "linear-gradient(135deg, #E8A15C, #FF6A3D)", // amber → ember
];
const gradientFor = (id) => CARD_GRADIENTS[Math.abs(Number(id) || 0) % CARD_GRADIENTS.length];

const initialsOf = (name) =>
  ((name || "?").trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?");

const WEEKDAY_LOCALE = { en: "en-US", uz: "uz-UZ", ru: "ru-RU" };
const weekdayName = (lang) => {
  try {
    return new Date().toLocaleDateString(WEEKDAY_LOCALE[lang] || "en-US", { weekday: "long" });
  } catch {
    return new Date().toLocaleDateString("en-US", { weekday: "long" });
  }
};

// Tiny count-up used for the header numbers (respects reduced-motion).
function useCountUp(target, duration = 850) {
  const [val, setVal] = useState(target);
  const raf = useRef(0);
  useEffect(() => {
    const t = Number(target) || 0;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (reduce || t <= 0) { setVal(t); return; }
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(t * eased));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, duration]);
  return val;
}

export const CityScreen = () => {
  const { t, lang } = useT();
  const [activeFilter, setActiveFilter] = useState("All");
  const [sort, setSort] = useState("recent");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [people, setPeople] = useState([]);
  const [regionMap, setRegionMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [viewingUserId, setViewingUserId] = useState(null);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [rolesOpen, setRolesOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const loadSeq = useRef(0);

  const filters = ["ForYou", "All", "UI/UX", "Frontend", "Backend", "ML/AI", "Business"];

  // Region id → localized name, for the card foot. Best-effort; foot falls back
  // to age when a name can't be resolved.
  useEffect(() => {
    users.regionsPublic().then((rows) => {
      const m = {};
      for (const r of rows || []) {
        m[r.id] = (lang === "uz" ? r.name_uz : lang === "ru" ? r.name_ru : r.name_en) || r.name_en;
      }
      setRegionMap(m);
    }).catch(() => {});
  }, [lang]);

  useEffect(() => {
    const id = setTimeout(() => loadUsers(), 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFilter, sort, verifiedOnly]);

  useEffect(() => {
    const tick = () => users.unreadCount().then((r) => setUnread(r?.unread || 0)).catch(() => {});
    tick();
    const id = setInterval(tick, 60000 + Math.random() * 15000);
    return () => clearInterval(id);
  }, []);

  const loadUsers = async () => {
    const seq = ++loadSeq.current;
    setLoading(true); setLoadError(false);
    try {
      const q = { sort };
      if (verifiedOnly) q.verified = true;
      if (activeFilter === "ForYou") q.match = true;
      else if (activeFilter !== "All") q.skill = activeFilter.toLowerCase();
      const res = await users.discover(q);
      if (loadSeq.current !== seq) return;
      setPeople(Array.isArray(res) ? res : []);
    } catch (e) {
      if (loadSeq.current === seq) setLoadError(true);
    }
    if (loadSeq.current === seq) setLoading(false);
  };

  const total = people.length;
  const onlineCount = people.filter((p) => p.is_online).length;
  const verifiedCount = people.filter((p) => p.checked).length;
  const nBuilders = useCountUp(total);
  const nOnline = useCountUp(onlineCount);
  const nVerified = useCountUp(verifiedCount);

  const quiet = !loading && total === 0;
  const currentYear = new Date().getFullYear();

  const actions = [
    ["search", () => setSearchOpen(true), "search"],
    ["map", () => setMapOpen(true), "map"],
    ["briefcase", () => setRolesOpen(true), t("roles.title")],
  ];

  return (
    <>
      <Page>
        {/* The ported ch-* classes reference var(--muted)/var(--muted-strong),
            which the app's global tokens don't define (they ship --text-3 /
            --text-2). Alias them locally so muted text renders muted — matching
            the desktop — without touching shared Shared.jsx. */}
        <div style={{ "--muted": "#A8A093", "--muted-strong": "#C6BEAF" }}>
        <div style={{ padding: "calc(var(--safe-t) + 16px) 20px 0" }}>
          {/* Firelit action toolbar */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 18 }}>
            {actions.map(([icon, onClick, label]) => (
              <button key={icon} onClick={onClick} aria-label={label} title={label} style={ICON_BTN}>
                <Icon name={icon} size={18} />
              </button>
            ))}
            <button
              onClick={() => { setInboxOpen(true); setUnread(0); }}
              aria-label={t("inbox.title")}
              style={{ ...ICON_BTN, position: "relative" }}
            >
              <Icon name="bell" size={18} />
              {unread > 0 && (
                <span style={{
                  position: "absolute", top: -4, right: -4, minWidth: 18, height: 18, padding: "0 4px",
                  background: "linear-gradient(135deg, var(--ember), var(--terra))", color: "#160E08",
                  borderRadius: 99, fontSize: 11, fontWeight: 700,
                  display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid var(--bg)",
                }}>{unread > 9 ? "9+" : unread}</span>
              )}
            </button>
          </div>

          {/* City header — eyebrow / amber count-up headline / serif sub / stats */}
          <p className="ch-eyebrow">{t("city.eyebrow", { weekday: weekdayName(lang) })}</p>
          <h1 className="ch-h1">
            {quiet
              ? t("city.resting")
              : <><span className="amber">{nBuilders}</span> {t("city.litSuffix")}</>}
          </h1>
          <p className="ch-sub">{quiet ? t("city.subQuiet") : t("city.subActive")}</p>

          <div style={{ display: "flex", gap: 26, marginTop: 18 }}>
            <Stat value={nOnline} label={t("city.stat.online")} online />
            <Stat value={nBuilders} label={t("city.stat.builders")} />
            <Stat value={nVerified} label={t("city.stat.verified")} />
          </div>

          {/* Sort + verified toggle (preserved discover query controls) */}
          <div style={{ display: "flex", gap: 8, margin: "22px 0 12px", alignItems: "center" }}>
            <select value={sort} onChange={(e) => setSort(e.target.value)} style={{
              flex: 1, background: "var(--surface-2)", border: "1px solid var(--hair)",
              borderRadius: "var(--radius-sm)", padding: "9px 12px", fontSize: 13,
              color: "var(--text)", appearance: "none", cursor: "pointer", fontFamily: "var(--font-body)",
            }}>
              <option value="recent">{t("sort.recent")}</option>
              <option value="verified">{t("sort.verified")}</option>
              <option value="name">{t("sort.name")}</option>
            </select>
            <button onClick={() => setVerifiedOnly((v) => !v)} style={{
              padding: "9px 14px", fontSize: 12.5, fontWeight: 600, fontFamily: "var(--font-body)",
              background: verifiedOnly ? "var(--amber)" : "var(--surface-2)",
              color: verifiedOnly ? "#160E08" : "var(--muted-strong)",
              border: `1px solid ${verifiedOnly ? "var(--amber)" : "var(--hair)"}`,
              borderRadius: "var(--radius-sm)", cursor: "pointer", whiteSpace: "nowrap",
            }}>{t("filter.verifiedOnly")}</button>
          </div>

          {/* Skill filter chips — Chorsu chips (active = solid amber) */}
          <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, scrollbarWidth: "none" }}>
            {filters.map((f) => {
              const on = activeFilter === f;
              return (
                <button key={f} onClick={() => setActiveFilter(f)} style={{
                  flexShrink: 0, background: on ? "var(--amber)" : "var(--surface-2)",
                  color: on ? "#160E08" : "var(--muted-strong)",
                  border: `1px solid ${on ? "var(--amber)" : "var(--hair)"}`,
                  borderRadius: 99, padding: "8px 16px", fontSize: 13, fontWeight: on ? 700 : 500,
                  cursor: "pointer", transition: "all 0.2s", fontFamily: "var(--font-body)",
                }}>
                  {f === "All" ? t("filter.all") : f === "ForYou" ? `✦ ${t("discover.forYou")}` : f}
                </button>
              );
            })}
          </div>

          {/* Region / section slab divider */}
          {!loading && !loadError && total > 0 && (
            <div className="ch-slab">
              <span className="ch-slab-k">{t("city.slab.kicker")}</span>
              <h2>{t("city.slab.title")}</h2>
              <div className="ch-slab-line" />
              <span className="ch-slab-k">{t("city.slab.lit", { n: total })}</span>
            </div>
          )}
        </div>

        {/* Builder-window grid */}
        <div style={{ padding: "6px 20px 40px" }}>
          {loading ? (
            <SkeletonList count={5} />
          ) : loadError ? (
            <div style={{ textAlign: "center", padding: 40, color: "var(--text-3)" }}>
              <div style={{ marginBottom: 12 }}>{t("common.loadError")}</div>
              <button onClick={loadUsers} className="btn-ghost" style={{ width: "auto" }}>{t("common.retry")}</button>
            </div>
          ) : total === 0 ? (
            <GraceTile t={t} />
          ) : (
            <div className="ch-grid">
              {people.map((p, i) => (
                <BuilderCard
                  key={p.id}
                  p={p}
                  index={i}
                  t={t}
                  region={p.region_id ? regionMap[p.region_id] : null}
                  currentYear={currentYear}
                  onOpen={() => setViewingUserId(p.id)}
                />
              ))}
              {total < 4 && <GraceTile t={t} />}
            </div>
          )}
        </div>
        </div>
      </Page>

      {viewingUserId && (
        <UserProfileModal userId={viewingUserId} onClose={() => setViewingUserId(null)} />
      )}
      {inboxOpen && <InboxModal onClose={() => setInboxOpen(false)} />}
      {searchOpen && <SearchModal onClose={() => setSearchOpen(false)} />}
      {mapOpen && <MapModal onClose={() => setMapOpen(false)} />}
      {rolesOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "var(--bg)" }}>
          <OpenRolesScreen onBack={() => setRolesOpen(false)} />
        </div>
      )}
    </>
  );
};

// One header stat (count-up value + mono label). Online reads in --green.
const Stat = ({ value, label, online }) => (
  <div>
    <div style={{
      fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 30, lineHeight: 1,
      color: online ? "var(--green)" : "var(--text)",
    }}>{value}</div>
    <div style={{
      fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.14em",
      textTransform: "uppercase", color: "var(--muted)", marginTop: 5,
    }}>{label}</div>
  </div>
);

// A single firelit builder window. Gracefully omits any field the payload lacks
// (online ping, currently_building, rating) rather than rendering undefined.
const BuilderCard = ({ p, index, t, region, currentYear, onOpen }) => {
  const label = [p.name, p.surname].filter(Boolean).join(" ") || p.display_name || "";
  const grad = gradientFor(p.id);
  const skills = (p.analysis?.skills || []).slice(0, 3);
  const age = p.birth_year ? currentYear - p.birth_year : null;
  const footLeft = region || (age ? t("common.yo", { n: age }) : null);

  const look = p.mentor?.is_mentor
    ? t("ach.mentor.name")
    : p.open_to_work
      ? t("pd.cofounder")
      : p.open_to_volunteering
        ? t("discover.badge.volunteer")
        : null;

  const rating = p.rating || {};
  const hasRating = rating.count > 0 && rating.average != null;
  let rep, repNew = false;
  if (p.match_pct != null) rep = `✦ ${p.match_pct}%`;
  else if (hasRating) rep = `★ ${Number(rating.average).toFixed(1)}`;
  else { rep = `✶ ${t("city.card.new")}`; repNew = true; }

  const activate = () => onOpen();

  return (
    <div
      className="ch-card"
      role="button"
      tabIndex={0}
      onClick={activate}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); activate(); } }}
      style={{ cursor: "pointer", animationDelay: `${Math.min(index, 11) * 45}ms` }}
    >
      <div className="ch-card-wash" style={{ background: grad }} />

      {look && (
        <div className="ch-card-look">
          <i aria-hidden="true" />
          {look}
        </div>
      )}

      <div className="ch-card-av" style={{ background: grad }}>
        {p.photo_url ? <img src={p.photo_url} alt={label} /> : initialsOf(label)}
      </div>

      {p.is_online && (
        <span className="ch-card-pres" aria-hidden="true">
          <span className="ch-online-ping" />
          <i />
        </span>
      )}

      <div className="ch-card-body">
        <div className="ch-card-nm">
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
          {p.checked && <span className="ch-card-vf" title={t("common.verified")}>✓</span>}
        </div>

        {p.currently_building && (
          <div className="ch-card-bld">
            {t("city.card.building")} <b>{p.currently_building}</b>
          </div>
        )}

        {skills.length > 0 && (
          <div className="ch-card-tags">
            {skills.map((s, i) => (
              <span className="ch-card-t" key={`${s}-${i}`}>{s}</span>
            ))}
          </div>
        )}
      </div>

      <div className="ch-card-foot">
        <span className="ch-card-reg">{footLeft || ""}</span>
        <span className={`ch-card-rep${repNew ? " ch-card-rep-new" : ""}`}>{rep}</span>
      </div>
    </div>
  );
};

// Warm low-count / empty tile — an opening, not a dead end (spec §6).
const GraceTile = ({ t }) => (
  <div className="ch-grace">
    <span className="ch-grace-k">{t("city.grace.kicker")}</span>
    <div className="ch-grace-t">{t("city.grace.title")}</div>
    <div className="ch-grace-s">{t("city.grace.sub")}</div>
  </div>
);
