import { useState, useEffect } from "react";
import { Page, AvatarEl } from "../components/Shared";
import { Icon } from "../components/Icons";
import { users, storage } from "../api";
import { EditProfileScreen } from "./EditProfileScreen";
import { AdminScreen } from "./AdminScreen";
import { EventsScreen } from "./EventsScreen";
import { useT } from "../i18n";
import { shareUrl } from "../tg";

const InviteCard = () => {
  const { t } = useT();
  const [data, setData] = useState(null);
  const [board, setBoard] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    users.invite().then(setData).catch(() => {});
    users.leaderboard().then(setBoard).catch(() => {});
  }, []);
  if (!data) return null;

  const copy = async () => {
    try { await navigator.clipboard.writeText(data.link); }
    catch { /* clipboard blocked */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div style={{
      background: "linear-gradient(135deg, var(--accent-dim), var(--surface-2))",
      border: "1px solid var(--accent)", borderRadius: "var(--radius)",
      padding: 16, marginBottom: 12,
    }}>
      <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 16, marginBottom: 4 }}>
        🎁 {t("invite.title")}
      </div>
      <div style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.5, marginBottom: 12 }}>
        {t("invite.desc")}
      </div>
      <div style={{
        background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
        padding: "10px 12px", fontSize: 12, color: "var(--text-2)", wordBreak: "break-all", marginBottom: 10,
      }}>{data.link}</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <button onClick={copy} style={{
          flex: 1, padding: 10, background: "var(--surface-3)", border: "1px solid var(--border)",
          borderRadius: "var(--radius-sm)", color: "var(--text)", fontWeight: 600, fontSize: 13, cursor: "pointer",
        }}>{copied ? t("invite.copied") : t("invite.copy")}</button>
        <button onClick={() => shareUrl(data.link, t("invite.shareText"))} style={{
          flex: 1, padding: 10, background: "var(--accent)", border: "none",
          borderRadius: "var(--radius-sm)", color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer",
        }}>{t("invite.share")}</button>
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--accent)", textAlign: "center", marginBottom: board?.top?.length ? 14 : 0 }}>
        {t("invite.count", { n: data.invited_count })}
      </div>
      {board && (
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-2)", marginBottom: 8 }}>
            {t("invite.leaderboard")}
          </div>
          {board.top?.length ? board.top.map((r) => (
            <div key={r.rank} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "5px 0", fontSize: 13,
              color: r.is_me ? "var(--accent)" : "var(--text-2)", fontWeight: r.is_me ? 700 : 500,
            }}>
              <span>{r.rank}. {r.name}{r.is_me ? ` (${t("invite.you")})` : ""}</span>
              <span>{r.count}</span>
            </div>
          )) : (
            <div style={{ fontSize: 12, color: "var(--text-3)" }}>{t("invite.noLeaders")}</div>
          )}
        </div>
      )}
    </div>
  );
};

const TAG_COLORS = {
  skills:       { bg: "rgba(123,111,255,0.15)", color: "#7B6FFF" },
  knowledges:   { bg: "rgba(78,205,196,0.15)",  color: "#4ECDC4" },
  interests:    { bg: "rgba(255,179,71,0.15)",   color: "#FFB347" },
  preparations: { bg: "rgba(167,139,250,0.15)",  color: "#A78BFA" },
  goals:        { bg: "rgba(255,107,107,0.15)",  color: "#FF6B6B" },
};

const TAG_KEYS = ["skills", "knowledges", "interests", "preparations", "goals"];

export const SettingsScreen = () => {
  const { t } = useT();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [eventsOpen, setEventsOpen] = useState(false);

  useEffect(() => { loadUser(); }, []);

  const loadUser = async () => {
    setLoading(true);
    try { setUser(await users.me()); } catch (e) {}
    setLoading(false);
  };

  const handleSignOut = () => {
    storage.clear();
    window.dispatchEvent(new Event("bfu:signout"));
  };

  if (loading) return (
    <Page><div style={{ textAlign: "center", padding: 60 }}><Icon name="loader" size={24} /></div></Page>
  );

  if (!user) return null;

  // ── Edit Profile overlay ──────────────────────────────────────────────────
  if (editOpen) return (
    <EditProfileScreen
      me={user}
      onBack={() => setEditOpen(false)}
      onSaved={loadUser}
    />
  );

  // ── Admin Panel overlay ───────────────────────────────────────────────────
  if (adminOpen) return (
    <AdminScreen user={user} onBack={() => setAdminOpen(false)} />
  );

  if (eventsOpen) return (
    <EventsScreen onBack={() => setEventsOpen(false)} />
  );

  const age = user.birth_year ? new Date().getFullYear() - user.birth_year : null;
  const analysis = user.analysis;

  return (
    <Page>
      <div style={{ padding: "20px 20px 100px" }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800, marginBottom: 20 }}>{t("settings.title")}</h1>

        {/* Profile Card */}
        <div style={{
          background: "linear-gradient(135deg, var(--surface), var(--surface-2))",
          border: "1px solid var(--border)", borderRadius: "var(--radius)",
          padding: "20px", marginBottom: 12,
        }}>
          <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 14 }}>
            <AvatarEl name={user.display_name} size={60} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 18 }}>
                {[user.name, user.surname].filter(Boolean).join(" ") || user.display_name}
              </div>
              {user.tg_username && (
                <div style={{ color: "var(--accent)", fontSize: 13, marginTop: 2 }}>@{user.tg_username}</div>
              )}
              <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                {age && (
                  <span style={{ fontSize: 11, color: "var(--text-3)", background: "var(--surface-3)", borderRadius: 99, padding: "2px 8px" }}>
                    🎂 {t("common.yo", { n: age })}
                  </span>
                )}
                {user.gender && (
                  <span style={{ fontSize: 11, color: "var(--text-3)", background: "var(--surface-3)", borderRadius: 99, padding: "2px 8px" }}>
                    {user.gender === "Male" ? `♂ ${t("common.male")}` : `♀ ${t("common.female")}`}
                  </span>
                )}
                <span style={{ fontSize: 11, color: "var(--text-3)", background: "var(--surface-3)", borderRadius: 99, padding: "2px 8px" }}>
                  🌐 {user.language?.toUpperCase()}
                </span>
              </div>
            </div>
          </div>

          {user.about && (
            <p style={{ color: "var(--text-2)", fontSize: 13, lineHeight: 1.6, marginBottom: 14 }}>{user.about}</p>
          )}

          {/* Tags */}
          {analysis && TAG_KEYS.map((key) => {
            const tags = analysis[key];
            if (!tags?.length) return null;
            const { bg, color } = TAG_COLORS[key];
            return (
              <div key={key} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: "var(--text-3)", textTransform: "uppercase", marginBottom: 6 }}>{t(`tag.${key}`)}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {tags.map(t => (
                    <span key={t} style={{ background: bg, color, borderRadius: 99, padding: "3px 10px", fontSize: 11, fontWeight: 600 }}>{t}</span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Intentions */}
        {(user.open_to_work || user.open_to_volunteering) && (
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            {user.open_to_work && (
              <span style={{ background: "var(--accent-dim)", border: "1px solid var(--accent)", color: "var(--accent)", borderRadius: 99, padding: "6px 14px", fontSize: 12, fontWeight: 600 }}>
                {t("settings.openStartups")}
              </span>
            )}
            {user.open_to_volunteering && (
              <span style={{ background: "rgba(78,205,196,0.15)", border: "1px solid rgba(78,205,196,0.3)", color: "#4ECDC4", borderRadius: 99, padding: "6px 14px", fontSize: 12, fontWeight: 600 }}>
                {t("settings.openVolunteer")}
              </span>
            )}
          </div>
        )}

        <InviteCard />

        {/* Edit Profile Button */}
        <button onClick={() => setEditOpen(true)} style={{
          width: "100%", background: "var(--accent)", border: "none",
          borderRadius: "var(--radius-sm)", padding: "14px",
          cursor: "pointer", color: "#fff",
          fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15,
          boxShadow: "0 4px 24px rgba(123,111,255,0.35)", marginBottom: 10,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        }}>
          <Icon name="edit" size={16} color="#fff" /> {t("settings.editProfile")}
        </button>

        <button onClick={() => setEventsOpen(true)} style={{
          width: "100%", background: "var(--surface-2)", border: "1px solid var(--border)",
          borderRadius: "var(--radius-sm)", padding: "14px", cursor: "pointer",
          color: "var(--text)", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15,
          marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        }}>{t("settings.events")}</button>

        {/* Admin Dashboard */}
        {(user.role === "admin" || user.role === "super_admin") && (
          <button onClick={() => setAdminOpen(true)} style={{
            width: "100%", background: "var(--surface-3)", border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)", padding: "14px",
            cursor: "pointer", color: "var(--text)",
            fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15,
            marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}>
            {t("settings.adminDashboard")}
          </button>
        )}

        {/* Sign Out */}
        <button onClick={handleSignOut} style={{
          width: "100%", background: "rgba(255,107,107,0.1)", border: "1px solid rgba(255,107,107,0.2)",
          borderRadius: "var(--radius-sm)", padding: "12px", cursor: "pointer",
          color: "#FF6B6B", fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 14,
        }}>
          {t("settings.signOut")}
        </button>
      </div>
    </Page>
  );
};
