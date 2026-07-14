import { useState, useEffect, useRef } from "react";
import { Page, AvatarEl } from "../components/Shared";
import { Icon } from "../components/Icons";
import { users, storage, regions, bookings } from "../api";
import { FLAGS } from "../flags";
import { useT } from "../i18n";
import { tgAlert, shareUrl, openExternal } from "../tg";

// Marstiff is BFU's sanctioned partner; the credit links to their Instagram.
const MARSTIFF_URL = "https://www.instagram.com/marstiff_uz";
import { EditProfileScreen } from "./EditProfileScreen";
import { MentorsScreen } from "./MentorsScreen";
import { MentorSlotsSheet, BookingsSheet } from "../components/MentorSheets";
import { HomeStrip } from "../components/HomeStrip";
import { NotificationPrefsSheet } from "../components/NotificationPrefsSheet";
import { SavedSheet } from "../components/SavedSheet";
import { InviteSheet } from "../components/InviteSheet";
import { BlockedSheet } from "../components/BlockedSheet";
import { InboxModal } from "../components/InboxModal";
import { ProjectManageSheet } from "../components/ProjectManageSheet";
import { UserProfileModal } from "../components/UserProfileModal";

// ── Chorsu bento helpers ──────────────────────────────────────────────────────
// Achievement id → mono glyph + firelit tint. Labels resolve at render via the
// mini-app's existing t(`ach.${key}.name`) keys so they stay trilingual.
const ACHV_META = {
  first_project:         { icon: "◆", color: "amber" },
  first_application:     { icon: "✓", color: "green" },
  five_invites:          { icon: "✶", color: "ember" },
  verified:              { icon: "✓", color: "green" },
  first_endorsement:     { icon: "◆", color: "amber" },
  mentor:                { icon: "✶", color: "ember" },
  first_vouch_received:  { icon: "✓", color: "green" },
};
const ACHV_COLORS = {
  amber: { bg: "rgba(232,161,92,0.12)", border: "rgba(232,161,92,0.35)", text: "var(--amber)" },
  green: { bg: "rgba(127,176,105,0.12)", border: "rgba(127,176,105,0.35)", text: "var(--green)" },
  ember: { bg: "rgba(255,106,61,0.10)", border: "rgba(255,106,61,0.30)", text: "var(--ember)" },
};

// Client-side profile completeness (no network) — nudges builders to a fuller
// profile so discovery/matching works better. Weighted; hidden at 100%.
function profileCompleteness(u) {
  if (!u) return 0;
  let s = 0;
  if (u.name && u.surname) s += 10;
  if (u.photo_url) s += 15;
  if (u.birth_year) s += 5;
  if (u.gender) s += 5;
  if (u.region_id) s += 10;
  if (u.about) s += 20;
  if (u.currently_building) s += 10;
  if (u.checked) s += 10;
  if ((u.analysis?.skills || []).length) s += 10;
  if (u.open_to_work || u.open_to_volunteering) s += 5;
  return Math.min(100, s);
}

const CIRCUMFERENCE = 2 * Math.PI * 52; // r=52, matches the ring SVG below

function elasticEaseOut(x) {
  if (x === 0) return 0;
  if (x === 1) return 1;
  const c4 = (2 * Math.PI) / 3;
  return Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * c4) + 1;
}

// Reputation ring — ported from desktop ReputationCell (elastic count-up).
const ReputationRing = ({ average, size = 116 }) => {
  const ringRef = useRef(null);
  useEffect(() => {
    const ring = ringRef.current;
    if (!ring) return undefined;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fraction = average != null ? average / 5 : 0;
    const target = CIRCUMFERENCE * (1 - fraction);
    if (reduce) { ring.setAttribute("stroke-dashoffset", String(target)); return undefined; }
    let frame;
    const start = performance.now();
    const duration = 1300;
    const delay = setTimeout(() => {
      const tick = (now) => {
        const p = Math.min(1, (now - start) / duration);
        const eased = elasticEaseOut(p);
        ring.setAttribute("stroke-dashoffset", String(CIRCUMFERENCE + (target - CIRCUMFERENCE) * eased));
        if (p < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    }, 250);
    return () => { clearTimeout(delay); if (frame) cancelAnimationFrame(frame); };
  }, [average]);

  return (
    <div style={{ position: "relative", flex: "0 0 auto", width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 128 128" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="64" cy="64" r="52" fill="none" stroke="var(--surface-2)" strokeWidth="10" />
        <circle ref={ringRef} cx="64" cy="64" r="52" fill="none" stroke="url(#ch-rep-grad)"
          strokeWidth="10" strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE} strokeDashoffset={CIRCUMFERENCE} />
        <defs>
          <linearGradient id="ch-rep-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#F0B429" />
            <stop offset="1" stopColor="#FF6A3D" />
          </linearGradient>
        </defs>
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 34, lineHeight: 1, color: "var(--text)" }}>
          {average != null ? average.toFixed(1) : "—"}
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: "0.14em", color: "var(--text-2)", marginTop: 3 }}>
          / 5.0
        </div>
      </div>
    </div>
  );
};

// One row in the folded-in Settings menu.
const ActionRow = ({ icon, glyph, label, onClick, tone = "default", right = null }) => (
  <button onClick={onClick} style={{
    width: "100%", display: "flex", alignItems: "center", gap: 12, textAlign: "left",
    background: tone === "danger" ? "rgba(192,86,59,0.10)" : "var(--surface-2)",
    border: `1px solid ${tone === "danger" ? "rgba(192,86,59,0.35)" : "var(--hair)"}`,
    borderRadius: "var(--radius-sm)", padding: "13px 15px", cursor: "pointer",
    color: tone === "danger" ? "var(--terra)" : "var(--text)",
    fontFamily: "var(--font-body)", fontWeight: 600, fontSize: 14.5,
  }}>
    {glyph
      ? <span style={{ fontSize: 17, width: 20, textAlign: "center", flexShrink: 0 }}>{glyph}</span>
      : <Icon name={icon} size={18} color={tone === "danger" ? "var(--terra)" : "var(--amber)"} />}
    <span style={{ flex: 1, minWidth: 0 }}>{label}</span>
    {right}
    <Icon name="chevron_right" size={16} color="var(--text-3)" />
  </button>
);

const StatTile = ({ value, label }) => (
  <div style={{ flex: 1, textAlign: "center", padding: "12px 4px",
    background: "var(--surface-2)", border: "1px solid var(--hair)", borderRadius: "var(--radius-sm)" }}>
    <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 22, color: "var(--text)" }}>{value}</div>
    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.1em", marginTop: 4 }}>{label}</div>
  </div>
);

export const ProfileScreen = () => {
  const { t, lang, setLang } = useT();
  const [user, setUser] = useState(null);
  const [achievements, setAchievements] = useState([]);
  const [regionName, setRegionName] = useState("");
  const [inviteLink, setInviteLink] = useState(null);
  const [loading, setLoading] = useState(true);

  const [editOpen, setEditOpen] = useState(false);
  const [mentorsOpen, setMentorsOpen] = useState(false);
  const [slotsOpen, setSlotsOpen] = useState(false);
  const [bookingsOpen, setBookingsOpen] = useState(false);
  const [savingLang, setSavingLang] = useState(false);
  const [notifPrefsOpen, setNotifPrefsOpen] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [blockedOpen, setBlockedOpen] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [viewingUserId, setViewingUserId] = useState(null);
  const [sessionReqs, setSessionReqs] = useState(0);
  const [homeRefresh, setHomeRefresh] = useState(0);

  useEffect(() => {
    if (!FLAGS.MENTORING) return;
    bookings.mine()
      .then(r => setSessionReqs((r?.as_mentor || []).filter(b => b.status === "requested").length))
      .catch(() => {});
  }, []);

  useEffect(() => { loadUser(); }, []);

  const loadUser = async () => {
    setLoading(true);
    try {
      const me = await users.me();
      // Enrich with the public-profile shape (badges etc.); `me` keeps priority
      // for identity/role fields the public payload doesn't carry.
      const prof = await users.getProfile(me.id).catch(() => null);
      setUser({ ...(prof || {}), ...me });
    } catch (e) { /* handled by empty render */ }
    setLoading(false);
  };

  // Achievements, region label and invite link are additive — failures never
  // block the profile render.
  useEffect(() => {
    users.achievements().then(r => setAchievements(r?.achievements || [])).catch(() => setAchievements([]));
    users.invite().then(d => setInviteLink(d?.link || null)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!user?.region_id) { setRegionName(""); return; }
    regions.list().then(list => {
      const r = (list || []).find(x => x.id === user.region_id);
      if (r) setRegionName(r[`name_${lang}`] || r.name_en || "");
    }).catch(() => {});
  }, [user?.region_id, lang]);

  const handleSignOut = () => {
    storage.clear();
    window.dispatchEvent(new Event("bfu:signout"));
  };

  const chooseLang = async (code) => {
    if (code === user?.language || savingLang) { setLang(code); return; }
    setLang(code);
    setUser(u => (u ? { ...u, language: code } : u));
    setSavingLang(true);
    try { await users.updateMe({ language: code }); } catch { /* keep local */ }
    setSavingLang(false);
  };

  const copyPublic = async () => {
    const url = users.publicUrl(user.id);
    try { await navigator.clipboard?.writeText(url); tgAlert(t("trust.copied")); }
    catch { tgAlert(url); }
  };

  // CV/resume PDF export — flagged off. The guard keeps the network call dead
  // even if a stale ref somehow reaches the handler; flip FLAGS.CV_EXPORT to restore.
  const downloadCV = async () => {
    if (!FLAGS.CV_EXPORT) return;
    try { await users.resume(); }
    catch { tgAlert(t("resume.failed")); }
  };

  // Admin work lives on the desktop console now — the Mini App only points at it.
  // Telegram's openLink hands the URL to the system browser; window.open is the
  // plain-web fallback (same pattern as the external links in SearchModal).
  const openAdminConsole = () => {
    const url = "https://brightfuturesuzbekistan.uz/web/dashboard";
    const w = window.Telegram?.WebApp;
    if (w && typeof w.openLink === "function") {
      try { w.openLink(url); return; } catch { /* fall through */ }
    }
    window.open(url, "_blank", "noopener");
  };

  // ── Overlays (preserve Settings navigation) ─────────────────────────────────
  if (editOpen) return <EditProfileScreen me={user} onBack={() => setEditOpen(false)} onSaved={loadUser} />;
  if (FLAGS.MENTORING && mentorsOpen) return <MentorsScreen onClose={() => setMentorsOpen(false)} />;

  if (loading) {
    return (
      <Page style={{ "--muted": "var(--text-3)", "--muted-strong": "var(--text-2)" }}>
        <div style={{ textAlign: "center", padding: 60, color: "var(--text-3)" }}>
          <Icon name="loader" size={24} color="var(--amber)" />
        </div>
      </Page>
    );
  }
  if (!user) return null;

  const fullName = [user.name, user.surname].filter(Boolean).join(" ") || user.display_name;
  const isOnline = user.is_online === true;
  const rating = user.rating || { average: null, count: 0 };
  const collaborators = user.collaborators || { count: 0, preview: [] };
  const followers = user.follower_count || 0;
  const topVouch = (user.vouches || [])[0];
  const vouchCount = user.vouch_count ?? (user.vouches || []).length;
  const founded = user.founded_projects || [];
  const member = user.member_projects || [];
  const stats = user.stats || {};
  const links = user.portfolio_links || [];
  const isMentor = FLAGS.MENTORING && !!user.mentor?.is_mentor;
  const isAdmin = user.role === "admin" || user.role === "super_admin";

  const lookingFor = user.open_to_work && user.open_to_volunteering
    ? "both" : user.open_to_work ? "work" : user.open_to_volunteering ? "volunteering" : null;

  const STACK_GRADIENTS = [
    "linear-gradient(140deg,#E8A15C,#C0563B)",
    "linear-gradient(140deg,#F0B429,#C0563B)",
    "linear-gradient(140deg,#5EC5B6,#12564F)",
    "linear-gradient(140deg,#7FB069,#12564F)",
  ];
  const initials = (nm) => (nm || "?").trim().split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

  const LANGS = [
    { code: "en", label: "English" },
    { code: "uz", label: "O‘zbekcha" },
    { code: "ru", label: "Русский" },
  ];

  return (
    <Page style={{ "--muted": "var(--text-3)", "--muted-strong": "var(--text-2)" }}>
      <div style={{ padding: "calc(var(--safe-t) + 18px) 18px 40px" }}>

        {/* ── Header: eyebrow + identity strip ── */}
        <p className="ch-eyebrow">{t("profile.your_bench")}</p>
        <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 16 }}>
          <div style={{ position: "relative", flex: "0 0 auto" }}>
            <AvatarEl name={fullName} size={92} photoUrl={user.photo_url} />
            {isOnline && (
              <span style={{ position: "absolute", bottom: 4, right: 4, display: "inline-flex", width: 16, height: 16 }}>
                <span className="ch-online-ping" />
                <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "var(--ember)", border: "3px solid var(--bg)" }} />
              </span>
            )}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h1 style={{ margin: 0, fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 26,
                lineHeight: 1.05, letterSpacing: "-0.02em", color: "var(--text)", overflowWrap: "anywhere" }}>
                {fullName}
              </h1>
              {user.checked && (
                <span title={t("common.verified")} style={{ flex: "0 0 auto", display: "inline-flex",
                  alignItems: "center", justifyContent: "center", width: 22, height: 22, borderRadius: "50%",
                  background: "rgba(127,176,105,0.16)", color: "var(--green)", fontSize: 12 }}>✓</span>
              )}
            </div>
            {user.currently_building && (
              <div style={{ marginTop: 8, fontSize: 15, lineHeight: 1.35, display: "-webkit-box",
                WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                <span style={{ fontFamily: "var(--font-accent)", fontStyle: "italic", color: "var(--text-2)" }}>
                  {t("profile.building")}
                </span>{" "}
                <span style={{ fontFamily: "var(--font-accent)", fontStyle: "italic", color: "var(--amber)" }}>
                  {user.currently_building}
                </span>
              </div>
            )}
            {(regionName || user.tg_username) && (
              <div style={{ marginTop: 10, fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.12em",
                textTransform: "uppercase", color: "var(--text-2)", display: "flex", alignItems: "center",
                gap: 8, flexWrap: "wrap" }}>
                {regionName && <span>{regionName}</span>}
                {regionName && user.tg_username && <span style={{ color: "var(--hair)" }}>/</span>}
                {user.tg_username && <span style={{ textTransform: "none" }}>@{user.tg_username}</span>}
              </div>
            )}
          </div>
        </div>

        {/* ── Profile completeness nudge (hidden at 100%) ── */}
        {profileCompleteness(user) < 100 && (
          <button onClick={() => setEditOpen(true)} style={{
            width: "100%", textAlign: "left", marginTop: 20, padding: "13px 15px", cursor: "pointer",
            background: "var(--surface-2)", border: "1px solid var(--hair)", borderRadius: "var(--radius-sm)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
              <span style={{ fontSize: 13, color: "var(--text)", fontWeight: 600 }}>
                {t("complete.label", { n: profileCompleteness(user) })}
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--amber)" }}>{t("complete.hint")}</span>
            </div>
            <div style={{ height: 6, background: "var(--bg)", borderRadius: 99, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${profileCompleteness(user)}%`,
                background: "linear-gradient(90deg, var(--amber), var(--ember))", borderRadius: 99, transition: "width 0.6s ease" }} />
            </div>
          </button>
        )}

        {/* ── Home command center (needs-you-now + who-viewed-you) ── */}
        <HomeStrip
          refreshKey={homeRefresh}
          onOpenRequests={() => setManageOpen(true)}
          onOpenInbox={() => setInboxOpen(true)}
          onOpenBookings={() => { if (FLAGS.MENTORING) setBookingsOpen(true); }}
          onOpenUser={(id) => setViewingUserId(id)}
        />

        {/* ── Bento stack (single column on mobile) ── */}
        <div className="ch-grid" style={{ marginTop: 24 }}>

          {/* Currently building / hero */}
          <div className="ch-cell-static" style={{ display: "flex", flexDirection: "column" }}>
            <div className="ch-cell-label">{t("profile.building")}</div>
            <div style={{ position: "relative", marginTop: 14, height: 120, borderRadius: 14, overflow: "hidden",
              background: "linear-gradient(160deg,#12564F 0%,#1A1815 42%,#C0563B 130%)", border: "1px solid var(--hair)" }}>
              <div style={{ position: "absolute", top: 18, right: 22, width: 46, height: 46, borderRadius: "50%",
                background: "radial-gradient(circle at 40% 40%, #F0B429, #FF6A3D 70%)", boxShadow: "0 0 40px rgba(255,106,61,0.55)" }} />
            </div>
            <h2 style={{ margin: "16px 0 0", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 24,
              letterSpacing: "-0.02em", color: "var(--text)" }}>
              {founded[0]?.name || user.currently_building || t("profile.noProjects")}
            </h2>
            {user.about && (
              <p style={{ margin: "8px 0 0", fontSize: 14, lineHeight: 1.55, color: "var(--text-2)",
                display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                {user.about}
              </p>
            )}
          </div>

          {/* Reputation */}
          <div className="ch-cell-static" style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <ReputationRing average={rating.average} />
            <div style={{ minWidth: 0 }}>
              <div className="ch-cell-label">{t("trust.rating")}</div>
              <div style={{ marginTop: 8, fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 19,
                color: "var(--text)", lineHeight: 1.15 }}>
                {rating.count > 0 ? t("profile.trusted") : t("profile.new_to_bazaar")}
              </div>
              <div style={{ marginTop: 8, fontSize: 13, color: "var(--text-2)" }}>
                {rating.count > 0 ? (
                  <>
                    <span style={{ fontFamily: "var(--font-mono)", color: "var(--amber)" }}>{rating.count}</span>{" "}
                    {rating.count === 1 ? t("profile.rating_one") : t("profile.rating_many")}
                  </>
                ) : t("trust.noRating")}
              </div>
            </div>
          </div>

          {/* Looking for */}
          {lookingFor && (
            <div className="ch-cell-static" style={{ borderColor: "rgba(127,176,105,0.3)",
              background: "linear-gradient(150deg, rgba(127,176,105,0.10), var(--surface) 60%)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--green)",
                  boxShadow: "0 0 12px rgba(127,176,105,0.8)" }} />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.16em",
                  textTransform: "uppercase", color: "var(--green)" }}>{t("profile.looking_for")}</span>
              </div>
              <p style={{ margin: "14px 0 0", fontSize: 18, lineHeight: 1.4, color: "var(--text)",
                fontFamily: "var(--font-display)", fontWeight: 500 }}>
                {t(`profile.looking_${lookingFor}`)}
              </p>
            </div>
          )}

          {/* Achievements */}
          {FLAGS.TRUST && achievements.length > 0 && (
            <div className="ch-cell-static">
              <div className="ch-cell-label">{t("ach.title")}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
                {achievements.map(a => {
                  const meta = ACHV_META[a.key] || { icon: "◆", color: "amber" };
                  const label = t(`ach.${a.key}.name`);
                  if (!a.earned) {
                    return (
                      <div key={a.key} title={t("ach.locked")} style={{ display: "inline-flex", alignItems: "center",
                        gap: 7, padding: "8px 13px", borderRadius: "var(--radius-pill)", background: "var(--surface-2)",
                        border: "1px dashed var(--hair)", color: "var(--text-2)", fontSize: 12.5, fontWeight: 500, opacity: 0.75 }}>
                        <span aria-hidden style={{ fontFamily: "var(--font-mono)" }}>◇</span> {label}
                      </div>
                    );
                  }
                  const c = ACHV_COLORS[meta.color];
                  return (
                    <div key={a.key} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 13px",
                      borderRadius: "var(--radius-pill)", background: c.bg, border: `1px solid ${c.border}`,
                      color: c.text, fontSize: 12.5, fontWeight: 600 }}>
                      <span aria-hidden>{meta.icon}</span> {label}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Vouches */}
          <div className="ch-cell-static" style={{ display: "flex", flexDirection: "column" }}>
            <div className="ch-cell-label">{t("trust.vouches")}{vouchCount > 0 ? ` (${vouchCount})` : ""}</div>
            {topVouch ? (
              <>
                <p style={{ margin: "14px 0 0", fontFamily: "var(--font-accent)", fontStyle: "italic",
                  fontSize: 20, lineHeight: 1.4, color: "var(--text)" }}>
                  “{topVouch.text}”
                </p>
                <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%",
                    background: "linear-gradient(140deg,#7FB069,#12564F)", display: "flex", alignItems: "center",
                    justifyContent: "center", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14, color: "#160E08" }}>
                    {initials(topVouch.author?.display_name)}
                  </div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text)" }}>
                    {topVouch.author?.display_name || t("inbox.someone")}
                  </div>
                </div>
              </>
            ) : (
              <p style={{ marginTop: 14, color: "var(--text-2)", fontSize: 14 }}>{t("trust.noVouches")}</p>
            )}
          </div>

          {/* Connections */}
          {FLAGS.CONNECTIONS && (
          <div className="ch-cell-static" style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <div style={{ display: "flex" }}>
              {collaborators.preview.length > 0 ? (
                collaborators.preview.slice(0, 4).map((p, i) => (
                  <div key={p.id ?? i} style={{ width: 42, height: 42, borderRadius: "50%",
                    background: STACK_GRADIENTS[i % STACK_GRADIENTS.length], border: "2px solid var(--surface)",
                    marginLeft: i === 0 ? 0 : -13, display: "flex", alignItems: "center", justifyContent: "center",
                    fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14, color: "#160E08", overflow: "hidden" }}>
                    {p.photo_url
                      ? <img src={p.photo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : initials(p.display_name)}
                  </div>
                ))
              ) : (
                <div style={{ width: 42, height: 42, borderRadius: "50%", background: "var(--surface-2)",
                  border: "2px solid var(--surface)", display: "flex", alignItems: "center", justifyContent: "center",
                  fontFamily: "var(--font-mono)", fontSize: 16, color: "var(--text-2)" }} aria-hidden>◇</div>
              )}
              {collaborators.count > collaborators.preview.slice(0, 4).length && (
                <div style={{ width: 42, height: 42, borderRadius: "50%", background: "var(--surface-2)",
                  border: "2px solid var(--surface)", marginLeft: -13, display: "flex", alignItems: "center",
                  justifyContent: "center", fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 12, color: "var(--text-2)" }}>
                  +{collaborators.count - collaborators.preview.slice(0, 4).length}
                </div>
              )}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 14, color: "var(--text)" }}>
                <span style={{ fontFamily: "var(--font-mono)", color: "var(--amber)" }}>{followers}</span>{" "}
                {followers === 1 ? t("follow.followersOne").replace(/^1\s*/, "") : t("follow.followers", { n: followers }).replace(/^\d+\s*/, "")}
              </div>
              {collaborators.count > 0 && (
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: "0.1em",
                  textTransform: "uppercase", color: "var(--text-2)", marginTop: 5 }}>
                  {t("collab.title")}
                </div>
              )}
            </div>
          </div>
          )}

          {/* Projects, stats & links */}
          <div className="ch-cell-static">
            <div style={{ display: "flex", gap: 8 }}>
              <StatTile value={stats.projects_founded ?? 0} label={t("profile.stat.founded")} />
              <StatTile value={stats.projects_joined ?? 0} label={t("profile.stat.joined")} />
              <StatTile value={stats.applications_accepted ?? 0} label={t("profile.stat.accepted")} />
            </div>

            {(founded.length > 0 || member.length > 0) ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 16 }}>
                {founded.length > 0 && (
                  <div>
                    <div className="section-label" style={{ marginBottom: 8 }}>{t("profile.founded")}</div>
                    {founded.map(p => (
                      <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--surface-2)",
                        border: "1px solid var(--hair)", borderRadius: "var(--radius-sm)", padding: "10px 12px", marginBottom: 6 }}>
                        <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, color: "var(--text)",
                          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</span>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600, padding: "3px 9px",
                          borderRadius: "var(--radius-pill)", textTransform: "uppercase", letterSpacing: "0.06em",
                          background: p.is_active ? "rgba(94,197,182,0.15)" : "var(--surface-3)",
                          color: p.is_active ? "var(--teal-bright)" : "var(--text-3)" }}>
                          {p.is_active ? t("profile.active") : t("profile.closed")}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {member.length > 0 && (
                  <div>
                    <div className="section-label" style={{ marginBottom: 8 }}>{t("profile.member")}</div>
                    {member.map(p => (
                      <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--surface-2)",
                        border: "1px solid var(--hair)", borderRadius: "var(--radius-sm)", padding: "10px 12px", marginBottom: 6 }}>
                        <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, color: "var(--text)",
                          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</span>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600, padding: "3px 9px",
                          borderRadius: "var(--radius-pill)", textTransform: "uppercase", letterSpacing: "0.06em",
                          background: p.is_active ? "rgba(94,197,182,0.15)" : "var(--surface-3)",
                          color: p.is_active ? "var(--teal-bright)" : "var(--text-3)" }}>
                          {p.is_active ? t("profile.active") : t("profile.closed")}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ fontSize: 12.5, color: "var(--text-3)", textAlign: "center", padding: "14px 0 4px" }}>
                {t("profile.noProjects")}
              </div>
            )}

            {links.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div className="section-label" style={{ marginBottom: 8 }}>{t("profile.portfolio")}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {links.map((l, i) => (
                    <a key={i} href={l.url} target="_blank" rel="noopener noreferrer" style={{
                      display: "inline-flex", alignItems: "center", gap: 5, fontFamily: "var(--font-mono)", fontSize: 11,
                      padding: "6px 11px", borderRadius: "var(--radius-pill)", background: "var(--surface-2)",
                      border: "1px solid var(--hair)", color: "var(--amber)", textDecoration: "none" }}>
                      <Icon name="link" size={12} color="var(--amber)" /> {l.label}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Primary CTA: edit ── */}
        <button className="btn-primary" onClick={() => setEditOpen(true)} style={{ marginTop: 24,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <Icon name="edit" size={16} color="#160E08" /> {t("settings.editProfile")}
        </button>

        {/* ── Folded-in Settings menu ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
          <ActionRow glyph="🔗" label={t("trust.sharePublic")} onClick={copyPublic} />
          {FLAGS.CV_EXPORT && (
            <ActionRow glyph="📄" label={t("resume.download")} onClick={downloadCV} />
          )}
          {FLAGS.SAVED && (
            <ActionRow glyph="❥" label={t("saved.title")} onClick={() => setSavedOpen(true)} />
          )}
          <ActionRow glyph="🎁" label={t("invite.title")} onClick={() => setInviteOpen(true)} />
          {FLAGS.MENTORING && (
            <ActionRow glyph="🎓" label={t("mentor.browse")} onClick={() => setMentorsOpen(true)} />
          )}
          {FLAGS.MENTORING && (
            <ActionRow glyph="📅" label={t("booking.title")} onClick={() => setBookingsOpen(true)}
              right={sessionReqs > 0 ? (
                <span style={{ minWidth: 20, height: 20, padding: "0 6px", borderRadius: 99,
                  background: "linear-gradient(135deg, var(--ember), var(--terra))", color: "#160E08",
                  fontFamily: "var(--font-mono)", fontSize: 10.5, fontWeight: 700,
                  display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{sessionReqs}</span>
              ) : null} />
          )}
          {FLAGS.NOTIF_PREFS && (
            <ActionRow glyph="🔔" label={t("notif.settingsRow")} onClick={() => setNotifPrefsOpen(true)} />
          )}
          <ActionRow glyph="🚫" label={t("blocked.title")} onClick={() => setBlockedOpen(true)} />
          {isMentor && (
            <ActionRow glyph="🗓️" label={t("mentor.mySlots")} onClick={() => setSlotsOpen(true)} />
          )}
          {isAdmin && (
            <ActionRow icon="settings" label={t("settings.adminWeb")} onClick={openAdminConsole} />
          )}
        </div>

        {/* ── Language switcher ── */}
        <div style={{ marginTop: 22 }}>
          <div className="section-label" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="globe" size={13} color="var(--text-3)" /> {t("ep.language")}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {LANGS.map(l => {
              const on = (user.language || lang) === l.code;
              return (
                <button key={l.code} onClick={() => chooseLang(l.code)} style={{
                  flex: 1, background: on ? "var(--accent-dim)" : "var(--surface-2)",
                  border: `1px solid ${on ? "var(--amber)" : "var(--hair)"}`, borderRadius: "var(--radius-sm)",
                  padding: "11px 4px", color: on ? "var(--amber)" : "var(--text-2)",
                  fontFamily: "var(--font-body)", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
                  {l.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Powered by Marstiff (sanctioned partner credit) ──
            Opens Marstiff's Instagram. openExternal() hands the URL to the system
            browser via Telegram's openLink — a bare <a> would navigate the webview
            away from the Mini App and strand the user with no way back. */}
        <div
          role="link"
          tabIndex={0}
          onClick={() => openExternal(MARSTIFF_URL)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") openExternal(MARSTIFF_URL); }}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "26px 0 14px", opacity: 0.7, cursor: "pointer" }}
        >
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--text-3)", letterSpacing: "0.2em", textTransform: "uppercase" }}>
            powered by
          </span>
          <span style={{ fontFamily: "var(--font-display)", fontSize: 14, color: "var(--text)", fontWeight: 700 }}>Marstiff</span>
          <img src="/marstiff-logo.png" alt="Marstiff" style={{ height: 18, objectFit: "contain" }} />
        </div>

        {/* ── Sign out ── */}
        <button onClick={handleSignOut} style={{
          width: "100%", background: "rgba(192,86,59,0.10)", border: "1px solid rgba(192,86,59,0.30)",
          borderRadius: "var(--radius-pill)", padding: "13px", cursor: "pointer", color: "var(--terra)",
          fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 14 }}>
          {t("settings.signOut")}
        </button>
      </div>

      {FLAGS.MENTORING && slotsOpen && <MentorSlotsSheet onClose={() => setSlotsOpen(false)} />}
      {FLAGS.MENTORING && bookingsOpen && <BookingsSheet onClose={() => { setBookingsOpen(false); setHomeRefresh(k => k + 1); }} />}
      {/* Gated on mount, not just on the row: the sheet fetches prefs on open, so an
          unmounted sheet also means no prefs request. NOTE — this sheet is where the
          privacy controls (dm_privacy / who_viewed_consent, FLAGS.PRIVACY_PREFS) live;
          they are unreachable from the Mini App while NOTIF_PREFS is off. */}
      {FLAGS.NOTIF_PREFS && notifPrefsOpen && <NotificationPrefsSheet onClose={() => setNotifPrefsOpen(false)} />}
      {FLAGS.SAVED && savedOpen && <SavedSheet onClose={() => setSavedOpen(false)} />}
      {inviteOpen && <InviteSheet onClose={() => setInviteOpen(false)} />}
      {blockedOpen && <BlockedSheet onClose={() => setBlockedOpen(false)} />}
      {inboxOpen && <InboxModal onClose={() => { setInboxOpen(false); setHomeRefresh(k => k + 1); }} />}
      {manageOpen && <ProjectManageSheet me={user} initialTab="requests" onClose={() => { setManageOpen(false); setHomeRefresh(k => k + 1); }} onChanged={loadUser} />}
      {viewingUserId && <UserProfileModal userId={viewingUserId} onClose={() => setViewingUserId(null)} />}
    </Page>
  );
};
