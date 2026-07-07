// Region heatmap cell — SERVER component (no hooks). One row per region, each
// with the region name + a horizontal amber→ember bar proportional to `members`
// (relative to the busiest region), plus small mono figures. Regions arrive
// pre-sorted by members desc from /admin/analytics/regions. Capped to ~14 rows;
// the remainder is summarised in an "others" note. Bars are hand-built divs —
// no chart library — and are purely CSS, so this stays a server component.

const MAX_ROWS = 14;

export default function RegionHeatmap({ payload }) {
  const regions = payload?.regions || [];
  const totals = payload?.totals || {};

  if (!regions.length) {
    return (
      <section className="ch-cell" style={{ padding: 26 }}>
        <div className="ch-cell-label">Region heatmap · members</div>
        <p
          style={{
            margin: "16px 0 0",
            fontFamily: "var(--font-accent)",
            fontStyle: "italic",
            fontSize: 20,
            color: "var(--muted)",
          }}
        >
          No regions have builders yet — the map lights up as the city grows.
        </p>
      </section>
    );
  }

  const max = Math.max(1, ...regions.map((r) => Number(r.members) || 0));
  const shown = regions.slice(0, MAX_ROWS);
  const rest = regions.slice(MAX_ROWS);
  const restMembers = rest.reduce((s, r) => s + (Number(r.members) || 0), 0);

  return (
    <section className="ch-cell" style={{ padding: 26 }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 14,
          flexWrap: "wrap",
        }}
      >
        <div className="ch-cell-label">Region heatmap · members</div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: "0.1em",
            color: "var(--muted)",
          }}
        >
          {(Number(totals.members) || 0).toLocaleString("en-US")} builders ·{" "}
          {(Number(totals.projects) || 0).toLocaleString("en-US")} projects ·{" "}
          {(Number(totals.open_projects) || 0).toLocaleString("en-US")} open
        </div>
      </div>

      <div style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 13 }}>
        {shown.map((r, i) => {
          const members = Number(r.members) || 0;
          const pct = Math.round((members / max) * 100);
          const name = r.name_en || r.name_uz || r.name_ru || "—";
          return (
            <div key={r.id ?? name} style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div
                style={{
                  flex: "0 0 148px",
                  fontFamily: "var(--font-display)",
                  fontWeight: 600,
                  fontSize: 15,
                  color: i === 0 ? "var(--amber)" : "var(--text)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {name}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    position: "relative",
                    height: 22,
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
                      width: `${Math.max(pct, members > 0 ? 4 : 0)}%`,
                      borderRadius: "var(--radius-pill)",
                      background:
                        "linear-gradient(90deg, var(--terra), var(--amber))",
                      boxShadow:
                        members > 0 ? "0 0 18px rgba(232,161,92,0.28)" : "none",
                    }}
                  />
                </div>
              </div>
              <div
                style={{
                  flex: "0 0 auto",
                  textAlign: "right",
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  letterSpacing: "0.04em",
                  color: "var(--muted)",
                  minWidth: 190,
                }}
              >
                <b style={{ color: "var(--text)", fontWeight: 400 }}>{members}</b> members ·{" "}
                {Number(r.projects) || 0} projects · {Number(r.open_projects) || 0} open
              </div>
            </div>
          );
        })}
      </div>

      {rest.length > 0 && (
        <div
          style={{
            marginTop: 16,
            paddingTop: 14,
            borderTop: "1px solid var(--hair)",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: "0.08em",
            color: "var(--muted)",
          }}
        >
          + {rest.length} more {rest.length === 1 ? "region" : "regions"} ·{" "}
          {restMembers.toLocaleString("en-US")} builders
        </div>
      )}
    </section>
  );
}
