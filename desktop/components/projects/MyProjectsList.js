"use client";

import { useEffect, useState } from "react";
import { bfu } from "@/lib/client-api";

// Client-side "Your projects" list. Loads GET /projects/mine on mount
// (per-user, uncacheable) and splits the result into OWNED (creator_id === me.id)
// and JOINED (member but not creator). Owned cards carry an applicant count and
// a Manage link; joined cards link to the public project page.
//
// GET /projects/mine returns the founder's OWN projects only (the backend filters
// on creator_id) — so in practice everything here is owned. We still split
// defensively in case the endpoint's contract widens to include joined projects.

function typeMeta(type) {
  if (type === "volunteering") {
    return { label: "Volunteering", cls: "ch-pcard-badge-volunteering" };
  }
  return { label: "Startup", cls: "ch-pcard-badge-startup" };
}

function StatusBadge({ project }) {
  // Approval / hiring status marker in the top-right of a card.
  if (project.is_approved === false) {
    return (
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9.5,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--amber)",
          background: "rgba(232,161,92,0.12)",
          border: "1px solid rgba(232,161,92,0.3)",
          borderRadius: "var(--radius-pill)",
          padding: "4px 10px",
        }}
      >
        Pending approval
      </span>
    );
  }
  if (project.is_hiring) {
    return (
      <span className="ch-pcard-hiring">
        <span className="ch-pcard-ping">
          <i />
        </span>
        Hiring
      </span>
    );
  }
  return null;
}

function OwnedCard({ project }) {
  const meta = typeMeta(project.type);
  const pending = project.pending_applications_count || 0;
  const members = project.member_count || 0;
  return (
    <div
      className="ch-pcard"
      style={{ animation: "none", opacity: 1, transform: "none", cursor: "default" }}
    >
      <div className="ch-pcard-top">
        <span className={`ch-pcard-badge ${meta.cls}`}>
          <i />
          {meta.label}
        </span>
        <div className="ch-pcard-marks">
          <StatusBadge project={project} />
        </div>
      </div>

      <div className="ch-pcard-nm">{project.name}</div>
      {project.goal ? <div className="ch-pcard-goal">{project.goal}</div> : null}

      <div className="ch-pcard-foot" style={{ alignItems: "flex-end" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--amber)" }}>
            {pending > 0 ? `${pending} pending` : "No new applicants"}
          </span>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9.5,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--muted)",
            }}
          >
            {members} {members === 1 ? "member" : "members"} · {project.view_count || 0} views
          </span>
        </div>
        <a
          href={`/projects/${project.id}/manage`}
          className="ch-btn-primary"
          style={{ padding: "9px 16px", fontSize: 13 }}
        >
          Manage {pending > 0 ? `(${pending})` : ""}
        </a>
      </div>
    </div>
  );
}

function JoinedCard({ project }) {
  const meta = typeMeta(project.type);
  return (
    <a
      href={`/p/${project.id}`}
      className="ch-pcard"
      style={{ animation: "none", opacity: 1, transform: "none", textDecoration: "none" }}
    >
      <div className="ch-pcard-top">
        <span className={`ch-pcard-badge ${meta.cls}`}>
          <i />
          {meta.label}
        </span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9.5,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "var(--green)",
          }}
        >
          On the team
        </span>
      </div>
      <div className="ch-pcard-nm">{project.name}</div>
      {project.goal ? <div className="ch-pcard-goal">{project.goal}</div> : null}
      <div className="ch-pcard-foot">
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9.5,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--muted)",
          }}
        >
          {project.member_count || 0} members
        </span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--amber)" }}>
          Open →
        </span>
      </div>
    </a>
  );
}

function EmptyState() {
  return (
    <div className="ch-empty" style={{ marginTop: 28 }}>
      <span className="ch-empty-k">Your workshop is empty</span>
      <div className="ch-empty-t">You haven't started a project yet.</div>
      <div className="ch-empty-s">
        Every team on BFU began with one person lighting a window. Describe what
        you want to build and let the city gather around it.
      </div>
      <a href="/projects/new" className="ch-btn-primary" style={{ marginTop: 8 }}>
        Start one <span style={{ fontSize: 14 }}>→</span>
      </a>
    </div>
  );
}

export default function MyProjectsList({ meId }) {
  const [state, setState] = useState("loading"); // loading | ready | error
  const [projects, setProjects] = useState([]);
  const [justCreated, setJustCreated] = useState(null);

  useEffect(() => {
    // Surface a one-time "submitted — pending approval" banner after a create.
    try {
      const id = sessionStorage.getItem("bfu:justCreated");
      if (id) {
        setJustCreated(id);
        sessionStorage.removeItem("bfu:justCreated");
      }
    } catch {}

    let alive = true;
    bfu("/projects/mine")
      .then((res) => {
        if (!alive) return;
        setProjects(Array.isArray(res) ? res : []);
        setState("ready");
      })
      .catch(() => {
        if (alive) setState("error");
      });
    return () => {
      alive = false;
    };
  }, []);

  if (state === "loading") {
    return (
      <div style={{ marginTop: 28, color: "var(--muted)", fontSize: 14 }}>
        <span className="ch-spin" aria-hidden style={{ marginRight: 8 }}>◠</span>
        Loading your projects…
      </div>
    );
  }

  if (state === "error") {
    return (
      <div style={{ marginTop: 28, color: "var(--terra)", fontSize: 14 }}>
        Couldn't load your projects. Refresh to try again.
      </div>
    );
  }

  const owned = projects.filter((p) => !meId || p.creator_id === meId || p.creator_id == null);
  const joined = projects.filter((p) => meId && p.creator_id != null && p.creator_id !== meId);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 30 }}>
      {justCreated ? (
        <div
          role="status"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "14px 18px",
            borderRadius: "var(--radius-sm)",
            background: "rgba(127,176,105,0.1)",
            border: "1px solid rgba(127,176,105,0.35)",
            color: "var(--text)",
            fontSize: 14,
          }}
        >
          <span style={{ color: "var(--green)", fontSize: 16 }}>✓</span>
          Submitted — your project is pending admin approval. It'll appear in the
          city once approved.
        </div>
      ) : null}

      {owned.length === 0 && joined.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          {owned.length > 0 && (
            <section>
              <div className="ch-slab" style={{ margin: "0 0 18px" }}>
                <span className="ch-slab-k">Yours</span>
                <h2>Projects you started</h2>
                <span className="ch-slab-line" />
              </div>
              <div className="ch-grid">
                {owned.map((p) => (
                  <OwnedCard key={p.id} project={p} />
                ))}
              </div>
            </section>
          )}

          {joined.length > 0 && (
            <section>
              <div className="ch-slab" style={{ margin: "0 0 18px" }}>
                <span className="ch-slab-k">Joined</span>
                <h2>Teams you're on</h2>
                <span className="ch-slab-line" />
              </div>
              <div className="ch-grid">
                {joined.map((p) => (
                  <JoinedCard key={p.id} project={p} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
