"use client";

import { useEffect, useRef, useState } from "react";
import Atmosphere from "@/components/Atmosphere";
import { bfu } from "@/lib/client-api";
import { useT, useLang } from "@/components/i18n/LocaleProvider";
import { nearestRegionId } from "@/lib/regionCentroids";

// Mirrors the Telegram Mini App's 6-step registration (src/screens/AuthScreen.jsx):
// language → basic info → location/school/centers → about → intentions → groups.
// Submits with the SAME backend calls the Mini App uses: PATCH /users/me then
// POST /users/me/finalize (finalize flips is_registered + sets group name tags).

const CURRENT_YEAR = new Date().getFullYear();
const MIN_BIRTH_YEAR = CURRENT_YEAR - 60;
const MAX_BIRTH_YEAR = CURRENT_YEAR - 10;
const PHONE_RE = /^\+?[0-9]{7,15}$/;

const LANGUAGES = [
  { label: "English", code: "en" },
  { label: "O‘zbekcha", code: "uz" },
  { label: "Русский", code: "ru" },
];

function regionName(r, lang) {
  return r[`name_${lang}`] || r.name_en || r.name_uz || r.name_ru || r.name || `#${r.id}`;
}

const INPUT = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--hair)",
  background: "var(--surface-2)",
  color: "var(--text)",
  fontFamily: "var(--font-body)",
  fontSize: 15,
  outline: "none",
};
const LABEL = {
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "var(--muted-strong)",
  marginBottom: 8,
};
const ERR = { color: "var(--terra)", fontSize: 12, marginTop: 5 };

export default function RegisterFlow({ me, preview = false }) {
  const t = useT();
  const { lang, setLang } = useLang();

  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  const [regions, setRegions] = useState([]);
  const [schools, setSchools] = useState([]);
  const [lcs, setLcs] = useState([]);
  const [groups, setGroups] = useState([]);
  const [checkingGroups, setCheckingGroups] = useState(false);

  const [form, setForm] = useState({
    language: lang,
    name: me?.name || "",
    surname: me?.surname || "",
    gender: me?.gender || "",
    birth_year: me?.birth_year ? String(me.birth_year) : "",
    phone_number: me?.phone_number || "",
    region_id: me?.region_id ? String(me.region_id) : "",
    school_id: "",
    lc_ids: [],
    about: me?.about || "",
    open_to_work: false,
    open_to_volunteering: false,
    latitude: null,
    longitude: null,
  });
  const [errors, setErrors] = useState({});
  const [schoolSearch, setSchoolSearch] = useState("");
  const [lcSearch, setLcSearch] = useState("");
  const [locStatus, setLocStatus] = useState("");

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    bfu("/regions").then((d) => setRegions(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  async function fetchSchoolsAndLCs(regionId) {
    if (!regionId) return;
    try {
      const [s, l] = await Promise.all([
        bfu(`/regions/${regionId}/schools`).catch(() => []),
        bfu(`/regions/${regionId}/learning-centers`).catch(() => []),
      ]);
      setSchools(Array.isArray(s) ? s : []);
      setLcs(Array.isArray(l) ? l : []);
      set("school_id", "");
      set("lc_ids", []);
    } catch {
      /* ignore */
    }
  }

  const lastGroupsCheck = useRef(0);
  async function refreshGroups() {
    const now = Date.now();
    if (now - lastGroupsCheck.current < 3000) return;
    lastGroupsCheck.current = now;
    setCheckingGroups(true);
    try {
      const d = await bfu("/users/me/groups");
      setGroups(Array.isArray(d) ? d : []);
    } catch {
      setGroups([]); // fail open — never trap the final step on a hiccup
    }
    setCheckingGroups(false);
  }

  function shareLocation() {
    if (!navigator.geolocation) {
      setLocStatus("failed");
      return;
    }
    setLocStatus("sharing");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        // Auto-pick the nearest region (matches the Mini App) — but never
        // overwrite a region the user already chose.
        const auto = nearestRegionId(regions, lat, lng);
        setForm((f) => ({
          ...f,
          latitude: lat,
          longitude: lng,
          region_id: f.region_id || (auto ? String(auto) : f.region_id),
        }));
        if (auto && !form.region_id) fetchSchoolsAndLCs(auto);
        setLocStatus("shared");
      },
      () => setLocStatus("failed"),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  function validateBasics() {
    const e = {};
    if (!form.name.trim()) e.name = t("register.err_first_name");
    if (!form.surname.trim()) e.surname = t("register.err_last_name");
    if (!form.gender) e.gender = t("register.err_gender");
    const by = parseInt(form.birth_year, 10);
    if (!by || by < MIN_BIRTH_YEAR || by > MAX_BIRTH_YEAR) {
      e.birth_year = t("register.err_birth_year", { min: MIN_BIRTH_YEAR, max: MAX_BIRTH_YEAR });
    }
    if (!form.phone_number || !PHONE_RE.test(form.phone_number.trim())) {
      e.phone_number = t("register.err_phone");
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const canContinue = (() => {
    if (preview) return true; // review mode — walk every step freely
    if (step === 0) return !!form.language;
    if (step === 1) return !!(form.name && form.surname && form.gender && form.birth_year && form.phone_number);
    if (step === 2) return !!form.region_id;
    if (step === 3) return !!form.about.trim();
    if (step === 4) return true;
    if (step === 5) return groups.length === 0 || groups.every((g) => g.joined);
    return true;
  })();

  async function submit() {
    setLoading(true);
    setSubmitError(null);
    try {
      await bfu("/users/me", {
        method: "PATCH",
        body: {
          language: form.language,
          name: form.name.trim(),
          surname: form.surname.trim(),
          gender: form.gender,
          birth_year: parseInt(form.birth_year, 10) || null,
          phone_number: form.phone_number.trim(),
          region_id: parseInt(form.region_id, 10) || null,
          school_id: form.school_id ? parseInt(form.school_id, 10) : null,
          learning_center_ids: form.lc_ids,
          latitude: form.latitude,
          longitude: form.longitude,
          about: form.about,
          open_to_work: form.open_to_work,
          open_to_volunteering: form.open_to_volunteering,
        },
      });
      await bfu("/users/me/finalize", { method: "POST" });
      window.location.href = "/web/home";
    } catch (err) {
      setLoading(false);
      setSubmitError(err?.message || t("register.err_generic"));
    }
  }

  const STEPS = 6;
  function goNext() {
    if (!preview && step === 1 && !validateBasics()) return;
    if (step === STEPS - 1) {
      if (!preview) submit();
      return;
    }
    if (step === STEPS - 2) refreshGroups(); // entering groups step → load them
    setStep((s) => s + 1);
  }

  const STEP_META = [
    { emoji: "🌐", title: t("register.s0_title"), sub: t("register.s0_sub") },
    { emoji: "🧬", title: t("register.s1_title"), sub: t("register.s1_sub") },
    { emoji: "📍", title: t("register.s2_title"), sub: t("register.s2_sub") },
    { emoji: "✍️", title: t("register.s3_title"), sub: t("register.s3_sub") },
    { emoji: "🤝", title: t("register.s4_title"), sub: t("register.s4_sub") },
    { emoji: "💬", title: t("register.s5_title"), sub: t("register.s5_sub") },
  ];
  const meta = STEP_META[step];
  const progress = ((step + 1) / STEPS) * 100;

  const filteredSchools = schools
    .filter((s) => !schoolSearch || s.name.toLowerCase().includes(schoolSearch.toLowerCase()))
    .slice(0, 20);
  const filteredLCs = lcs
    .filter((l) => (!lcSearch || l.name.toLowerCase().includes(lcSearch.toLowerCase())) && !form.lc_ids.includes(l.id))
    .slice(0, 20);

  return (
    <main
      style={{
        position: "relative",
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 20px",
      }}
    >
      <Atmosphere />
      <div style={{ position: "relative", zIndex: 2, width: "100%", maxWidth: 540 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/bfu-mark.png"
          alt="Bright Futures Uzbekistan"
          style={{ height: 44, width: "auto", display: "block", margin: "0 auto 20px", filter: "drop-shadow(0 2px 16px rgba(232,161,92,0.3))" }}
        />

        <div
          className="ch-cell-static"
          style={{
            padding: "30px 30px 26px",
            background: "linear-gradient(160deg, rgba(232,161,92,0.06), rgba(192,86,59,0.04) 55%, var(--surface))",
          }}
        >
          {preview && (
            <div style={{ marginBottom: 14, padding: "8px 12px", borderRadius: "var(--radius-sm)", background: "rgba(94,197,182,0.12)", border: "1px solid rgba(94,197,182,0.4)", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--teal-bright)", textAlign: "center" }}>
              Preview — walk every step freely · sign-up disabled
            </div>
          )}

          {/* Progress + step counter */}
          <div style={{ height: 3, background: "var(--surface-2)", borderRadius: 99, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${progress}%`, background: "linear-gradient(90deg, var(--amber), var(--ember))", borderRadius: 99, transition: "width 0.4s ease" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, marginBottom: 16 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: "0.12em", color: "var(--muted)" }}>
              {t("register.step_of", { a: step + 1, b: STEPS })}
            </span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--muted)" }}>{Math.round(progress)}%</span>
          </div>

          <div style={{ fontSize: 26, marginBottom: 6 }}>{meta.emoji}</div>
          <h1 style={{ margin: 0, fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "clamp(22px, 5vw, 27px)", letterSpacing: "-0.02em", color: "var(--text)" }}>
            {meta.title}
          </h1>
          <p style={{ margin: "8px 0 22px", fontSize: 13.5, lineHeight: 1.5, color: "var(--muted-strong)" }}>{meta.sub}</p>

          {/* ── Step content ── */}
          {step === 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {LANGUAGES.map((l) => {
                const on = form.language === l.code;
                return (
                  <button
                    key={l.code}
                    type="button"
                    onClick={() => { set("language", l.code); setLang(l.code); }}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "14px 18px", borderRadius: "var(--radius-sm)",
                      border: `1px solid ${on ? "var(--amber)" : "var(--hair)"}`,
                      background: on ? "rgba(232,161,92,0.14)" : "var(--surface-2)",
                      color: on ? "var(--amber)" : "var(--text)",
                      fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 15, cursor: "pointer",
                    }}
                  >
                    {l.label}
                    {on && <span aria-hidden>✓</span>}
                  </button>
                );
              })}
            </div>
          )}

          {step === 1 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <div style={LABEL}>{t("register.first_name")} *</div>
                  <input style={INPUT} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder={t("register.first_name_ph")} maxLength={100} />
                  {errors.name && <div style={ERR}>{errors.name}</div>}
                </div>
                <div>
                  <div style={LABEL}>{t("register.last_name")} *</div>
                  <input style={INPUT} value={form.surname} onChange={(e) => set("surname", e.target.value)} placeholder={t("register.last_name_ph")} maxLength={100} />
                  {errors.surname && <div style={ERR}>{errors.surname}</div>}
                </div>
              </div>
              <div>
                <div style={LABEL}>{t("register.gender")} *</div>
                <div style={{ display: "flex", gap: 8 }}>
                  {[
                    { v: "Male", label: `♂ ${t("register.male")}` },
                    { v: "Female", label: `♀ ${t("register.female")}` },
                  ].map((g) => {
                    const on = form.gender === g.v;
                    return (
                      <button key={g.v} type="button" onClick={() => set("gender", g.v)} style={{
                        flex: 1, padding: "12px 6px", borderRadius: "var(--radius-sm)",
                        border: `1px solid ${on ? "var(--amber)" : "var(--hair)"}`,
                        background: on ? "rgba(232,161,92,0.14)" : "var(--surface-2)",
                        color: on ? "var(--amber)" : "var(--muted-strong)",
                        fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 14, cursor: "pointer",
                      }}>{g.label}</button>
                    );
                  })}
                </div>
                {errors.gender && <div style={ERR}>{errors.gender}</div>}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12 }}>
                <div>
                  <div style={LABEL}>{t("register.birth_year")} *</div>
                  <input style={{ ...INPUT, textAlign: "center" }} value={form.birth_year} inputMode="numeric"
                    onChange={(e) => set("birth_year", e.target.value.replace(/[^\d]/g, "").slice(0, 4))} placeholder={t("register.birth_year_ph")} />
                  {errors.birth_year && <div style={ERR}>{errors.birth_year}</div>}
                </div>
                <div>
                  <div style={LABEL}>{t("register.phone")} *</div>
                  <input style={INPUT} type="tel" value={form.phone_number} onChange={(e) => set("phone_number", e.target.value)} placeholder="+998911853616" maxLength={25} />
                  {errors.phone_number && <div style={ERR}>{errors.phone_number}</div>}
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <div style={LABEL}>{t("register.region")} *</div>
                <select style={{ ...INPUT, cursor: "pointer" }} value={form.region_id}
                  onChange={(e) => { set("region_id", e.target.value); fetchSchoolsAndLCs(e.target.value); }}>
                  <option value="" disabled>{t("register.select_region")}</option>
                  {regions.map((r) => <option key={r.id} value={r.id}>{regionName(r, lang)}</option>)}
                </select>
              </div>
              {/* School (single) */}
              <div>
                <div style={LABEL}>{t("register.school")}</div>
                {form.school_id ? (
                  <span className="ch-tag" onClick={() => set("school_id", "")} style={{ cursor: "pointer" }}>
                    {schools.find((s) => String(s.id) === String(form.school_id))?.name} ✕
                  </span>
                ) : (
                  <>
                    <input style={INPUT} value={schoolSearch} onChange={(e) => setSchoolSearch(e.target.value)} placeholder={t("register.search_school")} disabled={!form.region_id} />
                    {schoolSearch && filteredSchools.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                        {filteredSchools.map((s) => (
                          <button key={s.id} type="button" onClick={() => { set("school_id", String(s.id)); setSchoolSearch(""); }}
                            style={{ background: "var(--surface-2)", border: "1px solid var(--hair)", borderRadius: 20, color: "var(--text)", padding: "6px 12px", fontSize: 12.5, cursor: "pointer" }}>
                            + {s.name}
                          </button>
                        ))}
                      </div>
                    )}
                    {!form.region_id && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>{t("register.select_region_first")}</div>}
                  </>
                )}
              </div>
              {/* Learning centers (multi) */}
              <div>
                <div style={LABEL}>{t("register.lcs")}</div>
                {form.lc_ids.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                    {form.lc_ids.map((id) => (
                      <span key={id} className="ch-tag" onClick={() => set("lc_ids", form.lc_ids.filter((x) => x !== id))} style={{ cursor: "pointer" }}>
                        {lcs.find((l) => l.id === id)?.name} ✕
                      </span>
                    ))}
                  </div>
                )}
                <input style={INPUT} value={lcSearch} onChange={(e) => setLcSearch(e.target.value)} placeholder={t("register.search_lc")} disabled={!form.region_id} />
                {lcSearch && filteredLCs.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                    {filteredLCs.map((l) => (
                      <button key={l.id} type="button" onClick={() => { set("lc_ids", [...form.lc_ids, l.id]); setLcSearch(""); }}
                        style={{ background: "var(--surface-2)", border: "1px solid var(--hair)", borderRadius: 20, color: "var(--text)", padding: "6px 12px", fontSize: 12.5, cursor: "pointer" }}>
                        + {l.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {/* Location */}
              <div>
                <div style={LABEL}>{t("register.loc_label")}</div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>{t("register.loc_why")}</div>
                <button type="button" onClick={shareLocation} disabled={locStatus === "sharing"} style={{
                  width: "100%", padding: 12, borderRadius: "var(--radius-sm)", cursor: "pointer",
                  border: `1px solid ${locStatus === "shared" ? "rgba(94,197,182,0.5)" : "var(--hair)"}`,
                  background: locStatus === "shared" ? "rgba(18,86,79,0.25)" : "var(--surface-2)",
                  color: locStatus === "shared" ? "var(--teal-bright)" : "var(--text)",
                  fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 13,
                }}>
                  {locStatus === "sharing" ? t("register.loc_sharing") : locStatus === "shared" ? t("register.loc_shared") : t("register.loc_share")}
                </button>
                {locStatus === "failed" && <div style={{ fontSize: 11.5, color: "var(--amber)", marginTop: 6 }}>{t("register.loc_failed")}</div>}
              </div>
            </div>
          )}

          {step === 3 && (
            <textarea style={{ ...INPUT, resize: "none", lineHeight: 1.6 }} rows={6} value={form.about}
              onChange={(e) => set("about", e.target.value)} placeholder={t("register.about_ph")} />
          )}

          {step === 4 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                { key: "open_to_work", title: t("register.work_title"), sub: t("register.work_sub") },
                { key: "open_to_volunteering", title: t("register.vol_title"), sub: t("register.vol_sub") },
              ].map((it) => {
                const on = form[it.key];
                return (
                  <button key={it.key} type="button" onClick={() => set(it.key, !on)} style={{
                    padding: 16, borderRadius: "var(--radius-sm)", textAlign: "left", cursor: "pointer",
                    border: `1px solid ${on ? "var(--amber)" : "var(--hair)"}`,
                    background: on ? "rgba(232,161,92,0.14)" : "var(--surface-2)",
                    color: on ? "var(--amber)" : "var(--text)",
                  }}>
                    <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, marginBottom: 4 }}>{it.title}</div>
                    <div style={{ fontSize: 13, color: on ? "var(--amber)" : "var(--muted-strong)" }}>{it.sub}</div>
                  </button>
                );
              })}
            </div>
          )}

          {step === 5 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {groups.length === 0 ? (
                <div style={{ textAlign: "center", padding: 20, color: "var(--muted)", fontSize: 14 }}>
                  {checkingGroups ? t("register.groups_checking") : t("register.groups_none")}
                </div>
              ) : (
                groups.map((g) => (
                  <div key={g.group_id} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                    padding: "14px 16px", borderRadius: "var(--radius-sm)",
                    border: `1px solid ${g.joined ? "rgba(94,197,182,0.4)" : "var(--hair)"}`, background: "var(--surface-2)",
                  }}>
                    <div>
                      <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 14, color: "var(--text)" }}>{g.name}</div>
                      <div style={{ fontSize: 12, marginTop: 2, color: g.joined ? "var(--teal-bright)" : "var(--muted)" }}>
                        {g.joined ? t("register.groups_joined") : t("register.groups_not_joined")}
                      </div>
                    </div>
                    {!g.joined && g.group_link && (
                      <a href={g.group_link} target="_blank" rel="noopener noreferrer" style={{
                        flexShrink: 0, background: "linear-gradient(135deg, var(--amber), var(--terra))", color: "#160E08",
                        borderRadius: "var(--radius-sm)", padding: "8px 14px", fontSize: 12, fontWeight: 700, textDecoration: "none", fontFamily: "var(--font-display)",
                      }}>{t("register.groups_join")}</a>
                    )}
                    {g.joined && <span style={{ fontSize: 18 }} aria-hidden>✅</span>}
                  </div>
                ))
              )}
              <button type="button" onClick={refreshGroups} disabled={checkingGroups} style={{
                padding: 12, borderRadius: "var(--radius-sm)", cursor: "pointer",
                border: "1px solid var(--hair)", background: "var(--surface-2)",
                color: "var(--muted-strong)", fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 13, opacity: checkingGroups ? 0.6 : 1,
              }}>
                {checkingGroups ? t("register.groups_check_btn") : t("register.groups_refresh")}
              </button>
            </div>
          )}

          {submitError && (
            <div role="alert" style={{ margin: "18px 0 0", padding: "12px 15px", borderRadius: "var(--radius-sm)", border: "1px solid rgba(192,86,59,0.4)", background: "rgba(192,86,59,0.12)", fontSize: 13.5, color: "var(--text)" }}>
              {submitError}
            </div>
          )}

          {/* Footer nav */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 26 }}>
            {step > 0 && (
              <button type="button" onClick={() => setStep((s) => s - 1)} style={{
                background: "none", border: "1px solid var(--hair)", borderRadius: "var(--radius-sm)",
                color: "var(--muted-strong)", padding: "13px 18px", cursor: "pointer", fontFamily: "var(--font-body)", fontSize: 14,
              }}>
                {t("register.previous")}
              </button>
            )}
            <button type="button" onClick={goNext} className="ch-btn-primary" disabled={loading || !canContinue || (preview && step === STEPS - 1)}
              style={{ flex: 1, justifyContent: "center", fontSize: 15, padding: "14px 20px", border: "none", cursor: loading || !canContinue || (preview && step === STEPS - 1) ? "default" : "pointer", opacity: !canContinue ? 0.5 : loading ? 0.7 : 1 }}>
              {preview && step === STEPS - 1
                ? "👁 Preview — sign-up disabled"
                : loading ? t("register.saving") : step < STEPS - 1 ? t("register.continue") : t("register.complete")}
            </button>
          </div>
        </div>

        <div style={{ marginTop: 20, textAlign: "center", fontFamily: "var(--font-accent)", fontStyle: "italic", fontSize: 16, color: "var(--muted)" }}>
          {t("register.tagline")}
        </div>
      </div>
    </main>
  );
}
