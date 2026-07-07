"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { bfu } from "@/lib/client-api";
import { gradientFor, initials } from "@/lib/avatar";
import CreateProjectForm from "@/components/projects/CreateProjectForm";

// Owner cockpit for a single project. Loads the AUTHED GET /projects/{id}
// (viewer-specific fields) on mount, then:
//   • gates ownership: creator_id !== meId → redirect to /p/{id}
//   • lists the pending applications (from project.members? no — from the
//     authed detail's `pending_applications_count`, but the FULL applicant list
//     with names comes from GET /projects/my-requests, filtered to this project)
//   • Accept / Reject each → PATCH /projects/{id}/applications/{appId}
//     {action:"accept"|"decline"} with an optimistic remove
//   • Edit (reuse CreateProjectForm pre-filled → PATCH)
//   • Delete (confirm → DELETE /projects/{id})
//
// NOTE ON APPLICANTS DATA: the authed GET /projects/{id} exposes
// pending_applications_count + a members list, but NOT the pending applicants'
// identities (its `applications` relation is loaded server-side yet not
// serialized into ProjectResponse). The one endpoint that returns pending
// applicants WITH names/avatars is GET /projects/my-requests (the founder's
// inbox across ALL their projects) — we fetch it and filter to this project_id.

function StatusChip({ project }) {
  if (project.is_approved === false) {
    return (
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--amber)",
          background: "rgba(232,161,92,0.12)",
          border: "1px solid rgba(232,161,92,0.3)",
          borderRadius: "var(--radius-pill)",
          padding: "5px 12px",
        }}
      >
        Pending approval
      </span>
    );
  }
  return (
    <span
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        color: project.is_hiring ? "var(--green)" : "var(--muted)",
        background: project.is_hiring ? "rgba(127,176,105,0.12)" : "var(--surface-2)",
        border: `1px solid ${project.is_hiring ? "rgba(127,176,105,0.3)" : "var(--hair)"}`,
        borderRadius: "var(--radius-pill)",
        padding: "5px 12px",
      }}
    >
      {project.is_hiring ? "Hiring" : "Not hiring"}
    </span>
  );
}

function Avatar({ id, name, photo, size = 44 }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        flex: "0 0 auto",
        background: gradientFor(id),
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--font-display)",
        fontWeight: 800,
        fontSize: size * 0.36,
        color: "#160E08",
        overflow: "hidden",
      }}
    >
      {photo ? (
        <img src={photo} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} />
      ) : (
        initials(name)
      )}
    </div>
  );
}

function ApplicantRow({ app, onDecision, busy }) {
  const a = app.applicant || {};
  const name = a.display_name || `Builder #${a.id}`;
  return (
    <div
      className="ch-cell"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: 18,
        flexWrap: "wrap",
      }}
    >
      <Avatar id={a.id} name={name} photo={a.photo_url} />
      <div style={{ flex: 1, minWidth: 180 }}>
        <a
          href={`/u/${a.id}`}
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: 17,
            color: "var(--text)",
            textDecoration: "none",
          }}
        >
          {name}
        </a>
        {app.role ? (
          <div style={{ marginTop: 3, fontSize: 13, color: "var(--muted)" }}>
            Applying as <span style={{ color: "var(--amber)" }}>{app.role}</span>
          </div>
        ) : null}
        {a.about ? (
          <div
            style={{
              marginTop: 5,
              fontSize: 13,
              color: "var(--muted)",
              lineHeight: 1.5,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {a.about}
          </div>
        ) : null}
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button
          type="button"
          onClick={() => onDecision(app, "accept")}
          disabled={busy}
          className="ch-btn-primary"
          style={{ padding: "10px 18px", fontSize: 13, opacity: busy ? 0.6 : 1 }}
        >
          Accept
        </button>
        <button
          type="button"
          onClick={() => onDecision(app, "decline")}
          disabled={busy}
          style={{
            padding: "10px 16px",
            fontSize: 13,
            borderRadius: "var(--radius-pill)",
            background: "rgba(192,86,59,0.1)",
            border: "1px solid rgba(192,86,59,0.3)",
            color: "var(--terra)",
            cursor: busy ? "default" : "pointer",
            opacity: busy ? 0.6 : 1,
          }}
        >
          Reject
        </button>
      </div>
    </div>
  );
}

export default function ProjectManager({ projectId, meId }) {
  const router = useRouter();
  const [state, setState] = useState("loading"); // loading | ready | error | forbidden
  const [project, setProject] = useState(null);
  const [apps, setApps] = useState([]);
  const [busyApp, setBusyApp] = useState(null); // app id currently deciding
  const [tab, setTab] = useState("applicants"); // applicants | edit | danger
  const [regions, setRegions] = useState([]);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [toast, setToast] = useState(null);

  function flash(text, tone = "ok") {
    setToast({ text, tone });
    setTimeout(() => setToast(null), 3000);
  }

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const p = await bfu(`/projects/${projectId}`);
        if (!alive) return;
        // Ownership gate — GET /projects/{id} has no `is_owner`, so derive it.
        if (p.creator_id !== meId) {
          setState("forbidden");
          router.replace(`/p/${projectId}`);
          return;
        }
        setProject(p);
        setState("ready");
        // Applicants (names/avatars) come from the founder inbox, filtered here.
        try {
          const inbox = await bfu("/projects/my-requests");
          if (alive) {
            setApps(
              (Array.isArray(inbox) ? inbox : []).filter(
                (x) => x.project_id === Number(projectId) || x.project_id === projectId
              )
            );
          }
        } catch {
          if (alive) setApps([]);
        }
        // Regions for the edit form. /public/regions is a public backend route,
        // but the authed proxy forwards any path — so bfu() reaches it fine.
        try {
          const r = await bfu("/public/regions");
          if (alive) setRegions(Array.isArray(r) ? r : []);
        } catch {
          if (alive) setRegions([]);
        }
      } catch (err) {
        if (!alive) return;
        if (err?.status === 401) {
          router.replace("/login");
          return;
        }
        setState("error");
      }
    }
    load();
    return () => {
      alive = false;
    };
  }, [projectId, meId, router]);

  async function decide(app, action) {
    setBusyApp(app.id);
    // Optimistic: remove the row immediately.
    const prev = apps;
    setApps((cur) => cur.filter((x) => x.id !== app.id));
    try {
      await bfu(`/projects/${projectId}/applications/${app.id}`, {
        method: "PATCH",
        body: { action },
      });
      flash(action === "accept" ? "Applicant accepted — they're on the team." : "Application declined.");
      // Keep the header count in sync.
      setProject((p) =>
        p
          ? {
              ...p,
              pending_applications_count: Math.max(0, (p.pending_applications_count || 1) - 1),
              member_count: action === "accept" ? (p.member_count || 0) + 1 : p.member_count,
            }
          : p
      );
    } catch (err) {
      // Roll back on failure.
      setApps(prev);
      flash(err?.message || "Couldn't update the application.", "err");
    } finally {
      setBusyApp(null);
    }
  }

  async function doDelete() {
    setDeleting(true);
    try {
      await bfu(`/projects/${projectId}`, { method: "DELETE" });
      router.push("/projects/mine");
      router.refresh();
    } catch (err) {
      flash(err?.message || "Couldn't delete the project.", "err");
      setDeleting(false);
    }
  }

  if (state === "loading" || state === "forbidden") {
    return (
      <div style={{ marginTop: 28, color: "var(--muted)", fontSize: 14 }}>
        <span className="ch-spin" aria-hidden style={{ marginRight: 8 }}>◠</span>
        {state === "forbidden" ? "Taking you to the project…" : "Loading your project…"}
      </div>
    );
  }
  if (state === "error" || !project) {
    return (
      <div style={{ marginTop: 28, color: "var(--terra)", fontSize: 14 }}>
        Couldn't load this project. Refresh to try again.
      </div>
    );
  }

  const pending = apps.length;

  const tabBtn = (key, label, count) => {
    const on = tab === key;
    return (
      <button
        type="button"
        onClick={() => setTab(key)}
        style={{
          padding: "9px 16px",
          borderRadius: "var(--radius-pill)",
          border: `1px solid ${on ? "var(--amber)" : "var(--hair)"}`,
          background: on ? "rgba(232,161,92,0.12)" : "transparent",
          color: on ? "var(--amber)" : "var(--muted)",
          cursor: "pointer",
          fontFamily: "var(--font-body)",
          fontWeight: 600,
          fontSize: 13.5,
        }}
      >
        {label}
        {count != null && count > 0 ? (
          <span style={{ marginLeft: 7, fontFamily: "var(--font-mono)", fontSize: 12 }}>{count}</span>
        ) : null}
      </button>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Project header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 20,
          flexWrap: "wrap",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <StatusChip project={project} />
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "var(--muted)",
              }}
            >
              {project.type === "volunteering" ? "Volunteering" : "Startup"} · {project.member_count || 0} members · {project.view_count || 0} views
            </span>
          </div>
          <h1
            style={{
              margin: "12px 0 0",
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: 40,
              lineHeight: 1.05,
              letterSpacing: "-0.02em",
              color: "var(--text)",
            }}
          >
            {project.name}
          </h1>
        </div>
        <a href={`/p/${project.id}`} className="ch-btn-ghost">
          View public page <span style={{ fontSize: 14 }}>↗</span>
        </a>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {tabBtn("applicants", "Applicants", pending)}
        {tabBtn("edit", "Edit project")}
        {tabBtn("danger", "Delete")}
      </div>

      {/* Applicants tab */}
      {tab === "applicants" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {pending === 0 ? (
            <div className="ch-empty" style={{ minHeight: 220 }}>
              <span className="ch-empty-k">No pending applicants</span>
              <div className="ch-empty-t" style={{ fontSize: 24 }}>
                Quiet for now.
              </div>
              <div className="ch-empty-s">
                When builders apply to join, they'll appear here for you to accept
                or decline.
              </div>
            </div>
          ) : (
            apps.map((app) => (
              <ApplicantRow key={app.id} app={app} onDecision={decide} busy={busyApp === app.id} />
            ))
          )}
        </div>
      )}

      {/* Edit tab — reuse the create form, pre-filled, in PATCH mode. */}
      {tab === "edit" && <CreateProjectForm regions={regions} mode="edit" initial={project} />}

      {/* Danger tab */}
      {tab === "danger" && (
        <div
          className="ch-cell"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 16,
            borderColor: "rgba(192,86,59,0.35)",
            background: "linear-gradient(155deg, rgba(192,86,59,0.06), var(--surface) 60%)",
          }}
        >
          <div className="ch-cell-label" style={{ color: "var(--terra)" }}>
            Delete this project
          </div>
          <p style={{ margin: 0, fontSize: 14, color: "var(--muted)", lineHeight: 1.55, maxWidth: 560 }}>
            This removes <b style={{ color: "var(--text)" }}>{project.name}</b> from
            the city. Members lose access and applicants can no longer join. This
            can't be undone.
          </p>
          {!confirmDelete ? (
            <div>
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                style={{
                  padding: "11px 20px",
                  borderRadius: "var(--radius-pill)",
                  background: "rgba(192,86,59,0.12)",
                  border: "1px solid rgba(192,86,59,0.4)",
                  color: "var(--terra)",
                  cursor: "pointer",
                  fontWeight: 600,
                  fontSize: 14,
                }}
              >
                Delete project
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 14, color: "var(--text)" }}>Are you sure?</span>
              <button
                type="button"
                onClick={doDelete}
                disabled={deleting}
                style={{
                  padding: "11px 20px",
                  borderRadius: "var(--radius-pill)",
                  background: "var(--terra)",
                  border: "none",
                  color: "#fff",
                  cursor: deleting ? "default" : "pointer",
                  fontWeight: 700,
                  fontSize: 14,
                  opacity: deleting ? 0.6 : 1,
                }}
              >
                {deleting ? "Deleting…" : "Yes, delete it"}
              </button>
              <button type="button" className="ch-btn-ghost" onClick={() => setConfirmDelete(false)}>
                Keep it
              </button>
            </div>
          )}
        </div>
      )}

      {toast ? (
        <div
          className="ch-toast ch-toast-show"
          role="status"
          style={{ borderColor: toast.tone === "err" ? "rgba(192,86,59,0.5)" : "rgba(127,176,105,0.5)" }}
        >
          <span className="ch-toast-tx" style={{ color: toast.tone === "err" ? "var(--terra)" : "var(--text)" }}>
            {toast.text}
          </span>
        </div>
      ) : null}
    </div>
  );
}
