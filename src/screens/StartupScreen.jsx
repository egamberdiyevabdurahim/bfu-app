import { useState, useEffect, useRef } from "react";
import { Page, SkeletonList } from "../components/Shared";
import { Icon } from "../components/Icons";
import { projects, users } from "../api";
import { ProjectForm } from "../components/ProjectForm";
import { ProjectDetail } from "../components/ProjectDetail";
import { UserProfileModal } from "../components/UserProfileModal";
import { FounderFunnel } from "../components/FounderFunnel";
import { useT } from "../i18n";
import { tgAlert, tgConfirm } from "../tg";

const PAGE_SIZE = 10;

const FitBadge = ({ isFit }) => {
  const { t } = useT();
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      background: isFit ? "rgba(78,205,196,0.15)" : "rgba(255,99,99,0.12)",
      color: isFit ? "#4ECDC4" : "#FF6363",
      border: `1px solid ${isFit ? "rgba(78,205,196,0.3)" : "rgba(255,99,99,0.25)"}`,
      borderRadius: 99, padding: "3px 9px", fontSize: 11, fontWeight: 700, flexShrink: 0,
    }}>
      {isFit ? t("badge.fit") : t("badge.notFit")}
    </span>
  );
};

const ApplyStatusTag = ({ status }) => {
  const { t } = useT();
  if (!status) return null;
  const map = {
    pending:  { bg: "rgba(255,179,71,0.15)",  color: "#FFB347", label: t("status.pending")  },
    accepted: { bg: "rgba(78,205,196,0.15)",   color: "#4ECDC4", label: t("status.accepted") },
    declined: { bg: "rgba(255,99,99,0.12)",    color: "#FF6363", label: t("status.declined") },
  };
  const cfg = map[status];
  if (!cfg) return null;
  return (
    <span style={{
      display: "inline-block", background: cfg.bg, color: cfg.color,
      borderRadius: 99, padding: "3px 9px", fontSize: 11, fontWeight: 700,
    }}>{cfg.label}</span>
  );
};

export const StartupScreen = ({ deepLinkAppId }) => {
  const { t } = useT();
  const [active, setActive] = useState(deepLinkAppId ? "requests" : "browse");
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [me, setMe] = useState(null);

  // Requests tab
  const [requestsList, setRequestsList] = useState([]);
  const [reqLoading, setReqLoading] = useState(false);
  const [highlightedAppId] = useState(deepLinkAppId ? Number(deepLinkAppId) : null);

  // Founder funnel (my startups tab)
  const [showFunnel, setShowFunnel] = useState(false);

  // Modals
  const [selectedProject, setSelectedProject] = useState(null);
  const [selectedApplicant, setSelectedApplicant] = useState(null);

  useEffect(() => {
    users.me().then(setMe).catch(() => {});
  }, []);

  // Bumped on every tab switch; loaders ignore their result if a newer load
  // started, so a slow response can't overwrite the now-active tab's list.
  const loadSeq = useRef(0);

  useEffect(() => {
    const seq = ++loadSeq.current;
    setList([]); setOffset(0); setHasMore(true);
    if (active === "browse") loadProjects(0, true, seq);
    else if (active === "my startups") loadMine(seq);
    else if (active === "requests") loadRequests(seq);
  }, [active]);

  const loadProjects = async (off = 0, replace = false, seq = loadSeq.current) => {
    if (off === 0) setLoading(true); else setLoadingMore(true);
    try {
      const res = await projects.list({ type: "startup", limit: PAGE_SIZE, offset: off });
      if (loadSeq.current !== seq) return;
      if (replace) setList(res); else setList(prev => [...prev, ...res]);
      setOffset(off + res.length);
      setHasMore(res.length === PAGE_SIZE);
    } catch (e) {
      if (loadSeq.current === seq) tgAlert(t("board.loadFailed", { msg: e.message }));
    }
    if (loadSeq.current === seq) { setLoading(false); setLoadingMore(false); }
  };

  const loadMine = async (seq = loadSeq.current) => {
    setLoading(true);
    try {
      const res = await projects.mine({ type: "startup" });
      if (loadSeq.current !== seq) return;
      setList(res);
      setHasMore(false);
    }
    catch (e) {
      if (loadSeq.current === seq) tgAlert(t("board.loadFailed", { msg: e.message }));
    }
    if (loadSeq.current === seq) setLoading(false);
  };

  const loadRequests = async (seq = loadSeq.current) => {
    setReqLoading(true);
    try {
      const res = await projects.myRequests({ type: "startup" });
      if (loadSeq.current !== seq) return;
      setRequestsList(res);
    }
    catch (e) {
      if (loadSeq.current === seq) tgAlert(t("board.loadFailed", { msg: e.message }));
    }
    if (loadSeq.current === seq) setReqLoading(false);
  };

  const handleReview = async (projectId, appId, action) => {
    try {
      await projects.reviewApplication(projectId, appId, action);
      await loadRequests();
    } catch (e) { tgAlert(e.message); }
  };

  const handleProjectUpdate = (updated) => {
    setList(prev => prev.map(p => p.id === updated.id ? updated : p));
  };

  const showApplyBtn = (s) => active === "browse" && s.is_hiring && !s.is_member && me && s.creator_id !== me.id && !s.my_application_status;

  return (
    <Page>
      <div style={{ padding: "calc(var(--safe-t) + 16px) 20px 0" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <p style={{ color: "var(--text-3)", fontSize: 12, fontFamily: "var(--font-display)", fontWeight: 600, letterSpacing: "0.1em" }}>{t("startup.kicker")}</p>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800 }}>{t("startup.title")}</h1>
          </div>
          <button onClick={() => setActive(a => a === "post" ? "browse" : "post")}
            style={{
              background: "var(--accent)", border: "none", borderRadius: 10,
              width: 38, height: 38, display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", color: "#fff",
            }}>
            <Icon name={active === "post" ? "x" : "plus"} size={18} />
          </button>
        </div>

        <div style={{ display: "flex", background: "var(--surface-2)", borderRadius: "var(--radius-sm)", padding: 3, marginBottom: 20, gap: 2 }}>
          {[["browse","board.tab.browse"], ["my startups","board.tab.myStartups"], ["requests","board.tab.requests"]].map(([tab, key]) => (
            <button key={tab} onClick={() => setActive(tab)} style={{
              flex: 1, background: active === tab ? "var(--surface-3)" : "transparent",
              border: "none", borderRadius: 8, padding: "8px 4px",
              color: active === tab ? "var(--text)" : "var(--text-3)",
              fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 12,
              cursor: "pointer", transition: "all 0.2s", whiteSpace: "nowrap",
            }}>
              {t(key)}
            </button>
          ))}
        </div>
      </div>

      {active === "post" ? (
        <div style={{ padding: "0 20px" }}>
          <ProjectForm type="startup" onSuccess={() => { setActive("my startups"); loadMine(); }} />
        </div>

      ) : active === "requests" ? (
        <div style={{ padding: "0 20px", display: "flex", flexDirection: "column", gap: 12, paddingBottom: 100 }}>
          {reqLoading ? (
            <SkeletonList count={4} />
          ) : requestsList.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "var(--text-3)" }}>{t("board.empty.reqStartups")}</div>
          ) : requestsList.map(app => {
            const isHighlighted = highlightedAppId && app.id === highlightedAppId;
            return (
              <div key={app.id} className="card" style={{
                border: isHighlighted ? "2px solid var(--accent)" : "1px solid var(--border)",
                boxShadow: isHighlighted ? "0 0 20px rgba(123,111,255,0.3)" : undefined,
                animation: isHighlighted ? "pulse 2s ease 0.5s" : undefined,
              }}>
                {isHighlighted && (
                  <div style={{ fontSize: 11, color: "var(--accent)", fontWeight: 700, marginBottom: 8, letterSpacing: "0.08em" }}>
                    {t("board.newNotified")}
                  </div>
                )}
                <div style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 600, letterSpacing: "0.08em", marginBottom: 4 }}>
                  {app.project_type.toUpperCase()} · {app.project_name}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: "50%",
                    background: "var(--accent-dim)", border: "2px solid var(--accent)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 16, flexShrink: 0,
                  }}>
                    {app.applicant.display_name[0]?.toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15 }}>
                      {app.applicant.display_name}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-3)" }}>
                      {app.applicant.birth_year ? `${new Date().getFullYear() - app.applicant.birth_year} y/o` : ""}
                      {app.applicant.gender && app.applicant.gender !== "Prefer not to say" ? ` · ${app.applicant.gender}` : ""}
                    </div>
                  </div>
                </div>

                {app.applicant.about && (
                  <p style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.6, marginBottom: 12 }}>
                    {app.applicant.about.slice(0, 120)}{app.applicant.about.length > 120 ? "..." : ""}
                  </p>
                )}

                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => setSelectedApplicant(app.applicant)} style={{
                    flex: 1, background: "var(--surface-2)", border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)", padding: "10px", cursor: "pointer",
                    color: "var(--text-2)", fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 13,
                  }}>
                    {t("common.viewProfile")}
                  </button>
                  <button onClick={() => handleReview(app.project_id, app.id, "accept")} style={{
                    flex: 1, background: "rgba(78,205,196,0.15)", border: "1px solid rgba(78,205,196,0.3)",
                    borderRadius: "var(--radius-sm)", padding: "10px", cursor: "pointer",
                    color: "#4ECDC4", fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 13,
                  }}>
                    {t("board.accept")}
                  </button>
                  <button onClick={() => handleReview(app.project_id, app.id, "decline")} style={{
                    flex: 1, background: "rgba(255,99,99,0.1)", border: "1px solid rgba(255,99,99,0.25)",
                    borderRadius: "var(--radius-sm)", padding: "10px", cursor: "pointer",
                    color: "#FF6363", fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 13,
                  }}>
                    {t("board.decline")}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

      ) : (
        <div style={{ padding: "0 20px", display: "flex", flexDirection: "column", gap: 12, paddingBottom: 100 }}>
          {active === "my startups" && (
            <>
              <button onClick={() => setShowFunnel(v => !v)} style={{
                width: "100%", padding: "10px 14px", textAlign: "left",
                background: "var(--surface-2)", border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)", color: "var(--accent)", fontWeight: 700,
                fontSize: 13, cursor: "pointer", display: "flex", justifyContent: "space-between",
              }}>
                <span>📊 {t("funnel.title")}</span>
                <span style={{ color: "var(--text-3)" }}>{showFunnel ? "−" : "+"}</span>
              </button>
              {showFunnel && (
                <div style={{ marginBottom: 4 }}>
                  <FounderFunnel />
                </div>
              )}
            </>
          )}
          {loading ? (
            <SkeletonList count={4} />
          ) : list.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "var(--text-3)" }}>
              {active === "my startups" ? t("board.empty.myStartups") : t("board.empty.startups")}
            </div>
          ) : list.map((s, i) => (
            <div key={s.id} className="card" style={{ animation: `fadeUp ${0.1 + i * 0.05}s ease`, cursor: "pointer" }}
              onClick={() => setSelectedProject(s)}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ background: "rgba(123,111,255,0.15)", color: "#7B6FFF", borderRadius: 6, padding: "3px 8px", fontSize: 11, fontWeight: 600 }}>startup</span>
                {active === "browse" && (
                  s.my_application_status ? <ApplyStatusTag status={s.my_application_status} /> : <FitBadge isFit={s.is_fit} />
                )}
                {active === "my startups" && (
                  s.is_draft ? <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-2)", background: "var(--surface-3)", borderRadius: 99, padding: "3px 9px" }}>{t("badge.draft")}</span>
                  : !s.is_approved ? <span style={{ fontSize: 11, fontWeight: 700, color: "#FFB347", background: "rgba(255,179,71,0.12)", borderRadius: 99, padding: "3px 9px" }}>{t("badge.pending")}</span>
                  : null
                )}
                {active === "browse" && s.is_pinned && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", background: "var(--accent-dim)", borderRadius: 99, padding: "3px 9px", marginLeft: 6 }}>{t("badge.pinned")}</span>
                )}
              </div>
              <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16, marginBottom: 2 }}>{s.name}</h3>
              <p style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.6, marginBottom: 12 }}>{s.goal || s.about}</p>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: s.is_member || showApplyBtn(s) ? 12 : 0 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 12, color: "var(--text-3)" }}>
                  <Icon name="users" size={12} /> {t("board.membersN", { n: s.member_count })}
                </span>
                {s.req_regions?.length > 0 && <span className="tag">{t("board.regionsN", { n: s.req_regions.length })}</span>}
                {s.req_skills?.length > 0 && <span className="tag">{t("board.skillsN", { n: s.req_skills.length })}</span>}
                {s.age_from && s.age_to && <span className="tag">🎂 {s.age_from}–{s.age_to}</span>}
              </div>

              {active === "my startups" && (
                <div style={{ fontSize: 12, color: "#4ECDC4", fontWeight: 600, marginBottom: 4 }}>
                  {t("myproj.stats", { views: s.view_count || 0, pending: s.pending_applications_count || 0 })}
                </div>
              )}

              {s.is_member && active === "browse" && (
                <div style={{
                  width: "100%", background: "var(--accent-dim)", border: "1px solid var(--accent)",
                  borderRadius: "var(--radius-sm)", padding: "10px", textAlign: "center",
                  color: "var(--accent)", fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 13,
                }}>{t("board.youreMember")}</div>
              )}
            </div>
          ))}

          {!loading && hasMore && active === "browse" && (
            <button onClick={() => loadProjects(offset)} disabled={loadingMore} style={{
              width: "100%", background: "var(--surface-2)", border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)", padding: "12px", cursor: "pointer",
              color: "var(--text-2)", fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 13, marginBottom: 20,
            }}>
              {loadingMore ? t("common.loadingMore") : t("common.loadMore")}
            </button>
          )}
        </div>
      )}

      {selectedProject && (
        <ProjectDetail
          project={selectedProject}
          me={me}
          onClose={() => setSelectedProject(null)}
          onUpdate={handleProjectUpdate}
        />
      )}
      {selectedApplicant && (
        <UserProfileModal user={selectedApplicant} onClose={() => setSelectedApplicant(null)} />
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { box-shadow: 0 0 20px rgba(123,111,255,0.3); }
          50% { box-shadow: 0 0 40px rgba(123,111,255,0.6); }
        }
      `}</style>
    </Page>
  );
};
