"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { bfu } from "@/lib/client-api";
import { useCountUp } from "@/lib/useCountUp";
import { useT } from "@/components/i18n/LocaleProvider";

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
    return { labelKey: "projects.type_volunteering", cls: "ch-pcard-badge-volunteering" };
  }
  return { labelKey: "projects.type_startup", cls: "ch-pcard-badge-startup" };
}

function StatusBadge({ project }) {
  const t = useT();
  // Draft / approval / hiring status marker in the top-right of a card.
  //
  // DRAFT WINS over every other status. A draft (saved but never submitted in the
  // Mini App) is not public: /p/{id} notFound()s for it, it's excluded from every
  // browse/search query, and nobody but the owner can see it. Saying "Hiring" or
  // even "Pending approval" about it would be a lie — a draft isn't in the queue,
  // it hasn't been sent anywhere. So we check is_draft first and return early.
  //
  // Deliberately NEUTRAL (muted grey, no accent colour): amber = pending review,
  // green = live and hiring. A draft is neither — it's inert, and the badge should
  // read that way at a glance.
  if (project.is_draft) {
    return (
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9.5,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--muted-strong)",
          background: "var(--surface-2)",
          border: "1px solid var(--hair)",
          borderRadius: "var(--radius-pill)",
          padding: "4px 10px",
        }}
      >
        {t("projects.status_draft")}
      </span>
    );
  }
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
        {t("projects.status_pending")}
      </span>
    );
  }
  if (project.is_hiring) {
    return (
      <span className="ch-pcard-hiring">
        <span className="ch-pcard-ping">
          <i />
        </span>
        {t("projects.hiring")}
      </span>
    );
  }
  return null;
}

function OwnedCard({ project }) {
  const t = useT();
  const router = useRouter();
  const meta = typeMeta(project.type);
  const pending = project.pending_applications_count || 0;
  const members = project.member_count || 0;

  // MISLEADING AFFORDANCE, FIXED: the whole card is a link, and it used to open
  // the PUBLIC project page (/p/{id}) for every project — including drafts. A
  // draft has no public page: app/p/[id]/page.js notFound()s on it (getProject
  // returns nothing for draft/unapproved/deleted), so clicking your own draft
  // dead-ended on "This ember has gone out". Drafts now open the one place where
  // a draft is real and actionable — the manage/edit cockpit. Everything else
  // keeps opening the public page as before.
  const isDraft = !!project.is_draft;
  const open = () =>
    router.push(isDraft ? `/projects/${project.id}/manage` : `/p/${project.id}`);
  return (
    <div
      className="ch-pcard"
      role="link"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      }}
      style={{ animation: "none", opacity: 1, transform: "none", cursor: "pointer" }}
    >
      <div className="ch-pcard-top">
        <span className={`ch-pcard-badge ${meta.cls}`}>
          <i />
          {t(meta.labelKey)}
        </span>
        <div className="ch-pcard-marks">
          <StatusBadge project={project} />
        </div>
      </div>

      <div className="ch-pcard-nm">{project.name}</div>
      {project.goal ? <div className="ch-pcard-goal">{project.goal}</div> : null}

      <div className="ch-pcard-foot" style={{ alignItems: "flex-end" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              color: pending > 0 ? "var(--amber)" : "var(--muted-strong)",
            }}
          >
            {pending > 0
              ? t("projects.pending_count", { n: pending })
              : t("projects.no_new_applicants")}
          </span>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--muted-strong)",
            }}
          >
            {members === 1
              ? t("projects.member_one", { n: members })
              : t("projects.member_many", { n: members })}{" "}
            · {t("projects.views_count", { n: project.view_count || 0 })}
          </span>
        </div>
        <a
          href={`/web/projects/${project.id}/manage`}
          onClick={(e) => e.stopPropagation()}
          className="ch-btn-primary"
          style={{ padding: "9px 16px", fontSize: 13 }}
        >
          {t("projects.manage")} {pending > 0 ? `(${pending})` : ""}
        </a>
      </div>
    </div>
  );
}

function JoinedCard({ project }) {
  const t = useT();
  const meta = typeMeta(project.type);
  return (
    <a
      href={`/web/p/${project.id}`}
      className="ch-pcard"
      style={{ animation: "none", opacity: 1, transform: "none", textDecoration: "none" }}
    >
      <div className="ch-pcard-top">
        <span className={`ch-pcard-badge ${meta.cls}`}>
          <i />
          {t(meta.labelKey)}
        </span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "var(--green)",
          }}
        >
          {t("projects.on_the_team")}
        </span>
      </div>
      <div className="ch-pcard-nm">{project.name}</div>
      {project.goal ? <div className="ch-pcard-goal">{project.goal}</div> : null}
      <div className="ch-pcard-foot">
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--muted-strong)",
          }}
        >
          {(project.member_count || 0) === 1
            ? t("projects.member_one", { n: project.member_count || 0 })
            : t("projects.member_many", { n: project.member_count || 0 })}
        </span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--amber)" }}>
          {t("projects.open_arrow")} →
        </span>
      </div>
    </a>
  );
}

// At-a-glance owner funnel across ALL the founder's projects.
// GET /projects/mine/funnel →
//   { totals:{project_count,views,applications,accepted,pending,declined},
//     projects:[...] }
function FunnelTile({ label, value, accent }) {
  const animated = useCountUp(value || 0);
  return (
    <div
      className="ch-cell-static"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: 18,
        background: accent
          ? "linear-gradient(155deg, rgba(232,161,92,0.08), var(--surface) 62%)"
          : undefined,
      }}
    >
      <div className="ch-cell-label">{label}</div>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: 30,
          lineHeight: 1,
          letterSpacing: "-0.01em",
          color: accent ? "var(--amber)" : "var(--text)",
        }}
      >
        {animated}
      </div>
    </div>
  );
}

function FunnelStrip({ fallback }) {
  const t = useT();
  const [totals, setTotals] = useState(null);

  useEffect(() => {
    let alive = true;
    bfu("/projects/mine/funnel")
      .then((res) => {
        if (alive) setTotals(res?.totals || null);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // Prefer the server funnel (adds applications/accepted/pending) once it lands,
  // but ALWAYS show a stat strip whenever there's at least one project — derived
  // client-side from the already-loaded list — so the header never reads empty
  // even if the funnel endpoint is slow or unavailable.
  const hasFunnel = Boolean(totals && totals.project_count);
  if (!hasFunnel && (!fallback || !fallback.projects)) return null;

  // Accent the ACTIONABLE metric (Pending applicants when there are any) rather
  // than the vanity "Views" number, so the eye lands on what needs a decision.
  const tiles = hasFunnel
    ? [
        { label: t("projects.funnel_projects"), value: totals.project_count },
        { label: t("projects.funnel_views"), value: totals.views },
        { label: t("projects.funnel_applications"), value: totals.applications },
        { label: t("projects.funnel_accepted"), value: totals.accepted },
        { label: t("projects.funnel_pending"), value: totals.pending, accent: (totals.pending || 0) > 0 },
      ]
    : [
        { label: t("projects.funnel_projects"), value: fallback.projects },
        { label: t("projects.funnel_total_views"), value: fallback.views },
        { label: t("projects.funnel_hiring"), value: fallback.hiring, accent: (fallback.hiring || 0) > 0 },
      ];

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
        gap: 14,
      }}
    >
      {tiles.map((t) => (
        <FunnelTile key={t.label} label={t.label} value={t.value} accent={t.accent} />
      ))}
    </div>
  );
}

function EmptyState() {
  const t = useT();
  return (
    <div className="ch-empty" style={{ marginTop: 28 }}>
      <span className="ch-empty-k">{t("projects.empty_mine_k")}</span>
      <div className="ch-empty-t">{t("projects.empty_mine_t")}</div>
      <div className="ch-empty-s">{t("projects.empty_mine_s")}</div>
      <a href="/web/projects/new" className="ch-btn-primary" style={{ marginTop: 8 }}>
        {t("projects.start_one")} <span style={{ fontSize: 14 }}>→</span>
      </a>
    </div>
  );
}

export default function MyProjectsList({ meId }) {
  const t = useT();
  const [state, setState] = useState("loading"); // loading | ready | error
  const [projects, setProjects] = useState([]);
  const [justCreated, setJustCreated] = useState(null);
  // A draft was just saved — distinct from justCreated, which claims "pending
  // approval". A draft isn't in any queue, so it gets its own honest banner.
  const [justSavedDraft, setJustSavedDraft] = useState(null);
  const aliveRef = useRef(true);

  function load() {
    setState("loading");
    bfu("/projects/mine")
      .then((res) => {
        if (!aliveRef.current) return;
        setProjects(Array.isArray(res) ? res : []);
        setState("ready");
      })
      .catch(() => {
        if (aliveRef.current) setState("error");
      });
  }

  useEffect(() => {
    aliveRef.current = true;
    // Surface a one-time "submitted — pending approval" banner after a create.
    try {
      const id = sessionStorage.getItem("bfu:justCreated");
      if (id) {
        setJustCreated(id);
        sessionStorage.removeItem("bfu:justCreated");
      }
      const draftId = sessionStorage.getItem("bfu:justSavedDraft");
      if (draftId) {
        setJustSavedDraft(draftId);
        sessionStorage.removeItem("bfu:justSavedDraft");
      }
    } catch {}

    load();
    return () => {
      aliveRef.current = false;
    };
  }, []);

  if (state === "loading") {
    return (
      <div
        role="status"
        aria-live="polite"
        style={{ marginTop: 28, color: "var(--muted-strong)", fontSize: 14 }}
      >
        <span className="ch-spin" aria-hidden style={{ marginRight: 8 }}>◠</span>
        {t("projects.loading_yours")}
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="ch-empty" style={{ marginTop: 28 }}>
        <span className="ch-empty-k" style={{ color: "var(--terra)" }}>
          {t("projects.err_load_k")}
        </span>
        <div className="ch-empty-t">{t("projects.err_load_t")}</div>
        <button type="button" className="ch-btn-primary" onClick={load} style={{ marginTop: 8 }}>
          <span className="ch-spin" aria-hidden style={{ marginRight: 6 }}>↻</span>
          {t("projects.try_again")}
        </button>
      </div>
    );
  }

  const owned = projects.filter((p) => !meId || p.creator_id === meId || p.creator_id == null);
  const joined = projects.filter((p) => meId && p.creator_id != null && p.creator_id !== meId);

  // Client-side stat fallback so the header strip always has something to show.
  // Drafts are excluded from "Hiring now": a draft carries is_hiring (it's a form
  // default) but nobody can see or apply to it, so counting it would inflate the
  // tile with a project that isn't actually recruiting anyone.
  const derived = {
    projects: projects.length,
    views: projects.reduce((a, p) => a + (p.view_count || 0), 0),
    hiring: projects.filter((p) => p.is_hiring && !p.is_draft).length,
  };

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
          {t("projects.just_created")}
        </div>
      ) : null}

      {justSavedDraft ? (
        <div
          role="status"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "14px 18px",
            borderRadius: "var(--radius-sm)",
            background: "rgba(232,161,92,0.1)",
            border: "1px solid rgba(232,161,92,0.35)",
            color: "var(--text)",
            fontSize: 14,
          }}
        >
          <span style={{ color: "var(--amber)", fontSize: 16 }}>✎</span>
          {t("projects.just_saved_draft")}
        </div>
      ) : null}

      {/* At-a-glance owner funnel — self-hides when there are no projects. */}
      <FunnelStrip fallback={derived} />

      {owned.length === 0 && joined.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          {owned.length > 0 && (
            <section>
              <div className="ch-slab" style={{ margin: "0 0 18px" }}>
                <span className="ch-slab-k">{t("projects.slab_yours_k")}</span>
                <h2>{t("projects.slab_yours_h")}</h2>
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
                <span className="ch-slab-k">{t("projects.slab_joined_k")}</span>
                <h2>{t("projects.slab_joined_h")}</h2>
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
