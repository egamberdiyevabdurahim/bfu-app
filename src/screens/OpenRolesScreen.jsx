import { useState, useEffect, useRef } from "react";
import { Page, SkeletonList } from "../components/Shared";
import { Icon } from "../components/Icons";
import { roles, projects, users } from "../api";
import { ProjectDetail } from "../components/ProjectDetail";
import { useT } from "../i18n";
import { tgAlert } from "../tg";

const TYPE_ICON = { startup: "🚀", volunteering: "🤝" };

export const OpenRolesScreen = ({ onBack }) => {
  const { t } = useT();
  const [q, setQ] = useState("");
  const [list, setList] = useState(null);
  const [me, setMe] = useState(null);
  const [openProject, setOpenProject] = useState(null);
  const [prefillRole, setPrefillRole] = useState("");
  const seq = useRef(0);

  useEffect(() => { users.me().then(setMe).catch(() => {}); }, []);

  useEffect(() => {
    const my = ++seq.current;
    const h = setTimeout(() => {
      roles.list(q.trim() || undefined)
        .then(r => { if (seq.current === my) setList(r.roles || []); })
        .catch(() => { if (seq.current === my) setList([]); });
    }, 250);   // debounce
    return () => clearTimeout(h);
  }, [q]);

  const openRole = async (r) => {
    setPrefillRole(r.name);
    try {
      const project = await projects.get(r.project.id);
      setOpenProject(project);
    } catch (e) { tgAlert(e.message); }
  };

  return (
    <Page>
      <div style={{ padding: "calc(var(--safe-t) + 16px) 20px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          {onBack && (
            <button onClick={onBack} style={{ background: "var(--surface-2)", border: "none",
              borderRadius: 99, width: 34, height: 34, cursor: "pointer", color: "var(--text-2)" }}>
              <Icon name="arrow_left" size={16} />
            </button>
          )}
          <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 22 }}>{t("roles.title")}</h1>
        </div>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder={t("roles.searchPh")}
          style={{ width: "100%", boxSizing: "border-box", padding: "11px 14px", background: "var(--surface-2)",
            border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
            color: "var(--text)", fontSize: 14, marginBottom: 16 }} />
      </div>

      <div style={{ padding: "0 20px 32px" }}>
        {list === null ? (
          <SkeletonList />
        ) : list.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "var(--text-3)" }}>{t("roles.none")}</div>
        ) : list.map(r => (
          <button key={r.id} onClick={() => openRole(r)}
            style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, textAlign: "left",
              background: "var(--surface-2)", border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)", padding: "12px 14px", cursor: "pointer", marginBottom: 8 }}>
            <span style={{ fontSize: 18 }}>{TYPE_ICON[r.project.type] || "•"}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>{r.name}</div>
              <div style={{ fontSize: 12, color: "var(--text-3)" }}>{t("roles.inProject", { project: r.project.name })}</div>
            </div>
            <Icon name="arrow_right" size={16} />
          </button>
        ))}
      </div>

      {openProject && (
        <ProjectDetail
          project={openProject}
          me={me}
          prefillRole={prefillRole}
          onClose={() => setOpenProject(null)}
          onUpdate={setOpenProject}
        />
      )}
    </Page>
  );
};
