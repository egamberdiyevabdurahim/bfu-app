"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { bfu } from "@/lib/client-api";
import { useToast } from "@/lib/useToast";
import { useT } from "@/components/i18n/LocaleProvider";

// Shared create/edit form for a BFU project, in the Chorsu firelit grammar.
// Reused by:
//   • /projects/new            → mode="create" (POST /projects)
//   • /projects/[id]/manage    → mode="edit"   (PATCH /projects/{id}), prefilled
//
// Grounded on the backend ProjectCreate / ProjectUpdate schemas
// (backend/app/schemas/project.py) — only the real accepted fields are wired:
//   type, name, goal, about, is_hiring, gender_req, age_from, age_to,
//   req_region_ids, req_skills, req_knowledges.
// `channel`, `is_active`, `is_draft`, `group_link` exist on the schema but are
// out of scope for Batch 2a (channel/group_link are Telegram-link fields; draft
// mode is a later batch).

const inputBase = {
  width: "100%",
  background: "var(--surface-2)",
  border: "1px solid var(--hair)",
  borderRadius: "var(--radius-sm)",
  color: "var(--text)",
  fontFamily: "var(--font-body)",
  fontSize: 15,
  padding: "12px 14px",
  transition: "border-color 0.18s ease",
};

// Shared label for a field: promoted to --text so it reads louder than the
// --muted-strong hints below it.
const fieldLabel = {
  display: "block",
  marginBottom: 8,
  fontSize: 13,
  fontWeight: 600,
  color: "var(--text)",
};

function Section({ label, hint, children, style }) {
  return (
    <div className="ch-cell-static" style={{ display: "flex", flexDirection: "column", gap: 16, ...style }}>
      <div>
        {/* Section title promoted to --text so it isn't quieter than its own hint. */}
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

// A labelled chip editor: type + Enter (or "Add") to append, × to remove.
function ChipEditor({ items, onChange, placeholder, accent = "var(--amber)" }) {
  const t = useT();
  const [draft, setDraft] = useState("");
  // Brief inline notice when a duplicate is typed, so the cleared draft doesn't
  // read as "nothing happened".
  const [dupe, setDupe] = useState("");

  function add() {
    const v = draft.trim();
    if (!v) return;
    // Case-insensitive dedupe with visible feedback.
    if (items.some((x) => x.toLowerCase() === v.toLowerCase())) {
      setDupe(t("projmanage.chip_dupe", { value: v }));
      setDraft("");
      return;
    }
    setDupe("");
    onChange([...items, v]);
    setDraft("");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {items.length ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {items.map((it, i) => (
            <span
              key={`${it}-${i}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                letterSpacing: "0.03em",
                padding: "6px 6px 6px 12px",
                borderRadius: "var(--radius-pill)",
                background: "var(--surface-2)",
                border: `1px solid ${accent}44`,
                color: accent,
              }}
            >
              {it}
              <button
                type="button"
                aria-label={t("projmanage.chip_remove_aria", { item: it })}
                onClick={() => onChange(items.filter((_, j) => j !== i))}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 24,
                  height: 24,
                  border: "none",
                  borderRadius: "50%",
                  background: "transparent",
                  color: "var(--muted-strong)",
                  cursor: "pointer",
                  fontSize: 16,
                  lineHeight: 1,
                  padding: 0,
                }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <div style={{ display: "flex", gap: 10 }}>
        <input
          type="text"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (dupe) setDupe("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          maxLength={60}
          style={{ ...inputBase, flex: 1 }}
        />
        <button type="button" className="ch-btn-ghost" onClick={add}>
          <span style={{ color: accent }}>+</span> {t("projmanage.chip_add")}
        </button>
      </div>
      {dupe ? (
        <div role="status" style={{ fontSize: 12.5, color: "var(--muted-strong)" }}>
          {dupe}
        </div>
      ) : null}
    </div>
  );
}

// Segmented control (Startup / Volunteering).
function Segmented({ value, onChange, options }) {
  return (
    <div
      style={{
        display: "inline-flex",
        gap: 4,
        padding: 4,
        borderRadius: "var(--radius-pill)",
        background: "var(--surface-2)",
        border: "1px solid var(--hair)",
      }}
    >
      {options.map((opt) => {
        const on = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={on}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "9px 18px",
              borderRadius: "var(--radius-pill)",
              border: "none",
              cursor: "pointer",
              fontFamily: "var(--font-body)",
              fontWeight: 600,
              fontSize: 14,
              background: on ? opt.bg : "transparent",
              color: on ? opt.fg : "var(--muted-strong)",
              boxShadow: on ? `inset 0 0 0 1px ${opt.fg}55` : "none",
              transition: "background 0.18s ease, color 0.18s ease",
            }}
          >
            <span
              aria-hidden
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: on ? opt.dot : "var(--hair)",
                boxShadow: on ? `0 0 8px ${opt.dot}` : "none",
              }}
            />
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function Toggle({ on, onChange, label, sub }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      role="switch"
      aria-checked={on}
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

function regionName(r) {
  return r.name_en || r.name_uz || r.name_ru || `Region ${r.id}`;
}

// Stable stringification of an initial ProjectResponse for no-op edit detection.
function serializeBody(init) {
  return JSON.stringify({
    name: (init.name || "").trim(),
    goal: (init.goal || "").trim() || null,
    about: (init.about || "").trim() || null,
    is_hiring: init.is_hiring != null ? !!init.is_hiring : true,
    gender_req: init.gender_req || null,
    age_from: init.age_from != null ? Number(init.age_from) : null,
    age_to: init.age_to != null ? Number(init.age_to) : null,
    req_region_ids: [...(init.req_regions || []).map((r) => r.region_id).filter((x) => x != null)].sort(),
    req_skills: [...(init.req_skills || []).map((s) => s.skill_name).filter(Boolean)].sort(),
    req_knowledges: [...(init.req_knowledges || []).map((k) => k.knowledge_name).filter(Boolean)].sort(),
  });
}

// `initial` (edit mode) is the authed ProjectResponse for the project. It carries
// req_regions [{region_id}], req_skills [{skill_name}], req_knowledges
// [{knowledge_name}] — we normalize those into flat state below.
export default function CreateProjectForm({ regions = [], mode = "create", initial = null }) {
  const t = useT();
  const router = useRouter();
  const isEdit = mode === "edit";
  const regionOptions = Array.isArray(regions) ? regions : [];

  const init = initial || {};
  const [type, setType] = useState(init.type === "volunteering" ? "volunteering" : "startup");
  const [name, setName] = useState(init.name || "");
  const [goal, setGoal] = useState(init.goal || "");
  const [about, setAbout] = useState(init.about || "");
  const [isHiring, setIsHiring] = useState(init.is_hiring != null ? !!init.is_hiring : true);
  const [skills, setSkills] = useState(
    (init.req_skills || []).map((s) => s.skill_name).filter(Boolean)
  );
  const [knowledges, setKnowledges] = useState(
    (init.req_knowledges || []).map((k) => k.knowledge_name).filter(Boolean)
  );
  const [regionIds, setRegionIds] = useState(
    (init.req_regions || []).map((r) => r.region_id).filter((x) => x != null)
  );
  const [ageFrom, setAgeFrom] = useState(init.age_from != null ? String(init.age_from) : "");
  const [ageTo, setAgeTo] = useState(init.age_to != null ? String(init.age_to) : "");
  const [genderReq, setGenderReq] = useState(init.gender_req || "");

  // "idle" | "saving" | "error"
  const [state, setState] = useState("idle");
  const [error, setError] = useState("");

  // Toast for secondary feedback (e.g. nothing changed on edit) — shared,
  // timer-managed hook (no leaked setTimeout).
  const { toast, flash: showToast } = useToast(3200);

  // Snapshot of the initial edit body, so "Save changes" can detect a no-op.
  const initialBody = useMemo(() => (isEdit ? serializeBody(init) : null), [isEdit, init]);

  function toggleRegion(id) {
    setRegionIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  const nameOk = name.trim().length >= 3;

  function buildBody() {
    const parsedFrom = ageFrom.trim() === "" ? null : Number(ageFrom);
    const parsedTo = ageTo.trim() === "" ? null : Number(ageTo);
    const body = {
      name: name.trim(),
      goal: goal.trim() || null,
      about: about.trim() || null,
      is_hiring: isHiring,
      gender_req: genderReq || null,
      age_from: Number.isFinite(parsedFrom) ? parsedFrom : null,
      age_to: Number.isFinite(parsedTo) ? parsedTo : null,
      req_region_ids: regionIds,
      req_skills: skills,
      req_knowledges: knowledges,
    };
    // `type` is immutable on the backend PATCH (ProjectUpdate has no `type`), so
    // only send it on create.
    if (!isEdit) body.type = type;
    return body;
  }

  async function submit() {
    setError("");
    if (!nameOk) {
      setError(t("projmanage.form_err_name"));
      return;
    }
    const from = ageFrom.trim() === "" ? null : Number(ageFrom);
    const to = ageTo.trim() === "" ? null : Number(ageTo);
    // Client-side age-bound validation before the network call.
    if (from != null && (!Number.isFinite(from) || from < 13 || from > 100)) {
      setError(t("projmanage.form_err_min_age"));
      return;
    }
    if (to != null && (!Number.isFinite(to) || to < 13 || to > 100)) {
      setError(t("projmanage.form_err_max_age"));
      return;
    }
    if (from != null && to != null && from > to) {
      setError(t("projmanage.form_err_age_range"));
      return;
    }
    const body = buildBody();
    // Nothing changed on edit → skip the round-trip and tell the user.
    if (isEdit && initialBody != null) {
      const currentBody = JSON.stringify({
        name: body.name,
        goal: body.goal,
        about: body.about,
        is_hiring: body.is_hiring,
        gender_req: body.gender_req,
        age_from: body.age_from,
        age_to: body.age_to,
        req_region_ids: [...body.req_region_ids].sort(),
        req_skills: [...body.req_skills].sort(),
        req_knowledges: [...body.req_knowledges].sort(),
      });
      if (currentBody === initialBody) {
        showToast(t("projmanage.form_no_changes"));
        return;
      }
    }
    setState("saving");
    try {
      if (isEdit) {
        await bfu(`/projects/${init.id}`, { method: "PATCH", body });
        // Back to the manager, which reloads the fresh project.
        router.push(`/projects/${init.id}/manage`);
        router.refresh();
      } else {
        const created = await bfu("/projects", { method: "POST", body });
        const newId = created?.id;
        // Created projects are unapproved → not yet public at /p/{id}. Land the
        // founder on their projects list, where the pending badge explains the
        // wait, rather than a 404-until-approved public page.
        if (newId) {
          try {
            sessionStorage.setItem("bfu:justCreated", String(newId));
          } catch {}
        }
        router.push("/projects/mine");
        router.refresh();
      }
    } catch (err) {
      setState("error");
      setError(err?.message || t("projmanage.form_err_generic"));
    }
  }

  const typeOptions = [
    { value: "startup", label: t("projmanage.type_startup"), bg: "rgba(232,161,92,0.16)", fg: "var(--amber)", dot: "var(--amber)" },
    { value: "volunteering", label: t("projmanage.type_volunteering"), bg: "rgba(127,176,105,0.16)", fg: "var(--green)", dot: "var(--green)" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 780 }}>
      {/* Type — create only (immutable after) */}
      {!isEdit && (
        <Section label={t("projmanage.form_type_label")} hint={t("projmanage.form_type_hint")}>
          <Segmented value={type} onChange={setType} options={typeOptions} />
        </Section>
      )}

      {/* Name + goal */}
      <Section label={t("projmanage.form_essentials_label")} hint={t("projmanage.form_essentials_hint")}>
        <label style={{ display: "block" }}>
          <span style={fieldLabel}>{t("projmanage.form_name_label")}</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            placeholder={t("projmanage.form_name_placeholder")}
            style={inputBase}
          />
          {name.length > 0 && !nameOk ? (
            <span style={{ display: "block", marginTop: 6, fontSize: 12.5, color: "var(--muted-strong)" }}>
              {t("projmanage.form_name_min")}
            </span>
          ) : null}
        </label>
        <label style={{ display: "block" }}>
          <span style={fieldLabel}>{t("projmanage.form_goal_label")}</span>
          <input
            type="text"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            maxLength={200}
            placeholder={t("projmanage.form_goal_placeholder")}
            style={inputBase}
          />
        </label>
      </Section>

      {/* About */}
      <Section label={t("projmanage.form_story_label")} hint={t("projmanage.form_story_hint")}>
        <textarea
          value={about}
          onChange={(e) => setAbout(e.target.value)}
          rows={6}
          maxLength={4000}
          placeholder={t("projmanage.form_story_placeholder")}
          style={{ ...inputBase, resize: "vertical", lineHeight: 1.55, minHeight: 130 }}
        />
      </Section>

      {/* Hiring */}
      <Section label={t("projmanage.form_hiring_label")} hint={t("projmanage.form_hiring_hint")}>
        <Toggle
          on={isHiring}
          onChange={setIsHiring}
          label={t("projmanage.form_hiring_toggle")}
          sub={t("projmanage.form_hiring_toggle_sub")}
        />
      </Section>

      {/* Required skills */}
      <Section label={t("projmanage.form_skills_label")} hint={t("projmanage.form_skills_hint")}>
        <ChipEditor items={skills} onChange={setSkills} placeholder={t("projmanage.form_skills_placeholder")} />
      </Section>

      {/* Required knowledges */}
      <Section label={t("projmanage.form_domains_label")} hint={t("projmanage.form_domains_hint")} style={{}}>
        <ChipEditor
          items={knowledges}
          onChange={setKnowledges}
          placeholder={t("projmanage.form_domains_placeholder")}
          accent="var(--teal-bright)"
        />
      </Section>

      {/* Regions */}
      <Section label={t("projmanage.form_regions_label")} hint={t("projmanage.form_regions_hint")}>
        {regionOptions.length ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {regionOptions.map((r) => {
              const on = regionIds.includes(r.id);
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => toggleRegion(r.id)}
                  aria-pressed={on}
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    letterSpacing: "0.03em",
                    padding: "7px 12px",
                    borderRadius: "var(--radius-pill)",
                    cursor: "pointer",
                    background: on ? "rgba(232,161,92,0.16)" : "var(--surface-2)",
                    border: `1px solid ${on ? "var(--amber)" : "var(--hair)"}`,
                    color: on ? "var(--amber)" : "var(--muted-strong)",
                    transition: "all 0.16s ease",
                  }}
                >
                  {on ? <span aria-hidden style={{ marginRight: 5 }}>✓</span> : null}
                  {regionName(r)}
                </button>
              );
            })}
          </div>
        ) : (
          <div style={{ fontSize: 13, color: "var(--muted-strong)" }}>{t("projmanage.form_regions_unavailable")}</div>
        )}
      </Section>

      {/* Age + gender (optional) */}
      <Section label={t("projmanage.form_whocanjoin_label")} hint={t("projmanage.form_whocanjoin_hint")}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <label style={{ flex: "1 1 120px" }}>
            <span style={fieldLabel}>{t("projmanage.form_min_age")}</span>
            <input
              type="number"
              min={13}
              max={100}
              value={ageFrom}
              onChange={(e) => setAgeFrom(e.target.value)}
              placeholder="—"
              style={inputBase}
            />
          </label>
          <label style={{ flex: "1 1 120px" }}>
            <span style={fieldLabel}>{t("projmanage.form_max_age")}</span>
            <input
              type="number"
              min={13}
              max={100}
              value={ageTo}
              onChange={(e) => setAgeTo(e.target.value)}
              placeholder="—"
              style={inputBase}
            />
          </label>
          <label style={{ flex: "1 1 160px" }}>
            <span style={fieldLabel}>{t("projmanage.form_gender")}</span>
            <select
              value={genderReq}
              onChange={(e) => setGenderReq(e.target.value)}
              style={{ ...inputBase, cursor: "pointer", appearance: "none", colorScheme: "dark" }}
            >
              <option value="">{t("projmanage.form_gender_any")}</option>
              <option value="Male">{t("projmanage.form_gender_male")}</option>
              <option value="Female">{t("projmanage.form_gender_female")}</option>
            </select>
          </label>
        </div>
      </Section>

      {/* Error + submit bar */}
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
          {error ? (
            <span style={{ fontSize: 13, color: "var(--terra)" }}>{error}</span>
          ) : isEdit ? (
            <span style={{ fontSize: 13, color: "var(--muted-strong)" }}>{t("projmanage.form_editing")}</span>
          ) : (
            <span style={{ fontSize: 13, color: "var(--muted-strong)" }}>
              {t("projmanage.form_new_note")}
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {isEdit && (
            <a
              href={`/web/projects/${init.id}/manage`}
              className="ch-btn-ghost"
              aria-disabled={state === "saving" ? "true" : undefined}
              style={
                state === "saving"
                  ? { pointerEvents: "none", opacity: 0.55 }
                  : undefined
              }
            >
              {t("projmanage.cancel")}
            </a>
          )}
          <button
            type="button"
            className="ch-btn-primary"
            onClick={submit}
            disabled={state === "saving" || !nameOk}
            style={{
              opacity: state === "saving" || !nameOk ? 0.55 : 1,
              cursor: state === "saving" || !nameOk ? "default" : "pointer",
            }}
          >
            {state === "saving" ? (
              <>
                <span className="ch-spin" aria-hidden>◠</span> {isEdit ? t("projmanage.saving") : t("projmanage.form_submitting")}
              </>
            ) : isEdit ? (
              t("projmanage.form_save_changes")
            ) : (
              t("projmanage.form_create_project")
            )}
          </button>
        </div>
      </div>

      {toast ? (
        <div
          className="ch-toast ch-toast-show"
          role="status"
          style={{ borderColor: toast.tone === "err" ? "rgba(192,86,59,0.5)" : "rgba(127,176,105,0.5)" }}
        >
          <span className="ch-toast-tx" style={{ color: toast.tone === "err" ? "var(--terra)" : "var(--text)" }}>
            {toast.text}
          </span>
        </div>
      ) : null}
    </div>
  );
}
