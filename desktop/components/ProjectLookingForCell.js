"use client";

import { useT } from "@/components/i18n/LocaleProvider";

// Looking-for cell — the "what this project needs" bento tile. A prop-driven
// display cell. Renders mono pills for looking_for.skills + looking_for.knowledges
// and the region names (looking_for.regions[].name_en), plus a small
// requirements line (age range, gender). The whole cell is hidden by the parent
// when there is nothing to look for, but it also self-guards defensively.

function requirementLine(requirements, t) {
  if (!requirements) return null;
  const { age_from: from, age_to: to, gender_req: gender } = requirements;

  const parts = [];

  if (from != null && to != null) parts.push(t("projects.ages_range", { from, to }));
  else if (from != null) parts.push(t("projects.ages_from", { from }));
  else if (to != null) parts.push(t("projects.ages_to", { to }));

  if (gender) {
    const key = String(gender).toLowerCase();
    let label;
    if (key === "male" || key === "m") label = t("projects.gender_men");
    else if (key === "female" || key === "f") label = t("projects.gender_women");
    else if (key === "any") label = null;
    else label = gender;
    if (label) parts.push(label);
  }

  return parts.length ? parts.join(" · ") : null;
}

function Pill({ children, tone = "default" }) {
  const styles =
    tone === "region"
      ? {
          background: "rgba(18,86,79,0.18)",
          border: "1px solid rgba(94,197,182,0.3)",
          color: "var(--teal-bright)",
        }
      : {
          background: "var(--surface-2)",
          border: "1px solid var(--hair)",
          color: "var(--text)",
        };

  return (
    <span
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        letterSpacing: "0.03em",
        padding: "7px 12px",
        borderRadius: "var(--radius-pill)",
        ...styles,
      }}
    >
      {children}
    </span>
  );
}

export default function ProjectLookingForCell({ lookingFor, requirements }) {
  const t = useT();
  const skills = lookingFor?.skills || [];
  const knowledges = lookingFor?.knowledges || [];
  const regions = lookingFor?.regions || [];
  const reqLine = requirementLine(requirements, t);

  const hasChips = skills.length > 0 || knowledges.length > 0 || regions.length > 0;
  // Defensive guard — the parent already hides this when there's nothing, but
  // keep the component honest if rendered directly.
  if (!hasChips && !reqLine) return null;

  return (
    <div
      className="ch-cell-static"
      style={{
        gridColumn: "span 4",
        borderColor: "rgba(127,176,105,0.3)",
        background: "linear-gradient(150deg, rgba(127,176,105,0.10), var(--surface) 60%)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "var(--green)",
            boxShadow: "0 0 12px rgba(127,176,105,0.8)",
          }}
        />
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "var(--green)",
          }}
        >
          {t("projects.looking_for")}
        </span>
      </div>

      {hasChips && (
        <div
          style={{
            marginTop: 18,
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          {skills.map((s, i) => (
            <Pill key={`s-${i}-${s}`}>{s}</Pill>
          ))}
          {knowledges.map((k, i) => (
            <Pill key={`k-${i}-${k}`}>{k}</Pill>
          ))}
          {regions.map((r, i) => (
            <Pill key={`r-${r.id ?? `${i}-${r.name_en}`}`} tone="region">
              {r.name_en}
            </Pill>
          ))}
        </div>
      )}

      {reqLine && (
        <div
          style={{
            marginTop: hasChips ? 16 : 14,
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "var(--muted-strong)",
          }}
        >
          {reqLine}
        </div>
      )}
    </div>
  );
}
