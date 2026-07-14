"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { bfu } from "@/lib/client-api";
import { downloadResume } from "@/lib/resume";
import { useToast } from "@/lib/useToast";
import { handleFor } from "@/lib/handle";
import { useT } from "@/components/i18n/LocaleProvider";
import AchievementsCell from "@/components/AchievementsCell";
import { FLAGS } from "@/lib/flags";

// ── helpers ──────────────────────────────────────────────────────────────────

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
  const me = initial || {};
  const regionOptions = Array.isArray(regions) ? regions : [];

  // Form state, seeded from the SSR-fetched `me`.
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
  function changedFields() {
    const b = baseline.current;
    const body = {};
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

  // ── actions ─────────────────────────────────────────────────────────────────

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
        about,
        currently_building: currentlyBuilding,
        open_to_work: openToWork,
        open_to_volunteering: openToVol,
        region_id: regionId,
        portfolio_links: cleanLinks.map((l) => ({ ...l })),
      };
      // The PATCH auto-reanalyzes when the bio changes — reflect fresh skills.
      if (updated?.analysis?.skills) setSkills(updated.analysis.skills.filter(Boolean));
      setSaveState("saved");
      if (droppedLinks) {
        showToast(t("settings.saved_links_skipped"), "err");
      }
      savedTimer.current = setTimeout(() => setSaveState("idle"), 2600);
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

  const [cvBusy, setCvBusy] = useState(false);
  async function getCv() {
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SECTION_GAP }}>
      {/* Two-column layout: editor (wide) + secondary rail. */}
      <div
        className="settings-grid"
        style={{ display: "grid", gridTemplateColumns: "minmax(0,1.7fr) minmax(0,1fr)", gap: 20, alignItems: "start" }}
      >
        {/* ── LEFT: the editor ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Identity */}
          <Section label={t("settings.identity_label")} hint={t("settings.identity_hint")}>
            <label style={{ display: "block" }}>
              <span style={{ display: "block", marginBottom: 8, fontSize: 13, color: "var(--muted-strong)" }}>
                {t("settings.about_label")}
              </span>
              <textarea
                value={about}
                onChange={(e) => setAbout(e.target.value.slice(0, 600))}
                rows={6}
                maxLength={600}
                placeholder={t("settings.about_ph")}
                style={{ ...inputBase, resize: "vertical", lineHeight: 1.55, minHeight: 130 }}
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
          </Section>

          {/* Download CV */}
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
