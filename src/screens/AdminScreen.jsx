import { useState, useEffect } from "react";
import { admin } from "../api";
import { Icon } from "../components/Icons";
import { AvatarEl } from "../components/Shared";
import { useT } from "../i18n";
import { tgAlert, tgConfirm } from "../tg";

export const AdminScreen = ({ user, onBack }) => {
  const { t } = useT();
  const [activeTab, setActiveTab] = useState("Dashboard");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [search, setSearch] = useState("");
  // Broadcast form
  const [bcText, setBcText] = useState("");
  const [bcVerified, setBcVerified] = useState(false);
  const [bcSending, setBcSending] = useState(false);
  const [pForm, setPForm] = useState({ name: "", about: "", website: "", logo_url: "", owner_user_id: "" });

  const isSuper = user.role === "super_admin";

  useEffect(() => {
    if (activeTab === "Broadcast") { setLoading(false); return; }
    loadData(activeTab);
  }, [activeTab]);

  const sendBroadcast = async () => {
    const text = bcText.trim();
    if (!text) return;
    setBcSending(true);
    try {
      const preview = await admin.broadcast({ text, verified_only: bcVerified, dry_run: true });
      const ok = await tgConfirm(t("admin.bc.confirm", { n: preview.count }));
      if (!ok) { setBcSending(false); return; }
      const res = await admin.broadcast({ text, verified_only: bcVerified, dry_run: false });
      tgAlert(t("admin.bc.queued", { n: res.queued }));
      setBcText("");
    } catch (e) { tgAlert(e.message); }
    setBcSending(false);
  };

  const renderBroadcast = () => (
    <div>
      <p style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.5, marginBottom: 12 }}>
        {t("admin.bc.desc")}
      </p>
      <textarea className="input-field" value={bcText} onChange={e => setBcText(e.target.value)}
        rows={5} maxLength={3500} placeholder={t("admin.bc.placeholder")}
        style={{ width: "100%", resize: "vertical", marginBottom: 10 }} />
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-2)", marginBottom: 14, cursor: "pointer" }}>
        <input type="checkbox" checked={bcVerified} onChange={e => setBcVerified(e.target.checked)} />
        {t("admin.bc.verifiedOnly")}
      </label>
      <button onClick={sendBroadcast} disabled={bcSending || !bcText.trim()} style={{
        width: "100%", padding: 13, background: "var(--accent)", border: "none",
        borderRadius: "var(--radius-sm)", color: "#fff", fontWeight: 700, fontSize: 14,
        cursor: "pointer", fontFamily: "var(--font-display)", opacity: bcSending || !bcText.trim() ? 0.6 : 1,
      }}>{bcSending ? t("admin.bc.sending") : t("admin.bc.send")}</button>
    </div>
  );

  const renderPartners = () => {
    const partners = Array.isArray(data) ? data : [];
    const submit = async () => {
      if (!pForm.name.trim()) return;
      try {
        await admin.createPartner({
          name: pForm.name.trim(), about: pForm.about || null, website: pForm.website || null,
          logo_url: pForm.logo_url || null,
          owner_user_id: pForm.owner_user_id ? parseInt(pForm.owner_user_id) : null,
        });
        setPForm({ name: "", about: "", website: "", logo_url: "", owner_user_id: "" });
        loadData("Partners");
      } catch (e) { tgAlert(e.message); }
    };
    return (
      <div>
        <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, padding: 14, marginBottom: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 10, fontFamily: "var(--font-display)" }}>{t("admin.pt.add")}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <input className="input-field" placeholder={t("admin.pt.name")} value={pForm.name} onChange={e => setPForm({ ...pForm, name: e.target.value })} />
            <textarea className="input-field" rows={2} placeholder={t("admin.pt.about")} style={{ resize: "none" }} value={pForm.about} onChange={e => setPForm({ ...pForm, about: e.target.value })} />
            <input className="input-field" placeholder={t("admin.pt.website")} value={pForm.website} onChange={e => setPForm({ ...pForm, website: e.target.value })} />
            <input className="input-field" placeholder={t("admin.pt.logo")} value={pForm.logo_url} onChange={e => setPForm({ ...pForm, logo_url: e.target.value })} />
            <input className="input-field" placeholder={t("admin.pt.owner")} value={pForm.owner_user_id} onChange={e => setPForm({ ...pForm, owner_user_id: e.target.value })} />
            <button onClick={submit} disabled={!pForm.name.trim()} style={{ padding: 11, background: "var(--accent)", border: "none", borderRadius: "var(--radius-sm)", color: "#fff", fontWeight: 700, cursor: "pointer", opacity: pForm.name.trim() ? 1 : 0.6 }}>{t("admin.pt.create")}</button>
          </div>
        </div>
        {partners.length === 0 ? (
          <div style={{ textAlign: "center", padding: 30, color: "var(--text-3)" }}>{t("admin.pt.none")}</div>
        ) : partners.map(p => (
          <div key={p.id} className="card" style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700 }}>{p.name} {p.verified && <span style={{ color: "var(--accent)" }}>✓</span>}</div>
              <div style={{ fontSize: 12, color: "var(--text-3)" }}>
                {p.owner_user_id ? t("admin.pt.ownerN", { id: p.owner_user_id }) : t("admin.pt.noOwner")}
              </div>
            </div>
            <button onClick={() => handleAction(t("admin.pt.del"), admin.deletePartner, p.id)} style={{ background: "rgba(255,107,107,0.1)", border: "1px solid rgba(255,107,107,0.25)", color: "#FF6B6B", borderRadius: "var(--radius-sm)", padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{t("admin.pt.del")}</button>
          </div>
        ))}
      </div>
    );
  };

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
      } else if (tab === "Reports") {
        const res = await admin.getReports();
        setData(Array.isArray(res) ? res : []);
      } else if (tab === "Events") {
        const [evs, regs] = await Promise.all([admin.getEvents(), admin.getRegions()]);
        setData({ events: Array.isArray(evs) ? evs : [], regions: Array.isArray(regs) ? regs : [] });
      } else if (tab === "Partners") {
        const res = await admin.getPartners();
        setData(Array.isArray(res) ? res : []);
      }
    } catch (e) {
      console.error("Admin load error:", e);
      tgAlert(t("admin.loadError", { msg: e.message }));
    }
    setLoading(false);
  };

  const handleAction = async (action, fn, ...args) => {
    if (!await tgConfirm(t("admin.confirm", { action }))) return;
    try {
      await fn(...args);
      loadData(activeTab, search);
    } catch (e) {
      tgAlert(t("admin.actionFailed", { msg: e.message }));
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

  const renderEvents = () => {
    if (!data || !Array.isArray(data.events)) return null;
    return (
      <div>
        <EventAdminForm regions={data.regions || []} onCreated={() => loadData("Events")} />
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
          {data.events.map(ev => (
            <div key={ev.id} className="card" style={{ opacity: ev.is_deleted ? 0.5 : 1, border: ev.is_approved === false ? "1px solid #FFB347" : undefined }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>
                    {ev.title}
                    {ev.is_approved === false && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: "#FFB347", background: "rgba(255,179,71,0.15)", borderRadius: 6, padding: "2px 6px" }}>{t("admin.ev.pending")}</span>}
                    {ev.partner_id && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: "var(--accent)", background: "var(--accent-dim)", borderRadius: 6, padding: "2px 6px" }}>{t("admin.ev.partner")}</span>}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
                    {ev.type}{ev.deadline ? ` · ${new Date(ev.deadline).toLocaleDateString()}` : ""}
                  </div>
                </div>
                {ev.is_approved === false && !ev.is_deleted && (
                  <button onClick={async () => {
                    try { await admin.approveEvent(ev.id); loadData("Events"); }
                    catch (e) { tgAlert(t("admin.actionFailed", { msg: e.message })); }
                  }} style={{
                    padding: "4px 10px", borderRadius: 6, background: "var(--accent)",
                    color: "#fff", border: "none", fontSize: 12, fontWeight: 600, marginRight: 6,
                  }}>{t("admin.ev.approve")}</button>
                )}
                {!ev.is_deleted && (
                  <button onClick={async () => {
                    if (!await tgConfirm(t("admin.confirm", { action: t("admin.delete") }))) return;
                    try { await admin.deleteEvent(ev.id); loadData("Events"); }
                    catch (e) { tgAlert(t("admin.actionFailed", { msg: e.message })); }
                  }} style={{
                    padding: "4px 10px", borderRadius: 6, background: "rgba(255,107,107,0.1)",
                    color: "#FF6B6B", border: "1px solid rgba(255,107,107,0.25)", fontSize: 12, fontWeight: 600,
                  }}>{t("admin.delete")}</button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderReports = () => {
    if (!data || !Array.isArray(data)) return null;
    if (data.length === 0) return <div style={{ textAlign: "center", padding: 40, color: "var(--text-3)" }}>{t("admin.report.none")}</div>;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {data.map(r => (
          <div key={r.id} style={{
            background: "var(--surface-2)", border: "1px solid var(--border)",
            borderRadius: "var(--radius)", padding: 12, opacity: r.resolved ? 0.55 : 1,
          }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>
              {t("admin.report.row", { type: r.target_type, id: r.target_id, by: r.reporter_id })}
            </div>
            {r.reason && <div style={{ fontSize: 12, color: "var(--text-2)", margin: "6px 0", lineHeight: 1.5 }}>{r.reason}</div>}
            <button onClick={async () => {
              try { await admin.resolveReport(r.id); loadData("Reports"); }
              catch (e) { tgAlert(t("admin.actionFailed", { msg: e.message })); }
            }} style={{
              marginTop: 6, padding: "6px 12px", borderRadius: "var(--radius-sm)", fontSize: 12, fontWeight: 600,
              background: r.resolved ? "var(--surface-3)" : "var(--accent)", color: r.resolved ? "var(--text-2)" : "#fff",
              border: "none", cursor: "pointer",
            }}>{r.resolved ? t("admin.report.reopen") : t("admin.report.resolve")}</button>
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
          <AddLocation type="school" regions={data.regions || []} onCreated={() => loadData("Locations")} />
          {data.schools.map(s => <LocationItem key={s.id} item={s} type="school" regions={data.regions || []} onSaved={() => loadData("Locations")} />)}
        </div>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 12 }}>{t("admin.lcs")}</h3>
          <AddLocation type="lc" regions={data.regions || []} onCreated={() => loadData("Locations")} />
          {(data.lcs || []).map(lc => <LocationItem key={lc.id} item={lc} type="lc" regions={data.regions || []} onSaved={() => loadData("Locations")} />)}
        </div>
      </div>
    );
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", flexDirection: "column", background: "var(--bg)", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "calc(var(--safe-t) + 18px) 24px 16px", flexShrink: 0, borderBottom: "1px solid var(--border)", background: "var(--surface)" }}>
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
        {[["Dashboard","admin.tab.dashboard"],["Users","admin.tab.users"],["Projects","admin.tab.projects"],["Partners","admin.tab.partners"],["Locations","admin.tab.locations"],["Events","admin.tab.events"],["Reports","admin.tab.reports"],...(isSuper ? [["Broadcast","admin.tab.broadcast"]] : [])].map(([tab, key]) => (
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
            {activeTab === "Reports" && renderReports()}
            {activeTab === "Events" && renderEvents()}
            {activeTab === "Partners" && renderPartners()}
            {activeTab === "Broadcast" && renderBroadcast()}
          </>
        )}
      </div>
    </div>
  );
};

const EventAdminForm = ({ regions = [], onCreated }) => {
  const { t, lang } = useT();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const empty = { type: "hackathon", title: "", description: "", link: "", cover_url: "", deadline: "", region_id: "" };
  const [form, setForm] = useState(empty);

  const submit = async () => {
    if (!form.title.trim()) { tgAlert(t("ep.required")); return; }
    setSaving(true);
    try {
      const payload = {
        type: form.type, title: form.title.trim(),
        description: form.description || null, link: form.link || null,
        cover_url: form.cover_url || null,
        deadline: form.deadline ? form.deadline.replace(" ", "T") : null,
        region_id: form.region_id ? parseInt(form.region_id) : null,
      };
      await admin.createEvent(payload);
      setForm(empty); setOpen(false); onCreated();
    } catch (e) { tgAlert(t("admin.createFailed", { msg: e.message })); }
    setSaving(false);
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{
        width: "100%", marginBottom: 12, padding: 10, background: "var(--accent-dim)",
        border: "1px solid var(--accent)", borderRadius: "var(--radius-sm)",
        color: "var(--accent)", fontWeight: 600, fontSize: 13, cursor: "pointer",
      }}>{t("adminev.add")}</button>
    );
  }
  return (
    <div style={{ background: "var(--surface-2)", border: "1px solid var(--accent)", borderRadius: "var(--radius)", padding: 12, marginBottom: 12 }}>
      <select className="input-field" value={form.type} onChange={e => setForm({...form, type: e.target.value})} style={{ marginBottom: 10, appearance: "none", cursor: "pointer" }}>
        {["hackathon","grant","scholarship","meetup","other"].map(k => <option key={k} value={k}>{t(`events.type.${k}`)}</option>)}
      </select>
      <input className="input-field" placeholder={t("adminev.titlePh")} value={form.title} onChange={e => setForm({...form, title: e.target.value})} style={{ marginBottom: 10 }} />
      <textarea className="input-field" rows={3} placeholder={t("adminev.descPh")} value={form.description} onChange={e => setForm({...form, description: e.target.value})} style={{ marginBottom: 10, resize: "none" }} />
      <input className="input-field" placeholder={t("adminev.linkPh")} value={form.link} onChange={e => setForm({...form, link: e.target.value})} style={{ marginBottom: 10 }} />
      <input className="input-field" placeholder={t("adminev.coverPh")} value={form.cover_url} onChange={e => setForm({...form, cover_url: e.target.value})} style={{ marginBottom: 10 }} />
      <input className="input-field" placeholder={t("adminev.deadlinePh")} value={form.deadline} onChange={e => setForm({...form, deadline: e.target.value})} style={{ marginBottom: 10 }} />
      <select className="input-field" value={form.region_id} onChange={e => setForm({...form, region_id: e.target.value})} style={{ marginBottom: 12, appearance: "none", cursor: "pointer" }}>
        <option value="">{t("admin.selectRegion")}</option>
        {regions.map(r => <option key={r.id} value={r.id}>{r[`name_${lang}`] || r.name_en}</option>)}
      </select>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => { setForm(empty); setOpen(false); }} style={{ flex: 1, padding: 8, background: "var(--surface-3)", borderRadius: "var(--radius-sm)", color: "var(--text-2)" }}>{t("common.cancel")}</button>
        <button onClick={submit} disabled={saving} style={{ flex: 1, padding: 8, background: "var(--accent)", borderRadius: "var(--radius-sm)", color: "#fff", fontWeight: 600 }}>{saving ? t("admin.creating") : t("admin.create")}</button>
      </div>
    </div>
  );
};

const AddLocation = ({ type, regions = [], onCreated }) => {
  const { t, lang } = useT();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const empty = { name: "", region_id: "", group_id: "", group_link: "", latitude: "", longitude: "" };
  const [form, setForm] = useState(empty);

  const regionLabel = (r) => r[`name_${lang}`] || r.name_en;

  const handleCreate = async () => {
    if (!form.name.trim() || !form.region_id) { tgAlert(t("ep.required")); return; }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        region_id: parseInt(form.region_id),
        group_id: form.group_id ? parseInt(form.group_id) : null,
        group_link: form.group_link || null,
        latitude: form.latitude !== "" && !isNaN(parseFloat(form.latitude)) ? parseFloat(form.latitude) : null,
        longitude: form.longitude !== "" && !isNaN(parseFloat(form.longitude)) ? parseFloat(form.longitude) : null,
      };
      if (type === "school") await admin.createSchool(payload);
      else await admin.createLC(payload);
      setForm(empty); setOpen(false); onCreated();
    } catch (e) { tgAlert(t("admin.createFailed", { msg: e.message })); }
    setSaving(false);
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{
        width: "100%", marginBottom: 12, padding: 10, background: "var(--accent-dim)",
        border: "1px solid var(--accent)", borderRadius: "var(--radius-sm)",
        color: "var(--accent)", fontWeight: 600, fontSize: 13, cursor: "pointer"
      }}>{type === "school" ? t("admin.addSchool") : t("admin.addLc")}</button>
    );
  }

  return (
    <div style={{ background: "var(--surface-2)", border: "1px solid var(--accent)", borderRadius: "var(--radius)", padding: 12, marginBottom: 12 }}>
      <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 4 }}>{t("admin.nameField")}</div>
      <input className="input-field" placeholder={t("admin.namePh")} value={form.name} onChange={e => setForm({...form, name: e.target.value})} style={{ marginBottom: 10 }} />
      <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 4 }}>{t("admin.region")}</div>
      <select className="input-field" value={form.region_id} onChange={e => setForm({...form, region_id: e.target.value})} style={{ marginBottom: 10, appearance: "none", cursor: "pointer" }}>
        <option value="">{t("admin.selectRegion")}</option>
        {regions.map(r => <option key={r.id} value={r.id}>{regionLabel(r)}</option>)}
      </select>
      <input className="input-field" placeholder={t("admin.groupIdPh")} value={form.group_id} onChange={e => setForm({...form, group_id: e.target.value})} style={{ marginBottom: 8 }} />
      <input className="input-field" placeholder={t("admin.groupLinkPh")} value={form.group_link} onChange={e => setForm({...form, group_link: e.target.value})} style={{ marginBottom: 12 }} />
      <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 4 }}>{t("admin.position")}</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input className="input-field" type="text" inputMode="decimal" placeholder={t("admin.latitude")} value={form.latitude} onChange={e => setForm({...form, latitude: e.target.value})} />
        <input className="input-field" type="text" inputMode="decimal" placeholder={t("admin.longitude")} value={form.longitude} onChange={e => setForm({...form, longitude: e.target.value})} />
      </div>
      <button type="button" onClick={async () => {
        try {
          const r = await admin.myBotLocation();
          if (r.latitude == null) { tgAlert(t("admin.botLocNone")); return; }
          setForm(f => ({ ...f, latitude: String(r.latitude), longitude: String(r.longitude) }));
        } catch (e) { tgAlert(t("admin.actionFailed", { msg: e.message })); }
      }} style={{ width: "100%", marginBottom: 12, padding: 8, background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", color: "var(--accent)", fontWeight: 600, fontSize: 12, cursor: "pointer" }}>{t("admin.useBotLoc")}</button>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => { setForm(empty); setOpen(false); }} style={{ flex: 1, padding: 8, background: "var(--surface-3)", borderRadius: "var(--radius-sm)", color: "var(--text-2)" }}>{t("common.cancel")}</button>
        <button onClick={handleCreate} disabled={saving} style={{ flex: 1, padding: 8, background: "var(--accent)", borderRadius: "var(--radius-sm)", color: "#fff", fontWeight: 600 }}>{saving ? t("admin.creating") : t("admin.create")}</button>
      </div>
    </div>
  );
};

const LocationItem = ({ item, type, regions = [], onSaved }) => {
  const { t, lang } = useT();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: item.name || "",
    region_id: item.region_id ? String(item.region_id) : "",
    group_id: item.group_id || "",
    group_link: item.group_link || "",
    latitude: item.latitude ?? "",
    longitude: item.longitude ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const regionName = (r) => (r ? (r[`name_${lang}`] || r.name_en) : "");
  const currentRegion = regions.find(r => String(r.id) === String(item.region_id));
  const hasPos = item.latitude != null && item.longitude != null;

  const handleSave = async () => {
    if (!form.name.trim()) { tgAlert(t("ep.required")); return; }
    setSaving(true);
    try {
      const payload = {
        group_id: form.group_id ? parseInt(form.group_id) : null,
        group_link: form.group_link || null,
        name: form.name.trim(),
        region_id: form.region_id ? parseInt(form.region_id) : null,
        latitude: form.latitude !== "" && !isNaN(parseFloat(form.latitude)) ? parseFloat(form.latitude) : null,
        longitude: form.longitude !== "" && !isNaN(parseFloat(form.longitude)) ? parseFloat(form.longitude) : null,
      };
      if (type === "school") await admin.updateSchool(item.id, payload);
      else await admin.updateLC(item.id, payload);
      setEditing(false);
      onSaved();
    } catch(e) { tgAlert(t("admin.saveFailed")); }
    setSaving(false);
  };

  const handleDelete = async () => {
    const actKey = type === "school" ? "admin.act.deleteSchool" : "admin.act.deleteLc";
    if (!await tgConfirm(t("admin.confirm", { action: t(actKey) }))) return;
    setDeleting(true);
    try {
      if (type === "school") await admin.deleteSchool(item.id);
      else await admin.deleteLC(item.id);
      onSaved();
    } catch (e) { tgAlert(t("admin.actionFailed", { msg: e.message })); }
    setDeleting(false);
  };

  if (editing) {
    return (
      <div style={{ background: "var(--surface-2)", border: "1px solid var(--accent)", borderRadius: "var(--radius)", padding: 12, marginBottom: 8 }}>
        <div style={{ fontWeight: 700, marginBottom: 12, fontSize: 14 }}>{t("admin.editing", { name: item.name })}</div>
        <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 4 }}>{t("admin.nameField")}</div>
        <input className="input-field" placeholder={t("admin.namePh")} value={form.name} onChange={e => setForm({...form, name: e.target.value})} style={{ marginBottom: 10 }} />
        <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 4 }}>{t("admin.region")}</div>
        <select className="input-field" value={form.region_id} onChange={e => setForm({...form, region_id: e.target.value})} style={{ marginBottom: 10, appearance: "none", cursor: "pointer" }}>
          <option value="">{t("admin.selectRegion")}</option>
          {regions.map(r => <option key={r.id} value={r.id}>{regionName(r)}</option>)}
        </select>
        <input className="input-field" placeholder={t("admin.groupIdPh")} value={form.group_id} onChange={e => setForm({...form, group_id: e.target.value})} style={{ marginBottom: 8 }} />
        <input className="input-field" placeholder={t("admin.groupLinkPh")} value={form.group_link} onChange={e => setForm({...form, group_link: e.target.value})} style={{ marginBottom: 12 }} />
        <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 4 }}>{t("admin.position")}</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input className="input-field" type="text" inputMode="decimal" placeholder={t("admin.latitude")} value={form.latitude} onChange={e => setForm({...form, latitude: e.target.value})} />
          <input className="input-field" type="text" inputMode="decimal" placeholder={t("admin.longitude")} value={form.longitude} onChange={e => setForm({...form, longitude: e.target.value})} />
        </div>
        <button type="button" onClick={async () => {
          try {
            const r = await admin.myBotLocation();
            if (r.latitude == null) { tgAlert(t("admin.botLocNone")); return; }
            setForm(f => ({ ...f, latitude: String(r.latitude), longitude: String(r.longitude) }));
          } catch (e) { tgAlert(t("admin.actionFailed", { msg: e.message })); }
        }} style={{ width: "100%", marginBottom: 12, padding: 8, background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", color: "var(--accent)", fontWeight: 600, fontSize: 12, cursor: "pointer" }}>{t("admin.useBotLoc")}</button>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setEditing(false)} style={{ flex: 1, padding: 8, background: "var(--surface-3)", borderRadius: "var(--radius-sm)", color: "var(--text-2)" }}>{t("common.cancel")}</button>
          <button onClick={handleSave} disabled={saving} style={{ flex: 1, padding: 8, background: "var(--accent)", borderRadius: "var(--radius-sm)", color: "#fff", fontWeight: 600 }}>{saving ? t("common.saving") : t("common.save")}</button>
        </div>
        <button onClick={handleDelete} disabled={deleting} style={{ width: "100%", marginTop: 8, padding: 8, background: "rgba(255,107,107,0.1)", color: "#FF6B6B", border: "1px solid rgba(255,107,107,0.3)", borderRadius: "var(--radius-sm)", fontWeight: 600, fontSize: 13 }}>{deleting ? "…" : t("admin.delete")}</button>
      </div>
    );
  }

  return (
    <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 12, marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{item.name}</div>
        <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>
          {t("admin.regionLabel", { region: currentRegion ? regionName(currentRegion) : t("admin.none") })}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
          {t("admin.idLabel", { id: item.group_id || t("admin.none"), link: item.group_link ? t("admin.set") : t("admin.none") })}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
          {t("admin.posLabel", { pos: hasPos ? `${item.latitude}, ${item.longitude}` : t("admin.none") })}
          {hasPos && (
            <a href={`https://www.google.com/maps?q=${item.latitude},${item.longitude}`} target="_blank" rel="noopener noreferrer"
              style={{ color: "var(--accent)", marginLeft: 8, textDecoration: "none" }}>
              {t("admin.openMaps")}
            </a>
          )}
        </div>
      </div>
      <button onClick={() => setEditing(true)} style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer" }}><Icon name="edit" size={16} /></button>
    </div>
  );
};
