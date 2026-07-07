"use client";

import { useEffect, useState } from "react";
import { bfu } from "@/lib/client-api";

// Read-only "Open roles" island for the public /p/[id] page. The roles GET is
// auth-gated (needs a session), so this is an additive client island rather than
// SSR — anon readers simply see nothing here (the SSR "looking for" cell already
// covers the logged-out story). Shows only unfilled roles so applicants know what
// the team is actually looking for; the join island's role picker uses the same
// list.
//
// Shape confirmed: GET /projects/{id}/roles → { roles: [ {id,name,is_filled,created_at} ] }

export default function OpenRolesCell({ projectId }) {
  const [state, setState] = useState("loading"); // loading | ready | hidden
  const [roles, setRoles] = useState([]);

  useEffect(() => {
    let alive = true;
    bfu(`/projects/${projectId}/roles`)
      .then((res) => {
        if (!alive) return;
        const open = (res?.roles || []).filter((r) => !r.is_filled);
        if (open.length === 0) {
          setState("hidden"); // nothing to advertise → don't take up a cell
          return;
        }
        setRoles(open);
        setState("ready");
      })
      .catch(() => {
        if (alive) setState("hidden");
      });
    return () => {
      alive = false;
    };
  }, [projectId]);

  // Anon / no-roles → render nothing (SSR "looking for" already covers that
  // story). While the auth-gated fetch is in flight we reserve a slim skeleton
  // so the action rail doesn't jump when roles resolve.
  if (state === "hidden") return null;

  if (state === "loading") {
    return (
      <div
        className="ch-cell-static"
        aria-hidden
        style={{ display: "flex", flexDirection: "column", gap: 16, minHeight: 118 }}
      >
        <div className="ch-cell-label">Open roles</div>
        <div
          style={{
            height: 12,
            width: "62%",
            borderRadius: 6,
            background: "var(--surface-2)",
          }}
        />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {[64, 88, 52].map((w) => (
            <div
              key={w}
              style={{
                height: 28,
                width: w,
                borderRadius: "var(--radius-pill)",
                background: "var(--surface-2)",
              }}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="ch-cell-static" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="ch-cell-label">Open roles</div>
      <p style={{ margin: 0, fontSize: 14, color: "var(--muted-strong)", lineHeight: 1.5 }}>
        The team is looking for:
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {roles.map((r) => (
          <span
            key={r.id}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11.5,
              padding: "7px 13px",
              borderRadius: "var(--radius-pill)",
              background: "rgba(232,161,92,0.1)",
              border: "1px solid rgba(232,161,92,0.32)",
              color: "var(--amber)",
            }}
          >
            {r.name}
          </span>
        ))}
      </div>
    </div>
  );
}
