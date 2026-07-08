"use client";

import { useT } from "@/components/i18n/LocaleProvider";

// Project hero / identity strip — the firelit "cover" of the /p/[id] page.
// A prop-driven display cell (no local state): renders the project name
// (Bricolage, large), a type badge (Startup / Volunteering), a status line
// (hiring pill or "Completed" state), and — if present — the `goal` as an
// Instrument-Serif italic accent line. Mirrors the profile IdentityStrip's
// visual grammar.

export default function ProjectHero({ project }) {
  const t = useT();
  const {
    name,
    type,
    goal,
    is_active: isActive,
    is_hiring: isHiring,
    view_count: viewCount,
  } = project;

  const typeLabel =
    type === "startup"
      ? t("projects.type_startup")
      : type === "volunteering"
      ? t("projects.type_volunteering")
      : type
      ? String(type)
      : t("projects.type_project");
  const isStartup = type === "startup";
  // Startup → amber/ember firelit type accent; volunteering → teal/green.
  const typeAccent = isStartup ? "var(--amber)" : "var(--green)";
  const typeBg = isStartup
    ? "rgba(232,161,92,0.14)"
    : "rgba(127,176,105,0.14)";
  const typeBorder = isStartup
    ? "rgba(232,161,92,0.34)"
    : "rgba(127,176,105,0.34)";

  return (
    <div style={{ marginTop: 44 }}>
      {/* type badge + status pill row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 13px",
            borderRadius: "var(--radius-pill)",
            background: typeBg,
            border: `1px solid ${typeBorder}`,
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: typeAccent,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: typeAccent,
              boxShadow: `0 0 10px ${typeAccent}`,
            }}
          />
          {typeLabel}
        </span>

        {isActive && isHiring && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 13px",
              borderRadius: "var(--radius-pill)",
              background: "rgba(127,176,105,0.15)",
              border: "1px solid rgba(127,176,105,0.35)",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--green)",
            }}
          >
            <span style={{ position: "relative", display: "inline-flex", width: 8, height: 8 }}>
              <span className="ch-online-ping" style={{ background: "var(--green)" }} />
              <span
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: "50%",
                  background: "var(--green)",
                }}
              />
            </span>
            {t("projects.hero_looking")}
          </span>
        )}

        {/* Active but not hiring — a designed neutral status rather than a gap. */}
        {isActive && !isHiring && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 13px",
              borderRadius: "var(--radius-pill)",
              background: "rgba(232,161,92,0.1)",
              border: "1px solid rgba(232,161,92,0.28)",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--amber)",
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "var(--amber)",
                boxShadow: "0 0 10px var(--amber)",
              }}
            />
            {t("projects.hero_inprogress")}
          </span>
        )}

        {!isActive && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 13px",
              borderRadius: "var(--radius-pill)",
              background: "var(--surface-2)",
              border: "1px solid var(--hair)",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--muted-strong)",
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "var(--muted-strong)",
              }}
            />
            {t("projects.hero_completed")}
          </span>
        )}
      </div>

      {/* project name */}
      <h1
        style={{
          margin: "22px 0 0",
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: "clamp(40px, 6vw, 64px)",
          lineHeight: 1.05,
          letterSpacing: "-0.02em",
          color: "var(--text)",
          maxWidth: 900,
          overflowWrap: "break-word",
        }}
      >
        {name}
      </h1>

      {/* goal as Instrument-Serif italic accent */}
      {goal && (
        <p
          style={{
            margin: "18px 0 0",
            fontFamily: "var(--font-accent)",
            fontStyle: "italic",
            fontSize: "clamp(22px, 3vw, 30px)",
            lineHeight: 1.3,
            color: "var(--amber)",
            maxWidth: 820,
            overflowWrap: "break-word",
          }}
        >
          {goal}
        </p>
      )}

      {typeof viewCount === "number" && viewCount > 0 && (
        <div
          style={{
            marginTop: 18,
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "var(--muted-strong)",
          }}
        >
          {viewCount.toLocaleString()}{" "}
          {viewCount === 1 ? t("projects.view_one") : t("projects.view_many")}
        </div>
      )}
    </div>
  );
}
