"use client";

import { useMemo, useState } from "react";
import Atmosphere from "@/components/Atmosphere";
import { bfu } from "@/lib/client-api";
import { useT } from "@/components/i18n/LocaleProvider";
import { useLang } from "@/components/i18n/LocaleProvider";

// Resolve a region's display name for the active language, falling back through
// the other locales, then any bare `name`.
function regionName(r, lang) {
  return (
    r[`name_${lang}`] ||
    r.name_uz ||
    r.name_en ||
    r.name_ru ||
    r.name ||
    `#${r.id}`
  );
}

const FIELD_LABEL = {
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "var(--muted-strong)",
  marginBottom: 8,
  display: "flex",
  alignItems: "center",
  gap: 8,
};

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

export default function RegisterFlow({ me, regions = [] }) {
  const t = useT();
  const { lang } = useLang();

  const [name, setName] = useState(me?.name || "");
  const [surname, setSurname] = useState(me?.surname || "");
  const [gender, setGender] = useState(me?.gender || "");
  const [birthYear, setBirthYear] = useState(
    me?.birth_year ? String(me.birth_year) : ""
  );
  const [phone, setPhone] = useState(me?.phone_number || "");
  const [regionId, setRegionId] = useState(me?.region_id ? String(me.region_id) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const sortedRegions = useMemo(
    () =>
      [...regions].sort((a, b) =>
        regionName(a, lang).localeCompare(regionName(b, lang))
      ),
    [regions, lang]
  );

  const canSubmit = name.trim() && phone.trim() && regionId;

  async function submit(e) {
    e.preventDefault();
    setError(null);
    if (!canSubmit) {
      setError(t("register.err_required"));
      return;
    }
    let year = null;
    if (birthYear.trim()) {
      year = parseInt(birthYear.trim(), 10);
      if (!Number.isInteger(year) || year < 1930 || year > 2018) {
        setError(t("register.err_year"));
        return;
      }
    }
    setBusy(true);
    try {
      await bfu("/users/me/register", {
        method: "POST",
        body: {
          name: name.trim(),
          surname: surname.trim() || null,
          gender: gender || null,
          birth_year: year,
          phone_number: phone.trim(),
          region_id: Number(regionId),
          language: lang,
        },
      });
      // Hard navigation so the server re-reads the (now registered) session.
      window.location.href = "/home";
    } catch (err) {
      setBusy(false);
      setError(err?.message || t("register.err_generic"));
    }
  }

  const GENDERS = [
    { v: "male", label: t("register.gender_male") },
    { v: "female", label: t("register.gender_female") },
    { v: "other", label: t("register.gender_other") },
  ];

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

      <div
        style={{ position: "relative", zIndex: 2, width: "100%", maxWidth: 520 }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/bfu-mark.png"
          alt="Bright Futures Uzbekistan"
          style={{
            height: 46,
            width: "auto",
            display: "block",
            margin: "0 auto 22px",
            filter: "drop-shadow(0 2px 16px rgba(232,161,92,0.3))",
          }}
        />

        <form
          onSubmit={submit}
          className="ch-cell-static"
          style={{
            padding: "34px 32px 30px",
            background:
              "linear-gradient(160deg, rgba(232,161,92,0.06), rgba(192,86,59,0.04) 55%, var(--surface))",
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "var(--amber)",
            }}
          >
            {t("register.eyebrow")}
          </div>
          <h1
            style={{
              margin: "12px 0 0",
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: "clamp(28px, 6vw, 36px)",
              lineHeight: 1.08,
              letterSpacing: "-0.02em",
              color: "var(--text)",
            }}
          >
            {t("register.title_lead")}{" "}
            <span
              style={{
                fontFamily: "var(--font-accent)",
                fontStyle: "italic",
                fontWeight: 400,
                color: "var(--amber)",
              }}
            >
              {t("register.title_accent")}
            </span>
          </h1>
          <p
            style={{
              margin: "12px 0 26px",
              fontSize: 14.5,
              lineHeight: 1.55,
              color: "var(--muted-strong)",
            }}
          >
            {t("register.subtitle")}
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <div style={FIELD_LABEL}>{t("register.name")}</div>
              <input
                style={INPUT}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("register.name_ph")}
                autoComplete="given-name"
                maxLength={100}
              />
            </div>
            <div>
              <div style={FIELD_LABEL}>
                {t("register.surname")}
                <span style={{ opacity: 0.6, textTransform: "none", letterSpacing: 0 }}>
                  · {t("register.optional")}
                </span>
              </div>
              <input
                style={INPUT}
                value={surname}
                onChange={(e) => setSurname(e.target.value)}
                placeholder={t("register.surname_ph")}
                autoComplete="family-name"
                maxLength={100}
              />
            </div>
          </div>

          {/* Gender segmented */}
          <div style={{ marginTop: 16 }}>
            <div style={FIELD_LABEL}>
              {t("register.gender")}
              <span style={{ opacity: 0.6, textTransform: "none", letterSpacing: 0 }}>
                · {t("register.optional")}
              </span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {GENDERS.map((g) => {
                const on = gender === g.v;
                return (
                  <button
                    key={g.v}
                    type="button"
                    onClick={() => setGender(on ? "" : g.v)}
                    style={{
                      flex: 1,
                      padding: "11px 8px",
                      borderRadius: "var(--radius-sm)",
                      border: `1px solid ${on ? "var(--amber)" : "var(--hair)"}`,
                      background: on ? "rgba(232,161,92,0.14)" : "var(--surface-2)",
                      color: on ? "var(--amber)" : "var(--muted-strong)",
                      fontFamily: "var(--font-body)",
                      fontSize: 14,
                      fontWeight: on ? 600 : 400,
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                  >
                    {g.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
            <div>
              <div style={FIELD_LABEL}>
                {t("register.birth_year")}
                <span style={{ opacity: 0.6, textTransform: "none", letterSpacing: 0 }}>
                  · {t("register.optional")}
                </span>
              </div>
              <input
                style={INPUT}
                value={birthYear}
                onChange={(e) => setBirthYear(e.target.value.replace(/[^\d]/g, "").slice(0, 4))}
                placeholder={t("register.birth_year_ph")}
                inputMode="numeric"
              />
            </div>
            <div>
              <div style={FIELD_LABEL}>{t("register.phone")}</div>
              <input
                style={INPUT}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder={t("register.phone_ph")}
                autoComplete="tel"
                inputMode="tel"
                maxLength={25}
              />
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <div style={FIELD_LABEL}>{t("register.region")}</div>
            <select
              style={{ ...INPUT, appearance: "auto", cursor: "pointer" }}
              value={regionId}
              onChange={(e) => setRegionId(e.target.value)}
            >
              <option value="" disabled>
                {t("register.region_ph")}
              </option>
              {sortedRegions.map((r) => (
                <option key={r.id} value={r.id}>
                  {regionName(r, lang)}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <div
              role="alert"
              style={{
                margin: "18px 0 0",
                padding: "12px 15px",
                borderRadius: "var(--radius-sm)",
                border: "1px solid rgba(192,86,59,0.4)",
                background: "rgba(192,86,59,0.12)",
                fontSize: 13.5,
                lineHeight: 1.5,
                color: "var(--text)",
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            className="ch-btn-primary"
            disabled={busy}
            style={{
              marginTop: 24,
              justifyContent: "center",
              width: "100%",
              fontSize: 15,
              padding: "14px 20px",
              border: "none",
              cursor: busy ? "default" : "pointer",
              opacity: busy ? 0.7 : 1,
            }}
          >
            {busy ? t("register.submitting") : t("register.submit")}
          </button>
        </form>

        <div
          style={{
            marginTop: 22,
            textAlign: "center",
            fontFamily: "var(--font-accent)",
            fontStyle: "italic",
            fontSize: 16,
            color: "var(--muted)",
          }}
        >
          {t("register.tagline")}
        </div>
      </div>
    </main>
  );
}
