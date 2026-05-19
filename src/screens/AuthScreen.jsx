import { useState, useEffect, useRef } from "react";
import { Icon } from "../components/Icons";
import { auth, health, makeDevInitData, storage, regions, users } from "../api";
import { useT } from "../i18n";
import { tgAlert, tgConfirm, getStartParam } from "../tg";

const LANGUAGES = [
  { label: "English", code: "en" },
  { label: "O'zbekcha", code: "uz" },
  { label: "Русский", code: "ru" },
];
const CURRENT_YEAR = new Date().getFullYear();
const MIN_BIRTH_YEAR = CURRENT_YEAR - 60;
const MAX_BIRTH_YEAR = CURRENT_YEAR - 10;

const phoneRegex = /^\+?[0-9]{7,15}$/;

export const AuthScreen = ({ onComplete, forceRegister = false }) => {
  const { t, lang, setLang } = useT();
  const [screen, setScreen] = useState(forceRegister ? "register" : "welcome");
  const [regStep, setRegStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [devMode, setDevMode] = useState(false);

  const [dbRegions, setDbRegions] = useState([]);
  const [dbSchools, setDbSchools] = useState([]);
  const [dbLCs, setDbLCs] = useState([]);
  const [groupStatuses, setGroupStatuses] = useState([]);
  const [checkingGroups, setCheckingGroups] = useState(false);

  const [form, setForm] = useState({
    language: lang,
    name: "", surname: "",
    gender: "", birth_year: "", phone_number: "",
    region_id: "", school_id: "", lc_ids: [],
    about: "",
    open_to_work: false, open_to_volunteering: false,
    latitude: null, longitude: null,
  });
  const [locStatus, setLocStatus] = useState(""); // "" | sharing | shared | failed
  const [selectedSkills] = useState([]);
  const [schoolSearch, setSchoolSearch] = useState("");
  const [lcSearch, setLcSearch] = useState("");
  const [schoolFocused, setSchoolFocused] = useState(false);
  const [lcFocused, setLcFocused] = useState(false);

  // Validation errors
  const [errors, setErrors] = useState({});

  useEffect(() => {
    health().then(res => setDevMode(res?.env === "development")).catch(() => {});
    const initData = window.Telegram?.WebApp?.initData;
    if (initData) handleTelegramAuth(initData);
    if (forceRegister) fetchRegions();
  }, []);

  const handleTelegramAuth = async (initData) => {
    setLoading(true);
    try {
      const res = await auth.telegram(initData);
      storage.setTokens(res.access_token, res.refresh_token);
      // Capture referral (only sticks if not yet registered)
      const sp = getStartParam();
      const refM = sp && String(sp).match(/^ref_(\d+)$/);
      if (refM) { users.setReferral(Number(refM[1])).catch(() => {}); }
      if (res.is_registered) {
        onComplete(false);
      } else {
        fetchRegions();
        setScreen("register");
      }
    } catch (err) {
      tgAlert(t("auth.authFailed", { msg: err.message }));
    }
    setLoading(false);
  };

  const doDevAuth = () => handleTelegramAuth(makeDevInitData(2139292627));

  const fetchRegions = async () => {
    try {
      const data = await regions.list();
      setDbRegions(data);
    } catch (e) {}
  };

  const fetchSchoolsAndLCs = async (regionId) => {
    if (!regionId) return;
    try {
      const [sData, lcData] = await Promise.all([
        regions.schools(regionId),
        regions.lcs(regionId)
      ]);
      setDbSchools(sData);
      setDbLCs(lcData);
      setForm(f => ({ ...f, school_id: "", lc_ids: [] }));
    } catch (e) {}
  };

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const shareLocation = () => {
    if (!navigator.geolocation) { setLocStatus("failed"); return; }
    setLocStatus("sharing");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm(f => ({ ...f, latitude: pos.coords.latitude, longitude: pos.coords.longitude }));
        setLocStatus("shared");
      },
      () => setLocStatus("failed"),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const refreshGroupStatus = async () => {
    setCheckingGroups(true);
    try {
      const data = await users.checkGroups();
      setGroupStatuses(data);
    } catch (e) {
      tgAlert(t("auth.groups.checkFailed", { msg: e.message }));
    }
    setCheckingGroups(false);
  };

  const validateStep = (step) => {
    const errs = {};
    if (step === 1) {
      if (!form.name.trim()) errs.name = t("auth.err.firstName");
      if (!form.surname.trim()) errs.surname = t("auth.err.lastName");
      if (!form.gender) errs.gender = t("auth.err.gender");
      const by = parseInt(form.birth_year);
      if (!by || by < MIN_BIRTH_YEAR || by > MAX_BIRTH_YEAR) {
        errs.birth_year = t("auth.err.birthYear", { min: MIN_BIRTH_YEAR, max: MAX_BIRTH_YEAR });
      }
      if (!form.phone_number || !phoneRegex.test(form.phone_number)) {
        errs.phone_number = t("auth.err.phone");
      }
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const submitRegistration = async () => {
    setLoading(true);
    try {
      await users.updateMe({
        language: form.language,
        name: form.name.trim(),
        surname: form.surname.trim(),
        gender: form.gender,
        birth_year: parseInt(form.birth_year) || null,
        phone_number: form.phone_number,
        region_id: parseInt(form.region_id) || null,
        school_id: parseInt(form.school_id) || null,
        learning_center_ids: form.lc_ids,
        latitude: form.latitude,
        longitude: form.longitude,
        about: form.about,
        open_to_work: form.open_to_work,
        open_to_volunteering: form.open_to_volunteering,
      });

      // Finalize: mark registered + set name tags in all groups
      await users.finalize();
      onComplete(true);
    } catch (err) {
      tgAlert(t("auth.registerFailed", { msg: err.message }));
      setLoading(false);
    }
  };

  const goNext = () => {
    if (!validateStep(regStep)) return;
    if (regStep === steps.length - 1) {
      submitRegistration();
    } else {
      if (regStep === steps.length - 2) {
        // About to enter groups step — load group statuses
        refreshGroupStatus();
      }
      setRegStep(r => r + 1);
    }
  };

  // ── Filtered lists ─────────────────────────────────────────────────────────
  const filteredSchools = dbSchools.filter(s =>
    !schoolSearch || s.name.toLowerCase().includes(schoolSearch.toLowerCase())
  ).slice(0, 20);

  const filteredLCs = dbLCs.filter(lc =>
    (!lcSearch || lc.name.toLowerCase().includes(lcSearch.toLowerCase())) &&
    !form.lc_ids.includes(lc.id)
  ).slice(0, 20);

  // ── Steps ──────────────────────────────────────────────────────────────────
  const steps = [
    {
      emoji: "🌐", title: t("auth.step.langTitle"), sub: t("auth.step.langSub"),
      content: (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {LANGUAGES.map(l => (
            <button key={l.code} onClick={() => { set("language", l.code); setLang(l.code); }} style={{
              background: form.language === l.code ? "var(--accent-dim)" : "var(--surface-2)",
              border: `1px solid ${form.language === l.code ? "var(--accent)" : "var(--border)"}`,
              borderRadius: "var(--radius-sm)", padding: "14px 18px",
              color: form.language === l.code ? "var(--accent)" : "var(--text)",
              fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 15,
              cursor: "pointer", transition: "all 0.2s", textAlign: "left",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              {l.label}
              {form.language === l.code && <Icon name="check" size={16} color="var(--accent)" />}
            </button>
          ))}
        </div>
      ),
    },
    {
      emoji: "🧬", title: t("auth.step.basicTitle"), sub: t("auth.step.basicSub"),
      content: (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div className="section-label">{t("auth.firstName")} *</div>
              <input className="input-field" placeholder={t("auth.firstNamePh")} value={form.name}
                onChange={e => set("name", e.target.value)} />
              {errors.name && <div style={{ color: "#FF6363", fontSize: 11, marginTop: 4 }}>{errors.name}</div>}
            </div>
            <div style={{ flex: 1 }}>
              <div className="section-label">{t("auth.lastName")} *</div>
              <input className="input-field" placeholder={t("auth.lastNamePh")} value={form.surname}
                onChange={e => set("surname", e.target.value)} />
              {errors.surname && <div style={{ color: "#FF6363", fontSize: 11, marginTop: 4 }}>{errors.surname}</div>}
            </div>
          </div>
          <div>
            <div className="section-label">{t("auth.gender")} *</div>
            <div style={{ display: "flex", gap: 8 }}>
              {["Male", "Female"].map(g => (
                <button key={g} onClick={() => set("gender", g)} style={{
                  flex: 1, background: form.gender === g ? "var(--accent-dim)" : "var(--surface-2)",
                  border: `1px solid ${form.gender === g ? "var(--accent)" : "var(--border)"}`,
                  borderRadius: "var(--radius-sm)", padding: "12px 6px",
                  color: form.gender === g ? "var(--accent)" : "var(--text-2)",
                  fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 14,
                  cursor: "pointer", transition: "all 0.2s",
                }}>
                  {g === "Male" ? `♂ ${t("common.male")}` : `♀ ${t("common.female")}`}
                </button>
              ))}
            </div>
            {errors.gender && <div style={{ color: "#FF6363", fontSize: 11, marginTop: 4 }}>{errors.gender}</div>}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div className="section-label">{t("auth.birthYear")} *</div>
              <input className="input-field" type="number" placeholder={t("auth.birthYearPh")}
                value={form.birth_year} onChange={e => set("birth_year", e.target.value)}
                style={{ textAlign: "center" }} />
              {errors.birth_year && <div style={{ color: "#FF6363", fontSize: 11, marginTop: 4 }}>{errors.birth_year}</div>}
            </div>
            <div style={{ flex: 2 }}>
              <div className="section-label">{t("auth.phone")} *</div>
              <input className="input-field" type="tel" placeholder="+998911853616" value={form.phone_number}
                onChange={e => set("phone_number", e.target.value)} />
              {errors.phone_number && <div style={{ color: "#FF6363", fontSize: 11, marginTop: 4 }}>{errors.phone_number}</div>}
            </div>
          </div>
        </div>
      ),
    },
    {
      emoji: "📍", title: t("auth.step.locTitle"), sub: t("auth.step.locSub"),
      content: (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <div className="section-label">{t("auth.region")} *</div>
            <select className="input-field" value={form.region_id} onChange={e => {
              set("region_id", e.target.value);
              fetchSchoolsAndLCs(e.target.value);
            }} style={{ appearance: "none", cursor: "pointer" }}>
              <option value="">{t("auth.selectRegion")}</option>
              {dbRegions.map(r => <option key={r.id} value={r.id}>{r.name_en}</option>)}
            </select>
          </div>

          {/* School */}
          <div>
            <div className="section-label">{t("auth.school")}</div>
            {form.school_id && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                <span onClick={() => set("school_id", "")} className="chip active" style={{ cursor: "pointer" }}>
                  {dbSchools.find(s => s.id.toString() === form.school_id)?.name} <Icon name="x" size={12} />
                </span>
              </div>
            )}
            {!form.school_id && (
              <>
                <input className="input-field" placeholder={t("auth.searchSchool")}
                  value={schoolSearch}
                  onChange={e => setSchoolSearch(e.target.value)}
                  onFocus={() => setSchoolFocused(true)}
                  onBlur={() => setTimeout(() => setSchoolFocused(false), 200)}
                />
                {(schoolFocused || schoolSearch) && filteredSchools.length > 0 && (
                  <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)", marginTop: 4, maxHeight: 160,
                    overflowY: "auto", padding: 6, display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {filteredSchools.map(s => (
                      <button key={s.id} onClick={() => { set("school_id", s.id.toString()); setSchoolSearch(""); }}
                        style={{ background: "var(--surface-3)", border: "none", borderRadius: 20,
                          color: "var(--text)", padding: "6px 12px", fontSize: 12, cursor: "pointer" }}>
                        + {s.name}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* LCs */}
          <div>
            <div className="section-label">{t("auth.lcs")}</div>
            {form.lc_ids.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                {form.lc_ids.map(id => (
                  <span key={id} onClick={() => set("lc_ids", form.lc_ids.filter(x => x !== id))}
                    className="chip active" style={{ cursor: "pointer" }}>
                    {dbLCs.find(lc => lc.id === id)?.name} <Icon name="x" size={12} />
                  </span>
                ))}
              </div>
            )}
            <input className="input-field" placeholder={t("auth.searchLC")}
              value={lcSearch}
              onChange={e => setLcSearch(e.target.value)}
              onFocus={() => setLcFocused(true)}
              onBlur={() => setTimeout(() => setLcFocused(false), 200)}
            />
            {(lcFocused || lcSearch) && filteredLCs.length > 0 && (
              <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)", marginTop: 4, maxHeight: 160,
                overflowY: "auto", padding: 6, display: "flex", flexWrap: "wrap", gap: 6 }}>
                {filteredLCs.map(lc => (
                  <button key={lc.id} onClick={() => { set("lc_ids", [...form.lc_ids, lc.id]); setLcSearch(""); }}
                    style={{ background: "var(--surface-3)", border: "none", borderRadius: 20,
                      color: "var(--text)", padding: "6px 12px", fontSize: 12, cursor: "pointer" }}>
                    + {lc.name}
                  </button>
                ))}
              </div>
            )}
            {dbLCs.length === 0 && <span style={{ fontSize: 12, color: "var(--text-3)", display: "block", marginTop: 6 }}>{t("auth.selectRegionFirst")}</span>}
          </div>

          <div>
            <div className="section-label">{t("loc.label")}</div>
            <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 8 }}>{t("loc.why")}</div>
            <button type="button" onClick={shareLocation} disabled={locStatus === "sharing"} style={{
              width: "100%", background: locStatus === "shared" ? "rgba(78,205,196,0.12)" : "var(--surface-2)",
              border: `1px solid ${locStatus === "shared" ? "rgba(78,205,196,0.5)" : "var(--border)"}`,
              borderRadius: "var(--radius-sm)", padding: "12px",
              color: locStatus === "shared" ? "#4ECDC4" : "var(--text)",
              fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 13, cursor: "pointer",
            }}>
              {locStatus === "sharing" ? t("loc.sharing")
                : locStatus === "shared" ? t("loc.shared")
                : t("loc.share")}
            </button>
            {locStatus === "failed" && <div style={{ fontSize: 11, color: "#FFB347", marginTop: 6 }}>{t("loc.failed")}</div>}
          </div>
        </div>
      ),
    },
    {
      emoji: "✍️", title: t("auth.step.aboutTitle"), sub: t("auth.step.aboutSub"),
      content: (
        <textarea className="input-field" rows={6}
          placeholder={t("auth.aboutPh")}
          value={form.about} onChange={e => set("about", e.target.value)}
          style={{ resize: "none", lineHeight: 1.6 }} />
      ),
    },
    {
      emoji: "🤝", title: t("auth.step.intentTitle"), sub: t("auth.step.intentSub"),
      content: (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <button onClick={() => set("open_to_work", !form.open_to_work)} style={{
            background: form.open_to_work ? "var(--accent-dim)" : "var(--surface-2)",
            border: `1px solid ${form.open_to_work ? "var(--accent)" : "var(--border)"}`,
            borderRadius: "var(--radius-sm)", padding: "16px",
            color: form.open_to_work ? "var(--accent)" : "var(--text)",
            cursor: "pointer", transition: "all 0.2s", textAlign: "left",
          }}>
            <div style={{ fontWeight: 700, marginBottom: 4, fontFamily: "var(--font-display)" }}>{t("auth.intent.workTitle")}</div>
            <div style={{ fontSize: 13, color: "var(--text-3)" }}>{t("auth.intent.workSub")}</div>
          </button>
          <button onClick={() => set("open_to_volunteering", !form.open_to_volunteering)} style={{
            background: form.open_to_volunteering ? "var(--accent-dim)" : "var(--surface-2)",
            border: `1px solid ${form.open_to_volunteering ? "var(--accent)" : "var(--border)"}`,
            borderRadius: "var(--radius-sm)", padding: "16px",
            color: form.open_to_volunteering ? "var(--accent)" : "var(--text)",
            cursor: "pointer", transition: "all 0.2s", textAlign: "left",
          }}>
            <div style={{ fontWeight: 700, marginBottom: 4, fontFamily: "var(--font-display)" }}>{t("auth.intent.volTitle")}</div>
            <div style={{ fontSize: 13, color: "var(--text-3)" }}>{t("auth.intent.volSub")}</div>
          </button>
        </div>
      ),
    },
    {
      emoji: "💬", title: t("auth.step.groupsTitle"), sub: t("auth.step.groupsSub"),
      content: (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {groupStatuses.length === 0 ? (
            <div style={{ textAlign: "center", padding: 20, color: "var(--text-3)" }}>
              {checkingGroups ? t("auth.groups.checking") : t("auth.groups.none")}
            </div>
          ) : groupStatuses.map(g => (
            <div key={g.group_id} style={{
              background: "var(--surface-2)", border: `1px solid ${g.joined ? "rgba(78,205,196,0.4)" : "var(--border)"}`,
              borderRadius: "var(--radius-sm)", padding: "14px 16px",
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
            }}>
              <div>
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 14 }}>{g.name}</div>
                <div style={{ fontSize: 12, color: g.joined ? "#4ECDC4" : "var(--text-3)", marginTop: 2 }}>
                  {g.joined ? t("auth.groups.joined") : t("auth.groups.notJoined")}
                </div>
              </div>
              {!g.joined && g.group_link && (
                <a href={g.group_link} target="_blank" rel="noopener noreferrer" style={{
                  background: "var(--accent)", color: "#fff", borderRadius: "var(--radius-sm)",
                  padding: "8px 14px", fontSize: 12, fontWeight: 600, textDecoration: "none",
                  fontFamily: "var(--font-display)", flexShrink: 0,
                }}>{t("auth.groups.join")}</a>
              )}
              {g.joined && <span style={{ fontSize: 20 }}>✅</span>}
            </div>
          ))}
          <button onClick={refreshGroupStatus} disabled={checkingGroups} style={{
            background: "var(--surface-2)", border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)", padding: "12px", cursor: "pointer",
            color: "var(--text-2)", fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 13,
            opacity: checkingGroups ? 0.6 : 1,
          }}>
            {checkingGroups ? t("auth.groups.checkBtn") : t("auth.groups.refresh")}
          </button>
        </div>
      ),
    },
  ];

  const current = steps[regStep];
  const progress = ((regStep + 1) / steps.length) * 100;

  const canContinue = (() => {
    if (regStep === 0) return !!form.language;
    if (regStep === 1) return !!(form.name && form.surname && form.gender && form.birth_year && form.phone_number);
    if (regStep === 2) return !!form.region_id;
    if (regStep === 3) return !!form.about;
    if (regStep === 4) return true; // intentions optional
    if (regStep === 5) {
      // All groups must be joined (or no groups exist)
      return groupStatuses.length === 0 || groupStatuses.every(g => g.joined);
    }
    return true;
  })();

  // ── WELCOME ──────────────────────────────────────────────────────────────────
  if (screen === "welcome") return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: "20%", left: "50%", transform: "translateX(-50%)", width: 300, height: 300, background: "radial-gradient(circle, rgba(123,111,255,0.2) 0%, transparent 70%)", pointerEvents: "none" }} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 28px", textAlign: "center", gap: 24 }}>
        <div style={{ animation: "cardFloat 3s ease-in-out infinite" }}>
          <div style={{ width: 80, height: 80, background: "linear-gradient(135deg, var(--accent), #A78BFA)", borderRadius: 24, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 16px 48px rgba(123,111,255,0.4)", fontSize: 36 }}>✦</div>
        </div>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 42, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.1 }}>BFU</h1>
          <p style={{ fontFamily: "var(--font-display)", fontSize: 14, color: "var(--accent)", letterSpacing: "0.2em", fontWeight: 600, marginTop: 4 }}>{t("auth.tagline")}</p>
        </div>
        <p style={{ color: "var(--text-2)", fontSize: 16, lineHeight: 1.6, maxWidth: 280 }}>
          {t("auth.welcomeText")}
        </p>
        <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
          <p style={{ fontSize: 13, color: "var(--text-3)" }}>{t("auth.openInTelegram")}</p>
          {devMode && (
            <button className="btn-primary" onClick={doDevAuth} disabled={loading}>
              {loading ? t("auth.authenticating") : t("auth.devLogin")}
            </button>
          )}
        </div>
      </div>
    </div>
  );

  // ── REGISTER ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "52px 24px 0", flexShrink: 0 }}>
        {(!forceRegister || regStep > 0) && (
          <button onClick={() => regStep === 0 ? setScreen("welcome") : setRegStep(r => r - 1)}
            style={{ background: "none", border: "none", color: "var(--text-2)", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, marginBottom: 20 }}>
            <Icon name="arrow_left" size={18} /> {regStep === 0 ? t("common.back") : t("common.previous")}
          </button>
        )}
        {(forceRegister && regStep === 0) && <div style={{ marginBottom: 20 }} />}
        <div style={{ height: 3, background: "var(--surface-2)", borderRadius: 99, marginBottom: 6, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${progress}%`, background: "linear-gradient(90deg, var(--accent), #A78BFA)", borderRadius: 99, transition: "width 0.4s ease" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
          <span style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "var(--font-display)", fontWeight: 600, letterSpacing: "0.08em" }}>
            {t("auth.stepOf", { a: regStep + 1, b: steps.length })}
          </span>
          <span style={{ fontSize: 11, color: "var(--text-3)" }}>{Math.round(progress)}%</span>
        </div>
        <div style={{ fontSize: 28, marginBottom: 6 }}>{current.emoji}</div>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800, marginBottom: 4 }}>{current.title}</h2>
        <p style={{ color: "var(--text-2)", fontSize: 13, marginBottom: 20, lineHeight: 1.5 }}>{current.sub}</p>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "0 24px" }}>
        {current.content}
        <div style={{ height: 20 }} />
      </div>

      <div style={{ padding: "12px 24px 36px", flexShrink: 0, borderTop: "1px solid var(--border)", background: "var(--bg)" }}>
        <button className="btn-primary" onClick={goNext}
          disabled={loading || !canContinue}
          style={{ opacity: !canContinue ? 0.5 : 1 }}>
          {loading ? t("common.saving") : (regStep < steps.length - 1 ? t("common.continue") : t("auth.completeRegistration"))}
        </button>
      </div>
    </div>
  );
};
