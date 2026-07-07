"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { bfu } from "@/lib/client-api";

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
  outline: "none",
  transition: "border-color 0.18s ease",
};

function focusAmber(e) {
  e.target.style.borderColor = "var(--amber)";
}
function blurHair(e) {
  e.target.style.borderColor = "var(--hair)";
}

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

// A labelled chip editor: type + Enter (or "Add") to append, × to remove.
function ChipEditor({ items, onChange, placeholder, accent = "var(--amber)" }) {
  const [draft, setDraft] = useState("");

  function add() {
    const v = draft.trim();
    if (!v) return;
    // Case-insensitive dedupe.
    if (items.some((x) => x.toLowerCase() === v.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...items, v.slice(0, 60)]);
    setDraft("");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {items.length ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {items.map((it) => (
            <span
              key={it}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                letterSpacing: "0.03em",
                padding: "7px 10px 7px 12px",
                borderRadius: "var(--radius-pill)",
                background: "var(--surface-2)",
                border: `1px solid ${accent}44`,
                color: accent,
              }}
            >
              {it}
              <button
                type="button"
                aria-label={`Remove ${it}`}
                onClick={() => onChange(items.filter((x) => x !== it))}
                style={{
                  border: "none",
                  background: "transparent",
                  color: "var(--muted)",
                  cursor: "pointer",
                  fontSize: 15,
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
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          maxLength={60}
          style={{ ...inputBase, flex: 1 }}
          onFocus={focusAmber}
          onBlur={blurHair}
        />
        <button type="button" className="ch-btn-ghost" onClick={add}>
          <span style={{ color: accent }}>+</span> Add
        </button>
      </div>
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
              color: on ? opt.fg : "var(--muted)",
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

function regionName(r) {
  return r.name_en || r.name_uz || r.name_ru || `Region ${r.id}`;
}

// `initial` (edit mode) is the authed ProjectResponse for the project. It carries
// req_regions [{region_id}], req_skills [{skill_name}], req_knowledges
// [{knowledge_name}] — we normalize those into flat state below.
export default function CreateProjectForm({ regions = [], mode = "create", initial = null }) {
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

  // Toast for secondary feedback (e.g. nothing changed on edit).
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const showToast = useCallback((text, tone = "ok") => {
    setToast({ text, tone });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);

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
      setError("Give your project a name (at least 3 characters).");
      return;
    }
    const from = ageFrom.trim() === "" ? null : Number(ageFrom);
    const to = ageTo.trim() === "" ? null : Number(ageTo);
    if (from != null && to != null && from > to) {
      setError("The minimum age can't be higher than the maximum age.");
      return;
    }
    setState("saving");
    try {
      if (isEdit) {
        await bfu(`/projects/${init.id}`, { method: "PATCH", body: buildBody() });
        // Back to the manager, which reloads the fresh project.
        router.push(`/projects/${init.id}/manage`);
        router.refresh();
      } else {
        const created = await bfu("/projects", { method: "POST", body: buildBody() });
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
      setError(err?.message || "Something went wrong. Please try again.");
    }
  }

  const typeOptions = [
    { value: "startup", label: "Startup", bg: "rgba(232,161,92,0.16)", fg: "var(--amber)", dot: "var(--amber)" },
    { value: "volunteering", label: "Volunteering", bg: "rgba(127,176,105,0.16)", fg: "var(--green)", dot: "var(--green)" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 780 }}>
      {/* Type — create only (immutable after) */}
      {!isEdit && (
        <Section label="What are you building?" hint="Startups can hire paid teammates; volunteering gathers community hands.">
          <Segmented value={type} onChange={setType} options={typeOptions} />
        </Section>
      )}

      {/* Name + goal */}
      <Section label="The essentials" hint="A clear name and a one-line goal are what the city sees first.">
        <label style={{ display: "block" }}>
          <span style={{ display: "block", marginBottom: 8, fontSize: 13, color: "var(--muted)" }}>
            Project name
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            placeholder="e.g. Bazaar Runner — same-day delivery for Chorsu sellers"
            style={inputBase}
            onFocus={focusAmber}
            onBlur={blurHair}
          />
        </label>
        <label style={{ display: "block" }}>
          <span style={{ display: "block", marginBottom: 8, fontSize: 13, color: "var(--muted)" }}>
            One-line goal
          </span>
          <input
            type="text"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            maxLength={200}
            placeholder="What will exist when this works?"
            style={inputBase}
            onFocus={focusAmber}
            onBlur={blurHair}
          />
        </label>
      </Section>

      {/* About */}
      <Section label="Tell the story" hint="What you're making, why it matters, and where you are now.">
        <textarea
          value={about}
          onChange={(e) => setAbout(e.target.value)}
          rows={6}
          maxLength={4000}
          placeholder="The longer description builders read before they decide to join…"
          style={{ ...inputBase, resize: "vertical", lineHeight: 1.55, minHeight: 130 }}
          onFocus={focusAmber}
          onBlur={blurHair}
        />
      </Section>

      {/* Hiring */}
      <Section label="Are you hiring?" hint="Turn this on to accept applications from builders across Uzbekistan.">
        <Toggle
          on={isHiring}
          onChange={setIsHiring}
          label="Open to applications"
          sub="Builders can apply to join your team."
        />
      </Section>

      {/* Required skills */}
      <Section label="Skills you're looking for" hint="Optional — the abilities a teammate should bring. Type and press Enter.">
        <ChipEditor items={skills} onChange={setSkills} placeholder="e.g. Flutter, growth, illustration" />
      </Section>

      {/* Required knowledges */}
      <Section label="Domains that help" hint="Optional — fields or subject areas relevant to the work." style={{}}>
        <ChipEditor
          items={knowledges}
          onChange={setKnowledges}
          placeholder="e.g. logistics, education, fintech"
          accent="#5EC5B6"
        />
      </Section>

      {/* Regions */}
      <Section label="Regions" hint="Optional — leave empty to welcome builders from anywhere. Selecting regions narrows who fits.">
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
                    color: on ? "var(--amber)" : "var(--muted)",
                    transition: "all 0.16s ease",
                  }}
                >
                  {regionName(r)}
                </button>
              );
            })}
          </div>
        ) : (
          <div style={{ fontSize: 13, color: "var(--muted)" }}>Region list unavailable right now.</div>
        )}
      </Section>

      {/* Age + gender (optional) */}
      <Section label="Who can join" hint="Optional constraints — most projects leave these open.">
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <label style={{ flex: "1 1 120px" }}>
            <span style={{ display: "block", marginBottom: 8, fontSize: 13, color: "var(--muted)" }}>
              Min age
            </span>
            <input
              type="number"
              min={13}
              max={100}
              value={ageFrom}
              onChange={(e) => setAgeFrom(e.target.value)}
              placeholder="—"
              style={inputBase}
              onFocus={focusAmber}
              onBlur={blurHair}
            />
          </label>
          <label style={{ flex: "1 1 120px" }}>
            <span style={{ display: "block", marginBottom: 8, fontSize: 13, color: "var(--muted)" }}>
              Max age
            </span>
            <input
              type="number"
              min={13}
              max={100}
              value={ageTo}
              onChange={(e) => setAgeTo(e.target.value)}
              placeholder="—"
              style={inputBase}
              onFocus={focusAmber}
              onBlur={blurHair}
            />
          </label>
          <label style={{ flex: "1 1 160px" }}>
            <span style={{ display: "block", marginBottom: 8, fontSize: 13, color: "var(--muted)" }}>
              Gender
            </span>
            <select
              value={genderReq}
              onChange={(e) => setGenderReq(e.target.value)}
              style={{ ...inputBase, cursor: "pointer", appearance: "auto" }}
            >
              <option value="">Any</option>
              <option value="Male">Male only</option>
              <option value="Female">Female only</option>
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
            <span style={{ fontSize: 13.5, color: "var(--terra)" }}>{error}</span>
          ) : isEdit ? (
            <span style={{ fontSize: 13.5, color: "var(--muted)" }}>Editing your project.</span>
          ) : (
            <span style={{ fontSize: 13.5, color: "var(--muted)" }}>
              New projects go live after a quick admin approval.
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {isEdit && (
            <a href={`/projects/${init.id}/manage`} className="ch-btn-ghost">
              Cancel
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
                <span className="ch-spin" aria-hidden>◠</span> {isEdit ? "Saving…" : "Submitting…"}
              </>
            ) : isEdit ? (
              "Save changes"
            ) : (
              "Create project"
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
