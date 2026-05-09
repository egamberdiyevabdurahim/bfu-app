import { useState, useEffect } from "react";
import { Page } from "../components/Shared";
import { Icon } from "../components/Icons";
import { projects, users } from "../api";
import { ProjectForm } from "../components/ProjectForm";
import { ProjectDetail } from "../components/ProjectDetail";
import { UserProfileModal } from "../components/UserProfileModal";

const PAGE_SIZE = 10;

const FitBadge = ({ isFit }) => (
  <span style={{
    display: "inline-flex", alignItems: "center", gap: 4,
    background: isFit ? "rgba(78,205,196,0.15)" : "rgba(255,99,99,0.12)",
    color: isFit ? "#4ECDC4" : "#FF6363",
    border: `1px solid ${isFit ? "rgba(78,205,196,0.3)" : "rgba(255,99,99,0.25)"}`,
    borderRadius: 99, padding: "3px 9px", fontSize: 11, fontWeight: 700, flexShrink: 0,
  }}>
    {isFit ? "✓ Fit" : "✗ Not Fit"}
  </span>
);

const ApplyStatusTag = ({ status }) => {
  if (!status) return null;
  const map = {
    pending:  { bg: "rgba(255,179,71,0.15)",  color: "#FFB347", label: "⏳ Pending"  },
    accepted: { bg: "rgba(78,205,196,0.15)",   color: "#4ECDC4", label: "✓ Accepted" },
    declined: { bg: "rgba(255,99,99,0.12)",    color: "#FF6363", label: "✗ Declined" },
  };
  const t = map[status];
  if (!t) return null;
  return (
    <span style={{
      display: "inline-block", background: t.bg, color: t.color,
      borderRadius: 99, padding: "3px 9px", fontSize: 11, fontWeight: 700,
    }}>{t.label}</span>
  );
};

export const VolunteerScreen = ({ deepLinkAppId }) => {
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

  // Modals
  const [selectedProject, setSelectedProject] = useState(null);
  const [selectedApplicant, setSelectedApplicant] = useState(null);

  useEffect(() => {
    users.me().then(setMe).catch(() => {});
  }, []);

  useEffect(() => {
    setList([]); setOffset(0); setHasMore(true);
    if (active === "browse") loadProjects(0, true);
    else if (active === "my volunteering") loadMine();
    else if (active === "requests") loadRequests();
  }, [active]);

  const loadProjects = async (off = 0, replace = false) => {
    if (off === 0) setLoading(true); else setLoadingMore(true);
    try {
      const res = await projects.list({ type: "volunteering", limit: PAGE_SIZE, offset: off });
      if (replace) setList(res); else setList(prev => [...prev, ...res]);
      setOffset(off + res.length);
      setHasMore(res.length === PAGE_SIZE);
    } catch (e) {
      alert("Failed to load projects: " + e.message);
    }
    setLoading(false); setLoadingMore(false);
  };

  const loadMine = async () => {
    setLoading(true);
    try { 
      const res = await projects.mine({ type: "volunteering" }); 
      setList(res); 
      setHasMore(false); 
    }
    catch (e) {
      alert("Failed to load your volunteering: " + e.message);
    }
    setLoading(false);
  };

  const loadRequests = async () => {
    setReqLoading(true);
    try { 
      const res = await projects.myRequests({ type: "volunteering" }); 
      setRequestsList(res); 
    }
    catch (e) {
      alert("Failed to load requests: " + e.message);
    }
    setReqLoading(false);
  };

  const handleReview = async (projectId, appId, action) => {
    try {
      await projects.reviewApplication(projectId, appId, action);
      await loadRequests();
    } catch (e) { alert(e.message); }
  };

  const handleProjectUpdate = (updated) => {
    setList(prev => prev.map(p => p.id === updated.id ? updated : p));
  };

  return (
    <Page>
      <div style={{ padding: "20px 20px 0" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <p style={{ color: "var(--text-3)", fontSize: 12, fontFamily: "var(--font-display)", fontWeight: 600, letterSpacing: "0.1em" }}>GIVE BACK</p>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800 }}>Volunteer</h1>
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
          {["browse", "my volunteering", "requests"].map(t => (
            <button key={t} onClick={() => setActive(t)} style={{
              flex: 1, background: active === t ? "var(--surface-3)" : "transparent",
              border: "none", borderRadius: 8, padding: "8px 4px",
              color: active === t ? "var(--text)" : "var(--text-3)",
              fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 12,
              cursor: "pointer", transition: "all 0.2s", textTransform: "capitalize", whiteSpace: "nowrap",
            }}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {active === "post" ? (
        <div style={{ padding: "0 20px" }}>
          <ProjectForm type="volunteering" onSuccess={() => { setActive("my volunteering"); loadMine(); }} />
        </div>

      ) : active === "requests" ? (
        <div style={{ padding: "0 20px", display: "flex", flexDirection: "column", gap: 12, paddingBottom: 100 }}>
          {reqLoading ? (
            <div style={{ textAlign: "center", padding: 40, color: "var(--text-3)" }}><Icon name="loader" size={24} /></div>
          ) : requestsList.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "var(--text-3)" }}>No pending requests for your projects.</div>
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
                    🔔 NEW — You were notified about this request
                  </div>
                )}
                <div style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 600, letterSpacing: "0.08em", marginBottom: 4 }}>
                  {app.project_type.toUpperCase()} · {app.project_name}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: "50%",
                    background: "rgba(78,205,196,0.15)", border: "2px solid rgba(78,205,196,0.4)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 16, flexShrink: 0, color: "#4ECDC4",
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
                    View Profile
                  </button>
                  <button onClick={() => handleReview(app.project_id, app.id, "accept")} style={{
                    flex: 1, background: "rgba(78,205,196,0.15)", border: "1px solid rgba(78,205,196,0.3)",
                    borderRadius: "var(--radius-sm)", padding: "10px", cursor: "pointer",
                    color: "#4ECDC4", fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 13,
                  }}>
                    ✓ Accept
                  </button>
                  <button onClick={() => handleReview(app.project_id, app.id, "decline")} style={{
                    flex: 1, background: "rgba(255,99,99,0.1)", border: "1px solid rgba(255,99,99,0.25)",
                    borderRadius: "var(--radius-sm)", padding: "10px", cursor: "pointer",
                    color: "#FF6363", fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 13,
                  }}>
                    ✗ Decline
                  </button>
                </div>
              </div>
            );
          })}
        </div>

      ) : (
        <div style={{ padding: "0 20px", display: "flex", flexDirection: "column", gap: 12, paddingBottom: 100 }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: 40, color: "var(--text-3)" }}><Icon name="loader" size={24} /></div>
          ) : list.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "var(--text-3)" }}>
              {active === "my volunteering" ? "You haven't joined any volunteering projects yet." : "No volunteering projects found."}
            </div>
          ) : list.map((v, i) => (
            <div key={v.id} className="card" style={{ animation: `fadeUp ${0.1 + i * 0.05}s ease`, cursor: "pointer" }}
              onClick={() => setSelectedProject(v)}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ background: "rgba(123,111,255,0.15)", color: "#7B6FFF", borderRadius: 6, padding: "3px 8px", fontSize: 11, fontWeight: 600 }}>volunteering</span>
                {active === "browse" && (
                  v.my_application_status ? <ApplyStatusTag status={v.my_application_status} /> : <FitBadge isFit={v.is_fit} />
                )}
              </div>
              <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16, marginBottom: 2 }}>{v.name}</h3>
              <p style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.6, marginBottom: 12 }}>{v.goal || v.about}</p>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: v.is_member ? 12 : 0 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 12, color: "var(--text-3)" }}>
                  <Icon name="users" size={12} /> {v.member_count} volunteer{v.member_count !== 1 ? "s" : ""}
                </span>
                {v.req_regions?.length > 0 && <span className="tag">📍 {v.req_regions.length} regions</span>}
                {v.req_skills?.length > 0 && <span className="tag">💻 {v.req_skills.length} skills</span>}
                {v.age_from && v.age_to && <span className="tag">🎂 {v.age_from}–{v.age_to}</span>}
              </div>

              {v.is_member && active === "browse" && (
                <div style={{
                  width: "100%", background: "var(--accent-dim)", border: "1px solid var(--accent)",
                  borderRadius: "var(--radius-sm)", padding: "10px", textAlign: "center",
                  color: "var(--accent)", fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 13,
                }}>✓ You're a volunteer</div>
              )}
            </div>
          ))}

          {!loading && hasMore && active === "browse" && (
            <button onClick={() => loadProjects(offset)} disabled={loadingMore} style={{
              width: "100%", background: "var(--surface-2)", border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)", padding: "12px", cursor: "pointer",
              color: "var(--text-2)", fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 13, marginBottom: 20,
            }}>
              {loadingMore ? "Loading..." : "Load More"}
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
