"use client";

import { useEffect, useRef, useState } from "react";
import { bfu } from "@/lib/client-api";
import { useToast } from "@/lib/useToast";
import { useT } from "@/components/i18n/LocaleProvider";

// Client-side "Saved" list. Loads GET /projects/favorites on mount (per-user,
// uncacheable) → array of ProjectResponse. Renders each as a Chorsu project card
// linking to /p/{id}, with an empty state. Matches the .ch-pcard grammar used by
// MyProjectsList's JoinedCard. Each card carries a real un-save control:
//   DELETE /projects/{id}/favorite → 204  (optimistic remove from the list)

function typeMeta(type) {
  if (type === "volunteering") return { labelKey: "projmanage.type_volunteering", cls: "ch-pcard-badge-volunteering" };
  return { labelKey: "projmanage.type_startup", cls: "ch-pcard-badge-startup" };
}

function SavedCard({ project, onUnsave, busy }) {
  const t = useT();
  const meta = typeMeta(project.type);
  return (
    <a
      href={`/p/${project.id}`}
      className="ch-pcard"
      style={{ textDecoration: "none", position: "relative" }}
    >
      <div className="ch-pcard-top">
        <span className={`ch-pcard-badge ${meta.cls}`}>
          <i />
          {t(meta.labelKey)}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {project.is_hiring ? (
            <span className="ch-pcard-hiring">
              <span className="ch-pcard-ping">
                <i />
              </span>
              {t("projmanage.status_hiring")}
            </span>
          ) : null}
          <button
            type="button"
            title={t("projmanage.fav_remove_title")}
            aria-label={t("projmanage.fav_remove_aria", { name: project.name })}
            disabled={busy}
            onClick={(e) => {
              // The card is an <a>; keep the click from navigating.
              e.preventDefault();
              e.stopPropagation();
              onUnsave(project.id);
            }}
            style={{
              flex: "0 0 auto",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 30,
              height: 30,
              borderRadius: "50%",
              border: "1px solid rgba(232,161,92,0.35)",
              background: "rgba(232,161,92,0.1)",
              color: "var(--amber)",
              fontSize: 15,
              lineHeight: 1,
              cursor: busy ? "default" : "pointer",
              opacity: busy ? 0.5 : 1,
              transition: "background 0.18s ease, transform 0.18s ease",
            }}
          >
            {busy ? "·" : "♥"}
          </button>
        </div>
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
            ? t("projmanage.member_one", { n: project.member_count || 0 })
            : t("projmanage.member_many", { n: project.member_count || 0 })}{" "}
          · {t("projmanage.views_count", { n: project.view_count || 0 })}
        </span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--amber)" }}>
          {t("projmanage.open_link")} →
        </span>
      </div>
    </a>
  );
}

function EmptyState() {
  const t = useT();
  return (
    <div className="ch-empty" style={{ marginTop: 28 }}>
      <span className="ch-empty-k">{t("projmanage.fav_empty_k")}</span>
      <div className="ch-empty-t">{t("projmanage.fav_empty_t")}</div>
      <div className="ch-empty-s">
        {t("projmanage.fav_empty_s")}
      </div>
      <a href="/web/city" className="ch-btn-primary" style={{ marginTop: 8 }}>
        {t("projmanage.fav_explore")} <span style={{ fontSize: 14 }}>→</span>
      </a>
    </div>
  );
}

function ErrorState({ onRetry }) {
  const t = useT();
  return (
    <div className="ch-empty" style={{ marginTop: 28 }}>
      <span className="ch-empty-k" style={{ color: "var(--terra)" }}>
        {t("projmanage.fav_error_k")}
      </span>
      <div className="ch-empty-t">{t("projmanage.fav_error_t")}</div>
      <button type="button" className="ch-btn-primary" onClick={onRetry} style={{ marginTop: 8 }}>
        <span className="ch-spin" aria-hidden style={{ marginRight: 6 }}>
          ↻
        </span>
        {t("projmanage.try_again")}
      </button>
    </div>
  );
}

export default function FavoritesList() {
  const t = useT();
  const [state, setState] = useState("loading"); // loading | ready | error
  const [projects, setProjects] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const { toast, flash } = useToast();
  const aliveRef = useRef(true);

  function load() {
    setState("loading");
    bfu("/projects/favorites")
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
    load();
    return () => {
      aliveRef.current = false;
    };
  }, []);

  async function unsave(id) {
    if (busyId) return;
    setBusyId(id);
    const prev = projects;
    // Optimistically drop the card.
    setProjects((list) => list.filter((p) => p.id !== id));
    try {
      await bfu(`/projects/${id}/favorite`, { method: "DELETE" });
      flash(t("projmanage.fav_removed"), "ok");
    } catch {
      // Roll back so the shelf reflects reality.
      if (aliveRef.current) setProjects(prev);
      flash(t("projmanage.fav_remove_flash_error"), "err");
    } finally {
      if (aliveRef.current) setBusyId(null);
    }
  }

  if (state === "loading") {
    return (
      <div
        role="status"
        aria-live="polite"
        style={{ marginTop: 28, color: "var(--muted-strong)", fontSize: 14 }}
      >
        <span className="ch-spin" aria-hidden style={{ marginRight: 8 }}>
          ◠
        </span>
        {t("projmanage.fav_loading")}
      </div>
    );
  }
  if (state === "error") return <ErrorState onRetry={load} />;
  if (projects.length === 0) return <EmptyState />;

  return (
    <>
      <div className="ch-grid" style={{ marginTop: 28 }}>
        {projects.map((p) => (
          <SavedCard key={p.id} project={p} onUnsave={unsave} busy={busyId === p.id} />
        ))}
      </div>
      {toast ? (
        <div
          className="ch-toast ch-toast-show"
          role="status"
          aria-live="polite"
          style={{
            borderColor: toast.tone === "err" ? "rgba(192,86,59,0.5)" : "rgba(127,176,105,0.5)",
          }}
        >
          <span
            className="ch-toast-tx"
            style={{ color: toast.tone === "err" ? "var(--terra)" : "var(--text)" }}
          >
            {toast.text}
          </span>
        </div>
      ) : null}
    </>
  );
}
