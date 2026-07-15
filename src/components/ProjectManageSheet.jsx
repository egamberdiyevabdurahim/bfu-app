import { useState, useEffect, useRef } from "react";
import { SkeletonList, AvatarEl } from "./Shared";
import { Icon } from "./Icons";
import { projects } from "../api";
import { ProjectForm } from "./ProjectForm";
import { ProjectDetail } from "./ProjectDetail";
import { UserProfileModal } from "./UserProfileModal";
import { useT } from "../i18n";
import { tgAlert, tgConfirm } from "../tg";

// ── Founder management sheet for the unified Projects tab ─────────────────────
// A full-screen firelit overlay (mirrors ProjectDetail's shell) that restores
// the three founder tools that used to live on StartupScreen/VolunteerScreen:
//   • Post        — pick a type, then <ProjectForm> to publish a new project
//   • My projects — projects.mine() (all types), tap a card → <ProjectDetail>
//   • Requests    — projects.myRequests() (all types), Accept / Decline inline
// Logic is a faithful port of StartupScreen (post / mine / requests / review),
// reskinned to the Chorsu "Bazaar" tokens.

const MUTED = "var(--text-3)";
const MUTED_STRONG = "var(--text-2)";

// Chorsu segmented-control chip (mono uppercase pill; amber gradient when active)
const SegChip = ({ on, onClick, children }) => (
  <button
    role="tab"
    aria-selected={on}
    onClick={onClick}
    style={{
      flex: 1,
      padding: "10px 12px",
      borderRadius: "var(--radius-pill)",
      cursor: "pointer",
      fontFamily: "var(--font-mono)",
      fontSize: 11,
      letterSpacing: "0.06em",
      textTransform: "uppercase",
      whiteSpace: "nowrap",
      transition: "all 0.18s ease",
      border: on ? "1px solid rgba(232,161,92,0.5)" : "1px solid var(--hair)",
      background: on
        ? "linear-gradient(135deg, rgba(232,161,92,0.16), rgba(192,86,59,0.12))"
        : "transparent",
      color: on ? "var(--amber)" : MUTED,
    }}
  >
    {children}
  </button>
);

// Type badge on a "my projects" card (Startup = amber, Volunteering = green)
const TypeBadge = ({ type }) => {
  const { t } = useT();
  const isStartup = type === "startup";
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center",
        borderRadius: "var(--radius-pill)", padding: "4px 11px",
        fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: "0.06em",
        textTransform: "uppercase", fontWeight: 700,
        background: isStartup ? "rgba(232,161,92,0.14)" : "rgba(127,176,105,0.14)",
        color: isStartup ? "var(--amber)" : "var(--green)",
        border: `1px solid ${isStartup ? "rgba(232,161,92,0.32)" : "rgba(127,176,105,0.32)"}`,
      }}
    >
      {isStartup ? t("discover.badge.startup") : t("discover.badge.volunteer")}
    </span>
  );
};

// ── Shared full-screen overlay shell (matches this sheet's own shell) ─────────
// Used by the Edit and Team overlays so they read as the same surface family.
const OverlayShell = ({ title, onClose, children }) => {
  const { t } = useT();
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 210, display: "flex", justifyContent: "center",
      background: "var(--bg)", animation: "fadeIn 0.22s ease",
    }}>
      <div style={{
        width: "100%", maxWidth: 430, height: "100%", position: "relative",
        display: "flex", flexDirection: "column", background: "var(--bg)",
        animation: "fadeUp 0.32s cubic-bezier(0.2,0.9,0.3,1)",
      }}>
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
          }}>{title}</span>
          <span style={{ width: 38, height: 38 }} />
        </div>
        <div style={{
          flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch",
          padding: "16px 18px calc(28px + var(--safe-b))",
        }}>
          {children}
        </div>
      </div>
    </div>
  );
};

// Small toast (mirrors MessagesScreen's pattern) used across this sheet.
const Toast = ({ toast }) => {
  if (!toast?.text) return null;
  return (
    <div role="status" aria-live="polite" style={{
      position: "fixed", left: "50%", bottom: 84, transform: "translateX(-50%)", zIndex: 420,
      background: "var(--surface)", border: `1px solid ${toast.tone === "error" ? "rgba(192,86,59,0.5)" : "rgba(255,106,61,0.4)"}`,
      borderRadius: 12, padding: "10px 16px", maxWidth: 320, boxShadow: "0 16px 40px rgba(0,0,0,0.5)",
    }}>
      <b style={{ color: toast.tone === "error" ? "var(--terra)" : "var(--ember)", fontSize: 13.5 }}>{toast.text}</b>
    </div>
  );
};

// Owner action button on a "my projects" card (Edit / Team / Delete).
const CardAction = ({ icon, label, onClick, danger, busy }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={busy}
    style={{
      flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
      padding: "9px 8px", borderRadius: "var(--radius-pill)", cursor: busy ? "default" : "pointer",
      fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 12.5,
      background: danger ? "rgba(192,86,59,0.1)" : "var(--surface-2)",
      border: `1px solid ${danger ? "rgba(192,86,59,0.3)" : "var(--hair)"}`,
      color: danger ? "var(--terra)" : MUTED_STRONG,
      opacity: busy ? 0.6 : 1,
    }}
  >
    <Icon name={icon} size={14} /> {label}
  </button>
);

// ── One member row inside the Team manager ───────────────────────────────────
// Founder-set member-role (PATCH /projects/{id}/team/{uid} {role}) + Remove
// (DELETE /projects/{id}/team/{uid}, confirmed). Mirrors desktop TeamRow.
const TeamMemberRow = ({ project, member, onRoleSaved, onRemoved, flash }) => {
  const { t } = useT();
  const u = member.user || {};
  const name = u.display_name || t("common.member");
  const isFounder = !!member.is_founder;
  const [role, setRole] = useState(member.role || "");
  const [savedRole, setSavedRole] = useState(member.role || "");
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const dirty = role.trim() !== (savedRole || "").trim();

  const save = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      const res = await projects.setMemberRole(project.id, u.id, role.trim() || null);
      const next = res?.role || "";
      setSavedRole(next);
      setRole(next);
      onRoleSaved(u.id, next);
      flash(t("team.roleSaved"));
    } catch (e) {
      flash(e.message || t("team.roleFailed"), "error");
    }
    setSaving(false);
  };

  const remove = async () => {
    if (!await tgConfirm(t("team.removeConfirm", { name }))) return;
    setRemoving(true);
    try {
      await projects.removeMember(project.id, u.id);
      flash(t("team.removed", { name }));
      onRemoved(u.id);
    } catch (e) {
      flash(e.message || t("team.removeFailed"), "error");
      setRemoving(false);
    }
  };

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <AvatarEl name={name} size={40} photoUrl={u.photo_url} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {name}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3 }}>
            {isFounder && (
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.06em", color: "var(--amber)" }}>
                {t("team.founderYou")}
              </span>
            )}
            {u.is_online && (
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--green)" }}>● {t("team.online")}</span>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={role}
          onChange={(e) => setRole(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); save(); } }}
          placeholder={t("team.rolePh")}
          maxLength={80}
          className="input-field"
          style={{ flex: 1, fontSize: 14 }}
        />
        <button
          onClick={save}
          disabled={!dirty || saving}
          className="btn-ghost"
          style={{ width: "auto", padding: "0 16px", fontSize: 13, whiteSpace: "nowrap", opacity: !dirty || saving ? 0.5 : 1 }}
        >
          {saving ? t("common.saving") : t("common.save")}
        </button>
      </div>

      {!isFounder && (
        <button
          onClick={remove}
          disabled={removing}
          style={{
            alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 6,
            background: "rgba(192,86,59,0.1)", border: "1px solid rgba(192,86,59,0.3)",
            borderRadius: "var(--radius-pill)", padding: "8px 14px", cursor: removing ? "default" : "pointer",
            color: "var(--terra)", fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 12.5,
            opacity: removing ? 0.6 : 1,
          }}
        >
          <Icon name="x" size={13} /> {t("team.remove")}
        </button>
      )}
    </div>
  );
};

// ── Founder team manager (full-screen overlay) ───────────────────────────────
const TeamManager = ({ project, onClose, onMembersChanged }) => {
  const { t } = useT();
  const [roster, setRoster] = useState(null); // null = loading
  const [error, setError] = useState(false);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(0);
  const flash = (text, tone = "ok") => {
    setToast({ text, tone });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  };
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  useEffect(() => {
    let alive = true;
    projects.team(project.id)
      .then((list) => { if (alive) setRoster(Array.isArray(list) ? list : []); })
      .catch(() => { if (alive) { setError(true); setRoster([]); } });
    return () => { alive = false; };
  }, [project.id]);

  const onRoleSaved = (uid, role) =>
    setRoster((r) => (r || []).map((m) => (m.user?.id === uid ? { ...m, role } : m)));
  const onRemoved = (uid) => {
    setRoster((r) => (r || []).filter((m) => m.user?.id !== uid));
    onMembersChanged?.();
  };

  return (
    <OverlayShell title={t("team.title")} onClose={onClose}>
      <p style={{ margin: "0 0 16px", fontSize: 13.5, color: MUTED_STRONG, lineHeight: 1.55 }}>
        {t("team.intro")}
      </p>
      {roster === null ? (
        <div style={{ fontSize: 13, color: MUTED }}>{t("team.loading")}</div>
      ) : error ? (
        <div style={{ fontSize: 13, color: "var(--terra)" }}>{t("team.loadFailed")}</div>
      ) : roster.length === 0 ? (
        <div className="ch-grace">
          <span className="ch-grace-k">{t("team.title")}</span>
          <div className="ch-grace-t">{t("team.empty")}</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {roster.map((m) => (
            <TeamMemberRow
              key={m.user?.id}
              project={project}
              member={m}
              onRoleSaved={onRoleSaved}
              onRemoved={onRemoved}
              flash={flash}
            />
          ))}
        </div>
      )}
      <Toast toast={toast} />
    </OverlayShell>
  );
};

export const ProjectManageSheet = ({ me, onClose, onChanged, initialTab = "post" }) => {
  const { t } = useT();

  const [tab, setTab] = useState(initialTab);      // post | mine | requests
  const [postType, setPostType] = useState("startup"); // startup | volunteering

  const [mine, setMine] = useState(null);          // null = loading
  const [requests, setRequests] = useState(null);  // null = loading
  const [reviewing, setReviewing] = useState(null); // app id being reviewed

  const [selected, setSelected] = useState(null);        // project → ProjectDetail
  const [selectedApplicant, setSelectedApplicant] = useState(null); // → profile modal

  const [editing, setEditing] = useState(null);   // full project → ProjectForm (edit)
  const [teamFor, setTeamFor] = useState(null);   // project → TeamManager
  const [editBusyId, setEditBusyId] = useState(null);   // fetching full project for edit
  const [deleteBusyId, setDeleteBusyId] = useState(null);

  // Local toast (mirrors MessagesScreen) for delete / edit feedback.
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(0);
  const showToast = (text, tone = "ok") => {
    setToast({ text, tone });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  };
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  // Ignore a slow response if a newer load started (fast tab switches).
  const loadSeq = useRef(0);

  const loadMine = async (seq = loadSeq.current) => {
    setMine(null);
    try {
      const res = await projects.mine(); // all types
      if (loadSeq.current !== seq) return;
      setMine(res);
    } catch (e) {
      if (loadSeq.current === seq) { setMine([]); tgAlert(t("board.loadFailed", { msg: e.message })); }
    }
  };

  const loadRequests = async (seq = loadSeq.current) => {
    setRequests(null);
    try {
      const res = await projects.myRequests(); // all types
      if (loadSeq.current !== seq) return;
      setRequests(res);
    } catch (e) {
      if (loadSeq.current === seq) { setRequests([]); tgAlert(t("board.loadFailed", { msg: e.message })); }
    }
  };

  useEffect(() => {
    const seq = ++loadSeq.current;
    if (tab === "mine") loadMine(seq);
    else if (tab === "requests") loadRequests(seq);
  }, [tab]);

  // Accept / decline a pending application (backend expects "accept" | "decline").
  const handleReview = async (projectId, appId, action) => {
    setReviewing(appId);
    try {
      await projects.reviewApplication(projectId, appId, action);
      await loadRequests();
      onChanged?.();
    } catch (e) { tgAlert(e.message); }
    setReviewing(null);
  };

  // Keep the local "mine" list in sync when the detail sheet mutates a project,
  // and bubble the change up so the browse list refetches.
  const handleMineUpdate = (updated) => {
    setMine(prev => (prev ? prev.map(p => (p.id === updated.id ? { ...p, ...updated } : p)) : prev));
    setSelected(prev => (prev && prev.id === updated.id ? { ...prev, ...updated } : prev));
    onChanged?.();
  };

  // Edit: fetch the FULL project (the slim /mine card drops `about`, regions,
  // skills…) then open the pre-filled ProjectForm in edit mode.
  const openEdit = async (p) => {
    setEditBusyId(p.id);
    try {
      const full = await projects.get(p.id);
      setEditing(full);
    } catch (e) {
      tgAlert(e.message || t("common.loadError"));
    }
    setEditBusyId(null);
  };

  // Delete: confirm → DELETE /projects/{id} → drop from the list + toast.
  const doDelete = async (p) => {
    if (!await tgConfirm(t("manage.deleteConfirm", { name: p.name }))) return;
    setDeleteBusyId(p.id);
    try {
      await projects.delete(p.id);
      setMine(prev => (prev ? prev.filter(x => x.id !== p.id) : prev));
      showToast(t("manage.deleted"));
      onChanged?.();
    } catch (e) {
      showToast(e.message || t("manage.deleteFailed"), "error");
    }
    setDeleteBusyId(null);
  };

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
            }}>{t("manage.title")}</span>
            <span style={{ width: 38, height: 38 }} />
          </div>

          {/* ── Segmented control ── */}
          <div role="tablist" style={{ display: "flex", gap: 8, padding: "16px 18px 6px" }}>
            <SegChip on={tab === "post"} onClick={() => setTab("post")}>{t("manage.tab.post")}</SegChip>
            <SegChip on={tab === "mine"} onClick={() => setTab("mine")}>{t("manage.tab.mine")}</SegChip>
            <SegChip on={tab === "requests"} onClick={() => setTab("requests")}>{t("manage.tab.requests")}</SegChip>
          </div>

          {/* ── Scroll body ── */}
          <div style={{
            flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch",
            padding: "12px 18px calc(28px + var(--safe-b))",
          }}>
            {/* ══ POST ══ */}
            {tab === "post" && (
              <>
                <div style={{
                  fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.16em",
                  textTransform: "uppercase", color: MUTED, marginBottom: 10,
                }}>{t("manage.type.label")}</div>
                <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
                  <SegChip on={postType === "startup"} onClick={() => setPostType("startup")}>
                    {t("nav.startups")}
                  </SegChip>
                  <SegChip on={postType === "volunteering"} onClick={() => setPostType("volunteering")}>
                    {t("nav.volunteer")}
                  </SegChip>
                </div>
                <ProjectForm
                  type={postType}
                  onSuccess={() => { onChanged?.(); setTab("mine"); }}
                />
              </>
            )}

            {/* ══ MY PROJECTS ══ */}
            {tab === "mine" && (
              mine === null ? (
                <SkeletonList count={4} />
              ) : mine.length === 0 ? (
                <div className="ch-grace">
                  <span className="ch-grace-k">{t("manage.empty.mineK")}</span>
                  <div className="ch-grace-t">{t("profile.noProjects")}</div>
                  <div className="ch-grace-s">{t("manage.empty.mineS")}</div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {mine.map((p, i) => (
                    <div
                      key={p.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelected(p)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelected(p); } }}
                      className="card"
                      style={{ cursor: "pointer", animation: `fadeUp ${0.1 + Math.min(i, 8) * 0.05}s ease` }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                        <TypeBadge type={p.type} />
                        {p.is_draft ? (
                          <span style={{
                            fontFamily: "var(--font-mono)", fontSize: 10.5, fontWeight: 700, whiteSpace: "nowrap",
                            color: MUTED_STRONG, background: "var(--surface-3)",
                            borderRadius: "var(--radius-pill)", padding: "4px 10px",
                          }}>{t("badge.draft")}</span>
                        ) : p.is_approved === false ? (
                          <span style={{
                            fontFamily: "var(--font-mono)", fontSize: 10.5, fontWeight: 700, whiteSpace: "nowrap",
                            color: "var(--amber)", background: "rgba(232,161,92,0.12)",
                            border: "1px solid rgba(232,161,92,0.28)",
                            borderRadius: "var(--radius-pill)", padding: "4px 10px",
                          }}>{t("badge.pending")}</span>
                        ) : null}
                      </div>

                      <h3 style={{
                        fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 17,
                        letterSpacing: "-0.01em", color: "var(--text)", marginBottom: 4, lineHeight: 1.15,
                      }}>{p.name}</h3>

                      {(p.goal || p.about) && (
                        <p style={{
                          fontFamily: "var(--font-accent)", fontStyle: "italic", fontSize: 15,
                          color: "var(--text-2)", lineHeight: 1.3,
                          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
                        }}>{p.goal || p.about}</p>
                      )}

                      <div style={{
                        marginTop: 12, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
                        fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: "0.06em", color: MUTED,
                      }}>
                        <span>{t("board.membersN", { n: p.member_count ?? 0 })}</span>
                        <span>{t("myproj.stats", { views: p.view_count || 0, pending: p.pending_applications_count || 0 })}</span>
                      </div>

                      {/* Owner-only: edit every field, manage the team, or delete.
                          stopPropagation so these never open the detail sheet. */}
                      {me?.id === p.creator_id && (
                        <div style={{ display: "flex", gap: 8, marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--hair)" }}>
                          <CardAction icon="edit"  label={t("manage.edit")}    busy={editBusyId === p.id}   onClick={(e) => { e.stopPropagation(); openEdit(p); }} />
                          <CardAction icon="users" label={t("manage.teamBtn")}                              onClick={(e) => { e.stopPropagation(); setTeamFor(p); }} />
                          <CardAction icon="x"     label={t("manage.delete")}  danger busy={deleteBusyId === p.id} onClick={(e) => { e.stopPropagation(); doDelete(p); }} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )
            )}

            {/* ══ REQUESTS ══ */}
            {tab === "requests" && (
              requests === null ? (
                <SkeletonList count={4} />
              ) : requests.length === 0 ? (
                <div className="ch-grace">
                  <span className="ch-grace-k">{t("manage.tab.requests")}</span>
                  <div className="ch-grace-t">{t("board.empty.reqProjects")}</div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {requests.map((app, i) => {
                    const a = app.applicant || {};
                    const name = a.display_name || "";
                    const age = a.birth_year ? `${new Date().getFullYear() - a.birth_year}` : "";
                    const gender = a.gender && a.gender !== "Prefer not to say" ? a.gender : "";
                    const busy = reviewing === app.id;
                    return (
                      <div key={app.id} className="card" style={{ animation: `fadeUp ${0.1 + Math.min(i, 8) * 0.05}s ease` }}>
                        <div style={{
                          fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.08em",
                          textTransform: "uppercase", color: MUTED, marginBottom: 10,
                        }}>
                          {(app.project_type || "").toUpperCase()} · {app.project_name}
                        </div>

                        <div
                          onClick={() => setSelectedApplicant(a)}
                          style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: app.role || a.about ? 12 : 14, cursor: "pointer" }}
                        >
                          <AvatarEl name={name} size={44} photoUrl={a.photo_url} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {name}
                            </div>
                            {(age || gender) && (
                              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: MUTED, marginTop: 3 }}>
                                {[age, gender].filter(Boolean).join(" · ")}
                              </div>
                            )}
                          </div>
                          <Icon name="chevron_right" size={15} color={MUTED} />
                        </div>

                        {app.role && (
                          <div style={{ marginBottom: a.about ? 10 : 14 }}>
                            <span className="chip active">{app.role}</span>
                          </div>
                        )}

                        {a.about && (
                          <p style={{ fontSize: 13, color: MUTED_STRONG, lineHeight: 1.55, marginBottom: 14 }}>
                            {a.about.slice(0, 140)}{a.about.length > 140 ? "…" : ""}
                          </p>
                        )}

                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            onClick={() => handleReview(app.project_id, app.id, "accept")}
                            disabled={busy}
                            style={{
                              flex: 1, background: "rgba(127,176,105,0.15)", border: "1px solid rgba(127,176,105,0.35)",
                              borderRadius: "var(--radius-pill)", padding: "11px", cursor: busy ? "default" : "pointer",
                              color: "var(--green)", fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 13,
                              opacity: busy ? 0.6 : 1,
                            }}>
                            {t("board.accept")}
                          </button>
                          <button
                            onClick={() => handleReview(app.project_id, app.id, "decline")}
                            disabled={busy}
                            style={{
                              flex: 1, background: "rgba(192,86,59,0.1)", border: "1px solid rgba(192,86,59,0.3)",
                              borderRadius: "var(--radius-pill)", padding: "11px", cursor: busy ? "default" : "pointer",
                              color: "var(--terra)", fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 13,
                              opacity: busy ? 0.6 : 1,
                            }}>
                            {t("board.decline")}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            )}
          </div>
        </div>
      </div>

      {/* Manage a project (roles, updates, chat link, founder stats) */}
      {selected && (
        <ProjectDetail
          project={selected}
          me={me}
          onClose={() => setSelected(null)}
          onUpdate={handleMineUpdate}
        />
      )}

      {/* Applicant profile */}
      {selectedApplicant && (
        <UserProfileModal user={selectedApplicant} onClose={() => setSelectedApplicant(null)} />
      )}

      {/* Edit a project — pre-filled ProjectForm in PATCH mode */}
      {editing && (
        <OverlayShell title={t("manage.editTitle")} onClose={() => setEditing(null)}>
          <ProjectForm
            project={editing}
            onSuccess={() => {
              setEditing(null);
              showToast(t("manage.updated"));
              loadMine();
              onChanged?.();
            }}
          />
        </OverlayShell>
      )}

      {/* Manage team — set member roles + remove members */}
      {teamFor && (
        <TeamManager
          project={teamFor}
          onClose={() => setTeamFor(null)}
          onMembersChanged={() => loadMine()}
        />
      )}

      <Toast toast={toast} />
    </>
  );
};
