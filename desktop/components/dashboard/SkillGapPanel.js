// Skill-gap cell — SERVER component (no hooks). The most useful founder view:
// for the top ~10 skills by gap, show a demand bar (ember) and a supply bar
// (teal/green) on ONE shared scale so "wanted vs available" is legible at a
// glance, plus the numeric gap (amber when positive = "needs people", muted when
// covered). Skills arrive pre-sorted by gap desc from /admin/analytics/skill-gap.
// Hand-built paired bars — no chart library.

const TOP_N = 10;

export default function SkillGapPanel({ payload }) {
  const skills = (payload?.skills || []).slice(0, TOP_N);

  return (
    <section className="ch-cell-static" style={{ padding: 26 }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 14,
          flexWrap: "wrap",
        }}
      >
        <div className="ch-cell-label">Skill gap · what the city needs</div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: "0.08em",
            color: "var(--muted-strong)",
          }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <i style={{ width: 9, height: 9, borderRadius: 2, background: "var(--ember)" }} />
            demand
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <i style={{ width: 9, height: 9, borderRadius: 2, background: "var(--teal-bright)" }} />
            supply
          </span>
        </div>
      </div>

      {skills.length === 0 ? (
        <p
          style={{
            margin: "16px 0 0",
            fontFamily: "var(--font-accent)",
            fontStyle: "italic",
            fontSize: 20,
            color: "var(--muted)",
          }}
        >
          No skills mapped yet — the gap chart fills in as builders list what they
          want and what they bring.
        </p>
      ) : (
        <div style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 16 }}>
          {skills.map((s) => {
            const demand = Number(s.demand) || 0;
            const supply = Number(s.supply) || 0;
            // Shared scale across BOTH series so the two bars are comparable.
            const scale = Math.max(1, demand, supply);
            const gap = Number(s.gap) || 0;
            const needs = gap > 0;
            return (
              <div key={s.skill}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  <div
                    style={{
                      fontFamily: "var(--font-display)",
                      fontWeight: 600,
                      fontSize: 15,
                      color: "var(--text)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {s.skill}
                  </div>
                  <div
                    style={{
                      flex: "0 0 auto",
                      fontFamily: "var(--font-mono)",
                      fontSize: 11.5,
                      fontWeight: 700,
                      color: needs ? "var(--amber)" : "var(--muted-strong)",
                    }}
                  >
                    {needs ? `gap +${gap} · needs people` : `covered (${gap})`}
                  </div>
                </div>

                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 5 }}>
                  <Bar
                    value={demand}
                    scale={scale}
                    gradient="linear-gradient(90deg, var(--terra), var(--ember))"
                    glow="rgba(255,106,61,0.28)"
                  />
                  <Bar
                    value={supply}
                    scale={scale}
                    gradient="linear-gradient(90deg, var(--teal), var(--teal-bright))"
                    glow="rgba(94,197,182,0.24)"
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function Bar({ value, scale, gradient, glow }) {
  const pct = Math.round((value / scale) * 100);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div
        style={{
          flex: 1,
          minWidth: 0,
          position: "relative",
          height: 14,
          borderRadius: "var(--radius-pill)",
          background: "var(--surface-2)",
          border: "1px solid var(--hair)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            width: `${value > 0 ? Math.max(pct, 3) : 0}%`,
            borderRadius: "var(--radius-pill)",
            background: gradient,
            boxShadow: value > 0 ? `0 0 14px ${glow}` : "none",
          }}
        />
      </div>
      <div
        style={{
          flex: "0 0 34px",
          textAlign: "right",
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: "var(--muted-strong)",
        }}
      >
        {value}
      </div>
    </div>
  );
}
