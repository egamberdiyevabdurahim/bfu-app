import { useState, useEffect } from "react";
import { Icon } from "./Icons";
import { projects, regions, users, messages as msgApi } from "../api";
import { UserProfileModal } from "./UserProfileModal";
import { FollowButton } from "./FollowButton";
import { AvatarEl } from "./Shared";
import { useT } from "../i18n";
import { tgAlert, tgConfirm, openProjectChat } from "../tg";

// ── Project detail — rebuilt in the Chorsu "Bazaar" firelit design, mirroring
// the desktop /p/[id] page (ProjectHero + ProjectAboutCell + ProjectLookingForCell
// + projects/OpenRolesCell + ProjectUpdates). A full-screen mobile overlay:
// hero identity strip → viewer action rail (apply / manage) → about, looking-for,
// team, open roles, updates, chat and founder-stats bento cells. Every action of
// the old sheet is preserved (favorite, follow, apply/withdraw/leave, post/delete
// update, add/toggle/remove role, link group chat, report, founder stats).

// Muted tokens: the shared ch-* classes reference var(--muted)/var(--muted-strong)
// which aren't declared in the Mini App root — so we set muted colors explicitly
// from the declared tokens (--text-3 muted, --text-2 muted-strong).
const MUTED = "var(--text-3)";
const MUTED_STRONG = "var(--text-2)";

const FitBadge = ({ isFit }) => {
  const { t } = useT();
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      background: isFit ? "rgba(127,176,105,0.15)" : "rgba(192,86,59,0.14)",
      color: isFit ? "var(--green)" : "var(--terra)",
      border: `1px solid ${isFit ? "rgba(127,176,105,0.35)" : "rgba(192,86,59,0.3)"}`,
      borderRadius: "var(--radius-pill)", padding: "5px 12px",
      fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.04em",
    }}>
      {isFit ? t("badge.fit") : t("badge.notFit")}
    </span>
  );
};

const CellLabel = ({ children, color = MUTED }) => (
  <div className="ch-cell-label" style={{ color }}>{children}</div>
);

const StatusButton = ({ project, onApply, onCancel, onLeave, loading }) => {
  const { t } = useT();
  const s = project.my_application_status;
  const isCreator = project._is_creator;

  const statusBox = (label, color, bg, border) => (
    <div style={{
      flex: 1, background: bg, border: `1px solid ${border}`,
      borderRadius: "var(--radius-pill)", padding: "14px", textAlign: "center",
      color, fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 14,
    }}>
      {label}
    </div>
  );

  if (isCreator) return (
    <div style={{ display: "flex" }}>
      {statusBox(t("pd.yourProject"), "var(--amber)", "var(--accent-dim)", "rgba(232,161,92,0.34)")}
    </div>
  );

  if (project.is_member) return (
    <div style={{ display: "flex", gap: 10 }}>
      {statusBox(t("pd.youreMember"), "var(--green)", "rgba(127,176,105,0.15)", "rgba(127,176,105,0.35)")}
      <button onClick={onLeave} disabled={loading} className="btn-ghost" style={{
        width: "auto", color: "var(--terra)", borderColor: "rgba(192,86,59,0.35)",
      }}>{t("pd.leave")}</button>
    </div>
  );

  if (s === "pending") return (
    <div style={{ display: "flex", gap: 10 }}>
      {statusBox(t("pd.pendingReview"), "var(--amber)", "rgba(232,161,92,0.15)", "rgba(232,161,92,0.4)")}
      <button onClick={onCancel} disabled={loading} className="btn-ghost" style={{
        width: "auto", color: MUTED,
      }}>{t("pd.withdraw")}</button>
    </div>
  );

  if (s === "accepted") return (
    <div style={{ display: "flex" }}>
      {statusBox(t("pd.accepted"), "var(--green)", "rgba(127,176,105,0.15)", "rgba(127,176,105,0.35)")}
    </div>
  );

  if (s === "declined") return (
    <div style={{ display: "flex" }}>
      {statusBox(t("pd.declined"), "var(--terra)", "rgba(192,86,59,0.14)", "rgba(192,86,59,0.3)")}
    </div>
  );

  if (!project.is_hiring) return (
    <div style={{ display: "flex" }}>
      {statusBox(t("pd.notHiring"), MUTED, "var(--surface-2)", "var(--hair)")}
    </div>
  );

  return (
    <button onClick={onApply} disabled={loading || !project.is_fit} className="btn-primary">
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
  const isStartup = project.type === "startup";
  const typeAccent = isStartup ? "var(--amber)" : "var(--green)";
  const typeBg = isStartup ? "rgba(232,161,92,0.14)" : "rgba(127,176,105,0.14)";
  const typeBorder = isStartup ? "rgba(232,161,92,0.34)" : "rgba(127,176,105,0.34)";
  const isActive = project.is_active !== false;

  // In-app team chat: creator or accepted member can open the project's team
  // conversation (find-or-create; backend 403s anyone off the team).
  const onTeam = isCreator || project.is_member;
  const openTeamChat = async () => {
    try {
      const conv = await msgApi.projectChat(project.id);
      if (conv?.id) {
        window.dispatchEvent(new CustomEvent("bfu:open-messages", { detail: { conversationId: conv.id } }));
        onClose?.();
      }
    } catch (e) {
      tgAlert(e?.message || t("msg.threadError"));
    }
  };

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

  const toggleFavorite = async () => {
    try {
      if (project.is_favorited) {
        await projects.unfavorite(project.id);
        setProject({ ...project, is_favorited: false });
      } else {
        await projects.favorite(project.id);
        setProject({ ...project, is_favorited: true });
      }
    } catch (e) { tgAlert(e.message); }
  };

  // ── requirement line (ages / gender) — mirrors desktop ProjectLookingForCell ──
  const reqParts = [];
  if (project.age_from && project.age_to) reqParts.push(t("pd.ages", { a: project.age_from, b: project.age_to }));
  if (project.gender_req === "Male") reqParts.push(t("pd.maleOnly"));
  else if (project.gender_req === "Female") reqParts.push(t("pd.femaleOnly"));

  const hasSkills = project.req_skills?.length > 0;
  const hasRegions = project.req_regions?.length > 0;
  const hasLookingFor = hasSkills || hasRegions || reqParts.length > 0;

  return (
    <>
      <div style={{
        position: "fixed", inset: 0, zIndex: 200, display: "flex", justifyContent: "center",
        background: "var(--bg)", animation: "fadeIn 0.22s ease",
      }}>
        <div style={{
          width: "100%", maxWidth: 430, height: "100%", position: "relative",
          display: "flex", flexDirection: "column", background: "var(--bg)",
          animation: "fadeUp 0.32s cubic-bezier(0.2,0.9,0.3,1)",
        }}>
          {/* ── Top bar ── */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "calc(10px + var(--safe-t)) 16px 10px",
            borderBottom: "1px solid var(--hair)",
            background: "rgba(11,10,8,0.86)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)",
            position: "sticky", top: 0, zIndex: 5,
          }}>
            <button onClick={onClose} className="btn-ghost" style={{
              width: 38, height: 38, padding: 0, display: "flex", alignItems: "center",
              justifyContent: "center", borderRadius: "50%",
            }} aria-label={t("common.back")}>
              <Icon name="x" size={17} />
            </button>
            <span style={{
              fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.16em",
              textTransform: "uppercase", color: MUTED,
            }}>{isStartup ? "Startup" : "Volunteering"}</span>
            <button onClick={toggleFavorite} className="btn-ghost" style={{
              width: 38, height: 38, padding: 0, display: "flex", alignItems: "center",
              justifyContent: "center", borderRadius: "50%",
              color: project.is_favorited ? "var(--ember)" : MUTED_STRONG,
              borderColor: project.is_favorited ? "rgba(255,106,61,0.4)" : "var(--hair)",
              background: project.is_favorited ? "rgba(255,106,61,0.12)" : "rgba(35,32,25,0.6)",
            }} aria-label={project.is_favorited ? t("fav.remove") : t("fav.add")}>
              <Icon name="heart" size={17} />
            </button>
          </div>

          {/* ── Scroll body ── */}
          <div style={{
            flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch",
            padding: "20px 18px calc(28px + var(--safe-b))",
          }}>
            {/* ── HERO (mirror ProjectHero) ── */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 7,
                padding: "6px 12px", borderRadius: "var(--radius-pill)",
                background: typeBg, border: `1px solid ${typeBorder}`,
                fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: "0.14em",
                textTransform: "uppercase", color: typeAccent,
              }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: typeAccent, boxShadow: `0 0 10px ${typeAccent}` }} />
                {project.type}
              </span>

              {isActive ? (
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 8,
                  padding: "6px 12px", borderRadius: "var(--radius-pill)",
                  background: "rgba(127,176,105,0.12)", border: "1px solid rgba(127,176,105,0.32)",
                  fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: "0.12em",
                  textTransform: "uppercase", color: "var(--green)",
                }}>
                  {project.is_hiring && (
                    <span style={{ position: "relative", display: "inline-flex", width: 8, height: 8 }}>
                      <span className="ch-online-ping" style={{ background: "var(--green)" }} />
                      <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "var(--green)" }} />
                    </span>
                  )}
                  {t("profile.active")}
                </span>
              ) : (
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 8,
                  padding: "6px 12px", borderRadius: "var(--radius-pill)",
                  background: "var(--surface-2)", border: "1px solid var(--hair)",
                  fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: "0.12em",
                  textTransform: "uppercase", color: MUTED_STRONG,
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: MUTED_STRONG }} />
                  {t("profile.closed")}
                </span>
              )}

              {!isCreator && <FitBadge isFit={project.is_fit} />}
            </div>

            <h1 style={{
              margin: "20px 0 0", fontFamily: "var(--font-display)", fontWeight: 800,
              fontSize: 30, lineHeight: 1.06, letterSpacing: "-0.02em", color: "var(--text)",
              overflowWrap: "break-word",
            }}>
              {project.name}
            </h1>

            {project.goal && (
              <p style={{
                margin: "14px 0 0", fontFamily: "var(--font-accent)", fontStyle: "italic",
                fontSize: 20, lineHeight: 1.32, color: "var(--amber)", overflowWrap: "break-word",
              }}>
                {project.goal}
              </p>
            )}

            <div style={{
              marginTop: 16, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
            }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.06em", color: MUTED_STRONG }}>
                {t("board.membersN", { n: project.member_count })}
              </span>
              {!isCreator && (
                <FollowButton
                  targetType="project"
                  targetId={project.id}
                  initialFollowing={project.is_following}
                  initialCount={project.follower_count}
                />
              )}
            </div>

            {/* ── ACTION RAIL (mirror desktop ProjectActions cell) ── */}
            <div className="ch-cell-static" style={{ marginTop: 22, padding: 16 }}>
              {project.pending_applications_count > 0 && !isCreator && (
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: "0.06em", color: MUTED, textAlign: "center", marginBottom: 12 }}>
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
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 12, color: MUTED, marginBottom: 6 }}>{t("apply.roleLabel")}</div>
                  <input value={roleText} maxLength={80} onChange={e => setRoleText(e.target.value)}
                    placeholder={t("apply.rolePh")} className="input-field" style={{ marginBottom: 10 }} />
                  <button onClick={handleApply} disabled={loading} className="btn-primary">
                    {t("apply.submit")}
                  </button>
                </div>
              )}
            </div>

            {/* ── Cells column ── */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 22 }}>
              {/* About */}
              {project.about && (
                <div className="ch-cell-static">
                  <CellLabel>{t("pd.about")}</CellLabel>
                  <p style={{ margin: "14px 0 0", fontSize: 15, lineHeight: 1.65, color: "var(--text)", whiteSpace: "pre-line", overflowWrap: "break-word" }}>
                    {project.about}
                  </p>
                </div>
              )}

              {/* Looking for (skills + regions + requirements) */}
              {hasLookingFor && (
                <div className="ch-cell-static" style={{
                  borderColor: "rgba(127,176,105,0.3)",
                  background: "linear-gradient(150deg, rgba(127,176,105,0.10), var(--surface) 60%)",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--green)", boxShadow: "0 0 12px rgba(127,176,105,0.8)" }} />
                    <CellLabel color="var(--green)">{t("roles.title")}</CellLabel>
                  </div>

                  {hasSkills && (
                    <div style={{ marginTop: 16 }}>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: MUTED, marginBottom: 8 }}>
                        {t("pd.requiredSkills")}
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                        {project.req_skills.map(s => (
                          <span key={s.skill_name} className="chip">{s.skill_name}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {hasRegions && (
                    <div style={{ marginTop: 16 }}>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: MUTED, marginBottom: 8 }}>
                        {t("pd.targetRegions")}
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                        {project.req_regions.map(r => (
                          <span key={r.region_id} style={{
                            fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.03em",
                            padding: "6px 12px", borderRadius: "var(--radius-pill)",
                            background: "rgba(18,86,79,0.18)", border: "1px solid rgba(94,197,182,0.3)",
                            color: "var(--teal-bright)",
                          }}>
                            {regionMap[r.region_id] || t("pd.regionN", { n: r.region_id })}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {reqParts.length > 0 && (
                    <div style={{ marginTop: 16, fontFamily: "var(--font-mono)", fontSize: 11.5, letterSpacing: "0.06em", color: MUTED_STRONG }}>
                      {reqParts.join(" · ")}
                    </div>
                  )}
                </div>
              )}

              {/* Team */}
              {project.members?.length > 0 && (
                <div className="ch-cell-static">
                  <CellLabel>{t("pd.team", { n: project.member_count })}</CellLabel>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
                    {project.members.map(m => {
                      const isFounder = m.user_id === project.creator_id;
                      const displayName = m.display_name || `User #${m.user_id}`;
                      return (
                        <div key={m.user_id}
                          onClick={() => setViewingUserId(m.user_id)}
                          style={{
                            display: "flex", alignItems: "center", gap: 12,
                            padding: "10px 12px", background: "var(--surface-2)",
                            borderRadius: "var(--radius-sm)", cursor: "pointer",
                            border: "1px solid var(--hair)",
                          }}>
                          <AvatarEl name={displayName} size={40} photoUrl={m.photo_url} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {displayName}
                            </div>
                            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.06em", color: isFounder ? "var(--amber)" : MUTED, marginTop: 3 }}>
                              {isFounder ? t("pd.founder") : t("pd.cofounder")}
                            </div>
                          </div>
                          <Icon name="chevron_right" size={15} color={MUTED} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Open roles */}
              {(rolesList?.length > 0 || isCreator) && (
                <div className="ch-cell-static">
                  <CellLabel>{t("roles.sectionTitle")}</CellLabel>
                  {isCreator && (
                    <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                      <input value={newRole} onChange={e => setNewRole(e.target.value)}
                        placeholder={t("roles.addPh")} className="input-field" style={{ fontSize: 14 }} />
                      <button onClick={addRole} disabled={addingRole} className="btn-primary" style={{
                        width: "auto", padding: "0 18px", fontSize: 14, whiteSpace: "nowrap",
                      }}>{t("roles.add")}</button>
                    </div>
                  )}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
                    {(rolesList || []).map(r => (
                      <span key={r.id} style={{
                        display: "inline-flex", alignItems: "center", gap: 7,
                        fontFamily: "var(--font-mono)", fontSize: 11.5, padding: "7px 13px",
                        borderRadius: "var(--radius-pill)",
                        background: r.is_filled ? "var(--surface-2)" : "rgba(232,161,92,0.1)",
                        color: r.is_filled ? MUTED : "var(--amber)",
                        border: `1px solid ${r.is_filled ? "var(--hair)" : "rgba(232,161,92,0.32)"}`,
                      }}>
                        {r.name}{r.is_filled ? ` · ${t("roles.filled")}` : ""}
                        {isCreator && (
                          <>
                            <button onClick={() => toggleRole(r)} title={r.is_filled ? t("roles.markOpen") : t("roles.markFilled")}
                              style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", fontSize: 13, padding: 0, minHeight: 0 }}>
                              {r.is_filled ? "↺" : "✓"}
                            </button>
                            <button onClick={() => removeRole(r)} title={t("roles.remove")}
                              style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", fontSize: 14, padding: 0, minHeight: 0 }}>×</button>
                          </>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Updates */}
              <div className="ch-cell-static">
                <CellLabel>{t("updates.title")}</CellLabel>
                {isCreator && (
                  <div style={{ marginTop: 14, marginBottom: 4 }}>
                    <textarea value={updateText} maxLength={500}
                      onChange={e => setUpdateText(e.target.value)} placeholder={t("updates.placeholder")}
                      rows={2} className="input-field" style={{ resize: "vertical", fontSize: 14, lineHeight: 1.5 }} />
                    <button onClick={postUpdate} disabled={posting || !updateText.trim()} className="btn-primary" style={{
                      width: "auto", marginTop: 10, padding: "0 20px", height: 40, fontSize: 14,
                    }}>
                      {t("updates.post")}
                    </button>
                  </div>
                )}
                {updates === null ? (
                  <div style={{ fontSize: 12, color: MUTED, marginTop: 14 }}>{t("common.loading")}</div>
                ) : updates.length === 0 ? (
                  <div style={{ fontFamily: "var(--font-accent)", fontStyle: "italic", fontSize: 15, color: MUTED, marginTop: 14 }}>{t("updates.none")}</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
                    {updates.map(u => (
                      <div key={u.id} style={{
                        background: "var(--surface-2)", border: "1px solid var(--hair)",
                        borderLeft: "3px solid var(--amber)", borderRadius: "var(--radius-sm)", padding: "11px 13px",
                      }}>
                        <div style={{ fontSize: 13.5, color: "var(--text)", lineHeight: 1.6, whiteSpace: "pre-line", overflowWrap: "break-word" }}>{u.text}</div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: MUTED }}>
                            {u.author?.display_name || ""} · {(() => { try { return new Date(u.created_at).toLocaleDateString(); } catch { return ""; } })()}
                          </span>
                          {isCreator && (
                            <button onClick={() => removeUpdate(u.id)} style={{ background: "none", border: "none", color: MUTED, fontSize: 11, textDecoration: "underline", cursor: "pointer", padding: 0, minHeight: 0 }}>
                              {t("updates.delete")}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Contact channel */}
              {project.channel && (
                <div className="ch-cell-static">
                  <CellLabel>{t("pd.contact")}</CellLabel>
                  <a href={project.channel} target="_blank" rel="noreferrer" style={{
                    display: "inline-flex", alignItems: "center", gap: 8, marginTop: 12,
                    fontSize: 14, color: "var(--amber)", textDecoration: "none", overflowWrap: "anywhere",
                  }}>
                    <Icon name="send" size={14} /> {project.channel}
                  </a>
                </div>
              )}

              {/* Project chat */}
              <div className="ch-cell-static">
                <CellLabel>{t("chat.title")}</CellLabel>
                <div style={{ marginTop: 14 }}>
                  {onTeam && (
                    <button onClick={openTeamChat} className="btn-primary"
                      style={{ width: "100%", marginBottom: (project.group_link || isCreator) ? 10 : 0 }}>
                      💬 {t("msg.teamChatOpen")}
                    </button>
                  )}
                  {project.group_link ? (
                    <button onClick={() => openProjectChat(project)} className="btn-primary">{t("chat.join")}</button>
                  ) : isCreator ? (
                    editingLink ? (
                      <div>
                        <input value={linkDraft} onChange={e => setLinkDraft(e.target.value)}
                          placeholder={t("chat.linkPh")} className="input-field" style={{ marginBottom: 8, fontSize: 14 }} />
                        <div style={{ fontSize: 11.5, color: MUTED, marginBottom: 10, lineHeight: 1.5 }}>{t("chat.howto")}</div>
                        <button onClick={saveLink} className="btn-primary" style={{ width: "auto", padding: "0 22px", height: 42 }}>{t("common.save")}</button>
                      </div>
                    ) : (
                      <button onClick={() => { setLinkDraft(""); setEditingLink(true); }} className="btn-ghost" style={{ width: "100%" }}>
                        {t("chat.linkBtn")}</button>
                    )
                  ) : (
                    <div style={{ fontSize: 13, color: MUTED }}>{t("chat.none")}</div>
                  )}
                </div>
              </div>

              {/* Founder stats */}
              {isCreator && stats && (
                <div className="ch-cell-static">
                  <CellLabel>{t("pd.stats.title")}</CellLabel>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 14 }}>
                    {[
                      [t("pd.stats.pending"),  stats.pending,  "var(--amber)"],
                      [t("pd.stats.accepted"), stats.accepted, "var(--green)"],
                      [t("pd.stats.declined"), stats.declined, "var(--terra)"],
                      [t("pd.stats.views"),    stats.views,    "var(--teal-bright)"],
                      [t("pd.stats.avgDecision"), stats.avg_decision_hours != null ? t("pd.stats.hours", { n: stats.avg_decision_hours }) : t("pd.stats.noData"), "var(--ember)"],
                    ].map(([label, val, col], i) => (
                      <div key={i} style={{
                        textAlign: "center", padding: "10px 4px", background: "var(--surface-2)",
                        borderRadius: "var(--radius-sm)", border: `1px solid var(--hair)`,
                      }}>
                        <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 18, color: col }}>{val}</div>
                        <div className="ch-metric-label" style={{ color: MUTED }}>{label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button onClick={doReport} style={{
              background: "none", border: "none", color: MUTED,
              fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.06em",
              textDecoration: "underline", cursor: "pointer", padding: "18px 0 4px",
            }}>{t("report.btn")}</button>
          </div>
        </div>
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
