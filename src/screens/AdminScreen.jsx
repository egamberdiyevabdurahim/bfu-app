import { useState, useEffect } from "react";
import { admin } from "../api";
import { Icon } from "../components/Icons";
import { AvatarEl } from "../components/Shared";
import { useT } from "../i18n";

export const AdminScreen = ({ user, onBack }) => {
  const { t } = useT();
  const [activeTab, setActiveTab] = useState("Dashboard");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [search, setSearch] = useState("");

  const isSuper = user.role === "super_admin";

  useEffect(() => {
    loadData(activeTab);
  }, [activeTab]);

  const loadData = async (tab, query = "") => {
    setLoading(true);
    setData(null);
    try {
      const p = query ? { search: query } : {};
      if (tab === "Dashboard") {
        const res = await admin.getStats();
        setData(res);
      } else if (tab === "Users") {
        const res = await admin.getUsers(p);
        setData(Array.isArray(res) ? res : []);
      } else if (tab === "Projects") {
        const res = await admin.getProjects(p);
        setData(Array.isArray(res) ? res : []);
      } else if (tab === "Locations") {
        const [r, s, lc] = await Promise.all([
          admin.getRegions(), admin.getSchools(), admin.getLCs()
        ]);
        setData({ 
          regions: Array.isArray(r) ? r : [], 
          schools: Array.isArray(s) ? s : [], 
          lcs: Array.isArray(lc) ? lc : [] 
        });
      }
    } catch (e) {
      console.error("Admin load error:", e);
      alert(t("admin.loadError", { msg: e.message }));
    }
    setLoading(false);
  };

  const handleAction = async (action, fn, ...args) => {
    if (!window.confirm(t("admin.confirm", { action }))) return;
    try {
      await fn(...args);
      loadData(activeTab, search);
    } catch (e) {
      alert(t("admin.actionFailed", { msg: e.message }));
    }
  };

  const renderDashboard = () => {
    if (!data || Array.isArray(data) || data.schools !== undefined && typeof data.schools !== 'number') return null;
    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {[
          { label: t("admin.stat.users"), val: data.users, color: "#7B6FFF" },
          { label: t("admin.stat.projects"), val: data.projects, color: "#4ECDC4" },
          { label: t("admin.stat.regions"), val: data.regions, color: "#FFB347" },
          { label: t("admin.stat.schools"), val: data.schools, color: "#FF6B6B" },
          { label: t("admin.stat.lcs"), val: data.learning_centers, color: "#A78BFA" },
        ].map(s => (
          <div key={s.label} style={{
            background: "var(--surface-2)", border: `1px solid ${s.color}40`,
            borderRadius: "var(--radius)", padding: "16px", textAlign: "center"
          }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: s.color, fontFamily: "var(--font-display)" }}>{s.val}</div>
            <div style={{ fontSize: 12, color: "var(--text-2)", marginTop: 4, fontWeight: 600 }}>{s.label}</div>
          </div>
        ))}
      </div>
    );
  };

  const renderUsers = () => {
    if (!data || !Array.isArray(data)) return null;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ position: "relative" }}>
          <input className="input-field" placeholder={t("admin.searchUsers")} value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === "Enter" && loadData("Users", search)} />
          <button onClick={() => loadData("Users", search)} style={{ position: "absolute", right: 12, top: 12, background: "none", border: "none", color: "var(--accent)" }}><Icon name="search" size={18} /></button>
        </div>
        {data.map(u => (
          <div key={u.id} style={{
            background: "var(--surface-2)", border: "1px solid var(--border)",
            borderRadius: "var(--radius)", padding: 12, opacity: u.is_deleted ? 0.5 : 1
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
              <AvatarEl name={u.name || "U"} size={40} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
                  {u.name} {u.surname}
                  {u.checked && <span title="Verified" style={{ color: "var(--accent)", fontSize: 14 }}>●</span>}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-3)" }}>
                  {t("admin.userMeta", { id: u.id, tg: u.telegram_id, role: u.role })}
                </div>
              </div>
              <button onClick={() => handleAction(u.checked ? t("admin.act.unverifyUser") : t("admin.act.verifyUser"), admin.toggleCheck, u.id)} style={{
                padding: "4px 8px", borderRadius: 4, background: u.checked ? "var(--accent)" : "var(--surface-3)",
                color: u.checked ? "#fff" : "var(--text-3)", fontSize: 11, fontWeight: 700, border: "none"
              }}>{u.checked ? t("admin.verified") : t("admin.verify")}</button>
            </div>
            {!u.is_deleted && (
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => handleAction(t("admin.act.softDeleteUser"), admin.deleteUser, u.id)} style={{
                  flex: 1, padding: 8, background: "rgba(255,179,71,0.1)", color: "#FFB347",
                  border: "1px solid rgba(255,179,71,0.3)", borderRadius: "var(--radius-sm)", fontSize: 12, fontWeight: 600
                }}>{t("admin.safeDelete")}</button>
                {isSuper && (
                  <>
                    <button onClick={() => handleAction(t("admin.act.changeRole", { role: u.role === 'admin' ? 'user' : 'admin' }), admin.updateRole, u.id, u.role === 'admin' ? 'user' : 'admin')} style={{
                      flex: 1, padding: 8, background: "var(--surface-3)", color: "var(--text-2)",
                      border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: 12, fontWeight: 600
                    }}>{u.role === 'admin' ? t("admin.makeUser") : t("admin.makeAdmin")}</button>
                    <button onClick={() => handleAction(t("admin.act.hardDeleteUser"), admin.hardDeleteUser, u.id)} style={{
                      flex: 1, padding: 8, background: "rgba(255,107,107,0.1)", color: "#FF6B6B",
                      border: "1px solid rgba(255,107,107,0.3)", borderRadius: "var(--radius-sm)", fontSize: 12, fontWeight: 600
                    }}>{t("admin.hardDelete")}</button>
                  </>
                )}
              </div>
            )}
            {u.is_deleted && <div style={{ color: "#FF6B6B", fontSize: 12, fontWeight: 600 }}>{t("admin.safeDeleted")}</div>}
          </div>
        ))}
      </div>
    );
  };

  const renderProjects = () => {
    if (!data || !Array.isArray(data)) return null;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ position: "relative" }}>
          <input className="input-field" placeholder={t("admin.searchProjects")} value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === "Enter" && loadData("Projects", search)} />
          <button onClick={() => loadData("Projects", search)} style={{ position: "absolute", right: 12, top: 12, background: "none", border: "none", color: "var(--accent)" }}><Icon name="search" size={18} /></button>
        </div>
        {data.map(p => (
          <div key={p.id} style={{
            background: "var(--surface-2)", border: "1px solid var(--border)",
            borderRadius: "var(--radius)", padding: 12, opacity: p.is_deleted ? 0.5 : 1
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{p.name}</div>
                <div style={{ fontSize: 12, color: "var(--text-2)" }}>Type: {p.type} | Creator ID: {p.creator_id}</div>
              </div>
              <button onClick={() => handleAction(p.is_approved ? t("admin.act.unapproveProject") : t("admin.act.approveProject"), admin.approveProject, p.id)} style={{
                padding: "4px 8px", borderRadius: 4, background: p.is_approved ? "var(--accent)" : "var(--surface-3)",
                color: p.is_approved ? "#fff" : "var(--text-3)", fontSize: 11, fontWeight: 700, border: "none"
              }}>{p.is_approved ? t("admin.approved") : t("admin.approve")}</button>
            </div>
            {!p.is_deleted && (
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => handleAction(t("admin.act.softDeleteProject"), admin.deleteProject, p.id)} style={{
                  flex: 1, padding: 8, background: "rgba(255,179,71,0.1)", color: "#FFB347",
                  border: "1px solid rgba(255,179,71,0.3)", borderRadius: "var(--radius-sm)", fontSize: 12, fontWeight: 600
                }}>{t("admin.safeDelete")}</button>
                {isSuper && (
                  <button onClick={() => handleAction(t("admin.act.hardDeleteProject"), admin.hardDeleteProject, p.id)} style={{
                    flex: 1, padding: 8, background: "rgba(255,107,107,0.1)", color: "#FF6B6B",
                    border: "1px solid rgba(255,107,107,0.3)", borderRadius: "var(--radius-sm)", fontSize: 12, fontWeight: 600
                  }}>{t("admin.hardDelete")}</button>
                )}
              </div>
            )}
            {p.is_deleted && <div style={{ color: "#FF6B6B", fontSize: 12, fontWeight: 600 }}>{t("admin.safeDeleted")}</div>}
          </div>
        ))}
      </div>
    );
  };

  const renderLocations = () => {
    if (!data || !data.schools || !Array.isArray(data.schools)) return null;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 12 }}>{t("admin.schools")}</h3>
          {data.schools.map(s => <LocationItem key={s.id} item={s} type="school" onSaved={() => loadData("Locations")} />)}
        </div>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 12 }}>{t("admin.lcs")}</h3>
          {(data.lcs || []).map(lc => <LocationItem key={lc.id} item={lc} type="lc" onSaved={() => loadData("Locations")} />)}
        </div>
      </div>
    );
  };

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "var(--bg)", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "52px 24px 16px", flexShrink: 0, borderBottom: "1px solid var(--border)", background: "var(--surface)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={onBack} style={{
            background: "var(--surface-2)", border: "1px solid var(--border)",
            borderRadius: 99, width: 36, height: 36, display: "flex", alignItems: "center",
            justifyContent: "center", cursor: "pointer", color: "var(--text-2)"
          }}>
            <Icon name="arrow_left" size={16} />
          </button>
          <div>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 800 }}>{t("admin.title")}</h1>
            <div style={{ fontSize: 11, color: "var(--accent)", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" }}>
              {user.role.replace("_", " ")}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", overflowX: "auto", padding: "12px 24px", gap: 8, flexShrink: 0, borderBottom: "1px solid var(--border)", scrollbarWidth: "none" }}>
        {[["Dashboard","admin.tab.dashboard"],["Users","admin.tab.users"],["Projects","admin.tab.projects"],["Locations","admin.tab.locations"]].map(([tab, key]) => (
          <button key={tab} onClick={() => { setActiveTab(tab); setSearch(""); }} style={{
            flexShrink: 0, padding: "8px 16px", borderRadius: 99, fontSize: 13, fontWeight: 600,
            background: activeTab === tab ? "var(--accent)" : "var(--surface-2)",
            color: activeTab === tab ? "#fff" : "var(--text-2)",
            border: activeTab === tab ? "none" : "1px solid var(--border)", cursor: "pointer"
          }}>{t(key)}</button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: 40 }}><Icon name="loader" size={24} /></div>
        ) : (
          <>
            {activeTab === "Dashboard" && renderDashboard()}
            {activeTab === "Users" && renderUsers()}
            {activeTab === "Projects" && renderProjects()}
            {activeTab === "Locations" && renderLocations()}
          </>
        )}
      </div>
    </div>
  );
};

const LocationItem = ({ item, type, onSaved }) => {
  const { t } = useT();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ group_id: item.group_id || "", group_link: item.group_link || "" });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = { 
        group_id: form.group_id ? parseInt(form.group_id) : null, 
        group_link: form.group_link || null 
      };
      if (type === "school") await admin.updateSchool(item.id, payload);
      else await admin.updateLC(item.id, payload);
      setEditing(false);
      onSaved();
    } catch(e) { alert(t("admin.saveFailed")); }
    setSaving(false);
  };

  if (editing) {
    return (
      <div style={{ background: "var(--surface-2)", border: "1px solid var(--accent)", borderRadius: "var(--radius)", padding: 12, marginBottom: 8 }}>
        <div style={{ fontWeight: 700, marginBottom: 12, fontSize: 14 }}>{t("admin.editing", { name: item.name })}</div>
        <input className="input-field" placeholder={t("admin.groupIdPh")} value={form.group_id} onChange={e => setForm({...form, group_id: e.target.value})} style={{ marginBottom: 8 }} />
        <input className="input-field" placeholder={t("admin.groupLinkPh")} value={form.group_link} onChange={e => setForm({...form, group_link: e.target.value})} style={{ marginBottom: 12 }} />
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setEditing(false)} style={{ flex: 1, padding: 8, background: "var(--surface-3)", borderRadius: "var(--radius-sm)", color: "var(--text-2)" }}>{t("common.cancel")}</button>
          <button onClick={handleSave} disabled={saving} style={{ flex: 1, padding: 8, background: "var(--accent)", borderRadius: "var(--radius-sm)", color: "#fff", fontWeight: 600 }}>{saving ? t("common.saving") : t("common.save")}</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 12, marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{item.name}</div>
        <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>
          {t("admin.idLabel", { id: item.group_id || t("admin.none"), link: item.group_link ? t("admin.set") : t("admin.none") })}
        </div>
      </div>
      <button onClick={() => setEditing(true)} style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer" }}><Icon name="edit" size={16} /></button>
    </div>
  );
};
