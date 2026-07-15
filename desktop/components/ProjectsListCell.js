"use client";

import { useT } from "@/components/i18n/LocaleProvider";

// Founded / Member-of project lists — the desktop twin of the Mini App
// UserProfileModal's project section. Each row is a link to the public project
// page.
//
// ⚠ /web basePath: /p/{id} is an INTERNAL route. Next only auto-prefixes
// basePath onto <Link> and router navigations — a plain <a href> is NOT
// rewritten. So the "/web" is written explicitly here, matching how
// ProjectBrowseCard and BuilderCard link their cards. Omitted entirely when the
// builder has neither founded nor joined a project.
function emojiFor(type) {
  return type === "startup" ? "🚀" : type === "volunteering" ? "🤝" : "•";
}

function ProjectRow({ project, activeLabel, closedLabel }) {
  const active = !!project.is_active;
  return (
    <a
      href={`/web/p/${project.id}`}
      style={{
        display: "flex", alignItems: "center", gap: 12, textDecoration: "none",
        background: "var(--surface-2)", border: "1px solid var(--hair)",
        borderRadius: "var(--radius-sm)", padding: "10px 14px", color: "var(--text)",
      }}
    >
      <span style={{ fontSize: 16 }} aria-hidden>{emojiFor(project.type)}</span>
      <span
        style={{
          flex: 1, minWidth: 0, fontSize: 15, fontWeight: 600,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}
      >
        {project.name}
      </span>
      <span
        style={{
          fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600,
          padding: "3px 10px", borderRadius: "var(--radius-pill)",
          background: active ? "rgba(127,176,105,0.15)" : "var(--hair)",
          color: active ? "var(--green)" : "var(--muted-strong)",
        }}
      >
        {active ? activeLabel : closedLabel}
      </span>
    </a>
  );
}

export default function ProjectsListCell({ founded, member }) {
  const t = useT();
  const foundedList = founded || [];
  const memberList = member || [];
  if (foundedList.length === 0 && memberList.length === 0) return null;

  const activeLabel = t("profile.active");
  const closedLabel = t("profile.closed");

  return (
    <div
      className="ch-cell-static"
      style={{ gridColumn: "span 2", display: "flex", flexDirection: "column", gap: 22 }}
    >
      {foundedList.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="ch-cell-label">{t("profile.founded")}</div>
          {foundedList.map((p) => (
            <ProjectRow key={p.id} project={p} activeLabel={activeLabel} closedLabel={closedLabel} />
          ))}
        </div>
      )}
      {memberList.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="ch-cell-label">{t("profile.member_of")}</div>
          {memberList.map((p) => (
            <ProjectRow key={p.id} project={p} activeLabel={activeLabel} closedLabel={closedLabel} />
          ))}
        </div>
      )}
    </div>
  );
}
