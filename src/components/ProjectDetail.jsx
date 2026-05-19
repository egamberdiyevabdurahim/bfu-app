import { useState, useEffect } from "react";
import { Icon } from "./Icons";
import { projects, regions, users } from "../api";
import { UserProfileModal } from "./UserProfileModal";
import { useT } from "../i18n";
import { tgAlert, tgConfirm } from "../tg";

const FitBadge = ({ isFit }) => {
  const { t } = useT();
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      background: isFit ? "rgba(78,205,196,0.15)" : "rgba(255,99,99,0.12)",
      color: isFit ? "#4ECDC4" : "#FF6363",
      border: `1px solid ${isFit ? "rgba(78,205,196,0.3)" : "rgba(255,99,99,0.25)"}`,
      borderRadius: 99, padding: "4px 12px", fontSize: 12, fontWeight: 700,
    }}>
      {isFit ? t("badge.fit") : t("badge.notFit")}
    </span>
  );
};

const MemberAvatar = ({ name = "?", size = 36 }) => {
  const initials = (name || "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const colors = ["#7B6FFF", "#FF6B6B", "#4ECDC4", "#FFB347", "#A78BFA"];
  const bg = colors[(name.charCodeAt(0) || 0) % colors.length];
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: `${bg}22`, border: `2px solid ${bg}55`,
      color: bg, display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.38, fontWeight: 700, fontFamily: "var(--font-display)", flexShrink: 0,
    }}>
      {initials}
    </div>
  );
};

const StatusButton = ({ project, onApply, onCancel, onLeave, loading }) => {
  const { t } = useT();
  const s = project.my_application_status;
  const isCreator = project._is_creator;

  if (isCreator) return (
    <div style={{
      width: "100%", background: "var(--surface-2)", border: "1px solid var(--border)",
      borderRadius: "var(--radius-sm)", padding: "14px", textAlign: "center",
      color: "var(--text-3)", fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 14,
    }}>
      {t("pd.yourProject")}
    </div>
  );

  if (project.is_member) return (
    <div style={{ display: "flex", gap: 10 }}>
      <div style={{
        flex: 1, background: "var(--accent-dim)", border: "1px solid var(--accent)",
        borderRadius: "var(--radius-sm)", padding: "14px", textAlign: "center",
        color: "var(--accent)", fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 14,
      }}>
        {t("pd.youreMember")}
      </div>
      <button onClick={onLeave} disabled={loading} style={{
        background: "rgba(255,99,99,0.1)", border: "1px solid rgba(255,99,99,0.25)",
        borderRadius: "var(--radius-sm)", padding: "14px 16px", cursor: "pointer",
        color: "#FF6363", fontSize: 13,
      }}>{t("pd.leave")}</button>
    </div>
  );

  if (s === "pending") return (
    <div style={{ display: "flex", gap: 10 }}>
      <div style={{
        flex: 1, background: "rgba(255,179,71,0.15)", border: "1px solid rgba(255,179,71,0.4)",
        borderRadius: "var(--radius-sm)", padding: "14px", textAlign: "center",
        color: "#FFB347", fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 14,
      }}>
        {t("pd.pendingReview")}
      </div>
      <button onClick={onCancel} disabled={loading} style={{
        background: "var(--surface-2)", border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm)", padding: "14px 16px", cursor: "pointer",
        color: "var(--text-3)", fontSize: 13,
      }}>
        {t("pd.withdraw")}
      </button>
    </div>
  );

  if (s === "accepted") return (
    <div style={{
      width: "100%", background: "rgba(78,205,196,0.15)", border: "1px solid rgba(78,205,196,0.3)",
      borderRadius: "var(--radius-sm)", padding: "14px", textAlign: "center",
      color: "#4ECDC4", fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 14,
    }}>
      {t("pd.accepted")}
    </div>
  );

  if (s === "declined") return (
    <div style={{
      width: "100%", background: "rgba(255,99,99,0.1)", border: "1px solid rgba(255,99,99,0.25)",
      borderRadius: "var(--radius-sm)", padding: "14px", textAlign: "center",
      color: "#FF6363", fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 14,
    }}>
      {t("pd.declined")}
    </div>
  );

  if (!project.is_hiring) return (
    <div style={{
      width: "100%", background: "var(--surface-3)", borderRadius: "var(--radius-sm)", padding: "14px",
      textAlign: "center", color: "var(--text-3)", fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 14,
    }}>
      {t("pd.notHiring")}
    </div>
  );

  return (
    <button onClick={onApply} disabled={loading || !project.is_fit} style={{
      width: "100%",
      background: project.is_fit ? "var(--accent)" : "var(--surface-3)",
      border: "none", borderRadius: "var(--radius-sm)", padding: "14px",
      cursor: project.is_fit ? "pointer" : "not-allowed",
      color: project.is_fit ? "#fff" : "var(--text-3)",
      fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15,
      boxShadow: project.is_fit ? "0 4px 24px rgba(123,111,255,0.35)" : "none",
      opacity: loading ? 0.7 : 1, transition: "all 0.2s",
    }}>
      {loading ? t("pd.submitting") : (project.is_fit ? t("pd.apply") : t("pd.reqNotMet"))}
    </button>
  );
};

export const ProjectDetail = ({ project: initial, me, onClose, onUpdate }) => {
  const { t } = useT();
  const [project, setProject] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [regionMap, setRegionMap] = useState({});
  const [viewingUserId, setViewingUserId] = useState(null);

  const isCreator = me && project.creator_id === me.id;
  const projectWithFlag = { ...project, _is_creator: isCreator };

  // Load region names once
  useEffect(() => {
    regions.list().then(list => {
      const map = {};
      list.forEach(r => { map[r.id] = r.name_en; });
      setRegionMap(map);
    }).catch(() => {});
  }, []);

  const handleApply = async () => {
    if (!project.is_fit) {
      tgAlert(t("pd.notQualified"));
      return;
    }
    setLoading(true);
    try {
      await projects.apply(project.id);
      const updated = await projects.get(project.id);
      setProject(updated);
      if (onUpdate) onUpdate(updated);
    } catch (e) {
      tgAlert(e.message);
    }
    setLoading(false);
  };

  const handleCancel = async () => {
    setLoading(true);
    try {
      await projects.cancelApply(project.id);
      const updated = await projects.get(project.id);
      setProject(updated);
      if (onUpdate) onUpdate(updated);
    } catch (e) {
      tgAlert(e.message);
    }
    setLoading(false);
  };

  const doReport = async () => {
    if (!await tgConfirm(t("report.prompt"))) return;
    try {
      await users.report({ target_type: "project", target_id: project.id });
      tgAlert(t("report.sent"));
    } catch (e) { tgAlert(e.message); }
  };

  const handleLeave = async () => {
    if (!await tgConfirm(t("pd.confirmLeave"))) return;
    setLoading(true);
    try {
      await projects.leave(project.id);
      const updated = await projects.get(project.id);
      setProject(updated);
      if (onUpdate) onUpdate(updated);
    } catch (e) {
      tgAlert(e.message);
    }
    setLoading(false);
  };

  return (
    <>
      <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", flexDirection: "column" }}>
        {/* Backdrop */}
        <div onClick={onClose} style={{
          position: "absolute", inset: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)",
        }} />

        {/* Sheet */}
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0,
          maxWidth: 430, margin: "0 auto",
          background: "var(--surface)", borderRadius: "24px 24px 0 0",
          maxHeight: "92dvh", display: "flex", flexDirection: "column",
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

          {/* Content */}
          <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px" }}>
            {/* Type + Fit badge */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <span style={{ background: "rgba(123,111,255,0.15)", color: "#7B6FFF", borderRadius: 6, padding: "4px 10px", fontSize: 12, fontWeight: 600 }}>
                {project.type}
              </span>
              {!isCreator && <FitBadge isFit={project.is_fit} />}
              {isCreator && <span style={{ background: "rgba(255,179,71,0.15)", color: "#FFB347", borderRadius: 6, padding: "4px 10px", fontSize: 12, fontWeight: 600 }}>{t("pd.yourProject")}</span>}
            </div>

            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800, marginBottom: 6 }}>
              {project.name}
            </h2>
            {project.goal && (
              <p style={{ fontSize: 15, color: "var(--accent)", fontWeight: 500, marginBottom: 16, lineHeight: 1.5 }}>
                {project.goal}
              </p>
            )}

            {/* Stats */}
            <div style={{ display: "flex", gap: 14, marginBottom: 20, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-3)" }}>
                <Icon name="users" size={14} />
                {t("board.membersN", { n: project.member_count })}
              </div>
              {project.age_from && project.age_to && (
                <div style={{ fontSize: 13, color: "var(--text-3)" }}>{t("pd.ages", { a: project.age_from, b: project.age_to })}</div>
              )}
              {project.gender_req && (
                <div style={{ fontSize: 13, color: "var(--text-3)" }}>
                  {project.gender_req === "Male" ? t("pd.maleOnly") : t("pd.femaleOnly")}
                </div>
              )}
            </div>

            {/* About */}
            {project.about && (
              <div style={{ marginBottom: 20 }}>
                <div className="section-label">{t("pd.about")}</div>
                <p style={{ fontSize: 14, color: "var(--text-2)", lineHeight: 1.7 }}>{project.about}</p>
              </div>
            )}

            {/* Skills */}
            {project.req_skills?.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div className="section-label">{t("pd.requiredSkills")}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {project.req_skills.map(s => (
                    <span key={s.skill_name} className="chip">{s.skill_name}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Regions — now with real names */}
            {project.req_regions?.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div className="section-label">{t("pd.targetRegions")}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {project.req_regions.map(r => (
                    <span key={r.region_id} className="chip">
                      📍 {regionMap[r.region_id] || t("pd.regionN", { n: r.region_id })}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Members section */}
            {project.members?.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div className="section-label">{t("pd.team", { n: project.member_count })}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {project.members.map(m => {
                    const isFounder = m.user_id === project.creator_id;
                    const displayName = m.display_name || `User #${m.user_id}`;
                    return (
                      <div key={m.user_id}
                        onClick={() => setViewingUserId(m.user_id)}
                        style={{
                          display: "flex", alignItems: "center", gap: 12,
                          padding: "10px 14px", background: "var(--surface-2)",
                          borderRadius: "var(--radius-sm)", cursor: "pointer",
                          border: "1px solid var(--border)", transition: "background 0.15s",
                        }}>
                        <MemberAvatar name={displayName} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14 }}>
                            {displayName}
                          </div>
                          <div style={{ fontSize: 11, color: isFounder ? "#FFB347" : "var(--text-3)", fontWeight: 600, marginTop: 2 }}>
                            {isFounder ? t("pd.founder") : t("pd.cofounder")}
                          </div>
                        </div>
                        <Icon name="chevron_right" size={14} color="var(--text-3)" />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Channel */}
            {project.channel && (
              <div style={{ marginBottom: 20 }}>
                <div className="section-label">{t("pd.contact")}</div>
                <a href={project.channel} target="_blank" rel="noreferrer" style={{
                  display: "inline-flex", alignItems: "center", gap: 8, fontSize: 14,
                  color: "var(--accent)", textDecoration: "none",
                }}>
                  <Icon name="send" size={14} /> {project.channel}
                </a>
              </div>
            )}

            <button onClick={doReport} style={{
              background: "none", border: "none", color: "var(--text-3)",
              fontSize: 12, textDecoration: "underline", cursor: "pointer", padding: "4px 0",
            }}>{t("report.btn")}</button>

            <div style={{ height: 100 }} />
          </div>

          {/* Apply CTA */}
          <div style={{ padding: "16px 24px calc(24px + var(--safe-b))", borderTop: "1px solid var(--border)", background: "var(--surface)" }}>
            <StatusButton
              project={projectWithFlag}
              onApply={handleApply}
              onCancel={handleCancel}
              onLeave={handleLeave}
              loading={loading}
            />
          </div>
        </div>

        <style>{`
          @keyframes slideUp {
            from { transform: translateY(100%); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
          }
        `}</style>
      </div>

      {viewingUserId && (
        <UserProfileModal
          userId={viewingUserId}
          onClose={() => setViewingUserId(null)}
        />
      )}
    </>
  );
};
