import { useState, useEffect, useRef } from "react";
import { Icon } from "../components/Icons";
import { auth, health, makeDevInitData, storage, regions, users } from "../api";
import { useT } from "../i18n";
import { tgAlert, tgConfirm, getStartParam, requestWriteAccess } from "../tg";
import { nearestRegionId } from "../regionCentroids";
import { phoneLocal, phoneComplete, toE164 } from "../phone";

const LANGUAGES = [
  { label: "English", code: "en" },
  { label: "O'zbekcha", code: "uz" },
  { label: "Русский", code: "ru" },
];
const CURRENT_YEAR = new Date().getFullYear();
const MIN_BIRTH_YEAR = CURRENT_YEAR - 60;
const MAX_BIRTH_YEAR = CURRENT_YEAR - 10;

// About must be >= 10 words (mirrors the server rule).
const ABOUT_MIN_WORDS = 10;
const wordCount = (s) => String(s || "").trim().split(/\s+/).filter(Boolean).length;

export const AuthScreen = ({ onComplete, forceRegister = false }) => {
  const { t, lang, setLang } = useT();
  const [screen, setScreen] = useState(forceRegister ? "register" : "welcome");
  const [regStep, setRegStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [devMode, setDevMode] = useState(false);

  const [dbRegions, setDbRegions] = useState([]);

  const [form, setForm] = useState({
    language: lang,
    name: "", surname: "",
    gender: "", birth_year: "", phone_number: "",
    region_id: "",
    about: "",
    latitude: null, longitude: null,
  });
  const [locStatus, setLocStatus] = useState(""); // "" | sharing | shared | failed
  const [selectedSkills] = useState([]);

  // Validation errors
  const [errors, setErrors] = useState({});

  const askedWriteRef = useRef(false);

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

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const shareLocation = () => {
    if (!navigator.geolocation) { setLocStatus("failed"); return; }
    setLocStatus("sharing");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const auto = nearestRegionId(dbRegions, lat, lng);
        setForm(f => ({ ...f, latitude: lat, longitude: lng,
                              region_id: auto ? String(auto) : f.region_id }));
        setLocStatus("shared");
      },
      () => setLocStatus("failed"),
      { enableHighAccuracy: true, timeout: 10000 }
    );
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
      if (!phoneComplete(form.phone_number)) {
        errs.phone_number = t("auth.err.phone");
      }
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const submitRegistration = async () => {
    setLoading(true);
    try {
      // Intentions (open_to_work / open_to_volunteering) are intentionally NOT sent:
      // the backend defaults every new member to opted-IN, and they can adjust it
      // later in profile. Sending false here would silently override those defaults.
      await users.updateMe({
        language: form.language,
        name: form.name.trim(),
        surname: form.surname.trim(),
        gender: form.gender,
        birth_year: parseInt(form.birth_year) || null,
        phone_number: form.phone_number,
        region_id: parseInt(form.region_id) || null,
        latitude: form.latitude,
        longitude: form.longitude,
        about: form.about,
      });

      // Finalize: mark registered + set name tags in all groups
      await users.finalize();
      await ensureWriteAccess();
      onComplete(true);
    } catch (err) {
      tgAlert(t("auth.registerFailed", { msg: err.message }));
      setLoading(false);
    }
  };

  // Ask for bot-DM permission once (so admin can later reach this user), then
  // record the grant. Best-effort — a decline or any error must never block sign-up.
  const ensureWriteAccess = async () => {
    if (askedWriteRef.current) return;
    askedWriteRef.current = true;
    try {
      const granted = await requestWriteAccess();
      if (granted) await users.allowMessages();
    } catch { /* ignore */ }
  };

  const goNext = () => {
    ensureWriteAccess();
    if (!validateStep(regStep)) return;
    if (regStep === steps.length - 1) {
      submitRegistration();
    } else {
      setRegStep(r => r + 1);
    }
  };

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
              {errors.name && <div style={{ color: "var(--terra)", fontSize: 11, marginTop: 4 }}>{errors.name}</div>}
            </div>
            <div style={{ flex: 1 }}>
              <div className="section-label">{t("auth.lastName")} *</div>
              <input className="input-field" placeholder={t("auth.lastNamePh")} value={form.surname}
                onChange={e => set("surname", e.target.value)} />
              {errors.surname && <div style={{ color: "var(--terra)", fontSize: 11, marginTop: 4 }}>{errors.surname}</div>}
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
            {errors.gender && <div style={{ color: "var(--terra)", fontSize: 11, marginTop: 4 }}>{errors.gender}</div>}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div className="section-label">{t("auth.birthYear")} *</div>
              <input className="input-field" type="number" placeholder={t("auth.birthYearPh")}
                value={form.birth_year} onChange={e => set("birth_year", e.target.value)}
                style={{ textAlign: "center" }} />
              {errors.birth_year && <div style={{ color: "var(--terra)", fontSize: 11, marginTop: 4 }}>{errors.birth_year}</div>}
            </div>
            <div style={{ flex: 2 }}>
              <div className="section-label">{t("auth.phone")} *</div>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
                  color: "var(--text-3)", fontSize: 14, pointerEvents: "none", fontFamily: "var(--font-body)" }}>+998</span>
                <input className="input-field" type="tel" inputMode="numeric" placeholder="90 123 45 67"
                  value={phoneLocal(form.phone_number)}
                  onChange={e => set("phone_number", toE164(e.target.value))}
                  style={{ paddingLeft: 52 }} />
              </div>
              {phoneLocal(form.phone_number).length > 0 && !phoneComplete(form.phone_number) && (
                <div style={{ color: "var(--terra)", fontSize: 11, marginTop: 4 }}>{t("auth.err.phoneDigits")}</div>
              )}
              {errors.phone_number && <div style={{ color: "var(--terra)", fontSize: 11, marginTop: 4 }}>{errors.phone_number}</div>}
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
            <select className="input-field" value={form.region_id} onChange={e => set("region_id", e.target.value)}
              style={{ appearance: "none", cursor: "pointer" }}>
              <option value="">{t("auth.selectRegion")}</option>
              {dbRegions.map(r => <option key={r.id} value={r.id}>{r.name_en}</option>)}
            </select>
          </div>

          <div>
            <div className="section-label">{t("loc.label")}</div>
            <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 8 }}>{t("loc.why")}</div>
            <button type="button" onClick={shareLocation} disabled={locStatus === "sharing"} style={{
              width: "100%", background: locStatus === "shared" ? "rgba(18,86,79,0.25)" : "var(--surface-2)",
              border: `1px solid ${locStatus === "shared" ? "rgba(94,197,182,0.5)" : "var(--border)"}`,
              borderRadius: "var(--radius-sm)", padding: "12px",
              color: locStatus === "shared" ? "var(--teal-bright)" : "var(--text)",
              fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 13, cursor: "pointer",
            }}>
              {locStatus === "sharing" ? t("loc.sharing")
                : locStatus === "shared" ? t("loc.shared")
                : t("loc.share")}
            </button>
            {locStatus === "failed" && <div style={{ fontSize: 11, color: "var(--amber)", marginTop: 6 }}>{t("loc.failed")}</div>}
          </div>
        </div>
      ),
    },
    {
      emoji: "✍️", title: t("auth.step.aboutTitle"), sub: t("auth.step.aboutSub"),
      content: (() => {
        const words = wordCount(form.about);
        const enough = words >= ABOUT_MIN_WORDS;
        return (
          <div>
            <textarea className="input-field" rows={6}
              placeholder={t("auth.aboutPh")}
              value={form.about} onChange={e => set("about", e.target.value)}
              style={{ resize: "none", lineHeight: 1.6 }} />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 6 }}>
              <span style={{ fontSize: 12, color: enough ? "var(--text-3)" : "var(--amber)", lineHeight: 1.4 }}>
                {enough ? t("auth.about.ok") : t("auth.about.hint")}
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, flexShrink: 0,
                color: enough ? "var(--teal-bright)" : "var(--text-3)" }}>
                {t("auth.about.counter", { n: words, min: ABOUT_MIN_WORDS })}
              </span>
            </div>
          </div>
        );
      })(),
    },
  ];

  const current = steps[regStep];
  const progress = ((regStep + 1) / steps.length) * 100;

  const canContinue = (() => {
    if (regStep === 0) return !!form.language;
    if (regStep === 1) return !!(form.name && form.surname && form.gender && form.birth_year) && phoneComplete(form.phone_number);
    if (regStep === 2) return !!form.region_id;
    if (regStep === 3) return wordCount(form.about) >= ABOUT_MIN_WORDS;
    return true;
  })();

  // ── WELCOME ──────────────────────────────────────────────────────────────────
  if (screen === "welcome") return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", position: "relative", overflow: "hidden" }}>
      {/* Warm firelit ember/amber glow (was a cold purple radial) */}
      <div style={{ position: "absolute", top: "16%", left: "50%", transform: "translateX(-50%)", width: 360, height: 360, background: "radial-gradient(circle, rgba(255,106,61,0.24) 0%, rgba(232,161,92,0.12) 42%, transparent 72%)", pointerEvents: "none" }} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 28px", textAlign: "center", gap: 24 }}>
        <div style={{ animation: "cardFloat 3s ease-in-out infinite" }}>
          <img src="/bfu-mark.png" alt="BFU" style={{ width: 80, height: 80, objectFit: "contain", filter: "drop-shadow(0 16px 48px rgba(232,161,92,0.42))" }} />
        </div>
        <div>
          <div className="ch-eyebrow" style={{ color: "var(--amber)", letterSpacing: "0.22em" }}>{t("auth.tagline")}</div>
          <h1 className="ch-h1" style={{ marginTop: 8, fontSize: 56, textAlign: "center" }}>BFU</h1>
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
  // The whole screen IS the scroll container (real overflowY:auto, no nested
  // flex:1 region whose height has to be computed exactly right). This is
  // deliberately more forgiving than height-arithmetic: even if the keyboard
  // resize signal is ever stale on some device, nothing is clipped away by
  // overflow:hidden — the user can always scroll to reach a field or the
  // button. The footer is `position: sticky` (sticks to the bottom of
  // whatever is actually visible) instead of a flex child that depends on
  // the container shrinking by exactly the keyboard's height.
  return (
    <div style={{ height: "var(--app-h, 100dvh)", overflowY: "auto", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "calc(var(--safe-t) + 18px) 24px 0" }}>
        {/* Only show "Previous" past step 0. The old step-0 "Back" went to the
            welcome screen, whose only action (dev login) is hidden in prod —
            stranding mid-registration users until they killed the app. */}
        {regStep > 0 && (
          <button onClick={() => setRegStep(r => r - 1)}
            style={{ background: "none", border: "none", color: "var(--text-2)", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, marginBottom: 20 }}>
            <Icon name="arrow_left" size={18} /> {t("common.previous")}
          </button>
        )}
        {regStep === 0 && <div style={{ marginBottom: 20 }} />}
        <div style={{ height: 3, background: "var(--surface-2)", borderRadius: 99, marginBottom: 6, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${progress}%`, background: "linear-gradient(90deg, var(--amber), var(--ember))", borderRadius: 99, transition: "width 0.4s ease" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
          <span style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "var(--font-mono)", letterSpacing: "0.12em" }}>
            {t("auth.stepOf", { a: regStep + 1, b: steps.length })}
          </span>
          <span style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>{Math.round(progress)}%</span>
        </div>
        <div style={{ fontSize: 28, marginBottom: 6 }}>{current.emoji}</div>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800, marginBottom: 4 }}>{current.title}</h2>
        <p style={{ color: "var(--text-2)", fontSize: 13, marginBottom: 20, lineHeight: 1.5 }}>{current.sub}</p>
      </div>

      <div style={{ padding: "0 24px" }}>
        {current.content}
        <div style={{ height: 20 }} />
      </div>

      <div style={{ position: "sticky", bottom: 0, marginTop: "auto", padding: "12px 24px calc(24px + var(--safe-b))", borderTop: "1px solid var(--border)", background: "var(--bg)" }}>
        <button className="btn-primary" onClick={goNext}
          disabled={loading || !canContinue}
          style={{ opacity: !canContinue ? 0.5 : 1 }}>
          {loading ? t("common.saving") : (regStep < steps.length - 1 ? t("common.continue") : t("auth.completeRegistration"))}
        </button>
      </div>
    </div>
  );
};
