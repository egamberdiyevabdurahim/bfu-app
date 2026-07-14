import { useState, useEffect } from "react";
import { Icon } from "./Icons";
import { users, messages as msgApi } from "../api";
import { useT } from "../i18n";
import { tgAlert, tgConfirm, tgChatUrl, openChat } from "../tg";
import { Page, AvatarEl } from "./Shared";
import { BookSlotSheet } from "./MentorSheets";
import { FLAGS } from "../flags";

// Badge presentation — re-themed onto the Chorsu firelit palette (amber / green
// / teal-bright / ember). Colors are hex so we can derive tint + border.
export const BADGE_META = {
  verified:      { emoji: "✓",  color: "#E8A15C", key: "badge.verified" },
  early_adopter: { emoji: "🌱", color: "#7FB069", key: "badge.early" },
  connector:     { emoji: "🤝", color: "#5EC5B6", key: "badge.connector" },
  top_inviter:   { emoji: "🏆", color: "#FF6A3D", key: "badge.topInviter" },
};

// Analysis-tag groups → a Chorsu accent per group (skills=amber, knowledge=teal,
// interests=green, preparing=amber, goals=ember). Rendered in this order.
const TAG_ORDER = ["skills", "knowledges", "interests", "preparations", "goals"];
const TAG_COLOR = {
  skills: "#E8A15C",
  knowledges: "#5EC5B6",
  interests: "#7FB069",
  preparations: "#E8A15C",
  goals: "#FF6A3D",
};

// ── Small presentational helpers (pure — no i18n) ───────────────────────────
const Cell = ({ label, children, style }) => (
  <div className="ch-cell-static" style={{ display: "flex", flexDirection: "column", gap: 12, ...style }}>
    {label ? <div className="ch-cell-label">{label}</div> : null}
    {children}
  </div>
);

// Static reputation ring — mirrors the desktop ReputationCell arc without the
// entrance animation (a modal opens and closes too fast to warrant it).
const Ring = ({ value = 0 }) => {
  const C = 2 * Math.PI * 30;
  const frac = Math.max(0, Math.min(1, value / 5));
  const off = C * (1 - frac);
  return (
    <svg width="72" height="72" viewBox="0 0 72 72" style={{ transform: "rotate(-90deg)", flexShrink: 0 }}>
      <circle cx="36" cy="36" r="30" fill="none" stroke="var(--surface-2)" strokeWidth="7" />
      <circle cx="36" cy="36" r="30" fill="none" stroke="url(#ch-rep-grad-m)" strokeWidth="7"
        strokeLinecap="round" strokeDasharray={C} strokeDashoffset={off} />
      <defs>
        <linearGradient id="ch-rep-grad-m" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#E8A15C" />
          <stop offset="1" stopColor="#FF6A3D" />
        </linearGradient>
      </defs>
    </svg>
  );
};

const StatTile = ({ v, l }) => (
  <div style={{ flex: 1, textAlign: "center", padding: "10px 4px", background: "var(--surface-2)",
    border: "1px solid var(--hair)", borderRadius: "var(--radius-sm)" }}>
    <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 20, color: "var(--text)" }}>{v}</div>
    <div className="ch-metric-label" style={{ marginTop: 2 }}>{l}</div>
  </div>
);

export const UserProfileModal = ({ userId, user: propUser, onClose }) => {
  const { t, lang } = useT();
  const [user, setUser] = useState(propUser || null);
  const [loading, setLoading] = useState(!propUser && !!userId);
  const [introSending, setIntroSending] = useState(false);
  const [translated, setTranslated] = useState(null);
  const [translating, setTranslating] = useState(false);
  const [openers, setOpeners] = useState(null);
  const [loadingOpeners, setLoadingOpeners] = useState(false);
  const [matchReason, setMatchReason] = useState(null);
  const [loadingMatch, setLoadingMatch] = useState(false);
  const [vouchOpen, setVouchOpen] = useState(false);
  const [vouchText, setVouchText] = useState("");
  const [vouchBusy, setVouchBusy] = useState(false);
  // Mentoring is behind FLAGS.MENTORING for V1. The state stays (hooks can't be
  // conditional) but the only setter lives inside the flag-gated mentor cell and
  // the sheet render is flag-gated too, so BookSlotSheet can never open.
  const [booking, setBooking] = useState(false);

  // Follow (rebuilt inline so the toggle can wear .btn-primary / ghost like the
  // desktop PersonActions — same users.follow / users.unfollow calls as before).
  const [following, setFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [followBusy, setFollowBusy] = useState(false);

  const doWhyMatch = async () => {
    if (!FLAGS.AI_ASSIST) return;
    if (!user || loadingMatch) return;
    if (matchReason) { setMatchReason(null); return; }
    setLoadingMatch(true);
    try {
      const r = await users.whyMatch(user.id, lang);
      setMatchReason(r?.reason || (r?.shared?.length
        ? t("match.shared", { tags: r.shared.join(", ") })
        : t("match.none")));
    } catch (e) { tgAlert(e.message); }
    setLoadingMatch(false);
  };

  const doIcebreakers = async () => {
    if (!FLAGS.AI_ASSIST) return;
    if (!user || loadingOpeners) return;
    if (openers) { setOpeners(null); return; }
    setLoadingOpeners(true);
    try {
      const r = await users.icebreakers(user.id, lang);
      setOpeners(r?.icebreakers?.length ? r.icebreakers : []);
    } catch (e) { tgAlert(e.message); }
    setLoadingOpeners(false);
  };

  const copyOpener = async (text) => {
    try { await navigator.clipboard?.writeText(text); tgAlert(t("ice.copied")); }
    catch { tgAlert(text); }
  };

  const doInterest = async () => {
    if (!FLAGS.INTEREST_INTRO) return;
    if (!user) return;
    try {
      const r = await users.interest(user.id);
      tgAlert(r?.mutual ? t("interest.matched") : t("interest.sent"));
    } catch (e) { tgAlert(e.message); }
  };

  const doTranslate = async () => {
    if (!FLAGS.AI_ASSIST) return;
    if (!user || translating) return;
    if (translated) { setTranslated(null); return; }
    setTranslating(true);
    try {
      const r = await users.translateBio(user.id, lang);
      if (r?.translated) setTranslated(r.translated);
    } catch (e) {
      // silent — keep original
    }
    setTranslating(false);
  };

  const doIntro = async () => {
    if (!FLAGS.INTEREST_INTRO) return;
    if (!user) return;
    setIntroSending(true);
    try {
      const r = await users.requestIntro(user.id);
      tgAlert(r.has_username ? t("intro.sent") : t("intro.sent") + "\n" + t("intro.noUsername"));
    } catch (e) { tgAlert(e.message); }
    setIntroSending(false);
  };

  const doReport = async () => {
    if (!user) return;
    if (!await tgConfirm(t("report.prompt"))) return;
    try {
      await users.report({ target_type: "user", target_id: user.id });
      tgAlert(t("report.sent"));
    } catch (e) { tgAlert(e.message); }
  };

  const doEndorse = async (skill) => {
    if (!user) return;
    try {
      const r = await users.endorse(user.id, skill);
      // Optimistically update the endorsements array on the loaded user.
      setUser(prev => {
        if (!prev) return prev;
        const list = (prev.endorsements || []).filter(e => e.skill !== skill);
        if (r.count > 0) list.push({ skill, count: r.count, endorsed_by_me: r.endorsed });
        return { ...prev, endorsements: list };
      });
    } catch (e) { tgAlert(e.message); }
  };

  const submitVouch = async () => {
    if (!user || vouchBusy || !vouchText.trim()) return;
    setVouchBusy(true);
    try {
      await users.vouch(user.id, vouchText.trim());
      const fresh = await users.getProfile(user.id);
      setUser(fresh);
      setVouchOpen(false);
      setVouchText("");
      tgAlert(t("trust.vouchPost"));
    } catch (e) { tgAlert(e.message); }
    setVouchBusy(false);
  };

  const toggleFollow = async () => {
    if (followBusy || !user) return;
    setFollowBusy(true);
    const was = following;
    setFollowing(!was);
    setFollowerCount(c => Math.max(0, c + (was ? -1 : 1)));
    try {
      if (was) {
        await users.unfollow("user", user.id);
      } else {
        const r = await users.follow("user", user.id);
        if (r && typeof r.follower_count === "number") setFollowerCount(r.follower_count);
      }
    } catch (e) {
      setFollowing(was);
      setFollowerCount(c => Math.max(0, c + (was ? 1 : -1)));
      tgAlert(e.message);
    }
    setFollowBusy(false);
  };

  useEffect(() => {
    if (!propUser && userId) {
      setLoading(true);
      users.getProfile(userId)
        .then(setUser)
        .catch(() => onClose())
        .finally(() => setLoading(false));
    }
  }, [userId, propUser]);

  // Keep the local follow state in sync with whichever user object is loaded.
  useEffect(() => {
    if (user) {
      setFollowing(!!user.is_following);
      setFollowerCount(user.follower_count || 0);
    }
  }, [user]);

  if (!user && !loading) return null;

  const age = user?.birth_year ? new Date().getFullYear() - user.birth_year : null;
  const fullName = [user?.name, user?.surname].filter(Boolean).join(" ");
  const analysis = user?.analysis;
  const hasAnyTags = analysis && Object.values(analysis).some(arr => arr?.length > 0);
  const isOnline = user?.is_online === true || user?.recently_active === true;

  const rating = user?.rating;
  const stats = user?.stats || {};
  const founded = user?.founded_projects || [];
  const member = user?.member_projects || [];
  const links = user?.portfolio_links || [];
  const mutual = user?.mutual_connections || { count: 0, preview: [] };
  const collaborators = user?.collaborators || { count: 0, preview: [] };
  const region = user?.region;
  const regionName = region ? (typeof region === "string" ? region : (region.name_en || region.name)) : null;

  const hasProjects = founded.length > 0 || member.length > 0;
  const hasStats = (stats.projects_founded || 0) + (stats.projects_joined || 0) + (stats.applications_accepted || 0) > 0;
  const showBuilding = !!user?.currently_building || founded.length > 0;
  const showConnections = followerCount > 0 || mutual.count > 0 || collaborators.count > 0 || !!regionName;
  // Trust surfaces only count as "content" while FLAGS.TRUST is on — otherwise a
  // profile whose only content is a rating/vouches would render an empty body
  // with no empty-state message.
  const showVouches = FLAGS.TRUST && (user?.vouches?.length || 0) > 0;
  const showRating = FLAGS.TRUST && !!rating && rating.average != null;
  const nothing = !user?.about && !hasAnyTags && !hasProjects && !showVouches &&
    !(user?.badges?.length) && !user?.currently_building && !hasStats && !showRating;

  // Message now opens a REAL in-app DM (find-or-create), so it works for every
  // builder — including the many with no Telegram username. The Telegram
  // deep-link stays only as a secondary "open in Telegram" affordance.
  const rawMsg = t("um.message");
  const msgLabel = rawMsg === "um.message" ? "Message" : rawMsg;
  const canDeepLink = !!tgChatUrl(user);
  const openDm = async () => {
    if (!user?.id) return;
    try {
      const conv = await msgApi.openDm(user.id);
      if (conv?.id) {
        window.dispatchEvent(new CustomEvent("bfu:open-messages", { detail: { conversationId: conv.id } }));
        onClose?.();
      }
    } catch (e) {
      tgAlert(e?.status === 400 ? t("msg.cantMessage") : (e?.message || t("msg.sendFailed")));
    }
  };

  const projectEmoji = (type) => (type === "startup" ? "🚀" : type === "volunteering" ? "🤝" : "•");

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "var(--bg)", animation: "fadeIn 0.25s ease" }}>
      {/* Floating close — stays put while the profile scrolls beneath it. */}
      <button onClick={onClose} aria-label={t("common.back")} style={{
        position: "absolute", top: "calc(var(--safe-t) + 12px)", right: 14, zIndex: 20,
        width: 36, height: 36, borderRadius: "var(--radius-pill)", background: "rgba(35,32,25,0.82)",
        backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", border: "1px solid var(--hair)",
        display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--text-2)",
      }}>
        <Icon name="x" size={16} />
      </button>

      <Page style={{ background: "var(--bg)" }}>
        <div style={{ maxWidth: 430, margin: "0 auto", padding: "calc(var(--safe-t) + 56px) 18px 24px" }}>
          {loading || !user ? (
            <div style={{ padding: "80px 0", textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>
              {t("common.loadingProfile")}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

              {/* ── Identity strip ─────────────────────────────────────────── */}
              <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                <div style={{ position: "relative", flexShrink: 0 }}>
                  <AvatarEl name={fullName || user?.display_name || "?"} size={88} photoUrl={user?.photo_url} />
                  {isOnline && (
                    <span style={{ position: "absolute", bottom: 4, right: 4, display: "inline-flex", width: 16, height: 16 }}>
                      <span className="ch-online-ping" />
                      <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "var(--ember)", border: "3px solid var(--bg)" }} />
                    </span>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 24, letterSpacing: "-0.01em",
                    lineHeight: 1.05, color: "var(--text)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    {fullName || user?.display_name}
                    {user?.checked && (
                      <span title={t("common.verified")} style={{ display: "inline-flex", alignItems: "center",
                        justifyContent: "center", width: 22, height: 22, borderRadius: "50%",
                        background: "rgba(127,176,105,0.16)", color: "var(--green)", fontSize: 12 }}>✓</span>
                    )}
                  </h2>
                  {user?.currently_building && (
                    <div style={{ marginTop: 6, fontFamily: "var(--font-accent)", fontStyle: "italic", fontSize: 16,
                      lineHeight: 1.3, color: "var(--amber)", display: "-webkit-box", WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                      {user.currently_building}
                    </div>
                  )}
                  {user?.tg_username && (
                    <a href={`https://t.me/${user.tg_username}`} target="_blank" rel="noopener noreferrer"
                      style={{ display: "inline-block", marginTop: 6, fontSize: 13, color: "var(--text-3)",
                        textDecoration: "none", fontFamily: "var(--font-mono)" }}>
                      @{user.tg_username}
                    </a>
                  )}
                  <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                    {age && <span className="chip">🎂 {t("common.yo", { n: age })}</span>}
                    {user?.gender && (
                      <span className="chip">{user.gender === "Male" ? `♂ ${t("common.male")}` : `♀ ${t("common.female")}`}</span>
                    )}
                  </div>
                  {user?.badges?.length > 0 && (
                    <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                      {user.badges.map(b => {
                        const m = BADGE_META[b]; if (!m) return null;
                        return (
                          <span key={b} title={t(m.key)} style={{ fontSize: 11, fontWeight: 700, padding: "3px 9px",
                            borderRadius: "var(--radius-pill)", background: `${m.color}1f`, color: m.color,
                            border: `1px solid ${m.color}55` }}>{m.emoji} {t(m.key)}</span>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* ── Connect actions ────────────────────────────────────────── */}
              <Cell>
                <button onClick={toggleFollow} disabled={followBusy}
                  className={following ? "btn-ghost" : "btn-primary"}
                  style={following
                    ? { width: "100%", textAlign: "center", borderColor: "rgba(127,176,105,0.4)",
                        color: "var(--green)", background: "rgba(127,176,105,0.12)", opacity: followBusy ? 0.6 : 1 }
                    : { width: "100%", opacity: followBusy ? 0.6 : 1 }}>
                  {following ? `✓ ${t("follow.following")}` : t("follow.btn")}
                </button>

                <button className="btn-primary" onClick={openDm} style={{ width: "100%" }}>
                  ✉ {msgLabel}
                </button>
                {canDeepLink && (
                  <button className="btn-ghost" onClick={() => openChat(user)}
                    style={{ width: "100%", textAlign: "center", fontSize: 13 }}>
                    {t("um.openTelegram")}
                  </button>
                )}

                {/* "I'm interested" + "Request intro" — a second way to say hello on
                    top of Follow/Message. Hidden for V1 behind FLAGS.INTEREST_INTRO. */}
                {FLAGS.INTEREST_INTRO && (
                  <div style={{ display: "flex", gap: 10 }}>
                    <button className="btn-ghost" onClick={doInterest} style={{ flex: 1, textAlign: "center" }}>
                      {t("interest.btn")}
                    </button>
                    <button className="btn-ghost" onClick={doIntro} disabled={introSending}
                      style={{ flex: 1, textAlign: "center", opacity: introSending ? 0.6 : 1 }}>
                      {introSending ? t("intro.sending") : t("intro.btn")}
                    </button>
                  </div>
                )}

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 2 }}>
                  {followerCount > 0 ? (
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)" }}>
                      {followerCount === 1 ? t("follow.followersOne") : t("follow.followers", { n: followerCount })}
                    </span>
                  ) : <span />}
                  <button onClick={doReport} style={{ background: "none", border: "none", color: "var(--text-3)",
                    fontSize: 12, cursor: "pointer", padding: "2px 4px", fontFamily: "var(--font-body)" }}>
                    ⋯ {t("report.btn")}
                  </button>
                </div>
              </Cell>

              {/* ── A little AI help ───────────────────────────────────────── */}
              {/* "Why you match" + "Break the ice". Hidden for V1 behind FLAGS.AI_ASSIST:
                  the whole cell is gated, so neither the buttons nor the panels they
                  open render, and users.whyMatch / users.icebreakers are never called. */}
              {FLAGS.AI_ASSIST && (
                <Cell>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button className="btn-ghost" onClick={doWhyMatch} disabled={loadingMatch}
                      style={{ flex: "1 1 auto", textAlign: "center", opacity: loadingMatch ? 0.6 : 1 }}>
                      {loadingMatch ? t("match.thinking") : matchReason ? t("match.hide") : t("match.btn")}
                    </button>
                    <button className="btn-ghost" onClick={doIcebreakers} disabled={loadingOpeners}
                      style={{ flex: "1 1 auto", textAlign: "center", opacity: loadingOpeners ? 0.6 : 1 }}>
                      {loadingOpeners ? t("ice.thinking") : openers ? t("ice.hide") : t("ice.btn")}
                    </button>
                  </div>
                  {matchReason && (
                    <div style={{ padding: "12px 14px", borderRadius: "var(--radius-sm)",
                      border: "1px solid rgba(232,161,92,0.24)",
                      background: "linear-gradient(150deg, rgba(232,161,92,0.08), rgba(192,86,59,0.05) 60%, var(--surface))",
                      fontFamily: "var(--font-accent)", fontStyle: "italic", fontSize: 16, lineHeight: 1.5, color: "var(--text)" }}>
                      {matchReason}
                    </div>
                  )}
                  {openers && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {openers.length === 0 ? (
                        <div style={{ fontSize: 12, color: "var(--text-3)", textAlign: "center" }}>{t("ice.none")}</div>
                      ) : openers.map((o, i) => (
                        <button key={i} onClick={() => copyOpener(o)} style={{ textAlign: "left", padding: "10px 12px",
                          background: "var(--surface-2)", border: "1px solid var(--hair)", borderRadius: "var(--radius-sm)",
                          color: "var(--text)", fontSize: 14, lineHeight: 1.5, cursor: "pointer", fontFamily: "var(--font-body)" }}>
                          {o} <span style={{ color: "var(--amber)", fontSize: 11 }}>· {t("ice.tapCopy")}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </Cell>
              )}

              {/* ── Mentor ─────────────────────────────────────────────────── */}
              {FLAGS.MENTORING && user?.mentor?.is_mentor && (
                <Cell label={t("mentor.isMentor")} style={{ borderColor: "rgba(94,197,182,0.3)",
                  background: "linear-gradient(150deg, rgba(94,197,182,0.08), var(--surface) 60%)" }}>
                  {user.mentor.bio && (
                    <p style={{ fontSize: 14, color: "var(--text-2)", lineHeight: 1.6, margin: 0 }}>{user.mentor.bio}</p>
                  )}
                  {user.mentor.topics?.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {user.mentor.topics.map(tp => (
                        <span key={tp} style={{ fontFamily: "var(--font-mono)", fontSize: 11, padding: "5px 10px",
                          borderRadius: "var(--radius-pill)", background: "rgba(94,197,182,0.14)",
                          color: "var(--teal-bright)", border: "1px solid rgba(94,197,182,0.34)" }}>{tp}</span>
                      ))}
                    </div>
                  )}
                  <button className="btn-primary" onClick={() => setBooking(true)} style={{ width: "100%" }}>
                    {t("mentor.book")}
                  </button>
                </Cell>
              )}

              {/* ── Looking for (intentions) ───────────────────────────────── */}
              {(user?.open_to_work || user?.open_to_volunteering) && (
                <div className="ch-cell-static" style={{ borderColor: "rgba(127,176,105,0.3)",
                  background: "linear-gradient(150deg, rgba(127,176,105,0.10), var(--surface) 60%)",
                  display: "flex", flexWrap: "wrap", gap: 8 }}>
                  <span style={{ alignSelf: "center", width: 8, height: 8, borderRadius: "50%",
                    background: "var(--green)", boxShadow: "0 0 12px rgba(127,176,105,0.8)", marginRight: 2 }} />
                  {user.open_to_work && (
                    <span style={{ background: "var(--accent-dim)", border: "1px solid var(--amber)", color: "var(--amber)",
                      borderRadius: "var(--radius-pill)", padding: "5px 12px", fontSize: 12, fontWeight: 600 }}>
                      {t("um.openStartups")}
                    </span>
                  )}
                  {user.open_to_volunteering && (
                    <span style={{ background: "rgba(127,176,105,0.14)", border: "1px solid rgba(127,176,105,0.34)",
                      color: "var(--green)", borderRadius: "var(--radius-pill)", padding: "5px 12px", fontSize: 12, fontWeight: 600 }}>
                      {t("um.openVolunteer")}
                    </span>
                  )}
                </div>
              )}

              {/* ── Currently building ─────────────────────────────────────── */}
              {showBuilding && (
                <Cell label={t("profile.building")}>
                  <div className="accent-serif" style={{ fontSize: 24, lineHeight: 1.2 }}>
                    {user.currently_building || founded[0]?.name}
                  </div>
                </Cell>
              )}

              {/* ── About ──────────────────────────────────────────────────── */}
              {user?.about && (
                <Cell>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div className="ch-cell-label">{t("um.about")}</div>
                    {/* "Translate bio" — hidden for V1 behind FLAGS.AI_ASSIST. The bio
                        itself always renders; only the AI translate toggle is gated, so
                        users.translateBio is never called and `translated` stays null. */}
                    {FLAGS.AI_ASSIST && (
                      <button onClick={doTranslate} disabled={translating} style={{ background: "none", border: "none",
                        color: "var(--amber)", fontSize: 11, fontWeight: 600, cursor: "pointer", padding: 0,
                        fontFamily: "var(--font-body)" }}>
                        {translating ? t("bio.translating") : translated ? t("bio.original") : t("bio.translate")}
                      </button>
                    )}
                  </div>
                  <p style={{ fontSize: 14, color: "var(--text-2)", lineHeight: 1.7, margin: 0 }}>{translated || user.about}</p>
                </Cell>
              )}

              {/* ── Reputation ─────────────────────────────────────────────── */}
              {FLAGS.TRUST && rating && rating.average != null && (
                <Cell label={t("trust.rating")}>
                  <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
                    <Ring value={rating.average} />
                    <div>
                      <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 24, color: "var(--text)" }}>
                        {rating.average.toFixed(1)}
                        <span style={{ color: "var(--text-3)", fontSize: 14, fontWeight: 500 }}> / 5.0</span>
                      </div>
                      <div style={{ marginTop: 4, fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-3)" }}>
                        ({rating.count || 0})
                      </div>
                    </div>
                  </div>
                </Cell>
              )}

              {/* ── Skills / knowledge / interests / goals (skills endorsable when FLAGS.TRUST) ── */}
              {hasAnyTags && (
                <Cell>
                  {TAG_ORDER.map(key => {
                    const tags = analysis[key];
                    if (!tags || tags.length === 0) return null;
                    const color = TAG_COLOR[key];
                    return (
                      <div key={key} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <div className="ch-cell-label">{t(`tag.${key}`)}</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {tags.map(tag => {
                            // With TRUST off, skills render as plain (non-endorsable) chips
                            // like every other tag group.
                            if (key !== "skills" || !FLAGS.TRUST) {
                              return (
                                <span key={tag} style={{ fontFamily: "var(--font-mono)", fontSize: 11, padding: "5px 10px",
                                  borderRadius: "var(--radius-pill)", background: `${color}1a`, color,
                                  border: `1px solid ${color}44` }}>{tag}</span>
                              );
                            }
                            const e = (user.endorsements || []).find(x => x.skill === tag);
                            const count = e?.count || 0;
                            const mine = !!e?.endorsed_by_me;
                            return (
                              <button key={tag} onClick={() => doEndorse(tag)} style={{ display: "inline-flex",
                                alignItems: "center", gap: 6, fontFamily: "var(--font-mono)", fontSize: 11,
                                padding: "6px 11px", borderRadius: "var(--radius-pill)", cursor: "pointer",
                                background: mine ? "rgba(232,161,92,0.16)" : "var(--surface-2)",
                                border: `1px solid ${mine ? "var(--amber)" : "var(--hair)"}`,
                                color: mine ? "var(--amber)" : "var(--text-2)" }}>
                                <span>{mine ? "✓" : "＋"}</span>{tag}
                                {count > 0 && <span style={{ fontWeight: 700 }}>{count}</span>}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </Cell>
              )}

              {/* ── Connections ────────────────────────────────────────────── */}
              {showConnections && (
                <Cell>
                  {followerCount > 0 && (
                    <div style={{ fontSize: 14, color: "var(--text-2)" }}>
                      {followerCount === 1 ? t("follow.followersOne") : t("follow.followers", { n: followerCount })}
                    </div>
                  )}
                  {mutual.count > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <div className="ch-cell-label">
                        {mutual.count === 1 ? t("trust.mutualOne") : t("trust.mutual", { n: mutual.count })}
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {mutual.preview.map(m => (
                          <span key={m.id} style={{ display: "inline-flex", alignItems: "center", gap: 6,
                            background: "var(--surface-2)", border: "1px solid var(--hair)", borderRadius: "var(--radius-pill)",
                            padding: "4px 10px 4px 4px", color: "var(--text)", fontSize: 12, fontWeight: 600 }}>
                            <AvatarEl name={m.display_name} size={22} photoUrl={m.photo_url} />
                            {m.display_name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {collaborators.count > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <div className="ch-cell-label">{t("collab.title")}</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {collaborators.preview.map(c => (
                          <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10,
                            background: "var(--surface-2)", border: "1px solid var(--hair)",
                            borderRadius: "var(--radius-sm)", padding: "8px 12px" }}>
                            <AvatarEl name={c.display_name} size={32} photoUrl={c.photo_url} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap",
                                overflow: "hidden", textOverflow: "ellipsis" }}>{c.display_name}</div>
                              <div style={{ fontSize: 11, color: "var(--text-3)" }}>
                                {c.shared === 1 ? t("collab.sharedOne") : t("collab.shared", { n: c.shared })}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {regionName && (
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.1em", color: "var(--text-3)" }}>
                      {regionName}
                    </div>
                  )}
                </Cell>
              )}

              {/* ── Vouches ────────────────────────────────────────────────── */}
              {FLAGS.TRUST && (
                <Cell label={t("trust.vouches")}>
                  {(user.vouches || []).length === 0 ? (
                    <div style={{ fontSize: 13, color: "var(--text-3)" }}>{t("trust.noVouches")}</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {user.vouches.map(v => (
                        <div key={v.id} style={{ background: "var(--surface-2)", border: "1px solid var(--hair)",
                          borderLeft: "3px solid var(--amber)", borderRadius: "var(--radius-sm)", padding: "10px 12px" }}>
                          <div style={{ fontFamily: "var(--font-accent)", fontStyle: "italic", fontSize: 15,
                            color: "var(--text)", lineHeight: 1.5 }}>“{v.text}”</div>
                          <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>
                            — {v.author?.display_name || ""}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {!vouchOpen ? (
                    <button onClick={() => setVouchOpen(true)} className="btn-ghost"
                      style={{ alignSelf: "flex-start", color: "var(--amber)", borderColor: "var(--hair)" }}>
                      {t("trust.vouchBtn")}
                    </button>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <textarea value={vouchText} maxLength={280} onChange={e => setVouchText(e.target.value)}
                        placeholder={t("trust.vouchPh")} rows={3} className="input-field" style={{ resize: "vertical" }} />
                      <button onClick={submitVouch} disabled={vouchBusy || !vouchText.trim()} className="btn-primary"
                        style={{ alignSelf: "flex-start", width: "auto", padding: "10px 20px",
                          opacity: (vouchBusy || !vouchText.trim()) ? 0.55 : 1 }}>
                        {t("trust.vouchPost")}
                      </button>
                    </div>
                  )}
                </Cell>
              )}

              {/* ── Projects · stats · links ───────────────────────────────── */}
              {(hasProjects || links.length > 0 || hasStats) && (
                <Cell>
                  {hasStats && (
                    <div style={{ display: "flex", gap: 8 }}>
                      <StatTile v={stats.projects_founded ?? 0} l={t("profile.stat.founded")} />
                      <StatTile v={stats.projects_joined ?? 0} l={t("profile.stat.joined")} />
                      <StatTile v={stats.applications_accepted ?? 0} l={t("profile.stat.accepted")} />
                    </div>
                  )}
                  {founded.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <div className="ch-cell-label">{t("profile.founded")}</div>
                      {founded.map(p => (
                        <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10,
                          background: "var(--surface-2)", border: "1px solid var(--hair)",
                          borderRadius: "var(--radius-sm)", padding: "10px 12px" }}>
                          <span style={{ fontSize: 16 }}>{projectEmoji(p.type)}</span>
                          <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, color: "var(--text)",
                            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</span>
                          <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: "var(--radius-pill)",
                            background: p.is_active ? "rgba(127,176,105,0.15)" : "var(--surface-3)",
                            color: p.is_active ? "var(--green)" : "var(--text-3)" }}>
                            {p.is_active ? t("profile.active") : t("profile.closed")}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {member.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <div className="ch-cell-label">{t("profile.member")}</div>
                      {member.map(p => (
                        <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10,
                          background: "var(--surface-2)", border: "1px solid var(--hair)",
                          borderRadius: "var(--radius-sm)", padding: "10px 12px" }}>
                          <span style={{ fontSize: 16 }}>{projectEmoji(p.type)}</span>
                          <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, color: "var(--text)",
                            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</span>
                          <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: "var(--radius-pill)",
                            background: p.is_active ? "rgba(127,176,105,0.15)" : "var(--surface-3)",
                            color: p.is_active ? "var(--green)" : "var(--text-3)" }}>
                            {p.is_active ? t("profile.active") : t("profile.closed")}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {links.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <div className="ch-cell-label">{t("profile.portfolio")}</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {links.map((l, i) => (
                          <a key={i} href={l.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12,
                            fontWeight: 600, padding: "6px 12px", borderRadius: "var(--radius-pill)",
                            background: "var(--surface-2)", border: "1px solid var(--hair)", color: "var(--amber)",
                            textDecoration: "none" }}>🔗 {l.label}</a>
                        ))}
                      </div>
                    </div>
                  )}
                </Cell>
              )}

              {nothing && (
                <div style={{ textAlign: "center", padding: 20, color: "var(--text-3)", fontSize: 13 }}>
                  {t("um.empty")}
                </div>
              )}
            </div>
          )}
        </div>
      </Page>

      {FLAGS.MENTORING && booking && user && (
        <BookSlotSheet mentor={user} onClose={() => setBooking(false)} />
      )}
    </div>
  );
};
