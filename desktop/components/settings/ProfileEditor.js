"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { bfu } from "@/lib/client-api";
import { downloadResume } from "@/lib/resume";
import { useToast } from "@/lib/useToast";
import { handleFor } from "@/lib/handle";
import { useT } from "@/components/i18n/LocaleProvider";
import AchievementsCell from "@/components/AchievementsCell";
import { FLAGS } from "@/lib/flags";

// ── helpers ──────────────────────────────────────────────────────────────────

// Identity validation — kept IDENTICAL to the two other places that collect
// these fields (src/screens/EditProfileScreen.jsx and components/register/
// RegisterFlow.js) so a value accepted at sign-up is still accepted on edit.
const CURRENT_YEAR = new Date().getFullYear();
const MIN_BIRTH_YEAR = CURRENT_YEAR - 60;
const MAX_BIRTH_YEAR = CURRENT_YEAR - 10;
const PHONE_RE = /^\+?[0-9]{7,15}$/;

// The fields an admin may flag for correction — mirrors DENIABLE_FIELDS in
// backend/app/routers/admin.py (and the DENIABLE list in dashboard/AdminUsers.js).
// Each maps to the i18n key of the label the user sees on the input, so the
// banner names the field exactly as the form does.
const DENIED_FIELD_LABEL = {
  name: "settings.name_label",
  surname: "settings.surname_label",
  phone_number: "settings.phone_label",
  about: "settings.about_label",
  birth_year: "settings.birth_year_label",
  gender: "settings.gender_label",
  tg_username: "settings.tg_username_label",
};

// `denied_fields` is stored as a JSON-encoded list of field names (or null).
// Anything unparseable is treated as "nothing flagged" — a corrupt value must
// never lock the user out of their own settings.
function parseDenied(raw) {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((f) => typeof f === "string") : [];
  } catch {
    return [];
  }
}

// The set of skill tags for chips: analysis.skills is the AI-derived list.
function skillsFrom(me) {
  return (me?.analysis?.skills || me?.skills || []).filter(Boolean);
}

// Normalize the incoming portfolio_links (list of {label,url}) into editable
// rows, always leaving at least one blank row for adding.
function portfolioRows(links) {
  const rows = (Array.isArray(links) ? links : [])
    .filter((l) => l && (l.label || l.url))
    .map((l) => ({ label: l.label || "", url: l.url || "" }));
  return rows.length ? rows : [{ label: "", url: "" }];
}

const SECTION_GAP = 26;

// A labelled section card in the Chorsu grammar. These are PASSIVE containers,
// so they use .ch-cell-static (firelit surface, no hover lift/glow) — the glow
// is reserved for the real clickable "View public profile" tile below.
function Section({ label, hint, children, style }) {
  return (
    <div className="ch-cell-static" style={{ display: "flex", flexDirection: "column", gap: 16, ...style }}>
      <div>
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: 16,
            letterSpacing: "-0.01em",
            color: "var(--text)",
          }}
        >
          {label}
        </div>
        {hint ? (
          <div style={{ marginTop: 6, fontSize: 13, color: "var(--muted-strong)", lineHeight: 1.5 }}>
            {hint}
          </div>
        ) : null}
      </div>
      {children}
    </div>
  );
}

const inputBase = {
  width: "100%",
  background: "var(--surface-2)",
  border: "1px solid var(--hair)",
  borderRadius: "var(--radius-sm)",
  color: "var(--text)",
  fontFamily: "var(--font-body)",
  fontSize: 15,
  padding: "12px 14px",
  // No inline outline:none / onFocus border hacks — the global :focus-visible
  // ring on input/select/textarea (globals.css) handles focus visibility.
};

// Toggle switch (looking-for). Reduced-motion respected via CSS class on knob.
function Toggle({ on, onChange, label, sub }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      aria-pressed={on}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        width: "100%",
        textAlign: "left",
        background: on ? "rgba(127,176,105,0.08)" : "var(--surface-2)",
        border: `1px solid ${on ? "rgba(127,176,105,0.35)" : "var(--hair)"}`,
        borderRadius: "var(--radius-sm)",
        padding: "13px 15px",
        cursor: "pointer",
        color: "var(--text)",
        transition: "background 0.2s ease, border-color 0.2s ease",
      }}
    >
      <span
        aria-hidden
        style={{
          flex: "0 0 auto",
          width: 40,
          height: 23,
          borderRadius: 99,
          background: on ? "var(--green)" : "var(--hair)",
          position: "relative",
          transition: "background 0.2s ease",
        }}
      >
        <span
          className="ch-toggle-knob"
          style={{
            position: "absolute",
            top: 3,
            left: on ? 20 : 3,
            width: 17,
            height: 17,
            borderRadius: "50%",
            background: "#fff",
            boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
          }}
        />
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontWeight: 600, fontSize: 15 }}>{label}</span>
        {sub ? (
          <span style={{ display: "block", marginTop: 2, fontSize: 13, color: "var(--muted-strong)" }}>
            {sub}
          </span>
        ) : null}
      </span>
    </button>
  );
}

// ── main editor ───────────────────────────────────────────────────────────────

export default function ProfileEditor({ initial, regions }) {
  const t = useT();
  const router = useRouter();
  const me = initial || {};
  const regionOptions = Array.isArray(regions) ? regions : [];

  // Fields an admin asked this user to correct. Derived from the `me` PROP (not
  // state) on purpose: after a save we call router.refresh(), the server re-reads
  // /users/me, and a cleared flag makes the banner disappear without a reload —
  // the desktop equivalent of the Mini App's `bfu:me-updated` event.
  const deniedFields = parseDenied(me.denied_fields);
  const isDenied = (field) => deniedFields.includes(field);

  // Form state, seeded from the SSR-fetched `me`.
  const [name, setName] = useState(me.name || "");
  const [surname, setSurname] = useState(me.surname || "");
  const [birthYear, setBirthYear] = useState(me.birth_year ? String(me.birth_year) : "");
  const [gender, setGender] = useState(me.gender || "");
  const [phone, setPhone] = useState(me.phone_number || "");
  const [lat, setLat] = useState(me.latitude ?? null);
  const [lng, setLng] = useState(me.longitude ?? null);
  const [locStatus, setLocStatus] = useState(
    me.latitude != null && me.longitude != null ? "shared" : ""
  );
  const [errors, setErrors] = useState({});
  const [about, setAbout] = useState(me.about || "");
  const [currentlyBuilding, setCurrentlyBuilding] = useState(
    // Only prefill the manual value — an auto-derived value (source==="auto")
    // is a placeholder, not something the user typed.
    me.currently_building_source === "manual" ? me.currently_building || "" : ""
  );
  const [openToWork, setOpenToWork] = useState(!!me.open_to_work);
  const [openToVol, setOpenToVol] = useState(!!me.open_to_volunteering);
  const [regionId, setRegionId] = useState(
    me.region_id != null ? String(me.region_id) : ""
  );
  const [links, setLinks] = useState(portfolioRows(me.portfolio_links));
  const [skills, setSkills] = useState(skillsFrom(me));

  // Baseline used to compute the changed-fields diff on save.
  const baseline = useRef({
    name: me.name || "",
    surname: me.surname || "",
    birth_year: me.birth_year ? String(me.birth_year) : "",
    gender: me.gender || "",
    phone_number: me.phone_number || "",
    latitude: me.latitude ?? null,
    longitude: me.longitude ?? null,
    about: me.about || "",
    currently_building:
      me.currently_building_source === "manual" ? me.currently_building || "" : "",
    open_to_work: !!me.open_to_work,
    open_to_volunteering: !!me.open_to_volunteering,
    region_id: me.region_id != null ? String(me.region_id) : "",
    portfolio_links: portfolioRows(me.portfolio_links),
  });

  // Coach state.
  const [coachBusy, setCoachBusy] = useState(false);
  const [coachSuggestion, setCoachSuggestion] = useState("");
  const [coachError, setCoachError] = useState("");

  // Analyze state.
  const [analyzeBusy, setAnalyzeBusy] = useState(false);

  // Save state: "idle" | "saving" | "saved" | "error".
  const [saveState, setSaveState] = useState("idle");
  const [saveError, setSaveError] = useState("");
  const savedTimer = useRef(null);

  // Toast (shared managed-timer hook — no leaked setTimeout / setState-after-unmount).
  const { toast, flash: showToast } = useToast(3200);
  useEffect(() => () => {
    if (savedTimer.current) clearTimeout(savedTimer.current);
  }, []);

  const cleanLinks = useMemo(
    () =>
      links
        .map((l) => ({ label: (l.label || "").trim(), url: (l.url || "").trim() }))
        .filter((l) => l.label && l.url),
    [links]
  );

  // Which fields differ from the SSR baseline → the PATCH body.
  //
  // Strictly diff-based, and that is what closes the admin-corrections loop
  // correctly: PATCH /users/me clears a flagged field from `denied_fields` only
  // when that field's KEY is present in the body, so a flag lifts exactly when
  // the user actually re-edits the field it was raised on — never as a side
  // effect of saving something else.
  function changedFields() {
    const b = baseline.current;
    const body = {};
    // Identity. Compare trimmed-vs-trimmed so stray whitespace in the stored
    // value can't make the form permanently "dirty".
    if (name.trim() !== b.name.trim()) body.name = name.trim();
    if (surname.trim() !== b.surname.trim()) body.surname = surname.trim();
    if (birthYear !== b.birth_year) body.birth_year = birthYear ? Number(birthYear) : null;
    if (gender !== b.gender) body.gender = gender || null;
    if (phone.trim() !== b.phone_number.trim()) body.phone_number = phone.trim() || null;
    // Location travels as a pair — sending one without the other would leave a
    // half-set coordinate on the record.
    if (lat !== b.latitude || lng !== b.longitude) {
      body.latitude = lat;
      body.longitude = lng;
    }
    if (about !== b.about) body.about = about;
    if (currentlyBuilding !== b.currently_building)
      body.currently_building = currentlyBuilding;
    if (openToWork !== b.open_to_work) body.open_to_work = openToWork;
    if (openToVol !== b.open_to_volunteering)
      body.open_to_volunteering = openToVol;
    if (regionId !== b.region_id)
      body.region_id = regionId === "" ? null : Number(regionId);
    // Portfolio: compare normalized JSON so row reordering/blank-row noise
    // doesn't count as a change.
    const baseClean = b.portfolio_links
      .map((l) => ({ label: (l.label || "").trim(), url: (l.url || "").trim() }))
      .filter((l) => l.label && l.url);
    if (JSON.stringify(cleanLinks) !== JSON.stringify(baseClean))
      body.portfolio_links = cleanLinks;
    return body;
  }

  const dirty = Object.keys(changedFields()).length > 0;

  // Same rules as the Mini App / RegisterFlow: name + surname required; birth
  // year (when given) inside the allowed window; phone (when given) a plausible
  // number. Extra rule the other two don't need: a value the user ALREADY has
  // can't be blanked. PATCH /users/me drops null keys (`exclude_none=True`), so
  // a "cleared" phone or birth year would be a silent no-op reported as saved —
  // we ask for a real value instead of lying about the result.
  function validate() {
    const b = baseline.current;
    const errs = {};
    if (!name.trim()) errs.name = t("settings.err_name_required");
    if (!surname.trim()) errs.surname = t("settings.err_surname_required");
    if (birthYear) {
      const by = parseInt(birthYear, 10);
      if (!by || by < MIN_BIRTH_YEAR || by > MAX_BIRTH_YEAR) {
        errs.birth_year = t("settings.err_birth_year", {
          min: MIN_BIRTH_YEAR,
          max: MAX_BIRTH_YEAR,
        });
      }
    } else if (b.birth_year) {
      errs.birth_year = t("settings.err_birth_year_required");
    }
    if (phone.trim()) {
      if (!PHONE_RE.test(phone.trim())) errs.phone_number = t("settings.err_phone");
    } else if (b.phone_number.trim()) {
      errs.phone_number = t("settings.err_phone_required");
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  // ── actions ─────────────────────────────────────────────────────────────────

  // The Mini App reads coordinates from Telegram; on the web the equivalent is
  // navigator.geolocation. Different mechanism, same resulting PATCH body
  // ({latitude, longitude}). Nothing is sent until the user hits Save.
  function shareLocation() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      // No geolocation API at all (old browser, or a non-secure origin).
      setLocStatus("unsupported");
      return;
    }
    setLocStatus("sharing");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude);
        setLng(pos.coords.longitude);
        setLocStatus("shared");
      },
      // Denied / unavailable / timed out — all land here. The profile stays
      // exactly as it was; location is optional and the user can move on.
      () => setLocStatus("failed"),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  // Clearing sends {latitude: null, longitude: null} — the exact body the Mini
  // App sends for the same action.
  // ⚠️ BACKEND GAP (not fixable from this file): PATCH /users/me does
  // `body.model_dump(exclude_none=True)`, so those nulls are dropped and the
  // stored coordinates survive. Both apps have this; a real "forget my location"
  // needs the endpoint to distinguish "omitted" from "explicitly null"
  // (exclude_unset, or an explicit clear_location flag).
  function clearLocation() {
    setLat(null);
    setLng(null);
    setLocStatus("");
  }

  async function runCoach() {
    setCoachError("");
    setCoachSuggestion("");
    const text = about.trim();
    if (!text) {
      setCoachError(t("settings.coach_need_draft"));
      return;
    }
    setCoachBusy(true);
    try {
      const res = await bfu("/users/me/coach", {
        method: "POST",
        body: { kind: "bio", text },
      });
      setCoachSuggestion(res?.improved || "");
      if (!res?.improved) setCoachError(t("settings.coach_nothing"));
    } catch (err) {
      setCoachError(err.message || t("settings.coach_error"));
    } finally {
      setCoachBusy(false);
    }
  }

  function applyCoach() {
    if (!coachSuggestion) return;
    setAbout(coachSuggestion);
    setCoachSuggestion("");
    showToast(t("settings.coach_applied"), "ok");
  }

  async function runAnalyze() {
    // The backend derives skills from the SAVED bio. Saving the bio ALSO triggers
    // a server-side re-analysis (and consumes the shared 'analyze' cooldown), so
    // when the bio changed we read the fresh skills straight from the PATCH
    // response — firing a second /analyze here would just 429 on that cooldown.
    setAnalyzeBusy(true);
    try {
      let next;
      let savedBio = false;
      if (about !== baseline.current.about) {
        // Re-analysis reads the SAVED bio, so an unsaved edit is persisted first.
        // We tell the user this happened rather than PATCHing silently.
        const updated = await bfu("/users/me", { method: "PATCH", body: { about } });
        baseline.current.about = about;
        savedBio = true;
        next = ((updated?.analysis?.skills) || updated?.skills || []).filter(Boolean);
      } else {
        const res = await bfu("/users/me/analyze", { method: "POST" });
        next = (res?.skills || []).filter(Boolean);
      }
      setSkills(next);
      const found = next.length
        ? t(next.length === 1 ? "settings.skills_found_one" : "settings.skills_found_other", { n: next.length })
        : t("settings.skills_none_found");
      showToast(savedBio ? t("settings.bio_saved_with", { found }) : found, "ok");
    } catch (err) {
      showToast(err.message || t("settings.analyze_cooldown"), "err");
    } finally {
      setAnalyzeBusy(false);
    }
  }

  async function save() {
    if (!validate()) {
      setSaveState("error");
      setSaveError(t("settings.fix_fields"));
      return;
    }
    setErrors({});
    const body = changedFields();
    if (!Object.keys(body).length) {
      showToast(t("settings.nothing_to_save"), "ok");
      return;
    }
    // A row with only a label OR only a URL is dropped by cleanLinks — warn the
    // user rather than silently discarding it under a "Saved ✓".
    const droppedLinks = links.some((l) => {
      const label = (l.label || "").trim();
      const url = (l.url || "").trim();
      return (label || url) && !(label && url);
    });
    setSaveState("saving");
    setSaveError("");
    if (savedTimer.current) clearTimeout(savedTimer.current);
    try {
      const updated = await bfu("/users/me", { method: "PATCH", body });
      // Re-seed the baseline from what we sent (server echoes it back too).
      baseline.current = {
        name: name.trim(),
        surname: surname.trim(),
        birth_year: birthYear,
        gender,
        phone_number: phone.trim(),
        latitude: lat,
        longitude: lng,
        about,
        currently_building: currentlyBuilding,
        open_to_work: openToWork,
        open_to_volunteering: openToVol,
        region_id: regionId,
        portfolio_links: cleanLinks.map((l) => ({ ...l })),
      };
      // A renamed user is still tagged under the OLD name in every Telegram
      // group BFU manages (the global group/channel, their school, their
      // learning centers). POST /users/me/update-tags rewrites those tags — the
      // Mini App fires it on the same condition. Best-effort: the profile is
      // already saved, so a Telegram hiccup must not report a failed save.
      if ("name" in body || "surname" in body) {
        await bfu("/users/me/update-tags", { method: "POST" }).catch(() => {});
      }
      // The PATCH auto-reanalyzes when the bio changes — reflect fresh skills.
      if (updated?.analysis?.skills) setSkills(updated.analysis.skills.filter(Boolean));
      setSaveState("saved");
      if (droppedLinks) {
        showToast(t("settings.saved_links_skipped"), "err");
      }
      savedTimer.current = setTimeout(() => setSaveState("idle"), 2600);
      // Re-run the server components so the corrections banner lifts (the server
      // re-reads `denied_fields`) and the top bar picks up a new display name.
      // Only when something the server renders actually changed — an every-save
      // refresh would re-fetch me/regions/achievements/invite for nothing.
      if (deniedFields.length || "name" in body || "surname" in body) {
        router.refresh();
      }
    } catch (err) {
      setSaveState("error");
      setSaveError(err.message || t("settings.save_failed"));
    }
  }

  async function copyInvite() {
    try {
      const res = await bfu("/users/me/invite");
      const link = res?.link || "";
      if (!link) throw new Error(t("settings.invite_none"));
      await navigator.clipboard.writeText(link);
      showToast(t("settings.invite_copied"), "ok");
    } catch (err) {
      showToast(err.message || t("settings.invite_copy_failed"), "err");
    }
  }

  // CV / resume PDF export — hidden for V1 behind FLAGS.CV_EXPORT. The button
  // below is flag-gated, and this handler hard-stops too, so the /users/me/resume
  // download can't be fired while the feature is hidden. Flip the flag to restore.
  const [cvBusy, setCvBusy] = useState(false);
  async function getCv() {
    if (!FLAGS.CV_EXPORT) return;
    setCvBusy(true);
    try {
      await downloadResume();
      showToast(t("settings.cv_downloading"), "ok");
    } catch (err) {
      showToast(err.message || t("settings.cv_failed"), "err");
    } finally {
      setCvBusy(false);
    }
  }

  // ── render ────────────────────────────────────────────────────────────────

  // Inline field error text + the "needs fixing" marker on a flagged input.
  const errText = { marginTop: 6, fontSize: 12.5, color: "var(--terra)" };
  const fieldStyle = (field) =>
    errors[field] || isDenied(field)
      ? { ...inputBase, borderColor: "rgba(192,86,59,0.55)" }
      : inputBase;
  const DenyChip = ({ field }) =>
    isDenied(field) ? (
      <span
        style={{
          marginLeft: 8,
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--terra)",
          border: "1px solid rgba(192,86,59,0.45)",
          borderRadius: "var(--radius-pill)",
          padding: "2px 7px",
          whiteSpace: "nowrap",
        }}
      >
        {t("settings.deny_chip")}
      </span>
    ) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SECTION_GAP }}>
      {/* ── Admin corrections banner ──
          An admin flagged one or more fields on this account (`denied_fields` +
          `denied_note`). The Mini App force-routes the user to their profile and
          shows this; on the desktop /settings IS the profile editor, so the
          banner sits at the top of it and every flagged field is marked below.
          Clearing is server-side: PATCH /users/me drops a field from
          `denied_fields` as soon as the user re-saves that field. */}
      {deniedFields.length ? (
        <div
          role="alert"
          style={{
            display: "flex",
            gap: 14,
            alignItems: "flex-start",
            padding: "18px 20px",
            borderRadius: "var(--radius)",
            border: "1px solid rgba(192,86,59,0.5)",
            background: "rgba(192,86,59,0.08)",
          }}
        >
          <span aria-hidden style={{ fontSize: 20, lineHeight: 1.2 }}>⚠️</span>
          <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 700,
                fontSize: 17,
                color: "var(--terra)",
              }}
            >
              {t("settings.deny_title")}
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.55, color: "var(--text)" }}>
              {t("settings.deny_body", {
                fields: deniedFields
                  .map((f) => (DENIED_FIELD_LABEL[f] ? t(DENIED_FIELD_LABEL[f]) : f))
                  .join(", "),
              })}
            </div>
            {me.denied_note ? (
              <div
                style={{
                  fontFamily: "var(--font-accent)",
                  fontStyle: "italic",
                  fontSize: 14.5,
                  lineHeight: 1.55,
                  color: "var(--text)",
                  borderLeft: "2px solid rgba(192,86,59,0.5)",
                  paddingLeft: 12,
                }}
              >
                {me.denied_note}
              </div>
            ) : null}
            <div style={{ fontSize: 13, color: "var(--muted-strong)" }}>
              {t("settings.deny_fix_hint")}
            </div>
            {/* tg_username is set from Telegram itself (verified initData /
                getChat), never typed here — so say where to fix it. */}
            {deniedFields.includes("tg_username") ? (
              <div style={{ fontSize: 13, color: "var(--muted-strong)" }}>
                {t("settings.deny_tg_hint")}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Two-column layout: editor (wide) + secondary rail. */}
      <div
        className="settings-grid"
        style={{ display: "grid", gridTemplateColumns: "minmax(0,1.7fr) minmax(0,1fr)", gap: 20, alignItems: "start" }}
      >
        {/* ── LEFT: the editor ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Your details — name, surname, birth year, gender, phone.
              Collected once at registration and, until now, uneditable on the
              web: a typo in your own name was permanent, and an admin's
              correction request (usually on exactly these fields) could not be
              acted on from the desktop at all. */}
          <Section label={t("settings.basics_label")} hint={t("settings.basics_hint")}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <label style={{ display: "block", minWidth: 0 }}>
                <span style={{ display: "block", marginBottom: 8, fontSize: 13, color: "var(--muted-strong)" }}>
                  {t("settings.name_label")} *<DenyChip field="name" />
                </span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={100}
                  placeholder={t("settings.name_ph")}
                  aria-invalid={errors.name ? true : undefined}
                  style={fieldStyle("name")}
                />
                {errors.name ? <div style={errText}>{errors.name}</div> : null}
              </label>
              <label style={{ display: "block", minWidth: 0 }}>
                <span style={{ display: "block", marginBottom: 8, fontSize: 13, color: "var(--muted-strong)" }}>
                  {t("settings.surname_label")} *<DenyChip field="surname" />
                </span>
                <input
                  type="text"
                  value={surname}
                  onChange={(e) => setSurname(e.target.value)}
                  maxLength={100}
                  placeholder={t("settings.surname_ph")}
                  aria-invalid={errors.surname ? true : undefined}
                  style={fieldStyle("surname")}
                />
                {errors.surname ? <div style={errText}>{errors.surname}</div> : null}
              </label>
            </div>

            <div>
              <div style={{ marginBottom: 8, fontSize: 13, color: "var(--muted-strong)" }}>
                {t("settings.gender_label")}
                <DenyChip field="gender" />
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                {[
                  { v: "Male", label: `♂ ${t("settings.gender_male")}` },
                  { v: "Female", label: `♀ ${t("settings.gender_female")}` },
                ].map((g) => {
                  const on = gender === g.v;
                  return (
                    <button
                      key={g.v}
                      type="button"
                      onClick={() => setGender(g.v)}
                      aria-pressed={on}
                      style={{
                        flex: 1,
                        padding: "12px 8px",
                        borderRadius: "var(--radius-sm)",
                        border: `1px solid ${on ? "var(--amber)" : "var(--hair)"}`,
                        background: on ? "rgba(232,161,92,0.14)" : "var(--surface-2)",
                        color: on ? "var(--amber)" : "var(--muted-strong)",
                        fontFamily: "var(--font-display)",
                        fontWeight: 600,
                        fontSize: 14.5,
                        cursor: "pointer",
                      }}
                    >
                      {g.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 14 }}>
              <label style={{ display: "block", minWidth: 0 }}>
                <span style={{ display: "block", marginBottom: 8, fontSize: 13, color: "var(--muted-strong)" }}>
                  {t("settings.birth_year_label")}
                  <DenyChip field="birth_year" />
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={birthYear}
                  onChange={(e) => setBirthYear(e.target.value.replace(/[^\d]/g, "").slice(0, 4))}
                  placeholder={`${MIN_BIRTH_YEAR}–${MAX_BIRTH_YEAR}`}
                  aria-invalid={errors.birth_year ? true : undefined}
                  style={{ ...fieldStyle("birth_year"), textAlign: "center" }}
                />
                {errors.birth_year ? <div style={errText}>{errors.birth_year}</div> : null}
              </label>
              <label style={{ display: "block", minWidth: 0 }}>
                <span style={{ display: "block", marginBottom: 8, fontSize: 13, color: "var(--muted-strong)" }}>
                  {t("settings.phone_label")}
                  <DenyChip field="phone_number" />
                </span>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  maxLength={25}
                  placeholder="+998911853616"
                  aria-invalid={errors.phone_number ? true : undefined}
                  style={fieldStyle("phone_number")}
                />
                {errors.phone_number ? <div style={errText}>{errors.phone_number}</div> : null}
              </label>
            </div>
          </Section>

          {/* Identity */}
          <Section label={t("settings.identity_label")} hint={t("settings.identity_hint")}>
            <label style={{ display: "block" }}>
              <span style={{ display: "block", marginBottom: 8, fontSize: 13, color: "var(--muted-strong)" }}>
                {t("settings.about_label")}
                <DenyChip field="about" />
              </span>
              <textarea
                value={about}
                onChange={(e) => setAbout(e.target.value.slice(0, 600))}
                rows={6}
                maxLength={600}
                placeholder={t("settings.about_ph")}
                style={{
                  ...fieldStyle("about"),
                  resize: "vertical",
                  lineHeight: 1.55,
                  minHeight: 130,
                }}
              />
              <span
                style={{
                  display: "block",
                  marginTop: 6,
                  textAlign: "right",
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  color: about.length > 560 ? "var(--amber)" : "var(--muted-strong)",
                }}
              >
                {about.length}/600
              </span>
            </label>

            {/* AI bio coach */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
              <button
                type="button"
                className="ch-btn-ghost"
                onClick={runCoach}
                disabled={coachBusy}
                style={{ opacity: coachBusy ? 0.6 : 1 }}
              >
                <span style={{ color: "var(--amber)" }} aria-hidden>✦</span>
                {coachBusy ? t("settings.coach_polishing") : t("settings.coach_button")}
              </button>
              <span style={{ fontSize: 13, color: "var(--muted-strong)" }}>
                {t("settings.coach_helper")}
              </span>
            </div>
            {coachError ? (
              <div style={{ fontSize: 13, color: "var(--terra)" }}>{coachError}</div>
            ) : null}
            {coachSuggestion ? (
              <div
                style={{
                  border: "1px solid rgba(232,161,92,0.35)",
                  background: "rgba(232,161,92,0.07)",
                  borderRadius: "var(--radius-sm)",
                  padding: 16,
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                }}
              >
                <div className="ch-cell-label" style={{ color: "var(--amber)" }}>
                  {t("settings.coach_suggestion_label")}
                </div>
                <div style={{ fontSize: 14.5, lineHeight: 1.6, color: "var(--text)" }}>
                  {coachSuggestion}
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button type="button" className="ch-btn-primary" onClick={applyCoach}>
                    {t("settings.coach_apply")}
                  </button>
                  <button
                    type="button"
                    className="ch-btn-ghost"
                    onClick={() => setCoachSuggestion("")}
                  >
                    {t("settings.coach_dismiss")}
                  </button>
                </div>
              </div>
            ) : null}

            {/* Currently building */}
            <label style={{ display: "block", marginTop: 4 }}>
              <span style={{ display: "block", marginBottom: 8, fontSize: 13, color: "var(--muted-strong)" }}>
                {t("settings.building_label")}
              </span>
              <input
                type="text"
                value={currentlyBuilding}
                onChange={(e) => setCurrentlyBuilding(e.target.value)}
                maxLength={140}
                placeholder={
                  me.currently_building_source === "auto" && me.currently_building
                    ? t("settings.building_ph_auto", { value: me.currently_building })
                    : t("settings.building_ph_manual")
                }
                style={inputBase}
              />
              {me.currently_building_source === "auto" && me.currently_building && !currentlyBuilding ? (
                <span style={{ display: "block", marginTop: 6, fontSize: 12, color: "var(--muted-strong)" }}>
                  {t("settings.building_auto_note")}
                </span>
              ) : null}
            </label>
          </Section>

          {/* Looking for */}
          <Section label={t("settings.looking_label")} hint={t("settings.looking_hint")}>
            <Toggle
              on={openToWork}
              onChange={setOpenToWork}
              label={t("settings.open_work_label")}
              sub={t("settings.open_work_sub")}
            />
            <Toggle
              on={openToVol}
              onChange={setOpenToVol}
              label={t("settings.open_vol_label")}
              sub={t("settings.open_vol_sub")}
            />
          </Section>

          {/* Skills */}
          <Section
            label={t("settings.skills_label")}
            hint={t("settings.skills_hint")}
          >
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {skills.length ? (
                skills.map((s) => (
                  <span
                    key={s}
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      letterSpacing: "0.03em",
                      padding: "7px 12px",
                      borderRadius: "var(--radius-pill)",
                      background: "var(--surface-2)",
                      border: "1px solid rgba(232,161,92,0.28)",
                      color: "var(--amber)",
                    }}
                  >
                    {s}
                  </span>
                ))
              ) : (
                <span style={{ fontSize: 14, color: "var(--muted-strong)", fontStyle: "italic", fontFamily: "var(--font-accent)" }}>
                  {t("settings.skills_empty")}
                </span>
              )}
            </div>
            <div>
              <button
                type="button"
                className="ch-btn-ghost"
                onClick={runAnalyze}
                disabled={analyzeBusy}
                style={{ opacity: analyzeBusy ? 0.6 : 1 }}
              >
                <span style={{ color: "var(--amber)" }} aria-hidden>↻</span>
                {analyzeBusy ? t("settings.analyze_reading") : t("settings.analyze_button")}
              </button>
            </div>
          </Section>

          {/* Portfolio links */}
          <Section label={t("settings.portfolio_label")} hint={t("settings.portfolio_hint")}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {links.map((row, i) => {
                const incomplete = (row.label.trim() || row.url.trim()) && !(row.label.trim() && row.url.trim());
                return (
                <div key={i} style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
                  <input
                    type="text"
                    value={row.label}
                    aria-label={t("settings.link_label_aria", { n: i + 1 })}
                    onChange={(e) => {
                      const next = links.slice();
                      next[i] = { ...next[i], label: e.target.value };
                      setLinks(next);
                    }}
                    placeholder={t("settings.link_label_ph")}
                    maxLength={40}
                    style={{ ...inputBase, flex: "1 1 140px", minWidth: 0 }}
                  />
                  <input
                    type="url"
                    value={row.url}
                    aria-label={t("settings.link_url_aria", { n: i + 1 })}
                    aria-invalid={incomplete && !row.url.trim() ? true : undefined}
                    onChange={(e) => {
                      const next = links.slice();
                      next[i] = { ...next[i], url: e.target.value };
                      setLinks(next);
                    }}
                    placeholder="https://…"
                    style={{
                      ...inputBase,
                      flex: "2 1 200px",
                      minWidth: 0,
                      borderColor: incomplete ? "rgba(192,86,59,0.5)" : "var(--hair)",
                    }}
                  />
                  <button
                    type="button"
                    aria-label={t("settings.link_remove_aria", { n: i + 1 })}
                    title={t("settings.link_remove_title")}
                    onClick={() => {
                      const next = links.filter((_, j) => j !== i);
                      setLinks(next.length ? next : [{ label: "", url: "" }]);
                    }}
                    style={{
                      flex: "0 0 auto",
                      width: 38,
                      height: 38,
                      borderRadius: "var(--radius-sm)",
                      background: "var(--surface-2)",
                      border: "1px solid var(--hair)",
                      color: "var(--muted-strong)",
                      cursor: "pointer",
                      fontSize: 16,
                    }}
                  >
                    ×
                  </button>
                  {incomplete ? (
                    <span style={{ flexBasis: "100%", fontSize: 12, color: "var(--terra)" }}>
                      {row.url.trim() ? t("settings.link_need_label") : t("settings.link_need_url")}
                    </span>
                  ) : null}
                </div>
                );
              })}
            </div>
            {links.length < 5 ? (
              <div>
                <button
                  type="button"
                  className="ch-btn-ghost"
                  onClick={() => setLinks([...links, { label: "", url: "" }])}
                >
                  <span style={{ color: "var(--amber)" }} aria-hidden>+</span> {t("settings.add_link")}
                </button>
              </div>
            ) : null}
          </Section>

          {/* Region */}
          <Section label={t("settings.region_label")} hint={t("settings.region_hint")}>
            <select
              value={regionId}
              onChange={(e) => setRegionId(e.target.value)}
              aria-label={t("settings.region_aria")}
              style={{
                ...inputBase,
                cursor: "pointer",
                appearance: "none",
                WebkitAppearance: "none",
                MozAppearance: "none",
                colorScheme: "dark",
                paddingRight: 40,
                backgroundImage:
                  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'><path d='M1 1l5 5 5-5' fill='none' stroke='%23C6BEAF' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/></svg>\")",
                backgroundRepeat: "no-repeat",
                backgroundPosition: "right 14px center",
              }}
            >
              <option value="">{t("settings.region_select")}</option>
              {regionOptions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name_en || r.name_uz || r.name_ru || `Region ${r.id}`}
                </option>
              ))}
            </select>
          </Section>

          {/* Location — the browser's geolocation, the web counterpart of the
              Mini App's Telegram location request. Optional, and a denied
              permission is a normal outcome: we say so and change nothing. */}
          <Section label={t("settings.location_label")} hint={t("settings.location_hint")}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <button
                type="button"
                className="ch-btn-ghost"
                onClick={shareLocation}
                disabled={locStatus === "sharing"}
                style={{ opacity: locStatus === "sharing" ? 0.6 : 1 }}
              >
                <span style={{ color: "var(--amber)" }} aria-hidden>◎</span>
                {locStatus === "sharing"
                  ? t("settings.location_sharing")
                  : lat != null && lng != null
                  ? t("settings.location_update")
                  : t("settings.location_share")}
              </button>
              {lat != null && lng != null ? (
                <button type="button" className="ch-btn-ghost" onClick={clearLocation}>
                  <span style={{ color: "var(--terra)" }} aria-hidden>×</span>
                  {t("settings.location_remove")}
                </button>
              ) : null}
            </div>
            {lat != null && lng != null ? (
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                  color: "var(--green)",
                }}
              >
                {t("settings.location_shared", {
                  lat: Number(lat).toFixed(4),
                  lng: Number(lng).toFixed(4),
                })}
              </div>
            ) : null}
            {locStatus === "failed" ? (
              <div style={{ fontSize: 13, color: "var(--amber)" }}>
                {t("settings.location_failed")}
              </div>
            ) : null}
            {locStatus === "unsupported" ? (
              <div style={{ fontSize: 13, color: "var(--amber)" }}>
                {t("settings.location_unsupported")}
              </div>
            ) : null}
          </Section>
        </div>

        {/* ── RIGHT: secondary rail ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Achievements — reuse the public-profile look.
              V1: hidden behind FLAGS.TRUST. With the flag off this renders
              nothing and AchievementsLoader never mounts, so the client-side
              GET /users/me/achievements fetch never fires either. Flip
              FLAGS.TRUST to true and the cell comes back exactly as before. */}
          {FLAGS.TRUST &&
            (Array.isArray(me.achievements) && me.achievements.length ? (
              <AchievementsCell achievements={me.achievements} />
            ) : (
              <AchievementsLoader />
            ))}

          {/* Invite */}
          <Section label={t("settings.invite_section_label")} hint={t("settings.invite_section_hint")}>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                color: me.invite?.link ? "var(--muted-strong)" : "var(--muted)",
                fontStyle: me.invite?.link ? "normal" : "italic",
                wordBreak: "break-all",
                background: "var(--surface-2)",
                border: "1px solid var(--hair)",
                borderRadius: "var(--radius-sm)",
                padding: "11px 13px",
              }}
            >
              {me.invite?.link || t("settings.invite_preparing")}
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <button
                type="button"
                className="ch-btn-primary"
                onClick={copyInvite}
                disabled={!me.invite?.link}
                style={{ opacity: me.invite?.link ? 1 : 0.55, cursor: me.invite?.link ? "pointer" : "default" }}
              >
                {t("settings.invite_copy_button")}
              </button>
              {me.invite?.invited_count != null ? (
                <span style={{ fontSize: 13, color: "var(--muted-strong)" }}>
                  {t("settings.invited_count", { n: me.invite.invited_count })}
                </span>
              ) : null}
            </div>
            {/* Referral leaderboard — desktop parity with the Mini App's
                InviteSheet. GET /users/leaderboard → {top:[{rank,name,count,
                is_me}], my_count}. Fetched client-side (SSR /users/me doesn't
                carry it), "you" highlighted in amber. */}
            <InviteLeaderboard />
          </Section>

          {/* Download CV — V1: hidden behind FLAGS.CV_EXPORT. The whole Section
              (heading + hint + button) is inside the guard, so nothing is left
              behind: the rail is a flex column, and a falsy child emits no DOM
              node, so no empty card and no stray 20px gap. The /resume endpoint
              and lib/resume.js stay put — flip the flag and the card returns. */}
          {FLAGS.CV_EXPORT ? (
            <Section label={t("settings.cv_label")} hint={t("settings.cv_hint")}>
              <div>
                <button
                  type="button"
                  className="ch-btn-ghost"
                  onClick={getCv}
                  disabled={cvBusy}
                  style={{ opacity: cvBusy ? 0.6 : 1 }}
                >
                  <span style={{ color: "var(--amber)" }} aria-hidden>↓</span>
                  {cvBusy ? t("settings.cv_building") : t("settings.cv_download")}
                </button>
              </div>
            </Section>
          ) : null}

          {/* View public profile */}
          <a
            href={`/web/u/${handleFor(me.id)}`}
            className="ch-cell"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              color: "var(--text)",
              textDecoration: "none",
              background:
                "linear-gradient(155deg, rgba(255,106,61,0.08), var(--surface) 62%)",
            }}
          >
            <div className="ch-cell-label">{t("settings.public_kicker")}</div>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 20 }}>
              {t("settings.public_title")}
            </div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "var(--amber)",
              }}
            >
              {t("settings.public_open")}
            </div>
          </a>
        </div>
      </div>

      {/* Sticky save bar */}
      <div
        style={{
          position: "sticky",
          bottom: 18,
          zIndex: 40,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
          padding: "14px 20px",
          borderRadius: "var(--radius)",
          background: "rgba(26,24,21,0.92)",
          border: "1px solid var(--hair)",
          backdropFilter: "blur(8px)",
          boxShadow: "0 16px 40px rgba(0,0,0,0.45)",
        }}
      >
        <div style={{ minWidth: 0 }}>
          {saveState === "error" ? (
            <span style={{ fontSize: 13.5, color: "var(--terra)" }}>{saveError}</span>
          ) : saveState === "saved" ? (
            <span style={{ fontSize: 13.5, color: "var(--green)", fontWeight: 600 }}>
              {t("settings.saved_check")}
            </span>
          ) : dirty ? (
            <span style={{ fontSize: 13.5, color: "var(--muted-strong)" }}>
              {t("settings.unsaved")}
            </span>
          ) : (
            <span style={{ fontSize: 13.5, color: "var(--muted-strong)" }}>
              {t("settings.up_to_date")}
            </span>
          )}
        </div>
        <button
          type="button"
          className="ch-btn-primary"
          onClick={save}
          disabled={saveState === "saving" || !dirty}
          style={{
            opacity: saveState === "saving" || !dirty ? 0.55 : 1,
            cursor: saveState === "saving" || !dirty ? "default" : "pointer",
          }}
        >
          {saveState === "saving" ? (
            <>
              <span className="ch-spin" aria-hidden>◠</span> {t("settings.saving")}
            </>
          ) : (
            t("settings.save_button")
          )}
        </button>
      </div>

      {/* Toast — lifted above the sticky save bar so the two don't overlap. */}
      {toast ? (
        <div
          className="ch-toast ch-toast-show"
          role="status"
          aria-live="polite"
          style={{
            bottom: 96,
            borderColor:
              toast.tone === "err" ? "rgba(192,86,59,0.5)" : "rgba(127,176,105,0.5)",
          }}
        >
          <span
            className="ch-toast-tx"
            style={{ color: toast.tone === "err" ? "var(--terra)" : "var(--text)" }}
          >
            {toast.text}
          </span>
        </div>
      ) : null}
    </div>
  );
}

// Achievements are fetched client-side when the SSR payload didn't include them
// (GET /users/me does not carry achievements — they come from a separate
// endpoint). Small, self-contained loader so the rail still lights up.
function AchievementsLoader() {
  const t = useT();
  const [achievements, setAchievements] = useState(null);
  useEffect(() => {
    let alive = true;
    bfu("/users/me/achievements")
      .then((res) => alive && setAchievements(res?.achievements || []))
      .catch(() => alive && setAchievements([]));
    return () => {
      alive = false;
    };
  }, []);
  if (!achievements) {
    return (
      <Section label={t("settings.achievements_label")}>
        <div style={{ fontSize: 13, color: "var(--muted)" }}>{t("settings.achievements_loading")}</div>
      </Section>
    );
  }
  if (!achievements.length) {
    return (
      <Section label={t("settings.achievements_label")} hint={t("settings.achievements_hint")} />
    );
  }
  return <AchievementsCell achievements={achievements} />;
}

// Referral leaderboard shown under the invite link — the desktop counterpart of
// the Mini App InviteSheet's board. GET /users/leaderboard returns
// {top:[{rank,name,count,is_me}], my_count, period}; the default period is
// "week" (same as the Mini App's users.leaderboard()). Rendered as a compact
// ranked list with the current user's row highlighted in amber. Stays silent
// while loading and on error — the invite link is the primary content, so a
// leaderboard hiccup must never blank out the invite card.
function InviteLeaderboard() {
  const t = useT();
  const [board, setBoard] = useState(null);
  useEffect(() => {
    let alive = true;
    bfu("/users/leaderboard")
      .then((res) => alive && setBoard(res && Array.isArray(res.top) ? res : { top: [] }))
      .catch(() => alive && setBoard({ top: [] }));
    return () => {
      alive = false;
    };
  }, []);
  if (!board) return null;
  const rows = Array.isArray(board.top) ? board.top : [];
  return (
    <div style={{ marginTop: 4, paddingTop: 16, borderTop: "1px solid var(--hair)" }}>
      <div className="ch-cell-label">{t("settings.leaderboard_label")}</div>
      <div style={{ marginTop: 12, display: "flex", flexDirection: "column" }}>
        {rows.length ? (
          rows.map((r) => (
            <div
              key={r.rank}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                padding: "8px 2px",
                borderBottom: "1px solid var(--hair)",
                fontSize: 14,
                color: r.is_me ? "var(--amber)" : "var(--text)",
                fontWeight: r.is_me ? 700 : 500,
              }}
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 12,
                    color: "var(--muted)",
                    width: 20,
                    textAlign: "right",
                    flex: "0 0 auto",
                  }}
                >
                  {r.rank}
                </span>
                <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {r.name}
                  {r.is_me ? ` (${t("settings.leaderboard_you")})` : ""}
                </span>
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--amber)", flex: "0 0 auto" }}>
                {r.count}
              </span>
            </div>
          ))
        ) : (
          <div
            style={{
              fontSize: 13,
              color: "var(--muted)",
              fontStyle: "italic",
              fontFamily: "var(--font-accent)",
              padding: "8px 2px",
            }}
          >
            {t("settings.leaderboard_empty")}
          </div>
        )}
      </div>
    </div>
  );
}
