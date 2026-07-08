import { useState, useEffect, useRef } from "react";
import { Page, SkeletonList } from "../components/Shared";
import { Icon } from "../components/Icons";
import { projects, users } from "../api";
import { ProjectDetail } from "../components/ProjectDetail";
import { ProjectManageSheet } from "../components/ProjectManageSheet";
import { useT } from "../i18n";
import { tgAlert } from "../tg";

const PAGE_SIZE = 10;

// Firelit type badge — mirrors the desktop ProjectBrowseCard type badge
// (Startup = amber, Volunteering = teal-green). Reuses the existing localized
// discover.badge.* strings.
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
        background: isStartup ? "rgba(232,161,92,0.14)" : "rgba(94,197,182,0.14)",
        color: isStartup ? "var(--amber)" : "var(--teal-bright)",
        border: `1px solid ${isStartup ? "rgba(232,161,92,0.32)" : "rgba(94,197,182,0.32)"}`,
      }}
    >
      {isStartup ? t("discover.badge.startup") : t("discover.badge.volunteer")}
    </span>
  );
};

// Browse-card corner marker: the applicant's own status if they've applied,
// otherwise the fit signal — preserving the old Mini App browse semantics,
// reskinned to firelit tokens.
const CardMark = ({ project }) => {
  const { t } = useT();
  const s = project.my_application_status;
  if (s) {
    const map = {
      pending:  { bg: "rgba(232,161,92,0.15)", color: "var(--amber)",       bd: "rgba(232,161,92,0.32)", label: t("status.pending") },
      accepted: { bg: "rgba(127,176,105,0.15)", color: "var(--green)",       bd: "rgba(127,176,105,0.32)", label: t("status.accepted") },
      declined: { bg: "rgba(255,106,61,0.12)", color: "var(--ember)",        bd: "rgba(255,106,61,0.30)", label: t("status.declined") },
    };
    const cfg = map[s];
    if (!cfg) return null;
    return (
      <span style={{
        display: "inline-flex", alignItems: "center", borderRadius: "var(--radius-pill)",
        padding: "4px 10px", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap",
        background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.bd}`,
      }}>{cfg.label}</span>
    );
  }
  const isFit = project.is_fit;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4, borderRadius: "var(--radius-pill)",
      padding: "4px 10px", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap",
      background: isFit ? "rgba(127,176,105,0.15)" : "rgba(192,86,59,0.12)",
      color: isFit ? "var(--green)" : "var(--terra)",
      border: `1px solid ${isFit ? "rgba(127,176,105,0.30)" : "rgba(192,86,59,0.28)"}`,
    }}>{isFit ? t("badge.fit") : t("badge.notFit")}</span>
  );
};

// The firelit project window — built from Chorsu tokens, mirroring the desktop
// ProjectBrowseCard layout (type badge + marks, Bricolage name, Instrument-Serif
// italic goal, mono skill pills, member/region footer) with the fields the slim
// list payload exposes.
const ProjectCard = ({ p, index, onOpen }) => {
  const { t } = useT();
  const topSkills = (p.req_skills || []).slice(0, 3);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(p)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(p); } }}
      className="card"
      style={{
        cursor: "pointer", position: "relative",
        animation: `fadeUp ${0.1 + Math.min(index, 8) * 0.05}s ease`,
        transition: "border-color 0.2s ease, transform 0.15s ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <TypeBadge type={p.type} />
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {p.is_pinned && (
            <span style={{
              display: "inline-flex", alignItems: "center", borderRadius: "var(--radius-pill)",
              padding: "4px 10px", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap",
              background: "rgba(232,161,92,0.12)", color: "var(--amber)", border: "1px solid rgba(232,161,92,0.28)",
            }}>{t("badge.pinned")}</span>
          )}
          <CardMark project={p} />
        </div>
      </div>

      <h3 style={{
        fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 17,
        letterSpacing: "-0.01em", color: "var(--text)", marginBottom: 4, lineHeight: 1.15,
      }}>{p.name}</h3>

      {(p.goal || p.about) && (
        <p style={{
          fontFamily: "var(--font-accent)", fontStyle: "italic", fontSize: 15.5,
          color: "var(--text-2)", lineHeight: 1.3,
          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
        }}>{p.goal || p.about}</p>
      )}

      {topSkills.length > 0 && (
        <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 6 }}>
          {topSkills.map((s, i) => (
            <span key={`${s.skill_name}-${i}`} style={{
              fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.04em",
              padding: "5px 9px", borderRadius: "var(--radius-pill)",
              background: "var(--surface-2)", border: "1px solid var(--hair)", color: "var(--text-3)",
            }}>{s.skill_name}</span>
          ))}
        </div>
      )}

      <div style={{
        marginTop: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
        fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: "0.06em", color: "var(--text-3)",
      }}>
        <span>{t("board.membersN", { n: p.member_count ?? 0 })}</span>
        {p.age_from && p.age_to
          ? <span style={{ whiteSpace: "nowrap" }}>🎂 {p.age_from}–{p.age_to}</span>
          : (p.req_regions?.length > 0 && <span style={{ whiteSpace: "nowrap" }}>{t("board.regionsN", { n: p.req_regions.length })}</span>)}
      </div>

      {p.is_member && (
        <div style={{
          marginTop: 12, textAlign: "center", padding: "8px 10px",
          background: "var(--accent-dim)", border: "1px solid rgba(232,161,92,0.4)",
          borderRadius: "var(--radius-sm)", color: "var(--amber)",
          fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 12.5,
        }}>{t("board.youreMember")}</div>
      )}
    </div>
  );
};

// Screen: unified Projects browse — combines startups + volunteering into one
// list with a type filter (All / Startups / Volunteering), mirroring the desktop
// /projects surface (ProjectsHeader + ProjectFilterBar + ProjectBrowseCard).
// Tapping a card opens <ProjectDetail>, which owns the full apply flow.
export const ProjectsScreen = ({ deepLinkAppId } = {}) => {
  const { t } = useT();

  // Type filter: "all" | "startup" | "volunteering"
  const [filter, setFilter] = useState("all");
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [me, setMe] = useState(null);
  const [selectedProject, setSelectedProject] = useState(null);
  const [manageOpen, setManageOpen] = useState(false);

  useEffect(() => {
    users.me().then(setMe).catch(() => {});
  }, []);

  // Bumped on every filter change; a slow response is ignored if a newer load
  // has started, so it can't overwrite the now-active filter's list.
  const loadSeq = useRef(0);

  useEffect(() => {
    const seq = ++loadSeq.current;
    setList([]); setOffset(0); setHasMore(true);
    loadProjects(0, true, seq);
  }, [filter]);

  const paramsFor = (off) => {
    const p = { limit: PAGE_SIZE, offset: off };
    if (filter === "startup") p.type = "startup";
    else if (filter === "volunteering") p.type = "volunteering";
    return p;
  };

  const loadProjects = async (off = 0, replace = false, seq = loadSeq.current) => {
    if (off === 0) { setLoading(true); setLoadError(false); } else setLoadingMore(true);
    try {
      const res = await projects.list(paramsFor(off));
      if (loadSeq.current !== seq) return;
      setList(prev => (replace ? res : [...prev, ...res]));
      setOffset(off + res.length);
      setHasMore(res.length === PAGE_SIZE);
    } catch (e) {
      if (loadSeq.current === seq) {
        if (off === 0) setLoadError(true);
        else tgAlert(t("board.loadFailed", { msg: e.message }));
      }
    }
    if (loadSeq.current === seq) { setLoading(false); setLoadingMore(false); }
  };

  // Keep a tapped-through card in sync when the detail sheet mutates it (apply,
  // withdraw, leave, favorite).
  const handleProjectUpdate = (updated) => {
    setList(prev => prev.map(p => (p.id === updated.id ? { ...p, ...updated } : p)));
    setSelectedProject(prev => (prev && prev.id === updated.id ? { ...prev, ...updated } : prev));
  };

  const FILTERS = [
    { key: "all",          label: t("filter.all") },
    { key: "startup",      label: t("nav.startups") },
    { key: "volunteering", label: t("nav.volunteer") },
  ];

  const emptyMsg =
    filter === "startup" ? t("board.empty.startups")
    : filter === "volunteering" ? t("board.empty.volunteering")
    : t("profile.noProjects");

  return (
    <Page>
      <div style={{ padding: "calc(var(--safe-t) + 18px) 20px 0" }}>
        {/* Header — mono eyebrow + Bricolage headline + Instrument-Serif italic sub,
            with the founder-tools "+" pinned top-right, aligned with the title. */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="ch-eyebrow" style={{ color: "var(--amber)" }}>{t("startup.kicker")}</p>
            <h1 className="ch-h1" style={{ fontSize: 34 }}>{t("search.projects")}</h1>
            <p className="ch-sub" style={{ color: "var(--text-3)", fontSize: 17, marginTop: 8 }}>
              {t("land.f1.body")}
            </p>
          </div>
          <button
            onClick={() => setManageOpen(true)}
            aria-label={t("manage.title")}
            style={{
              flexShrink: 0, marginTop: 2, width: 40, height: 40, borderRadius: "50%",
              background: "var(--surface-2)", border: "1px solid var(--hair)",
              display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
            }}
          >
            <Icon name="plus" size={20} color="var(--amber)" />
          </button>
        </div>

        {/* Type filter row — single-select firelit pills (desktop ProjectFilterBar) */}
        <div role="tablist" style={{ display: "flex", gap: 8, marginTop: 20, marginBottom: 20, flexWrap: "wrap" }}>
          {FILTERS.map(f => {
            const on = filter === f.key;
            return (
              <button
                key={f.key}
                role="tab"
                aria-selected={on}
                onClick={() => setFilter(f.key)}
                style={{
                  padding: "9px 16px", borderRadius: "var(--radius-pill)", cursor: "pointer",
                  fontFamily: "var(--font-mono)", fontSize: 11.5, letterSpacing: "0.06em",
                  textTransform: "uppercase", whiteSpace: "nowrap", transition: "all 0.18s ease",
                  border: on ? "1px solid rgba(232,161,92,0.5)" : "1px solid var(--hair)",
                  background: on
                    ? "linear-gradient(135deg, rgba(232,161,92,0.16), rgba(192,86,59,0.12))"
                    : "transparent",
                  color: on ? "var(--amber)" : "var(--text-3)",
                }}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ padding: "0 20px 100px", display: "flex", flexDirection: "column", gap: 14 }}>
        {loading ? (
          <SkeletonList count={5} />
        ) : loadError ? (
          <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--text-3)" }}>
            <div style={{ marginBottom: 14 }}>{t("common.loadError")}</div>
            <button onClick={() => loadProjects(0, true)} className="btn-ghost" style={{ width: "auto" }}>
              {t("common.retry")}
            </button>
          </div>
        ) : list.length === 0 ? (
          <div style={{
            textAlign: "center", padding: "52px 24px",
            fontFamily: "var(--font-accent)", fontStyle: "italic", fontSize: 19, color: "var(--text-3)",
          }}>{emptyMsg}</div>
        ) : (
          <>
            {list.map((p, i) => (
              <ProjectCard key={p.id} p={p} index={i} onOpen={setSelectedProject} />
            ))}
            {hasMore && (
              <button
                onClick={() => loadProjects(offset)}
                disabled={loadingMore}
                className="btn-ghost"
                style={{ width: "100%", marginTop: 2 }}
              >
                {loadingMore ? t("common.loadingMore") : t("common.loadMore")}
              </button>
            )}
          </>
        )}
      </div>

      {selectedProject && (
        <ProjectDetail
          project={selectedProject}
          me={me}
          onClose={() => setSelectedProject(null)}
          onUpdate={handleProjectUpdate}
        />
      )}

      {manageOpen && (
        <ProjectManageSheet
          me={me}
          onClose={() => setManageOpen(false)}
          onChanged={() => loadProjects(0, true)}
        />
      )}
    </Page>
  );
};
