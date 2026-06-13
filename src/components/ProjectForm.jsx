import { useState, useEffect } from "react";
import { regions, projects, users } from "../api";
import { Icon } from "./Icons";
import { useT } from "../i18n";
import { tgAlert, tgConfirm } from "../tg";

const PREDEFINED_SKILLS = [
  "Frontend", "Backend", "Fullstack", "React", "Python", "Node.js", "Java", "C++", 
  "UI/UX Design", "Graphic Design", "Figma", "Marketing", "Social Media", "SEO",
  "Sales", "Business Dev", "Management", "Data Science", "Machine Learning",
  "AI", "Accounting", "Finance", "Legal", "Writing", "Public Speaking", "Video Editing",
  "Mobile Dev", "Flutter", "iOS", "Android", "DevOps", "Cybersecurity"
];

export const ProjectForm = ({ type, onSuccess }) => {
  const { t } = useT();
  const [form, setForm] = useState({
    name: "",
    goal: "",
    about: "",
    channel: "",
    gender_req: "Any",
    req_region_ids: [],
  });
  
  const [ageRange, setAgeRange] = useState([16, 35]);
  const [ageEnabled, setAgeEnabled] = useState(false); // off by default = no age requirement
  const [selectedSkills, setSelectedSkills] = useState([]);
  const [skillSearch, setSkillSearch] = useState("");

  const [dbRegions, setDbRegions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [polishing, setPolishing] = useState(false);

  useEffect(() => {
    regions.list().then(setDbRegions).catch(console.error);
  }, []);

  const polishAbout = async () => {
    if (polishing || !form.about.trim()) return;
    setPolishing(true);
    try {
      const r = await users.coach("project", form.about);
      if (r?.improved) {
        const ok = await tgConfirm(t("coach.apply", { text: r.improved }));
        if (ok) setForm(f => ({ ...f, about: r.improved }));
      } else { tgAlert(t("coach.failed")); }
    } catch (e) { tgAlert(e.message); }
    setPolishing(false);
  };

  const handleSubmit = async (asDraft = false) => {
    if (!form.name || !form.goal || !form.about) {
      tgAlert(t("pf.validation"));
      return;
    }

    setLoading(true);
    try {
      const payload = {
        type: type,
        name: form.name,
        goal: form.goal,
        about: form.about,
        channel: form.channel || null,
        age_from: ageEnabled ? ageRange[0] : null,
        age_to: ageEnabled ? ageRange[1] : null,
        gender_req: form.gender_req === "Any" ? null : form.gender_req,
        req_region_ids: form.req_region_ids,
        req_skills: selectedSkills,
        req_knowledges: [], // Removed from UI as requested
        is_draft: asDraft,
      };

      await projects.create(payload);
      
      if (onSuccess) onSuccess();
    } catch (e) {
      tgAlert(e.message || t("pf.createFailed"));
    }
    setLoading(false);
  };

  const toggleRegion = (id) => {
    setForm(prev => {
      if (prev.req_region_ids.includes(id)) {
        return { ...prev, req_region_ids: prev.req_region_ids.filter(r => r !== id) };
      }
      return { ...prev, req_region_ids: [...prev.req_region_ids, id] };
    });
  };

  const toggleSkill = (skill) => {
    if (selectedSkills.includes(skill)) {
      setSelectedSkills(selectedSkills.filter(s => s !== skill));
    } else {
      setSelectedSkills([...selectedSkills, skill]);
      setSkillSearch(""); // clear search on select
    }
  };

  const filteredSkills = PREDEFINED_SKILLS.filter(s => 
    s.toLowerCase().includes(skillSearch.toLowerCase()) && !selectedSkills.includes(s)
  );

  return (
    <div className="card" style={{ animation: "fadeUp 0.3s ease", marginBottom: 20 }}>
      <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 700, marginBottom: 20 }}>
        {type === "startup" ? t("pf.postStartup") : t("pf.postProject")}
      </h3>
      
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        
        {/* Basic Info */}
        <div>
          <div className="section-label">{t("pf.basicInfo")}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input className="input-field" placeholder={t("pf.namePh")} value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
            <input className="input-field" placeholder={t("pf.goalPh")} value={form.goal} onChange={e => setForm({...form, goal: e.target.value})} />
            <textarea className="input-field" rows={4} placeholder={t("pf.aboutPh")} style={{ resize: "none" }} value={form.about} onChange={e => setForm({...form, about: e.target.value})} />
            <button type="button" onClick={polishAbout} disabled={polishing || !form.about.trim()} style={{
              alignSelf: "flex-start", background: "none", border: "none", color: "#4ECDC4",
              fontSize: 12, fontWeight: 700, cursor: "pointer", padding: 0,
              opacity: polishing || !form.about.trim() ? 0.5 : 1,
            }}>{polishing ? t("coach.thinking") : t("coach.improve")}</button>
          </div>
        </div>

        <hr style={{ border: 0, borderTop: "1px solid var(--border)", margin: "4px 0" }} />

        {/* Contact */}
        <div>
          <div className="section-label">{t("pf.contact")}</div>
          <input className="input-field" placeholder={t("pf.channelPh")} value={form.channel} onChange={e => setForm({...form, channel: e.target.value})} />
        </div>

        <hr style={{ border: 0, borderTop: "1px solid var(--border)", margin: "4px 0" }} />

        {/* Requirements */}
        <div>
          <div className="section-label">{t("pf.requirements")}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            
            {/* Age Dual Slider */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 13, color: "var(--text-2)" }}>{t("pf.ageRange")}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {ageEnabled && <span style={{ fontSize: 13, fontWeight: 600, color: "var(--accent)" }}>{ageRange[0]} – {ageRange[1]}</span>}
                  <button onClick={() => setAgeEnabled(e => !e)} style={{
                    background: ageEnabled ? "var(--accent)" : "var(--surface-3)",
                    border: "none", borderRadius: 99, padding: "4px 12px",
                    color: ageEnabled ? "#fff" : "var(--text-3)", fontSize: 12, fontWeight: 600, cursor: "pointer"
                  }}>
                    {ageEnabled ? t("pf.on") : t("pf.off")}
                  </button>
                </div>
              </div>
              {ageEnabled && (
                <div style={{ position: "relative", height: 30, display: "flex", alignItems: "center" }}>
                  <div style={{ position: "absolute", width: "100%", height: 4, background: "var(--surface-3)", borderRadius: 2 }} />
                  <div style={{ 
                    position: "absolute", height: 4, background: "var(--accent)", borderRadius: 2,
                    left: `${((ageRange[0] - 10) / 50) * 100}%`,
                    right: `${100 - ((ageRange[1] - 10) / 50) * 100}%` 
                  }} />
                  <input 
                    type="range" min={10} max={60} value={ageRange[0]} 
                    onChange={e => setAgeRange([Math.min(Number(e.target.value), ageRange[1] - 1), ageRange[1]])}
                    className="dual-thumb"
                  />
                  <input 
                    type="range" min={10} max={60} value={ageRange[1]} 
                    onChange={e => setAgeRange([ageRange[0], Math.max(Number(e.target.value), ageRange[0] + 1)])}
                    className="dual-thumb"
                  />
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 6 }}>{t("pf.genderLabel")}</div>
                <select className="input-field" value={form.gender_req} onChange={e => setForm({...form, gender_req: e.target.value})} style={{ appearance: "none", cursor: "pointer" }}>
                  <option value="Any">{t("pf.genderAny")}</option>
                  <option value="Male">{t("pf.genderMale")}</option>
                  <option value="Female">{t("pf.genderFemale")}</option>
                </select>
              </div>
            </div>

            <div>
              <div style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 6 }}>{t("pf.targetRegions")}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {dbRegions.map(r => {
                  const selected = form.req_region_ids.includes(r.id);
                  return (
                    <button key={r.id} onClick={() => toggleRegion(r.id)} style={{
                      background: selected ? "var(--accent-dim)" : "var(--surface-2)",
                      border: `1px solid ${selected ? "var(--accent)" : "var(--border)"}`,
                      color: selected ? "var(--accent)" : "var(--text-2)",
                      borderRadius: 99, padding: "6px 12px", fontSize: 12, fontWeight: 500, cursor: "pointer",
                      transition: "all 0.2s"
                    }}>
                      {r.name_en}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 6 }}>{t("pf.requiredSkills")}</div>
              
              {/* Selected Skills Chips */}
              {selectedSkills.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                  {selectedSkills.map(s => (
                    <span key={s} onClick={() => toggleSkill(s)} className="chip active" style={{ cursor: "pointer" }}>
                      {s} <Icon name="x" size={12} />
                    </span>
                  ))}
                </div>
              )}

              {/* Search Bar */}
              <input 
                className="input-field" 
                placeholder={t("pf.searchSkills")} 
                value={skillSearch} 
                onChange={e => setSkillSearch(e.target.value)} 
                onKeyDown={e => {
                  if (e.key === 'Enter' && skillSearch.trim() !== '') {
                    e.preventDefault();
                    toggleSkill(skillSearch.trim());
                  }
                }}
              />
              
              {/* Search Results */}
              {skillSearch && (
                <div style={{ 
                  background: "var(--surface-2)", border: "1px solid var(--border)", 
                  borderRadius: "var(--radius-sm)", marginTop: 4, maxHeight: 150, overflowY: "auto",
                  padding: 4, display: "flex", flexWrap: "wrap", gap: 6 
                }}>
                  {filteredSkills.length === 0 ? (
                    <div style={{ padding: "8px 12px", fontSize: 12, color: "var(--text-3)" }}>
                      {t("pf.addCustomSkill", { q: skillSearch })}
                    </div>
                  ) : (
                    filteredSkills.map(s => (
                      <button key={s} onClick={() => toggleSkill(s)} style={{
                        background: "var(--surface-3)", border: "none", borderRadius: 20,
                        color: "var(--text)", padding: "6px 12px", fontSize: 12, cursor: "pointer"
                      }}>
                        + {s}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

          </div>
        </div>
        
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button onClick={() => handleSubmit(true)} disabled={loading} style={{
            flex: 1, padding: "14px", background: "var(--surface-3)", color: "var(--text-2)",
            border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
            fontWeight: 600, fontSize: 14, cursor: "pointer",
          }}>{t("pf.saveDraft")}</button>
          <button className="btn-primary" style={{ flex: 2 }} onClick={() => handleSubmit(false)} disabled={loading}>
            {loading ? t("common.saving") : (type === "startup" ? t("pf.publishStartup") : t("pf.publishProject"))}
          </button>
        </div>

      </div>
    </div>
  );
};
