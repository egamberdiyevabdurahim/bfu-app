import { useT } from "../i18n";

const TYPE_ICON = { startup: "🚀", volunteering: "🤝" };

function StatTile({ value, label }) {
  return (
    <div style={{ flex: 1, textAlign: "center", padding: "10px 4px",
      background: "var(--surface-2)", border: "1px solid var(--border)",
      borderRadius: "var(--radius-sm)" }}>
      <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 20, color: "var(--text)" }}>{value}</div>
      <div style={{ fontSize: 10, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 2 }}>{label}</div>
    </div>
  );
}

function ProjectRow({ p, onOpen }) {
  const { t } = useT();
  return (
    <button onClick={() => onOpen?.(p.id)} style={{
      width: "100%", display: "flex", alignItems: "center", gap: 10, textAlign: "left",
      background: "var(--surface-2)", border: "1px solid var(--border)",
      borderRadius: "var(--radius-sm)", padding: "10px 12px", cursor: "pointer", marginBottom: 6,
    }}>
      <span style={{ fontSize: 16 }}>{TYPE_ICON[p.type] || "•"}</span>
      <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, color: "var(--text)",
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</span>
      <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 99,
        background: p.is_active ? "rgba(78,205,196,0.15)" : "var(--surface-3)",
        color: p.is_active ? "#4ECDC4" : "var(--text-3)" }}>
        {p.is_active ? t("profile.active") : t("profile.closed")}
      </span>
    </button>
  );
}

export const ProfileExtras = ({ user, onOpenProject, onOpenProfile }) => {
  const { t } = useT();
  if (!user) return null;
  const founded = user.founded_projects || [];
  const member = user.member_projects || [];
  const stats = user.stats || {};
  const links = user.portfolio_links || [];
  const hasProjects = founded.length > 0 || member.length > 0;
  const rating = user.rating || { average: null, count: 0 };
  const mutual = user.mutual_connections || { count: 0, preview: [] };
  const collaborators = user.collaborators || { count: 0, preview: [] };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, marginTop: 4 }}>
      {/* Currently building */}
      {user.currently_building && (
        <div style={{ display: "flex", alignItems: "center", gap: 8,
          background: "var(--accent-dim)", border: "1px solid var(--accent)",
          borderRadius: "var(--radius-sm)", padding: "10px 12px" }}>
          <span style={{ fontSize: 15 }}>🔨</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 10, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>{t("profile.building")}</div>
            <div style={{ fontSize: 14, color: "var(--text)", fontWeight: 600 }}>{user.currently_building}</div>
          </div>
        </div>
      )}

      {/* Rating */}
      {rating.average != null && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 700, color: "var(--text)" }}>
          <span style={{ color: "#FFB347" }}>★ {rating.average}</span>
          <span style={{ color: "var(--text-3)", fontSize: 13, fontWeight: 500 }}>({rating.count})</span>
        </div>
      )}

      {/* Mutual connections */}
      {mutual.count > 0 && (
        <div>
          <div className="section-label">
            {mutual.count === 1 ? t("trust.mutualOne") : t("trust.mutual", { n: mutual.count })}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {mutual.preview.map(m => (
              <button key={m.id} onClick={() => onOpenProfile?.(m.id)} style={{
                display: "flex", alignItems: "center", gap: 6, background: "var(--surface-2)",
                border: "1px solid var(--border)", borderRadius: 99, padding: "4px 10px 4px 4px",
                cursor: "pointer", color: "var(--text)", fontSize: 12, fontWeight: 600,
              }}>
                <span style={{ width: 22, height: 22, borderRadius: "50%", background: "var(--accent-dim)",
                  color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 10, fontWeight: 800 }}>
                  {(m.display_name || "?").slice(0, 1).toUpperCase()}
                </span>
                {m.display_name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Frequent collaborators */}
      {collaborators.count > 0 && (
        <div>
          <div className="section-label">{t("collab.title")}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {collaborators.preview.map(c => (
              <button key={c.id} onClick={() => onOpenProfile?.(c.id)} style={{
                width: "100%", display: "flex", alignItems: "center", gap: 10, textAlign: "left",
                background: "var(--surface-2)", border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)", padding: "8px 12px", cursor: "pointer" }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", overflow: "hidden",
                  background: "var(--surface-3)", flexShrink: 0, display: "flex",
                  alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "var(--text-2)" }}>
                  {c.photo_url ? <img src={c.photo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : (c.display_name?.[0] || "?")}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)",
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.display_name}</div>
                  <div style={{ fontSize: 11, color: "var(--text-3)" }}>
                    {c.shared === 1 ? t("collab.sharedOne") : t("collab.shared", { n: c.shared })}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Stats */}
      <div style={{ display: "flex", gap: 8 }}>
        <StatTile value={stats.projects_founded ?? 0} label={t("profile.stat.founded")} />
        <StatTile value={stats.projects_joined ?? 0} label={t("profile.stat.joined")} />
        <StatTile value={stats.applications_accepted ?? 0} label={t("profile.stat.accepted")} />
      </div>

      {/* Projects */}
      {hasProjects ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {founded.length > 0 && (
            <div>
              <div className="section-label">{t("profile.founded")}</div>
              {founded.map(p => <ProjectRow key={p.id} p={p} onOpen={onOpenProject} />)}
            </div>
          )}
          {member.length > 0 && (
            <div>
              <div className="section-label">{t("profile.member")}</div>
              {member.map(p => <ProjectRow key={p.id} p={p} onOpen={onOpenProject} />)}
            </div>
          )}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: "var(--text-3)", textAlign: "center", padding: "4px 0" }}>{t("profile.noProjects")}</div>
      )}

      {/* Portfolio links */}
      {links.length > 0 && (
        <div>
          <div className="section-label">{t("profile.portfolio")}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {links.map((l, i) => (
              <a key={i} href={l.url} target="_blank" rel="noopener noreferrer" style={{
                fontSize: 12, fontWeight: 600, padding: "6px 12px", borderRadius: 99,
                background: "var(--surface-2)", border: "1px solid var(--border)",
                color: "var(--accent)", textDecoration: "none" }}>🔗 {l.label}</a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
