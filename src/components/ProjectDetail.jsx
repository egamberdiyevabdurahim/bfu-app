import { useState, useEffect } from "react";
import { Icon } from "./Icons";
import { projects, regions, users } from "../api";
import { UserProfileModal } from "./UserProfileModal";
import { FollowButton } from "./FollowButton";
import { useT } from "../i18n";
import { tgAlert, tgConfirm, openProjectChat } from "../tg";

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

export const ProjectDetail = ({ project: initial, me, prefillRole, onClose, onUpdate }) => {
  const { t } = useT();
  const [project, setProject] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [regionMap, setRegionMap] = useState({});
  const [viewingUserId, setViewingUserId] = useState(null);
  const [stats, setStats] = useState(null);
  const [updates, setUpdates] = useState(null);
  const [updateText, setUpdateText] = useState("");
  const [posting, setPosting] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);
  const [roleText, setRoleText] = useState(prefillRole || "");
  const [rolesList, setRolesList] = useState(null);
  const [newRole, setNewRole] = useState("");
  const [addingRole, setAddingRole] = useState(false);
  const [linkDraft, setLinkDraft] = useState("");
  const [editingLink, setEditingLink] = useState(false);

  const isCreator = me && project.creator_id === me.id;
  const projectWithFlag = { ...project, _is_creator: isCreator };

  // Founder stats (only for the project creator)
  useEffect(() => {
    if (isCreator) projects.stats(project.id).then(setStats).catch(() => {});
  }, [isCreator, project.id]);

  // Load region names once
  useEffect(() => {
    regions.list().then(list => {
      const map = {};
      list.forEach(r => { map[r.id] = r.name_en; });
      setRegionMap(map);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    projects.updates(project.id).then(r => setUpdates(r.updates || [])).catch(() => setUpdates([]));
  }, [project.id]);

  useEffect(() => {
    projects.roles(project.id).then(r => setRolesList(r.roles || [])).catch(() => setRolesList([]));
  }, [project.id]);

  const postUpdate = async () => {
    if (posting || !updateText.trim()) return;
    setPosting(true);
    try {
      await projects.postUpdate(project.id, updateText.trim());
      const r = await projects.updates(project.id);
      setUpdates(r.updates || []);
      setUpdateText("");
    } catch (e) { tgAlert(e.message); }
    setPosting(false);
  };

  const removeUpdate = async (uid) => {
    if (!await tgConfirm(t("updates.delete"))) return;
    try {
      await projects.deleteUpdate(project.id, uid);
      setUpdates(u => (u || []).filter(x => x.id !== uid));
    } catch (e) { tgAlert(e.message); }
  };

  const handleApply = async () => {
    if (!project.is_fit) {
      tgAlert(t("pd.notQualified"));
      return;
    }
    setLoading(true);
    try {
      await projects.apply(project.id, roleText.trim() || null);
      const updated = await projects.get(project.id);
      setProject(updated);
      setRoleOpen(false);
      setRoleText("");
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

  const addRole = async () => {
    const name = newRole.trim();
    if (addingRole || !name) return;
    setAddingRole(true);
    try {
      const r = await projects.addRole(project.id, name);
      setRolesList(list => [{ id: r.id, name, is_filled: false }, ...(list || [])]);
      setNewRole("");
    } catch (e) { tgAlert(e.message === "Role already listed" ? t("roles.dup") : e.message); }
    setAddingRole(false);
  };

  const toggleRole = async (role) => {
    try {
      await projects.setRoleFilled(project.id, role.id, !role.is_filled);
      setRolesList(list => list.map(r => r.id === role.id ? { ...r, is_filled: !r.is_filled } : r));
    } catch (e) { tgAlert(e.message); }
  };

  const removeRole = async (role) => {
    try {
      await projects.deleteRole(project.id, role.id);
      setRolesList(list => list.filter(r => r.id !== role.id));
    } catch (e) { tgAlert(e.message); }
  };

  const saveLink = async () => {
    try {
      const updated = await projects.update(project.id, { group_link: linkDraft.trim() });
      setEditingLink(false);
      setProject(p => ({ ...p, group_link: updated.group_link }));
    } catch (e) { tgAlert(e.message?.includes("t.me") ? t("chat.invalid") : e.message); }
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
          <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 20px 0" }}>
            <button
              onClick={async () => {
                try {
                  if (project.is_favorited) {
                    await projects.unfavorite(project.id);
                    setProject({ ...project, is_favorited: false });
                  } else {
                    await projects.favorite(project.id);
                    setProject({ ...project, is_favorited: true });
                  }
                } catch (e) { tgAlert(e.message); }
              }}
              style={{
                background: project.is_favorited ? "rgba(255,107,107,0.12)" : "var(--surface-2)",
                border: project.is_favorited ? "1px solid rgba(255,107,107,0.4)" : "1px solid var(--border)",
                borderRadius: 99, padding: "6px 12px", fontSize: 13,
                color: project.is_favorited ? "#FF6B6B" : "var(--text-2)",
                cursor: "pointer", fontWeight: 600,
              }}
            >{project.is_favorited ? "❤️ " + t("fav.remove") : "🤍 " + t("fav.add")}</button>
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

            {!isCreator && (
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                <FollowButton
                  targetType="project"
                  targetId={project.id}
                  initialFollowing={project.is_following}
                  initialCount={project.follower_count}
                />
                {project.follower_count > 0 && (
                  <span style={{ fontSize: 12, color: "var(--text-3)" }}>
                    {project.follower_count === 1 ? t("follow.followersOne") : t("follow.followers", { n: project.follower_count })}
                  </span>
                )}
              </div>
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

            {/* Updates */}
            <div style={{ marginBottom: 20 }}>
              <div className="section-label">{t("updates.title")}</div>
              {isCreator && (
                <div style={{ marginBottom: 12 }}>
                  <textarea value={updateText} maxLength={500}
                    onChange={e => setUpdateText(e.target.value)} placeholder={t("updates.placeholder")}
                    rows={2} style={{ width: "100%", boxSizing: "border-box", background: "var(--surface-2)",
                      border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", color: "var(--text)",
                      padding: "10px 12px", fontSize: 13, resize: "vertical" }} />
                  <button onClick={postUpdate} disabled={posting || !updateText.trim()} style={{
                    marginTop: 6, background: "var(--accent)", border: "none", borderRadius: "var(--radius-sm)",
                    color: "#fff", padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                    {t("updates.post")}
                  </button>
                </div>
              )}
              {updates === null ? (
                <div style={{ fontSize: 12, color: "var(--text-3)" }}>{t("common.loading")}</div>
              ) : updates.length === 0 ? (
                <div style={{ fontSize: 12, color: "var(--text-3)" }}>{t("updates.none")}</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {updates.map(u => (
                    <div key={u.id} style={{ background: "var(--surface-2)", border: "1px solid var(--border)",
                      borderLeft: "3px solid var(--accent)", borderRadius: "var(--radius-sm)", padding: "10px 12px" }}>
                      <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.6 }}>{u.text}</div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                        <span style={{ fontSize: 11, color: "var(--text-3)" }}>
                          {u.author?.display_name || ""} · {(() => { try { return new Date(u.created_at).toLocaleDateString(); } catch { return ""; } })()}
                        </span>
                        {isCreator && (
                          <button onClick={() => removeUpdate(u.id)} style={{ background: "none", border: "none",
                            color: "var(--text-3)", fontSize: 11, textDecoration: "underline", cursor: "pointer" }}>
                            {t("updates.delete")}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

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

            {/* Open roles */}
            {(rolesList?.length > 0 || isCreator) && (
              <div style={{ marginBottom: 20 }}>
                <div className="section-label">{t("roles.sectionTitle")}</div>
                {isCreator && (
                  <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                    <input value={newRole} onChange={e => setNewRole(e.target.value)}
                      placeholder={t("roles.addPh")} style={{
                        flex: 1, padding: "10px 12px", background: "var(--surface-2)",
                        border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
                        color: "var(--text)", fontSize: 13 }} />
                    <button onClick={addRole} disabled={addingRole} style={{
                      padding: "10px 14px", background: "var(--accent)", border: "none",
                      borderRadius: "var(--radius-sm)", color: "#fff", fontWeight: 700,
                      fontSize: 13, cursor: "pointer" }}>{t("roles.add")}</button>
                  </div>
                )}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {(rolesList || []).map(r => (
                    <span key={r.id} style={{
                      display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 12px",
                      borderRadius: 99, fontSize: 12, fontWeight: 600,
                      background: r.is_filled ? "var(--surface-3)" : "rgba(78,205,196,0.15)",
                      color: r.is_filled ? "var(--text-3)" : "#4ECDC4",
                      border: "1px solid var(--border)" }}>
                      {r.name}{r.is_filled ? ` · ${t("roles.filled")}` : ""}
                      {isCreator && (
                        <>
                          <button onClick={() => toggleRole(r)} title={r.is_filled ? t("roles.markOpen") : t("roles.markFilled")}
                            style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", fontSize: 12 }}>
                            {r.is_filled ? "↺" : "✓"}
                          </button>
                          <button onClick={() => removeRole(r)} title={t("roles.remove")}
                            style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", fontSize: 12 }}>×</button>
                        </>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Project chat */}
            <div style={{ marginBottom: 20 }}>
              <div className="section-label">{t("chat.title")}</div>
              {project.group_link ? (
                <button onClick={() => openProjectChat(project)} style={{
                  width: "100%", padding: "11px", background: "var(--accent)", border: "none",
                  borderRadius: "var(--radius-sm)", color: "#fff", fontWeight: 700, fontSize: 13,
                  cursor: "pointer" }}>{t("chat.join")}</button>
              ) : isCreator ? (
                editingLink ? (
                  <div>
                    <input value={linkDraft} onChange={e => setLinkDraft(e.target.value)}
                      placeholder={t("chat.linkPh")} style={{
                        width: "100%", boxSizing: "border-box", padding: "10px 12px", background: "var(--surface-2)",
                        border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
                        color: "var(--text)", fontSize: 13, marginBottom: 8 }} />
                    <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 8 }}>{t("chat.howto")}</div>
                    <button onClick={saveLink} style={{
                      padding: "9px 14px", background: "var(--accent)", border: "none",
                      borderRadius: "var(--radius-sm)", color: "#fff", fontWeight: 700,
                      fontSize: 13, cursor: "pointer" }}>{t("common.save")}</button>
                  </div>
                ) : (
                  <button onClick={() => { setLinkDraft(""); setEditingLink(true); }} style={{
                    width: "100%", padding: "11px", background: "var(--surface-2)",
                    border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
                    color: "var(--text-2)", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
                    {t("chat.linkBtn")}</button>
                )
              ) : (
                <div style={{ fontSize: 12, color: "var(--text-3)" }}>{t("chat.none")}</div>
              )}
            </div>

            {isCreator && stats && (
              <div style={{
                background: "var(--surface-2)", border: "1px solid var(--border)",
                borderRadius: "var(--radius)", padding: 14, marginBottom: 14,
              }}>
                <div className="section-label">{t("pd.stats.title")}</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                  {[
                    [t("pd.stats.pending"),  stats.pending,  "#FFB347"],
                    [t("pd.stats.accepted"), stats.accepted, "#4ECDC4"],
                    [t("pd.stats.declined"), stats.declined, "#FF6B6B"],
                    [t("pd.stats.views"),    stats.views,    "#7B6FFF"],
                    [t("pd.stats.avgDecision"), stats.avg_decision_hours != null ? t("pd.stats.hours", { n: stats.avg_decision_hours }) : t("pd.stats.noData"), "#A78BFA"],
                  ].map(([label, val, col], i) => (
                    <div key={i} style={{
                      textAlign: "center", padding: "8px 4px", background: "var(--surface)",
                      borderRadius: "var(--radius-sm)", border: `1px solid ${col}40`,
                    }}>
                      <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 18, color: col }}>{val}</div>
                      <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 2 }}>{label}</div>
                    </div>
                  ))}
                </div>
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
            {project.pending_applications_count > 0 && !isCreator && (
              <div style={{ fontSize: 11, color: "var(--text-3)", textAlign: "center", marginBottom: 8 }}>
                {t("pd.othersApplied", { n: project.pending_applications_count })}
              </div>
            )}
            <StatusButton
              project={projectWithFlag}
              onApply={() => setRoleOpen(true)}
              onCancel={handleCancel}
              onLeave={handleLeave}
              loading={loading}
            />
            {roleOpen && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 6 }}>{t("apply.roleLabel")}</div>
                <input value={roleText} maxLength={80} onChange={e => setRoleText(e.target.value)}
                  placeholder={t("apply.rolePh")} style={{ width: "100%", boxSizing: "border-box",
                    background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
                    color: "var(--text)", padding: "10px 12px", fontSize: 13, marginBottom: 8 }} />
                <button onClick={handleApply} disabled={loading} style={{ width: "100%", background: "var(--accent)",
                  border: "none", borderRadius: "var(--radius-sm)", color: "#fff", padding: "12px", fontWeight: 700,
                  fontSize: 14, cursor: "pointer" }}>{t("apply.submit")}</button>
              </div>
            )}
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
