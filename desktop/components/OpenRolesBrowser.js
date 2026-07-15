"use client";

import { useEffect, useRef, useState } from "react";
import { bfu } from "@/lib/client-api";
import { useT } from "@/components/i18n/LocaleProvider";

// Open-roles discovery (desktop parity with the Mini App's OpenRolesScreen).
//
//   GET /roles            → { roles: [ { id, name,
//                                        project: { id, name, type },
//                                        created_at } ] }
//   GET /roles?q={term}   → same, filtered by role name (case-insensitive
//                           substring). Debounced 300ms client-side.
//
// Each role is one clickable tile linking to /web/p/{project_id} — the project
// page is where you apply, so a role row is really "here's an opening, go meet
// the project". The backend only returns the role name + its project (id, name,
// type); there is no per-role skills list, so we render skills DEFENSIVELY —
// only if a future endpoint adds `role.skills` does the chip row appear.
//
// next/link would prefix /web automatically, but the sibling card grammar
// (ProjectBrowseCard) uses a plain <a href="/web/p/{id}">, so we match it: bare
// anchors here spell the /web basePath explicitly. bfu() already targets
// /web/api/bfu, so the fetch needs no prefix.

const TYPE_STYLE = {
  startup: { color: "var(--amber)", bg: "rgba(232,161,92,0.14)", bd: "rgba(232,161,92,0.34)" },
  volunteering: { color: "var(--teal-bright)", bg: "rgba(94,197,182,0.14)", bd: "rgba(94,197,182,0.34)" },
};
const DEFAULT_TYPE = { color: "var(--muted-strong)", bg: "var(--surface-2)", bd: "var(--hair)" };

function typeLabelFor(type, t) {
  if (type === "startup") return t("projects.type_startup");
  if (type === "volunteering") return t("projects.type_volunteering");
  return t("projects.type_project");
}

function RoleCard({ role, t }) {
  const project = role.project || {};
  const style = TYPE_STYLE[project.type] || DEFAULT_TYPE;
  // Defensive: the current /roles payload carries no skills; render the chip row
  // only if a payload ever includes them.
  const skills = Array.isArray(role.skills) ? role.skills.slice(0, 4) : [];

  return (
    <a
      href={`/web/p/${project.id}`}
      className="ch-cell"
      style={{ display: "block", textDecoration: "none", color: "var(--text)" }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "5px 11px",
            borderRadius: "var(--radius-pill)",
            background: style.bg,
            border: `1px solid ${style.bd}`,
            color: style.color,
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}
        >
          {typeLabelFor(project.type, t)}
        </span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--green)",
          }}
        >
          {t("roles.openBadge")}
        </span>
      </div>

      <h3
        style={{
          margin: "14px 0 0",
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: 20,
          lineHeight: 1.2,
          letterSpacing: "-0.01em",
          color: "var(--text)",
        }}
      >
        {role.name}
      </h3>

      <div style={{ marginTop: 8, fontSize: 14, lineHeight: 1.5, color: "var(--muted)" }}>
        {t("roles.inProject", { project: project.name || "" })}
      </div>

      {skills.length ? (
        <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 6 }}>
          {skills.map((s, i) => (
            <span className="ch-tag" key={`${s}-${i}`}>
              {s}
            </span>
          ))}
        </div>
      ) : null}

      <div
        style={{
          marginTop: 16,
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--amber)",
        }}
      >
        {t("roles.openProject")}
      </div>
    </a>
  );
}

export default function OpenRolesBrowser() {
  const t = useT();
  const [q, setQ] = useState("");
  const [state, setState] = useState("loading"); // loading | ready | error
  const [list, setList] = useState([]);
  const [reloadKey, setReloadKey] = useState(0);
  // Guards against out-of-order responses: only the latest request may commit.
  const seq = useRef(0);

  useEffect(() => {
    const my = ++seq.current;
    const term = q.trim();
    setState("loading");
    const h = setTimeout(() => {
      bfu("/roles", { params: term ? { q: term } : undefined })
        .then((res) => {
          if (seq.current !== my) return;
          setList(Array.isArray(res?.roles) ? res.roles : []);
          setState("ready");
        })
        .catch(() => {
          if (seq.current !== my) return;
          setState("error");
        });
    }, 300); // debounce
    return () => clearTimeout(h);
  }, [q, reloadKey]);

  const retry = () => setReloadKey((k) => k + 1);

  return (
    <div style={{ marginTop: 24 }}>
      {/* Search — mirrors the Mini App's ?q= filter, debounced above. */}
      <div style={{ position: "relative", maxWidth: 480 }}>
        <span
          aria-hidden
          style={{
            position: "absolute",
            left: 14,
            top: "50%",
            transform: "translateY(-50%)",
            color: "var(--muted)",
            fontSize: 14,
          }}
        >
          ⌕
        </span>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("roles.searchPh")}
          aria-label={t("roles.searchAria")}
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "12px 14px 12px 38px",
            background: "var(--surface-2)",
            border: "1px solid var(--hair)",
            borderRadius: "var(--radius-pill)",
            color: "var(--text)",
            fontFamily: "var(--font-body)",
            fontSize: 14,
            outline: "none",
          }}
        />
      </div>

      <div role="status" aria-live="polite">
        {state === "loading" ? (
          <div style={{ marginTop: 28, color: "var(--muted-strong)", fontSize: 14 }}>
            <span className="ch-spin" aria-hidden style={{ marginRight: 8 }}>
              ◠
            </span>
            {t("roles.loading")}
          </div>
        ) : state === "error" ? (
          <div style={{ marginTop: 28, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <span style={{ color: "var(--terra)", fontSize: 14 }}>{t("roles.loadError")}</span>
            <button type="button" onClick={retry} className="ch-btn-ghost">
              {t("community.tryAgain")}
            </button>
          </div>
        ) : list.length === 0 ? (
          <div className="ch-grace" style={{ marginTop: 24 }}>
            <span className="ch-grace-k">{t("roles.emptyKicker")}</span>
            <div className="ch-grace-t">
              {q.trim() ? t("roles.emptyTitleSearch") : t("roles.emptyTitle")}
            </div>
            <div className="ch-grace-s">
              {q.trim() ? t("roles.emptyBodySearch") : t("roles.emptyBody")}
            </div>
          </div>
        ) : (
          <div className="ch-grid" style={{ marginTop: 24 }}>
            {list.map((role) => (
              <RoleCard key={role.id} role={role} t={t} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
