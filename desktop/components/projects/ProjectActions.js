"use client";

import { useEffect, useState } from "react";
import { bfu } from "@/lib/client-api";
import { useT } from "@/components/i18n/LocaleProvider";

// Additive client island mounted on the public /p/[id] page. The SSR content
// (hero, about, team, looking-for) stays intact and public; this island calls
// the AUTHED GET /projects/{id} on mount to learn the viewer's relationship to
// the project, then renders exactly one control:
//
//   • not logged in (bfu throws 401)  → "Open the app to apply" / Log in link
//   • owner (creator_id === me.id)     → "Manage applicants (N)" → /projects/{id}/manage
//   • already a member                 → "You're on this team" + Leave (DELETE /join)
//   • pending application              → "Application pending" + Cancel (DELETE /apply)
//   • accepted / declined              → a status pill
//   • else, if hiring                  → Apply (with a role picker if open roles exist)
//                                        → POST /projects/{id}/apply {role?}
//
// Verbs/fields confirmed against backend/app/routers/projects.py:
//   apply:  POST /projects/{id}/apply  body {role?}   → 201 {id,status:"pending",role}
//   cancel: DELETE /projects/{id}/apply                → 204
//   leave:  DELETE /projects/{id}/join                 → 204
//   status strings: pending | accepted | declined

const card = {
  borderRadius: "var(--radius)",
  border: "1px solid var(--hair)",
  background: "var(--surface)",
  padding: 22,
};

function Pill({ children, color, bg, border }) {
  return (
    <div
      style={{
        width: "100%",
        textAlign: "center",
        padding: "14px",
        borderRadius: "var(--radius-sm)",
        background: bg,
        border: `1px solid ${border}`,
        color,
        fontFamily: "var(--font-display)",
        fontWeight: 600,
        fontSize: 15,
      }}
    >
      {children}
    </div>
  );
}

export default function ProjectActions({ projectId }) {
  const t = useT();
  const [state, setState] = useState("loading"); // loading | anon | ready | error
  const [project, setProject] = useState(null);
  const [roles, setRoles] = useState([]); // open roles (name strings)
  const [selectedRole, setSelectedRole] = useState("");
  const [showRolePicker, setShowRolePicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [me, setMe] = useState(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    async function load() {
      setState("loading");
      try {
        const [p, meRes] = await Promise.all([
          bfu(`/projects/${projectId}`),
          bfu("/users/me").catch(() => null),
        ]);
        if (!alive) return;
        setProject(p);
        setMe(meRes);
        setState("ready");
        // Fetch open roles (public read) for the role picker — best effort.
        try {
          const r = await bfu(`/projects/${projectId}/roles`);
          if (alive) setRoles((r?.roles || []).filter((x) => !x.is_filled).map((x) => x.name));
        } catch {
          /* no roles → plain apply button */
        }
      } catch (e) {
        if (!alive) return;
        if (e?.status === 401) setState("anon");
        else setState("error");
      }
    }
    load();
    return () => {
      alive = false;
    };
  }, [projectId, reloadKey]);

  // Prefer a server-provided ownership flag when present so a transient
  // /users/me failure never mislabels an owner as a would-be applicant; fall
  // back to the creator_id ↔ me.id match only when the flag is absent.
  const isOwner =
    project &&
    (typeof project.is_owner === "boolean"
      ? project.is_owner
      : !!(me && project.creator_id === me.id));

  async function apply(role) {
    setBusy(true);
    setErr("");
    try {
      await bfu(`/projects/${projectId}/apply`, {
        method: "POST",
        body: { role: role || null },
      });
      // Optimistic → pending.
      setProject((p) => ({ ...p, my_application_status: "pending" }));
      setShowRolePicker(false);
    } catch (e) {
      setErr(e?.message || t("projects.err_apply"));
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    setBusy(true);
    setErr("");
    try {
      await bfu(`/projects/${projectId}/apply`, { method: "DELETE" });
      setProject((p) => ({ ...p, my_application_status: null }));
    } catch (e) {
      setErr(e?.message || t("projects.err_cancel"));
    } finally {
      setBusy(false);
    }
  }

  async function leave() {
    setBusy(true);
    setErr("");
    try {
      await bfu(`/projects/${projectId}/join`, { method: "DELETE" });
      setProject((p) => ({ ...p, is_member: false }));
      setConfirmLeave(false);
    } catch (e) {
      setErr(e?.message || t("projects.err_leave"));
    } finally {
      setBusy(false);
    }
  }

  // ── render ──────────────────────────────────────────────────────────────────

  if (state === "loading") {
    return (
      <div style={{ ...card, color: "var(--muted-strong)", fontSize: 14, textAlign: "center" }}>
        <span className="ch-spin" aria-hidden style={{ marginRight: 8 }}>◠</span>
        {t("projects.loading")}
      </div>
    );
  }

  if (state === "anon") {
    return (
      <div style={{ ...card, display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="ch-cell-label">{t("projects.want_join")}</div>
        <p style={{ margin: 0, fontSize: 14, color: "var(--muted-strong)", lineHeight: 1.55 }}>
          {t("projects.anon_body")}
        </p>
        <a href="/web/login" className="ch-btn-primary" style={{ justifyContent: "center" }}>
          {t("projects.login_to_apply")} <span style={{ fontSize: 14 }}>→</span>
        </a>
      </div>
    );
  }

  if (state === "error" || !project) {
    return (
      <div
        style={{
          ...card,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          alignItems: "center",
          textAlign: "center",
        }}
      >
        <div style={{ color: "var(--terra)", fontSize: 14 }}>
          {t("projects.err_load_join")}
        </div>
        <button
          type="button"
          onClick={() => setReloadKey((k) => k + 1)}
          className="ch-btn-ghost"
        >
          {t("projects.try_again")}
        </button>
      </div>
    );
  }

  const s = project.my_application_status;

  let control;
  if (isOwner) {
    const n = project.pending_applications_count || 0;
    control = (
      <a
        href={`/web/projects/${projectId}/manage`}
        className="ch-btn-primary"
        style={{ width: "100%", justifyContent: "center" }}
      >
        {t("projects.manage_applicants")} {n > 0 ? `(${n})` : ""}
      </a>
    );
  } else if (project.is_member) {
    control = confirmLeave ? (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <p style={{ margin: 0, fontSize: 13.5, color: "var(--muted-strong)", lineHeight: 1.5 }}>
          {t("projects.leave_confirm")}
        </p>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            onClick={leave}
            disabled={busy}
            style={{
              flex: 1,
              padding: "12px 16px",
              borderRadius: "var(--radius-sm)",
              background: "rgba(192,86,59,0.12)",
              border: "1px solid rgba(192,86,59,0.35)",
              color: "var(--terra)",
              cursor: busy ? "default" : "pointer",
              fontWeight: 600,
              fontSize: 13.5,
            }}
          >
            {busy ? t("projects.leaving") : t("projects.yes_leave")}
          </button>
          <button
            type="button"
            onClick={() => setConfirmLeave(false)}
            disabled={busy}
            style={{
              flex: 1,
              padding: "12px 16px",
              borderRadius: "var(--radius-sm)",
              background: "var(--surface-2)",
              border: "1px solid var(--hair)",
              color: "var(--text)",
              cursor: busy ? "default" : "pointer",
              fontSize: 13.5,
            }}
          >
            {t("projects.stay")}
          </button>
        </div>
      </div>
    ) : (
      <div style={{ display: "flex", gap: 10 }}>
        <Pill color="var(--green)" bg="rgba(127,176,105,0.12)" border="rgba(127,176,105,0.35)">
          {t("projects.on_team")}
        </Pill>
        <button
          type="button"
          onClick={() => setConfirmLeave(true)}
          disabled={busy}
          style={{
            flex: "0 0 auto",
            padding: "14px 16px",
            borderRadius: "var(--radius-sm)",
            background: "rgba(192,86,59,0.1)",
            border: "1px solid rgba(192,86,59,0.25)",
            color: "var(--terra)",
            cursor: busy ? "default" : "pointer",
            fontSize: 13,
          }}
        >
          {t("projects.leave")}
        </button>
      </div>
    );
  } else if (s === "pending") {
    control = (
      <div style={{ display: "flex", gap: 10 }}>
        <Pill color="var(--amber)" bg="rgba(232,161,92,0.14)" border="rgba(232,161,92,0.4)">
          {t("projects.app_pending")}
        </Pill>
        <button
          type="button"
          onClick={cancel}
          disabled={busy}
          style={{
            flex: "0 0 auto",
            padding: "14px 16px",
            borderRadius: "var(--radius-sm)",
            background: "var(--surface-2)",
            border: "1px solid var(--hair)",
            color: "var(--muted-strong)",
            cursor: busy ? "default" : "pointer",
            fontSize: 13,
          }}
        >
          {t("projects.cancel")}
        </button>
      </div>
    );
  } else if (s === "accepted") {
    control = (
      <Pill color="var(--teal-bright)" bg="rgba(94,197,182,0.14)" border="rgba(94,197,182,0.3)">
        {t("projects.accepted")} 🎉
      </Pill>
    );
  } else if (s === "declined") {
    control = (
      <Pill color="var(--terra)" bg="rgba(192,86,59,0.1)" border="rgba(192,86,59,0.25)">
        {t("projects.declined")}
      </Pill>
    );
  } else if (!project.is_hiring) {
    control = (
      <Pill color="var(--muted)" bg="var(--surface-2)" border="var(--hair)">
        {t("projects.not_accepting")}
      </Pill>
    );
  } else if (showRolePicker && roles.length) {
    control = (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="ch-cell-label">{t("projects.pick_role")}</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {roles.map((r, i) => {
            const on = selectedRole === r;
            return (
              <button
                key={`${i}-${r}`}
                type="button"
                aria-pressed={on}
                onClick={() => setSelectedRole(on ? "" : r)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  padding: "7px 12px",
                  borderRadius: "var(--radius-pill)",
                  cursor: "pointer",
                  background: on ? "rgba(232,161,92,0.16)" : "var(--surface-2)",
                  border: `1px solid ${on ? "var(--amber)" : "var(--hair)"}`,
                  color: on ? "var(--amber)" : "var(--muted-strong)",
                  fontWeight: on ? 700 : 400,
                }}
              >
                {on && <span aria-hidden>✓</span>}
                {r}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          className="ch-btn-primary"
          onClick={() => apply(selectedRole)}
          disabled={busy}
          style={{ justifyContent: "center", opacity: busy ? 0.6 : 1 }}
        >
          {busy
            ? t("projects.submitting")
            : selectedRole
            ? t("projects.apply_as", { role: selectedRole })
            : t("projects.apply_no_role")}
        </button>
        <button
          type="button"
          onClick={() => {
            setShowRolePicker(false);
            setSelectedRole("");
          }}
          disabled={busy}
          style={{
            alignSelf: "center",
            background: "none",
            border: "none",
            color: "var(--muted-strong)",
            fontSize: 12.5,
            cursor: busy ? "default" : "pointer",
            textDecoration: "underline",
            textUnderlineOffset: 2,
          }}
        >
          {t("projects.back")}
        </button>
      </div>
    );
  } else {
    control = (
      <button
        type="button"
        className="ch-btn-primary"
        onClick={() => (roles.length ? setShowRolePicker(true) : apply(null))}
        disabled={busy}
        style={{ width: "100%", justifyContent: "center", opacity: busy ? 0.6 : 1 }}
      >
        {busy ? t("projects.submitting") : t("projects.apply_join")}
      </button>
    );
  }

  return (
    <div style={{ ...card, display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="ch-cell-label">
        {isOwner
          ? t("projects.actions_your_project")
          : project.is_member
          ? t("projects.actions_your_team")
          : t("projects.actions_join")}
      </div>
      {control}
      {err ? <div style={{ fontSize: 13, color: "var(--terra)" }}>{err}</div> : null}
    </div>
  );
}
