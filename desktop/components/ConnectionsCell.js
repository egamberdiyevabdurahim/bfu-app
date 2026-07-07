import { initials } from "@/lib/avatar";

const STACK_GRADIENTS = [
  "linear-gradient(140deg,#E8A15C,#C0563B)",
  "linear-gradient(140deg,#F0B429,#C0563B)",
  "linear-gradient(140deg,var(--teal-bright),#12564F)",
  "linear-gradient(140deg,#7FB069,#12564F)",
];

export default function ConnectionsCell({ collaborators, followerCount, region }) {
  const preview = collaborators?.preview || [];
  const collabCount = collaborators?.count || 0;
  const extra = Math.max(0, collabCount - preview.length);
  const followers = followerCount || 0;

  return (
    <div className="ch-cell-static" style={{ gridColumn: "span 4", display: "flex", alignItems: "center",
      justifyContent: "space-between", gap: 24, padding: "26px 28px", flexWrap: "wrap" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <div style={{ display: "flex" }}>
          {preview.length > 0 ? (
            preview.map((p, i) => (
              <div key={p.id ?? i} style={{ width: 44, height: 44, borderRadius: "50%",
                background: STACK_GRADIENTS[i % STACK_GRADIENTS.length], border: "2px solid var(--surface)",
                marginLeft: i === 0 ? 0 : -14, display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15, color: "#160E08" }}>
                {initials(p.display_name)}
              </div>
            ))
          ) : (
            <div style={{ width: 44, height: 44, borderRadius: "50%", background: "var(--surface-2)",
              border: "2px solid var(--surface)", display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: "var(--font-mono)", fontSize: 16, color: "var(--muted-strong)" }} aria-hidden>
              ◇
            </div>
          )}
          {extra > 0 && (
            <div style={{ width: 44, height: 44, borderRadius: "50%", background: "var(--surface-2)",
              border: "2px solid var(--surface)", marginLeft: -14, display: "flex", alignItems: "center",
              justifyContent: "center", fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 13,
              color: "var(--muted-strong)" }}>
              +{extra}
            </div>
          )}
        </div>
        <div>
          <div style={{ fontSize: 15, color: "var(--text)" }}>
            <span style={{ fontFamily: "var(--font-mono)", color: "var(--amber)" }}>
              {followers}
            </span>{" "}
            {followers === 1 ? "follower" : "followers"}
            {collabCount > 0 && (
              <>
                {" · "}
                <span style={{ fontFamily: "var(--font-mono)", color: "var(--amber)" }}>{collabCount}</span>{" "}
                {collabCount === 1 ? "collaborator" : "collaborators"}
              </>
            )}
          </div>
          {region && (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.1em",
              color: "var(--muted-strong)", marginTop: 4 }}>
              {region.name_en}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
