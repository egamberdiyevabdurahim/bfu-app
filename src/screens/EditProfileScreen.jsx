import { useState, useEffect } from "react";
import { Icon } from "../components/Icons";
import { users, regions } from "../api";
import { useT } from "../i18n";
import { tgAlert, tgConfirm } from "../tg";

const CURRENT_YEAR = new Date().getFullYear();
const phoneRegex = /^\+?[0-9]{7,15}$/;

export const EditProfileScreen = ({ me, onBack, onSaved }) => {
  const { t, setLang } = useT();
  const [form, setForm] = useState({
    name: me?.name || "",
    surname: me?.surname || "",
    birth_year: me?.birth_year?.toString() || "",
    gender: me?.gender || "",
    tg_username: me?.tg_username || "",
    language: me?.language || "en",
    about: me?.about || "",
    phone_number: me?.phone_number || "",
    open_to_work: me?.open_to_work ?? false,
    open_to_volunteering: me?.open_to_volunteering ?? false,
  });
  const [loading, setLoading] = useState(false);
  const [fetchingUsername, setFetchingUsername] = useState(false);
  const [updatingTags, setUpdatingTags] = useState(false);
  const [errors, setErrors] = useState({});
  const [dbRegions, setDbRegions] = useState([]);

  const origAbout = me?.about || "";
  const origName = me?.name || "";
  const origSurname = me?.surname || "";

  useEffect(() => {
    regions.list().then(setDbRegions).catch(() => {});
  }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const validate = () => {
    const errs = {};
    if (!form.name.trim()) errs.name = t("ep.required");
    if (!form.surname.trim()) errs.surname = t("ep.required");
    if (form.birth_year) {
      const by = parseInt(form.birth_year);
      if (isNaN(by) || by < CURRENT_YEAR - 60 || by > CURRENT_YEAR - 10) {
        errs.birth_year = t("ep.birthYearRange", { min: CURRENT_YEAR - 60, max: CURRENT_YEAR - 10 });
      }
    }
    if (form.phone_number && !phoneRegex.test(form.phone_number)) {
      errs.phone_number = t("ep.phoneInvalid");
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      await users.updateMe({
        name: form.name.trim(),
        surname: form.surname.trim(),
        birth_year: parseInt(form.birth_year) || null,
        gender: form.gender || null,
        tg_username: form.tg_username.replace("@", "") || null,
        language: form.language,
        about: form.about,
        phone_number: form.phone_number || null,
        open_to_work: form.open_to_work,
        open_to_volunteering: form.open_to_volunteering,
      });

      const nameChanged = form.name.trim() !== origName || form.surname.trim() !== origSurname;
      if (nameChanged) {
        setUpdatingTags(true);
        await users.updateTags().catch(() => {});
        setUpdatingTags(false);
      }

      if (onSaved) await onSaved();
      onBack();
    } catch (e) {
      tgAlert(t("ep.saveFailed", { msg: e.message }));
    }
    setLoading(false);
  };

  const handleFetchUsername = async () => {
    setFetchingUsername(true);
    try {
      const res = await users.fetchTgUsername();
      if (res.tg_username) {
        set("tg_username", res.tg_username);
      } else {
        tgAlert(t("ep.noTgUsername"));
      }
    } catch (e) {
      tgAlert(t("ep.fetchFailed", { msg: e.message }));
    }
    setFetchingUsername(false);
  };

  const LANGS = [
    { code: "en", label: "English" },
    { code: "uz", label: "O'zbekcha" },
    { code: "ru", label: "Русский" },
  ];

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "52px 24px 16px", flexShrink: 0, borderBottom: "1px solid var(--border)", background: "var(--bg)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={onBack} style={{
            background: "var(--surface-2)", border: "1px solid var(--border)",
            borderRadius: 99, width: 36, height: 36, display: "flex", alignItems: "center",
            justifyContent: "center", cursor: "pointer", color: "var(--text-2)",
          }}>
            <Icon name="arrow_left" size={16} />
          </button>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 800 }}>{t("ep.title")}</h1>
        </div>
      </div>

      {/* Fields */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Name */}
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div className="section-label">{t("ep.firstName")} *</div>
              <input className="input-field" value={form.name} onChange={e => set("name", e.target.value)} />
              {errors.name && <div style={{ color: "#FF6363", fontSize: 11, marginTop: 4 }}>{errors.name}</div>}
            </div>
            <div style={{ flex: 1 }}>
              <div className="section-label">{t("ep.lastName")} *</div>
              <input className="input-field" value={form.surname} onChange={e => set("surname", e.target.value)} />
              {errors.surname && <div style={{ color: "#FF6363", fontSize: 11, marginTop: 4 }}>{errors.surname}</div>}
            </div>
          </div>
          {(form.name !== origName || form.surname !== origSurname) && (
            <div style={{ fontSize: 11, color: "#FFB347", background: "rgba(255,179,71,0.1)", borderRadius: 8, padding: "8px 12px" }}>
              {t("ep.nameWarn")}
            </div>
          )}

          {/* Birth Year + Phone */}
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div className="section-label">{t("ep.birthYear")}</div>
              <input className="input-field" type="number" placeholder={`${CURRENT_YEAR - 60}–${CURRENT_YEAR - 10}`}
                value={form.birth_year} onChange={e => set("birth_year", e.target.value)} style={{ textAlign: "center" }} />
              {errors.birth_year && <div style={{ color: "#FF6363", fontSize: 11, marginTop: 4 }}>{errors.birth_year}</div>}
            </div>
            <div style={{ flex: 2 }}>
              <div className="section-label">{t("ep.phone")}</div>
              <input className="input-field" type="tel" placeholder="+998911853616"
                value={form.phone_number} onChange={e => set("phone_number", e.target.value)} />
              {errors.phone_number && <div style={{ color: "#FF6363", fontSize: 11, marginTop: 4 }}>{errors.phone_number}</div>}
            </div>
          </div>

          {/* Gender */}
          <div>
            <div className="section-label">{t("ep.gender")}</div>
            <div style={{ display: "flex", gap: 8 }}>
              {["Male", "Female"].map(g => (
                <button key={g} onClick={() => set("gender", g)} style={{
                  flex: 1, background: form.gender === g ? "var(--accent-dim)" : "var(--surface-2)",
                  border: `1px solid ${form.gender === g ? "var(--accent)" : "var(--border)"}`,
                  borderRadius: "var(--radius-sm)", padding: "12px 6px",
                  color: form.gender === g ? "var(--accent)" : "var(--text-2)",
                  fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 14, cursor: "pointer",
                }}>
                  {g === "Male" ? `♂ ${t("common.male")}` : `♀ ${t("common.female")}`}
                </button>
              ))}
            </div>
          </div>

          {/* Intentions */}
          <div>
            <div className="section-label">{t("ep.intentions")}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button onClick={() => set("open_to_work", !form.open_to_work)} style={{
                background: form.open_to_work ? "var(--accent-dim)" : "var(--surface-2)",
                border: `1px solid ${form.open_to_work ? "var(--accent)" : "var(--border)"}`,
                borderRadius: "var(--radius-sm)", padding: "12px 14px",
                color: form.open_to_work ? "var(--accent)" : "var(--text-2)",
                cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 10,
              }}>
                <span style={{ fontSize: 18 }}>⚡</span>
                <div>
                  <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 13 }}>{t("ep.workTitle")}</div>
                  <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>{t("ep.workSub")}</div>
                </div>
                {form.open_to_work && <Icon name="check" size={16} color="var(--accent)" style={{ marginLeft: "auto" }} />}
              </button>
              <button onClick={() => set("open_to_volunteering", !form.open_to_volunteering)} style={{
                background: form.open_to_volunteering ? "rgba(78,205,196,0.12)" : "var(--surface-2)",
                border: `1px solid ${form.open_to_volunteering ? "rgba(78,205,196,0.5)" : "var(--border)"}`,
                borderRadius: "var(--radius-sm)", padding: "12px 14px",
                color: form.open_to_volunteering ? "#4ECDC4" : "var(--text-2)",
                cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 10,
              }}>
                <span style={{ fontSize: 18 }}>🤝</span>
                <div>
                  <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 13 }}>{t("ep.volTitle")}</div>
                  <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>{t("ep.volSub")}</div>
                </div>
                {form.open_to_volunteering && <Icon name="check" size={16} color="#4ECDC4" style={{ marginLeft: "auto" }} />}
              </button>
            </div>
          </div>

          {/* Telegram Username */}
          <div>
            <div className="section-label">{t("ep.tgUsername")}</div>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ position: "relative", flex: 1 }}>
                <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--text-3)", fontSize: 14 }}>@</span>
                <input className="input-field" value={form.tg_username.replace("@", "")}
                  onChange={e => set("tg_username", e.target.value.replace("@", ""))}
                  style={{ paddingLeft: 28 }} placeholder={t("ep.tgUsernamePh")} />
              </div>
              <button onClick={handleFetchUsername} disabled={fetchingUsername} style={{
                background: "var(--accent-dim)", border: "1px solid var(--accent)",
                borderRadius: "var(--radius-sm)", padding: "0 14px", cursor: "pointer",
                color: "var(--accent)", fontFamily: "var(--font-display)", fontWeight: 600,
                fontSize: 12, flexShrink: 0,
              }}>
                {fetchingUsername ? "..." : t("ep.auto")}
              </button>
            </div>
          </div>

          {/* Language */}
          <div>
            <div className="section-label">{t("ep.language")}</div>
            <div style={{ display: "flex", gap: 8 }}>
              {LANGS.map(l => (
                <button key={l.code} onClick={() => { set("language", l.code); setLang(l.code); }} style={{
                  flex: 1, background: form.language === l.code ? "var(--accent-dim)" : "var(--surface-2)",
                  border: `1px solid ${form.language === l.code ? "var(--accent)" : "var(--border)"}`,
                  borderRadius: "var(--radius-sm)", padding: "10px 4px",
                  color: form.language === l.code ? "var(--accent)" : "var(--text-2)",
                  fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 12, cursor: "pointer",
                }}>
                  {l.label}
                </button>
              ))}
            </div>
          </div>

          {/* Bio */}
          <div>
            <div className="section-label">{t("ep.bio")}</div>
            <textarea className="input-field" rows={5} value={form.about}
              onChange={e => set("about", e.target.value)}
              placeholder={t("ep.bioPh")}
              style={{ resize: "none", lineHeight: 1.6 }} />
            {form.about !== origAbout && (
              <div style={{ fontSize: 11, color: "#4ECDC4", background: "rgba(78,205,196,0.1)", borderRadius: 8, padding: "8px 12px", marginTop: 6 }}>
                {t("ep.bioReanalyze")}
              </div>
            )}
          </div>

          <div style={{ height: 20 }} />
        </div>
      </div>

      {/* Save */}
      <div style={{ padding: "12px 24px 36px", flexShrink: 0, borderTop: "1px solid var(--border)", background: "var(--bg)" }}>
        <button className="btn-primary" onClick={handleSave} disabled={loading || updatingTags}>
          {updatingTags ? t("ep.updatingTags") : loading ? t("common.saving") : t("ep.saveChanges")}
        </button>
      </div>
    </div>
  );
};
