import { useState, useEffect } from "react";
import { Icon } from "./Icons";
import { users } from "../api";

const TAG_COLORS = {
  skills:       { bg: "rgba(123,111,255,0.15)", color: "#7B6FFF", label: "Skills" },
  knowledges:   { bg: "rgba(78,205,196,0.15)",  color: "#4ECDC4", label: "Knowledge" },
  interests:    { bg: "rgba(255,179,71,0.15)",   color: "#FFB347", label: "Interests" },
  preparations: { bg: "rgba(167,139,250,0.15)",  color: "#A78BFA", label: "Preparing For" },
  goals:        { bg: "rgba(255,107,107,0.15)",  color: "#FF6B6B", label: "Goals" },
};

const Avatar = ({ name = "?", size = 64 }) => {
  const initials = (name || "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const colors = ["#7B6FFF", "#FF6B6B", "#4ECDC4", "#FFB347", "#A78BFA", "#34D399"];
  const bg = colors[(name.charCodeAt(0) || 0) % colors.length];
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
  const [user, setUser] = useState(propUser || null);
  const [loading, setLoading] = useState(!propUser && !!userId);

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
        maxHeight: "88vh", display: "flex", flexDirection: "column",
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
            <div style={{ color: "var(--text-3)", fontSize: 13 }}>Loading profile…</div>
          </div>
        ) : (
          <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px 48px" }}>
            {/* Header */}
            <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 16 }}>
              <Avatar name={fullName || user?.display_name || "?"} size={64} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 800, marginBottom: 2 }}>
                  {fullName || user?.display_name}
                </h2>
                {user?.tg_username && (
                  <a href={`https://t.me/${user.tg_username}`} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: 13, color: "var(--accent)", textDecoration: "none" }}>
                    @{user.tg_username}
                  </a>
                )}
                <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                  {age && (
                    <span style={{ fontSize: 12, color: "var(--text-3)", background: "var(--surface-2)", borderRadius: 99, padding: "3px 9px" }}>
                      🎂 {age} y/o
                    </span>
                  )}
                  {user?.gender && (
                    <span style={{ fontSize: 12, color: "var(--text-3)", background: "var(--surface-2)", borderRadius: 99, padding: "3px 9px" }}>
                      {user.gender === "Male" ? "♂" : "♀"} {user.gender}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Intentions */}
            {(user?.open_to_work || user?.open_to_volunteering) && (
              <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                {user.open_to_work && (
                  <span style={{ background: "var(--accent-dim)", border: "1px solid var(--accent)", color: "var(--accent)", borderRadius: 99, padding: "5px 12px", fontSize: 12, fontWeight: 600 }}>
                    ⚡ Open to Startups
                  </span>
                )}
                {user.open_to_volunteering && (
                  <span style={{ background: "rgba(78,205,196,0.15)", border: "1px solid rgba(78,205,196,0.3)", color: "#4ECDC4", borderRadius: 99, padding: "5px 12px", fontSize: 12, fontWeight: 600 }}>
                    🤝 Open to Volunteer
                  </span>
                )}
              </div>
            )}

            {/* About */}
            {user?.about && (
              <div style={{ marginBottom: 20 }}>
                <div className="section-label">About</div>
                <p style={{ fontSize: 14, color: "var(--text-2)", lineHeight: 1.7 }}>{user.about}</p>
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
                      <div className="section-label">{style.label}</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {tags.map(tag => <TagChip key={tag} label={tag} category={key} />)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {!user?.about && !hasAnyTags && (
              <div style={{ textAlign: "center", padding: 20, color: "var(--text-3)", fontSize: 13 }}>
                This user hasn't filled in their profile yet.
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
    </div>
  );
};
