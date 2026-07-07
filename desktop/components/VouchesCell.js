import { initials } from "@/lib/avatar";

export default function VouchesCell({ vouches, vouchCount }) {
  const top = vouches?.[0];

  return (
    <div className="ch-cell-static" style={{ gridColumn: "span 2", display: "flex", flexDirection: "column" }}>
      <div className="ch-cell-label">Vouches ({vouchCount || 0})</div>
      {top ? (
        <>
          <p style={{ margin: "16px 0 0", fontFamily: "var(--font-accent)", fontStyle: "italic",
            fontSize: 23, lineHeight: 1.4, color: "var(--text)" }}>
            &ldquo;{top.text}&rdquo;
          </p>
          <div style={{ marginTop: "auto", paddingTop: 18, display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: "50%",
              background: "linear-gradient(140deg,#7FB069,#12564F)", display: "flex", alignItems: "center",
              justifyContent: "center", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15,
              color: "#160E08" }}>
              {top.author ? initials(top.author.display_name) : "?"}
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>
                {top.author?.display_name || "A BFU builder"}
              </div>
            </div>
          </div>
        </>
      ) : (
        <p style={{ marginTop: 16, color: "var(--muted-strong)" }}>No vouches yet.</p>
      )}
    </div>
  );
}
