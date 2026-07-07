"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { bfu } from "@/lib/client-api";
import { downloadResume } from "@/lib/resume";
import AchievementsCell from "@/components/AchievementsCell";

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

// A labelled section card in the Chorsu grammar.
function Section({ label, hint, children, style }) {
  return (
    <div className="ch-cell" style={{ display: "flex", flexDirection: "column", gap: 16, ...style }}>
      <div>
        <div className="ch-cell-label">{label}</div>
        {hint ? (
          <div style={{ marginTop: 6, fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>
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
  outline: "none",
  transition: "border-color 0.18s ease",
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
          <span style={{ display: "block", marginTop: 2, fontSize: 13, color: "var(--muted)" }}>
            {sub}
          </span>
        ) : null}
      </span>
    </button>
  );
}

// ── main editor ───────────────────────────────────────────────────────────────

export default function ProfileEditor({ initial, regions }) {
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

  // Toast (lightweight, shared feedback for secondary actions).
  const [toast, setToast] = useState(null); // { text, tone }
  const toastTimer = useRef(null);
  const showToast = useCallback((text, tone = "ok") => {
    setToast({ text, tone });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
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
      setCoachError("Write a first draft of your bio, then let the coach polish it.");
      return;
    }
    setCoachBusy(true);
    try {
      const res = await bfu("/users/me/coach", {
        method: "POST",
        body: { kind: "bio", text },
      });
      setCoachSuggestion(res?.improved || "");
      if (!res?.improved) setCoachError("The coach had nothing to add — your bio reads well.");
    } catch (err) {
      setCoachError(err.message || "The coach is resting. Try again in a moment.");
    } finally {
      setCoachBusy(false);
    }
  }

  function applyCoach() {
    if (!coachSuggestion) return;
    setAbout(coachSuggestion);
    setCoachSuggestion("");
    showToast("Suggestion applied to your bio", "ok");
  }

  async function runAnalyze() {
    // The backend derives skills from the SAVED bio. Saving the bio ALSO triggers
    // a server-side re-analysis (and consumes the shared 'analyze' cooldown), so
    // when the bio changed we read the fresh skills straight from the PATCH
    // response — firing a second /analyze here would just 429 on that cooldown.
    setAnalyzeBusy(true);
    try {
      let next;
      if (about !== baseline.current.about) {
        const updated = await bfu("/users/me", { method: "PATCH", body: { about } });
        baseline.current.about = about;
        next = ((updated?.analysis?.skills) || updated?.skills || []).filter(Boolean);
      } else {
        const res = await bfu("/users/me/analyze", { method: "POST" });
        next = (res?.skills || []).filter(Boolean);
      }
      setSkills(next);
      showToast(
        next.length ? `Found ${next.length} skill${next.length === 1 ? "" : "s"}` : "No skills detected yet",
        "ok"
      );
    } catch (err) {
      showToast(err.message || "Analysis is on cooldown — try again shortly", "err");
    } finally {
      setAnalyzeBusy(false);
    }
  }

  async function save() {
    const body = changedFields();
    if (!Object.keys(body).length) {
      showToast("Nothing to save yet", "ok");
      return;
    }
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
      savedTimer.current = setTimeout(() => setSaveState("idle"), 2600);
    } catch (err) {
      setSaveState("error");
      setSaveError(err.message || "Could not save. Please try again.");
    }
  }

  async function copyInvite() {
    try {
      const res = await bfu("/users/me/invite");
      const link = res?.link || "";
      if (!link) throw new Error("No invite link yet");
      await navigator.clipboard.writeText(link);
      showToast("Invite link copied", "ok");
    } catch (err) {
      showToast(err.message || "Could not copy the link", "err");
    }
  }

  const [cvBusy, setCvBusy] = useState(false);
  async function getCv() {
    setCvBusy(true);
    try {
      await downloadResume();
      showToast("Your CV is downloading", "ok");
    } catch (err) {
      showToast(err.message || "Could not build your CV", "err");
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
          <Section label="Identity" hint="Your bio is what the city reads first — and what the AI reads to place you.">
            <label style={{ display: "block" }}>
              <span style={{ display: "block", marginBottom: 8, fontSize: 13, color: "var(--muted)" }}>
                About you
              </span>
              <textarea
                value={about}
                onChange={(e) => setAbout(e.target.value)}
                rows={6}
                placeholder="What are you building, what you care about, what you're good at…"
                style={{ ...inputBase, resize: "vertical", lineHeight: 1.55, minHeight: 130 }}
                onFocus={(e) => (e.target.style.borderColor = "var(--amber)")}
                onBlur={(e) => (e.target.style.borderColor = "var(--hair)")}
              />
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
                <span style={{ color: "var(--amber)" }}>✦</span>
                {coachBusy ? "Polishing…" : "AI bio coach"}
              </button>
              <span style={{ fontSize: 12.5, color: "var(--muted)" }}>
                Let the coach tighten your draft — you decide whether to keep it.
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
                  Coach suggestion
                </div>
                <div style={{ fontSize: 14.5, lineHeight: 1.6, color: "var(--text)" }}>
                  {coachSuggestion}
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button type="button" className="ch-btn-primary" onClick={applyCoach}>
                    Apply to bio
                  </button>
                  <button
                    type="button"
                    className="ch-btn-ghost"
                    onClick={() => setCoachSuggestion("")}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ) : null}

            {/* Currently building */}
            <label style={{ display: "block", marginTop: 4 }}>
              <span style={{ display: "block", marginBottom: 8, fontSize: 13, color: "var(--muted)" }}>
                What you're building right now
              </span>
              <input
                type="text"
                value={currentlyBuilding}
                onChange={(e) => setCurrentlyBuilding(e.target.value)}
                maxLength={140}
                placeholder={
                  me.currently_building_source === "auto" && me.currently_building
                    ? `${me.currently_building} (from your active project)`
                    : "e.g. a delivery app for Tashkent bazaars"
                }
                style={inputBase}
                onFocus={(e) => (e.target.style.borderColor = "var(--amber)")}
                onBlur={(e) => (e.target.style.borderColor = "var(--hair)")}
              />
            </label>
          </Section>

          {/* Looking for */}
          <Section label="Looking for" hint="Let founders and organizers know how you want to show up.">
            <Toggle
              on={openToWork}
              onChange={setOpenToWork}
              label="Open to work"
              sub="Startups can invite you to join paid teams."
            />
            <Toggle
              on={openToVol}
              onChange={setOpenToVol}
              label="Open to volunteering"
              sub="Community projects can reach out to you."
            />
          </Section>

          {/* Skills */}
          <Section
            label="Skills"
            hint="These are derived by the AI from your bio. Re-run after you edit your bio to refresh them."
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
                <span style={{ fontSize: 13.5, color: "var(--muted)", fontStyle: "italic", fontFamily: "var(--font-accent)" }}>
                  No skills yet — write a bio and run the analysis.
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
                <span style={{ color: "var(--amber)" }}>↻</span>
                {analyzeBusy ? "Reading your bio…" : "Re-run AI analysis"}
              </button>
            </div>
          </Section>

          {/* Portfolio links */}
          <Section label="Portfolio links" hint="Up to 5 links — GitHub, a demo, a deck, your writing. Label + URL.">
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {links.map((row, i) => (
                <div key={i} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <input
                    type="text"
                    value={row.label}
                    onChange={(e) => {
                      const next = links.slice();
                      next[i] = { ...next[i], label: e.target.value };
                      setLinks(next);
                    }}
                    placeholder="Label"
                    maxLength={40}
                    style={{ ...inputBase, flex: "0 0 34%" }}
                    onFocus={(e) => (e.target.style.borderColor = "var(--amber)")}
                    onBlur={(e) => (e.target.style.borderColor = "var(--hair)")}
                  />
                  <input
                    type="url"
                    value={row.url}
                    onChange={(e) => {
                      const next = links.slice();
                      next[i] = { ...next[i], url: e.target.value };
                      setLinks(next);
                    }}
                    placeholder="https://…"
                    style={{ ...inputBase, flex: 1 }}
                    onFocus={(e) => (e.target.style.borderColor = "var(--amber)")}
                    onBlur={(e) => (e.target.style.borderColor = "var(--hair)")}
                  />
                  <button
                    type="button"
                    aria-label="Remove link"
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
                      color: "var(--muted)",
                      cursor: "pointer",
                      fontSize: 16,
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            {links.length < 5 ? (
              <div>
                <button
                  type="button"
                  className="ch-btn-ghost"
                  onClick={() => setLinks([...links, { label: "", url: "" }])}
                >
                  <span style={{ color: "var(--amber)" }}>+</span> Add link
                </button>
              </div>
            ) : null}
          </Section>

          {/* Region */}
          <Section label="Region" hint="Where in Uzbekistan you're based — helps the city place you on the map.">
            <select
              value={regionId}
              onChange={(e) => setRegionId(e.target.value)}
              style={{ ...inputBase, cursor: "pointer", appearance: "auto" }}
            >
              <option value="">— Select your region —</option>
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
          {/* Achievements — reuse the public-profile look. */}
          {Array.isArray(me.achievements) && me.achievements.length ? (
            <AchievementsCell achievements={me.achievements} />
          ) : (
            <AchievementsLoader />
          )}

          {/* Invite */}
          <Section label="Invite a builder" hint="Share your link — invited builders count toward your achievements.">
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                color: "var(--muted)",
                wordBreak: "break-all",
                background: "var(--surface-2)",
                border: "1px solid var(--hair)",
                borderRadius: "var(--radius-sm)",
                padding: "11px 13px",
              }}
            >
              {me.invite?.link || "Loading your link…"}
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <button type="button" className="ch-btn-primary" onClick={copyInvite}>
                Copy invite link
              </button>
              {me.invite?.invited_count != null ? (
                <span style={{ fontSize: 13, color: "var(--muted)" }}>
                  {me.invite.invited_count} invited so far
                </span>
              ) : null}
            </div>
          </Section>

          {/* Download CV */}
          <Section label="Your CV" hint="A one-page PDF built from your BFU profile — always up to date.">
            <div>
              <button
                type="button"
                className="ch-btn-ghost"
                onClick={getCv}
                disabled={cvBusy}
                style={{ opacity: cvBusy ? 0.6 : 1 }}
              >
                <span style={{ color: "var(--amber)" }}>↓</span>
                {cvBusy ? "Building your CV…" : "Download CV (PDF)"}
              </button>
            </div>
          </Section>

          {/* View public profile */}
          <a
            href={`/u/${me.id}`}
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
            <div className="ch-cell-label">See yourself as others do</div>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 20 }}>
              View public profile
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
              Open →
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
              Saved ✓
            </span>
          ) : dirty ? (
            <span style={{ fontSize: 13.5, color: "var(--muted)" }}>
              You have unsaved changes.
            </span>
          ) : (
            <span style={{ fontSize: 13.5, color: "var(--muted)" }}>
              Your profile is up to date.
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
              <span className="ch-spin" aria-hidden>◠</span> Saving…
            </>
          ) : (
            "Save changes"
          )}
        </button>
      </div>

      {/* Toast */}
      {toast ? (
        <div
          className="ch-toast ch-toast-show"
          role="status"
          style={{
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
  const [achievements, setAchievements] = useState(null);
  const started = useRef(false);
  if (!started.current) {
    started.current = true;
    bfu("/users/me/achievements")
      .then((res) => setAchievements(res?.achievements || []))
      .catch(() => setAchievements([]));
  }
  if (!achievements) {
    return (
      <Section label="Achievements">
        <div style={{ fontSize: 13, color: "var(--muted)" }}>Loading…</div>
      </Section>
    );
  }
  if (!achievements.length) {
    return (
      <Section label="Achievements" hint="Start a project, invite a builder, get endorsed — badges light up here." />
    );
  }
  return <AchievementsCell achievements={achievements} />;
}
