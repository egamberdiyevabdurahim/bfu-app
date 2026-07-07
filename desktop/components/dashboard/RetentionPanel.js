// Retention cell — SERVER component (no hooks). Cohort bars: one vertical bar
// per signup-month cohort, height sized by retention_pct, warm firelit gradient.
// The payload arrives newest-first; we reverse to oldest→newest so it reads as a
// left-to-right timeline. Hand-built with divs — no chart library. The
// active_days window is labelled so a founder knows what "active" means.

// Format "YYYY-MM" → "Jul '26"; pass through "older" (or anything non-parseable).
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
function monthLabel(month) {
  if (!month || month === "older") return "Older";
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return month;
  const yr = m[1].slice(2);
  const idx = Number(m[2]) - 1;
  const name = MONTHS[idx] || month;
  return `${name} '${yr}`;
}

export default function RetentionPanel({ payload }) {
  const activeDays = Number(payload?.active_days) || 30;
  const raw = payload?.cohorts || [];
  // newest-first → oldest→newest for a left-to-right timeline.
  const cohorts = [...raw].reverse();

  return (
    <section className="ch-cell" style={{ padding: 26, display: "flex", flexDirection: "column" }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 14,
          flexWrap: "wrap",
        }}
      >
        <div className="ch-cell-label">Retention · by signup cohort</div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: "0.1em",
            color: "var(--muted)",
          }}
        >
          active in last {activeDays}d
        </div>
      </div>

      {cohorts.length === 0 ? (
        <p
          style={{
            margin: "16px 0 0",
            fontFamily: "var(--font-accent)",
            fontStyle: "italic",
            fontSize: 20,
            color: "var(--muted)",
          }}
        >
          Not enough history yet — cohorts appear as builders arrive month over month.
        </p>
      ) : (
        <div
          style={{
            marginTop: 26,
            display: "flex",
            alignItems: "flex-end",
            gap: 12,
            minHeight: 190,
            overflowX: "auto",
            paddingBottom: 6,
          }}
        >
          {cohorts.map((c) => {
            const pct = Math.max(0, Math.min(100, Math.round(Number(c.retention_pct) || 0)));
            const total = Number(c.total) || 0;
            const active = Number(c.active) || 0;
            // Bar height from 0 (floor 6px so an empty cohort still reads) to 150px.
            const h = total > 0 ? Math.max(6, Math.round((pct / 100) * 150)) : 6;
            return (
              <div
                key={c.month || "older"}
                style={{
                  flex: "1 1 0",
                  minWidth: 46,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 12,
                    fontWeight: 700,
                    color: pct >= 50 ? "var(--green)" : pct > 0 ? "var(--amber)" : "var(--muted)",
                  }}
                >
                  {pct}%
                </div>
                <div
                  style={{
                    width: "100%",
                    maxWidth: 44,
                    height: 150,
                    display: "flex",
                    alignItems: "flex-end",
                  }}
                >
                  <div
                    style={{
                      width: "100%",
                      height: h,
                      borderRadius: "8px 8px 4px 4px",
                      background:
                        "linear-gradient(180deg, var(--amber), var(--terra))",
                      boxShadow: total > 0 ? "0 0 16px rgba(232,161,92,0.22)" : "none",
                    }}
                  />
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    letterSpacing: "0.06em",
                    color: "var(--muted)",
                    textAlign: "center",
                    whiteSpace: "nowrap",
                  }}
                >
                  {monthLabel(c.month)}
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    color: "var(--muted)",
                    textAlign: "center",
                  }}
                >
                  {active}/{total}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
