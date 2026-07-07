"use client";

import { useEffect, useState } from "react";
import { bfu } from "@/lib/client-api";

// Client-side "Saved" list. Loads GET /projects/favorites on mount (per-user,
// uncacheable) → array of ProjectResponse. Renders each as a Chorsu project card
// linking to /p/{id}, with an empty state. Matches the .ch-pcard grammar used by
// MyProjectsList's JoinedCard.

function typeMeta(type) {
  if (type === "volunteering") return { label: "Volunteering", cls: "ch-pcard-badge-volunteering" };
  return { label: "Startup", cls: "ch-pcard-badge-startup" };
}

function SavedCard({ project }) {
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
        {project.is_hiring ? (
          <span className="ch-pcard-hiring">
            <span className="ch-pcard-ping">
              <i />
            </span>
            Hiring
          </span>
        ) : (
          <span aria-hidden style={{ fontSize: 15, color: "var(--amber)" }}>♥</span>
        )}
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
          {project.member_count || 0} {(project.member_count || 0) === 1 ? "member" : "members"} · {project.view_count || 0} views
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
      <span className="ch-empty-k">Nothing saved yet</span>
      <div className="ch-empty-t">You haven't saved any projects.</div>
      <div className="ch-empty-s">
        Tap the heart on any project to keep it here — a quiet shelf of the
        things you want to come back to.
      </div>
      <a href="/city" className="ch-btn-primary" style={{ marginTop: 8 }}>
        Explore the city <span style={{ fontSize: 14 }}>→</span>
      </a>
    </div>
  );
}

export default function FavoritesList() {
  const [state, setState] = useState("loading"); // loading | ready | error
  const [projects, setProjects] = useState([]);

  useEffect(() => {
    let alive = true;
    bfu("/projects/favorites")
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
        Loading your saved projects…
      </div>
    );
  }
  if (state === "error") {
    return (
      <div style={{ marginTop: 28, color: "var(--terra)", fontSize: 14 }}>
        Couldn't load your saved projects. Refresh to try again.
      </div>
    );
  }
  if (projects.length === 0) return <EmptyState />;

  return (
    <div className="ch-grid" style={{ marginTop: 28 }}>
      {projects.map((p) => (
        <SavedCard key={p.id} project={p} />
      ))}
    </div>
  );
}
