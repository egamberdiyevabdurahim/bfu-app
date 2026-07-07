"use client";

import { useCountUp } from "@/lib/useCountUp";

export default function HeroBuildingCell({ profile }) {
  const project = profile.founded_projects?.[0];
  // Real open-roles count when the payload carries it; otherwise we hide the
  // stat entirely rather than animate a fabricated number on every profile.
  const rawOpenRoles = project?.open_roles_count ?? project?.open_roles ?? null;
  const hasOpenRoles = typeof rawOpenRoles === "number";
  const openRoles = useCountUp(hasOpenRoles ? rawOpenRoles : 0);
  const coFounders = useCountUp(profile.collaborators?.count || 0);

  return (
    <div className="ch-cell-static" style={{ gridColumn: "span 2", gridRow: "span 2",
      display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div className="ch-cell-label">Currently building</div>
      <div style={{ position: "relative", marginTop: 16, height: 190, borderRadius: 14,
        overflow: "hidden", background: "linear-gradient(160deg,#12564F 0%,#1A1815 42%,#C0563B 130%)",
        border: "1px solid var(--hair)" }}>
        <div style={{ position: "absolute", top: 22, right: 26, width: 56, height: 56,
          borderRadius: "50%", background: "radial-gradient(circle at 40% 40%, #F0B429, #FF6A3D 70%)",
          boxShadow: "0 0 44px rgba(255,106,61,0.6)" }} />
      </div>
      <h2 style={{ margin: "20px 0 0", fontFamily: "var(--font-display)", fontWeight: 700,
        fontSize: 34, letterSpacing: "-0.02em", color: "var(--text)" }}>
        {project?.name || profile.currently_building || "No project yet"}
      </h2>
      {profile.about && (
        <p style={{ margin: "10px 0 0", fontSize: 15, lineHeight: 1.55, color: "var(--muted-strong)",
          display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          {profile.about}
        </p>
      )}
      <div style={{ marginTop: "auto", paddingTop: 22, display: "flex", gap: 26 }}>
        {hasOpenRoles && (
          <>
            <div>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 30, color: "var(--amber)" }}>
                {openRoles}
              </div>
              <div className="ch-metric-label">Open roles</div>
            </div>
            <div style={{ width: 1, background: "var(--hair)" }} />
          </>
        )}
        <div>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 30, color: "var(--text)" }}>
            {coFounders}
          </div>
          <div className="ch-metric-label">Collaborators</div>
        </div>
      </div>
    </div>
  );
}
