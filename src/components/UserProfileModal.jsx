import { useState, useEffect } from "react";
import { Icon } from "./Icons";
import { users } from "../api";
import { useT } from "../i18n";
import { tgAlert, tgConfirm, tgChatUrl, openChat } from "../tg";
import { ProfileExtras } from "./ProfileExtras";
import { FollowButton } from "./FollowButton";
import { BookSlotSheet } from "./MentorSheets";

export const BADGE_META = {
  verified:      { emoji: "✓",  color: "#7B6FFF", key: "badge.verified" },
  early_adopter: { emoji: "🌱", color: "#4ECDC4", key: "badge.early" },
  connector:     { emoji: "🤝", color: "#FFB347", key: "badge.connector" },
  top_inviter:   { emoji: "🏆", color: "#FFB347", key: "badge.topInviter" },
};

const TAG_COLORS = {
  skills:       { bg: "rgba(123,111,255,0.15)", color: "#7B6FFF", label: "Skills" },
  knowledges:   { bg: "rgba(78,205,196,0.15)",  color: "#4ECDC4", label: "Knowledge" },
  interests:    { bg: "rgba(255,179,71,0.15)",   color: "#FFB347", label: "Interests" },
  preparations: { bg: "rgba(167,139,250,0.15)",  color: "#A78BFA", label: "Preparing For" },
  goals:        { bg: "rgba(255,107,107,0.15)",  color: "#FF6B6B", label: "Goals" },
};

const Avatar = ({ name = "?", size = 64, photoUrl = null }) => {
  const initials = (name || "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const colors = ["#7B6FFF", "#FF6B6B", "#4ECDC4", "#FFB347", "#A78BFA", "#34D399"];
  const bg = colors[(name.charCodeAt(0) || 0) % colors.length];
  const [failed, setFailed] = useState(false);
  if (photoUrl && !failed) {
    return (
      <img src={photoUrl} alt={initials} onError={() => setFailed(true)}
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover",
                 border: `3px solid ${bg}55`, flexShrink: 0 }} />
    );
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: `${bg}22`, border: `3px solid ${bg}55`,
      color: bg, display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.36, fontWeight: 800, fontFamily: "var(--font-display)", flexShrink: 0,
    }}>
      {initials}
    </div>
  );
};

const TagChip = ({ label, category }) => {
  const style = TAG_COLORS[category] || { bg: "var(--surface-3)", color: "var(--text-2)" };
  return (
    <span style={{
      background: style.bg, color: style.color, borderRadius: 99,
      padding: "4px 10px", fontSize: 11, fontWeight: 600, display: "inline-block",
    }}>{label}</span>
  );
};

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
  const [booking, setBooking] = useState(false);

  const doWhyMatch = async () => {
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
    if (!user) return;
    try {
      const r = await users.interest(user.id);
      tgAlert(r?.mutual ? t("interest.matched") : t("interest.sent"));
    } catch (e) { tgAlert(e.message); }
  };

  const doTranslate = async () => {
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

  useEffect(() => {
    if (!propUser && userId) {
      setLoading(true);
      users.getProfile(userId)
        .then(setUser)
        .catch(() => onClose())
        .finally(() => setLoading(false));
    }
  }, [userId, propUser]);

  if (!user && !loading) return null;

  const age = user?.birth_year ? new Date().getFullYear() - user.birth_year : null;
  const fullName = [user?.name, user?.surname].filter(Boolean).join(" ");
  const analysis = user?.analysis;

  const hasAnyTags = analysis && Object.values(analysis).some(arr => arr?.length > 0);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", flexDirection: "column" }}>
      {/* Backdrop */}
      <div onClick={onClose} style={{
        position: "absolute", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)",
      }} />

      {/* Sheet */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0,
        maxWidth: 430, margin: "0 auto",
        background: "var(--surface)", borderRadius: "24px 24px 0 0",
        maxHeight: "88dvh", display: "flex", flexDirection: "column",
        animation: "slideUp 0.3s ease",
      }}>
        <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 0" }}>
          <div style={{ width: 40, height: 4, background: "var(--surface-3)", borderRadius: 99 }} />
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", padding: "8px 20px 0" }}>
          <button onClick={onClose} style={{
            background: "var(--surface-2)", border: "none", borderRadius: 99,
            width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", color: "var(--text-2)",
          }}>
            <Icon name="x" size={16} />
          </button>
        </div>

        {loading ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}>
            <div style={{ color: "var(--text-3)", fontSize: 13 }}>{t("common.loadingProfile")}</div>
          </div>
        ) : (
          <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px 48px" }}>
            {/* Header */}
            <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 16 }}>
              <Avatar name={fullName || user?.display_name || "?"} size={64} photoUrl={user?.photo_url} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 800, marginBottom: 2, display: "flex", alignItems: "center", gap: 6 }}>
                  {fullName || user?.display_name}
                  {user?.checked && (
                    <span title={t("common.verified")} style={{ color: "var(--accent)", fontSize: 15 }}>✓</span>
                  )}
                </h2>
                {user?.tg_username && (
                  <a href={`https://t.me/${user.tg_username}`} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: 13, color: "var(--accent)", textDecoration: "none" }}>
                    @{user.tg_username}
                  </a>
                )}
                {user?.badges?.length > 0 && (
                  <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                    {user.badges.map(b => {
                      const m = BADGE_META[b]; if (!m) return null;
                      return (
                        <span key={b} title={t(m.key)} style={{
                          fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 99,
                          background: `${m.color}1f`, color: m.color, border: `1px solid ${m.color}55`,
                        }}>{m.emoji} {t(m.key)}</span>
                      );
                    })}
                  </div>
                )}
                <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                  {age && (
                    <span style={{ fontSize: 12, color: "var(--text-3)", background: "var(--surface-2)", borderRadius: 99, padding: "3px 9px" }}>
                      🎂 {t("common.yo", { n: age })}
                    </span>
                  )}
                  {user?.gender && (
                    <span style={{ fontSize: 12, color: "var(--text-3)", background: "var(--surface-2)", borderRadius: 99, padding: "3px 9px" }}>
                      {user.gender === "Male" ? `♂ ${t("common.male")}` : `♀ ${t("common.female")}`}
                    </span>
                  )}
                </div>
                {user?.follower_count > 0 && (
                  <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 4 }}>
                    {user.follower_count === 1 ? t("follow.followersOne") : t("follow.followers", { n: user.follower_count })}
                  </div>
                )}
              </div>
            </div>

            {/* Connect actions */}
            <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
              <FollowButton
                targetType="user"
                targetId={user.id}
                initialFollowing={user.is_following}
                initialCount={user.follower_count}
              />
              <button onClick={doIntro} disabled={introSending} style={{
                flex: "1 1 auto", minWidth: 130, padding: "11px", background: "var(--accent)", border: "none",
                borderRadius: "var(--radius-sm)", color: "#fff", fontWeight: 700, fontSize: 13,
                cursor: "pointer", fontFamily: "var(--font-display)",
              }}>{introSending ? t("intro.sending") : t("intro.btn")}</button>
              {tgChatUrl(user) && (
                <button onClick={() => openChat(user)} style={{
                  flex: "1 1 auto", minWidth: 100, padding: "11px", textAlign: "center",
                  background: "var(--surface-2)", border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)", color: "var(--text)", fontWeight: 600, fontSize: 13,
                  cursor: "pointer", fontFamily: "var(--font-display)",
                }}>💬 {user?.tg_username ? `@${user.tg_username}` : t("intro.btn").replace("👋 ", "")}</button>
              )}
              <button onClick={doInterest} style={{
                padding: "11px 14px", background: "rgba(167,139,250,0.12)",
                border: "1px solid rgba(167,139,250,0.4)", borderRadius: "var(--radius-sm)",
                color: "#A78BFA", fontWeight: 600, fontSize: 13, cursor: "pointer",
              }}>{t("interest.btn")}</button>
              <button onClick={doReport} title={t("report.btn")} style={{
                padding: "11px 14px", background: "rgba(255,107,107,0.1)",
                border: "1px solid rgba(255,107,107,0.25)", borderRadius: "var(--radius-sm)",
                color: "#FF6B6B", fontWeight: 600, fontSize: 13, cursor: "pointer",
              }}>{t("report.btn")}</button>
            </div>

            {/* Why you match — one-line AI reason grounded in shared interests */}
            <div style={{ marginBottom: 10 }}>
              <button onClick={doWhyMatch} disabled={loadingMatch} style={{
                width: "100%", padding: "10px", background: "rgba(167,139,250,0.1)",
                border: "1px solid rgba(167,139,250,0.3)", borderRadius: "var(--radius-sm)",
                color: "#A78BFA", fontWeight: 600, fontSize: 13, cursor: "pointer",
              }}>
                {loadingMatch ? t("match.thinking") : matchReason ? t("match.hide") : t("match.btn")}
              </button>
              {matchReason && (
                <div style={{
                  marginTop: 10, padding: "12px 14px", background: "var(--surface-2)",
                  border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
                  color: "var(--text)", fontSize: 14, lineHeight: 1.6,
                }}>✨ {matchReason}</div>
              )}
            </div>

            {/* AI icebreakers — kills the blank-message freeze before chatting */}
            <div style={{ marginBottom: 16 }}>
              <button onClick={doIcebreakers} disabled={loadingOpeners} style={{
                width: "100%", padding: "10px", background: "rgba(78,205,196,0.1)",
                border: "1px solid rgba(78,205,196,0.3)", borderRadius: "var(--radius-sm)",
                color: "#4ECDC4", fontWeight: 600, fontSize: 13, cursor: "pointer",
              }}>
                {loadingOpeners ? t("ice.thinking") : openers ? t("ice.hide") : t("ice.btn")}
              </button>
              {openers && (
                <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                  {openers.length === 0 ? (
                    <div style={{ fontSize: 12, color: "var(--text-3)", textAlign: "center" }}>{t("ice.none")}</div>
                  ) : openers.map((o, i) => (
                    <button key={i} onClick={() => copyOpener(o)} style={{
                      textAlign: "left", padding: "10px 12px", background: "var(--surface-2)",
                      border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
                      color: "var(--text)", fontSize: 13, lineHeight: 1.5, cursor: "pointer",
                    }}>{o} <span style={{ color: "var(--text-3)", fontSize: 11 }}>· {t("ice.tapCopy")}</span></button>
                  ))}
                </div>
              )}
            </div>

            {/* Intentions */}
            {(user?.open_to_work || user?.open_to_volunteering) && (
              <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                {user.open_to_work && (
                  <span style={{ background: "var(--accent-dim)", border: "1px solid var(--accent)", color: "var(--accent)", borderRadius: 99, padding: "5px 12px", fontSize: 12, fontWeight: 600 }}>
                    {t("um.openStartups")}
                  </span>
                )}
                {user.open_to_volunteering && (
                  <span style={{ background: "rgba(78,205,196,0.15)", border: "1px solid rgba(78,205,196,0.3)", color: "#4ECDC4", borderRadius: 99, padding: "5px 12px", fontSize: 12, fontWeight: 600 }}>
                    {t("um.openVolunteer")}
                  </span>
                )}
              </div>
            )}

            {/* Mentor card */}
            {user?.mentor?.is_mentor && (
              <div style={{
                marginBottom: 16, padding: "14px", background: "rgba(167,139,250,0.1)",
                border: "1px solid rgba(167,139,250,0.3)", borderRadius: "var(--radius-sm)",
              }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#A78BFA", marginBottom: 6 }}>
                  🎓 {t("mentor.isMentor")}
                </div>
                {user.mentor.bio && (
                  <p style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.6, margin: "0 0 8px" }}>{user.mentor.bio}</p>
                )}
                {user.mentor.topics?.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                    {user.mentor.topics.map(tp => (
                      <span key={tp} style={{ background: "rgba(167,139,250,0.15)", color: "#A78BFA",
                        borderRadius: 99, padding: "3px 10px", fontSize: 11, fontWeight: 600 }}>{tp}</span>
                    ))}
                  </div>
                )}
                <button onClick={() => setBooking(true)} style={{
                  width: "100%", padding: "10px", background: "#A78BFA", border: "none",
                  borderRadius: "var(--radius-sm)", color: "#fff", fontWeight: 700, fontSize: 13,
                  cursor: "pointer",
                }}>{t("mentor.book")}</button>
              </div>
            )}

            {/* About */}
            {user?.about && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div className="section-label">{t("um.about")}</div>
                  <button onClick={doTranslate} disabled={translating} style={{
                    background: "none", border: "none", color: "var(--accent)",
                    fontSize: 11, fontWeight: 600, cursor: "pointer", padding: 0,
                  }}>{translating ? t("bio.translating") : translated ? t("bio.original") : t("bio.translate")}</button>
                </div>
                <p style={{ fontSize: 14, color: "var(--text-2)", lineHeight: 1.7 }}>{translated || user.about}</p>
              </div>
            )}

            {/* Analysis Tags */}
            {hasAnyTags && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {Object.entries(TAG_COLORS).map(([key, style]) => {
                  const tags = analysis[key];
                  if (!tags || tags.length === 0) return null;
                  return (
                    <div key={key}>
                      <div className="section-label">{t(`tag.${key}`)}</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {tags.map(tag => {
                          if (key !== "skills") return <TagChip key={tag} label={tag} category={key} />;
                          const e = (user.endorsements || []).find(x => x.skill === tag);
                          const count = e?.count || 0;
                          const mine = !!e?.endorsed_by_me;
                          return (
                            <button key={tag} onClick={() => doEndorse(tag)} style={{
                              display: "inline-flex", alignItems: "center", gap: 6,
                              background: mine ? "rgba(123,111,255,0.25)" : "rgba(123,111,255,0.12)",
                              color: "#7B6FFF", border: mine ? "1px solid #7B6FFF" : "1px solid transparent",
                              borderRadius: 99, padding: "4px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer",
                            }}>
                              {tag}{count > 0 && <span style={{ fontWeight: 800 }}>👍 {count}</span>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ marginTop: 18 }}>
              <ProfileExtras user={user} />
            </div>

            {/* Vouches */}
            <div style={{ marginTop: 20 }}>
              <div className="section-label">{t("trust.vouches")}</div>
              {(user.vouches || []).length === 0 ? (
                <div style={{ fontSize: 12, color: "var(--text-3)" }}>{t("trust.noVouches")}</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {user.vouches.map(v => (
                    <div key={v.id} style={{ background: "var(--surface-2)", border: "1px solid var(--border)",
                      borderLeft: "3px solid var(--accent)", borderRadius: "var(--radius-sm)", padding: "10px 12px" }}>
                      <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.6 }}>“{v.text}”</div>
                      <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>
                        — {v.author?.display_name || ""}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {!vouchOpen ? (
                <button onClick={() => setVouchOpen(true)} style={{
                  marginTop: 8, background: "var(--surface-2)", border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)", color: "var(--accent)", padding: "8px 12px",
                  fontSize: 13, fontWeight: 600, cursor: "pointer" }}>{t("trust.vouchBtn")}</button>
              ) : (
                <div style={{ marginTop: 8 }}>
                  <textarea value={vouchText} maxLength={280}
                    onChange={e => setVouchText(e.target.value)} placeholder={t("trust.vouchPh")}
                    rows={3} style={{ width: "100%", boxSizing: "border-box", background: "var(--surface-2)",
                      border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", color: "var(--text)",
                      padding: "10px 12px", fontSize: 13, resize: "vertical" }} />
                  <button onClick={submitVouch} disabled={vouchBusy || !vouchText.trim()} style={{
                    marginTop: 6, background: "var(--accent)", border: "none", borderRadius: "var(--radius-sm)",
                    color: "#fff", padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                    {t("trust.vouchPost")}
                  </button>
                </div>
              )}
            </div>

            {!user?.about && !hasAnyTags && !(user?.founded_projects?.length || user?.member_projects?.length) && !(user?.vouches?.length) && (
              <div style={{ textAlign: "center", padding: 20, color: "var(--text-3)", fontSize: 13 }}>
                {t("um.empty")}
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>

      {booking && user && (
        <BookSlotSheet mentor={user} onClose={() => setBooking(false)} />
      )}
    </div>
  );
};
