"use client";

import { useEffect, useState } from "react";
import { bfu } from "@/lib/client-api";
import { useToast } from "@/lib/useToast";
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
// The same authed GET /projects/{id} also carries the viewer-specific bits the
// public SSR payload omits, so this one island now hosts every project-detail
// action the Mini App's ProjectDetail has (mirroring components/ProjectDetail.jsx):
//   • FOLLOW / unfollow the project (is_following + follower_count)
//   • REPORT the project
//   • GROUP CHAT — join the founder's external t.me link (group_link); the
//     founder can set/replace it inline
//   • CONTACT CHANNEL — the project's public channel link
//
// Verbs/fields confirmed against backend/app/routers/{projects,users}.py:
//   apply:    POST   /projects/{id}/apply  body {role?}  → 201 {id,status:"pending",role}
//   cancel:   DELETE /projects/{id}/apply                → 204
//   leave:    DELETE /projects/{id}/join                 → 204
//   follow:   POST   /follow  {target_type:"project",target_id}  → {following,follower_count}
//   unfollow: DELETE /follow  {target_type:"project",target_id}  → 204
//   report:   POST   /users/reports {target_type:"project",target_id,reason}  → {ok}
//   set link: PATCH  /projects/{id} {group_link}         → ProjectResponse (owner-only; t.me validated)
//   GET /projects/{id} → …, is_following, follower_count, group_link, channel
//   status strings: pending | accepted | declined

const card = {
  borderRadius: "var(--radius)",
  border: "1px solid var(--hair)",
  background: "var(--surface)",
  padding: 22,
};

const ghostBtn = {
  padding: "12px 16px",
  borderRadius: "var(--radius-sm)",
  background: "var(--surface-2)",
  border: "1px solid var(--hair)",
  color: "var(--text)",
  fontFamily: "var(--font-body)",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  transition: "border-color 0.18s ease, background 0.18s ease",
};

// A tiny transient toast, mirroring the .ch-toast styling used across the app
// (same shape PersonActions renders). Reads the shared useToast { text, tone }.
function Toast({ toast }) {
  if (!toast?.text) return null;
  const isError = toast.tone === "error";
  const border = isError ? "rgba(192,86,59,0.5)" : "rgba(255,106,61,0.4)";
  const accent = isError ? "var(--terra)" : "var(--ember)";
  return (
    <div
      className="ch-toast ch-toast-show"
      style={{ border: `1px solid ${border}` }}
      role="status"
      aria-live="polite"
    >
      <span className="ch-toast-tx" style={{ color: "var(--text)" }}>
        <b style={{ color: accent }}>{toast.text}</b>
      </span>
    </div>
  );
}

// Best-effort href for a project's contact channel, which members type freely:
// a full URL, a bare @handle, or a t.me path. Anything already absolute is left
// untouched; a leading @ or t.me/… is resolved to a telegram link. Falls back to
// the raw value so a link is always produced.
function channelHref(raw) {
  const v = (raw || "").trim();
  if (!v) return "";
  if (/^https?:\/\//i.test(v)) return v;
  if (v.startsWith("@")) return `https://t.me/${v.slice(1)}`;
  if (/^t\.me\//i.test(v)) return `https://${v}`;
  return v;
}

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

  // Follow / report / group-link — all read off the same authed `project`.
  const { toast, flash } = useToast(3200);
  const [followBusy, setFollowBusy] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reported, setReported] = useState(false);
  const [reportBusy, setReportBusy] = useState(false);
  const [editingLink, setEditingLink] = useState(false);
  const [linkDraft, setLinkDraft] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);

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

  // ── Follow (optimistic toggle) — mirrors the Mini App FollowButton ──────────
  async function toggleFollow() {
    if (followBusy || !project) return;
    setFollowBusy(true);
    const wasFollowing = project.is_following;
    setProject((p) => ({
      ...p,
      is_following: !wasFollowing,
      follower_count: Math.max(0, (p.follower_count || 0) + (wasFollowing ? -1 : 1)),
    }));
    try {
      if (wasFollowing) {
        await bfu("/follow", {
          method: "DELETE",
          body: { target_type: "project", target_id: Number(projectId) },
        });
      } else {
        const r = await bfu("/follow", {
          method: "POST",
          body: { target_type: "project", target_id: Number(projectId) },
        });
        // Reconcile the authoritative follower count returned by the server.
        if (r && typeof r.follower_count === "number") {
          setProject((p) => ({ ...p, follower_count: r.follower_count }));
        }
      }
    } catch (e) {
      // Roll back on failure.
      setProject((p) => ({
        ...p,
        is_following: wasFollowing,
        follower_count: Math.max(0, (p.follower_count || 0) + (wasFollowing ? 1 : -1)),
      }));
      flash(e?.message || t("people.followUpdateError"), "error");
    } finally {
      setFollowBusy(false);
    }
  }

  // ── Report the project — reveal → send is the confirm step, then toast ──────
  async function submitReport() {
    if (reportBusy) return;
    setReportBusy(true);
    try {
      await bfu("/users/reports", {
        method: "POST",
        body: {
          target_type: "project",
          target_id: Number(projectId),
          reason: reportReason.trim() || null,
        },
      });
      setReported(true);
      setShowReport(false);
      setReportReason("");
      flash(t("people.reportSent"));
    } catch (e) {
      flash(e?.message || t("people.reportError"), "error");
    } finally {
      setReportBusy(false);
    }
  }

  // ── Group-chat link — founder-only set/replace (backend validates t.me) ─────
  async function saveLink() {
    if (linkBusy) return;
    const draft = linkDraft.trim();
    if (!draft) return;
    setLinkBusy(true);
    try {
      const updated = await bfu(`/projects/${projectId}`, {
        method: "PATCH",
        body: { group_link: draft },
      });
      setProject((p) => ({ ...p, group_link: updated?.group_link ?? draft }));
      setEditingLink(false);
      setLinkDraft("");
      flash(t("projects.group_link_saved"));
    } catch (e) {
      // 422 = not a https://t.me/ link (see _clean_group_link).
      flash(
        e?.status === 422
          ? t("projects.group_link_invalid")
          : e?.message || t("projects.group_link_error"),
        "error"
      );
    } finally {
      setLinkBusy(false);
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

  const followers = project.follower_count || 0;
  const showChatCell = !!project.group_link || isOwner;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* ── Primary actions: apply / manage / leave + follow + report ── */}
      <div style={{ ...card, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div className="ch-cell-label">
            {isOwner
              ? t("projects.actions_your_project")
              : project.is_member
              ? t("projects.actions_your_team")
              : t("projects.actions_join")}
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted-strong)" }}>
            {followers === 1
              ? t("people.followerOne", { n: followers })
              : t("people.followerMany", { n: followers })}
          </div>
        </div>

        {control}
        {err ? <div style={{ fontSize: 13, color: "var(--terra)" }}>{err}</div> : null}

        {/* Follow toggle — hidden for the founder (can't follow your own). */}
        {!isOwner && (
          <button
            type="button"
            onClick={toggleFollow}
            disabled={followBusy}
            aria-pressed={!!project.is_following}
            className={project.is_following ? undefined : "ch-btn-primary"}
            style={
              project.is_following
                ? {
                    ...ghostBtn,
                    width: "100%",
                    justifyContent: "center",
                    textAlign: "center",
                    borderColor: "rgba(127,176,105,0.4)",
                    color: "var(--green)",
                    background: "rgba(127,176,105,0.1)",
                    opacity: followBusy ? 0.6 : 1,
                  }
                : { width: "100%", justifyContent: "center", opacity: followBusy ? 0.6 : 1 }
            }
          >
            <span aria-hidden>{project.is_following ? "✓" : "+"}</span>{" "}
            {project.is_following ? t("people.following") : t("people.follow")}
          </button>
        )}

        {/* Report affordance — hidden for the founder. The reveal → send is the
            confirm step; success surfaces as a toast. */}
        {!isOwner && (
          <>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              {reported ? (
                <span style={{ fontSize: 12, color: "var(--muted-strong)" }}>
                  {t("people.reported")} ✓
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowReport((v) => !v)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--muted-strong)",
                    fontSize: 12,
                    cursor: "pointer",
                    padding: "4px 2px",
                  }}
                >
                  <span aria-hidden>⋯</span> {t("people.report")}
                </button>
              )}
            </div>
            {showReport && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <textarea
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  placeholder={t("people.reportPlaceholder")}
                  rows={2}
                  style={{
                    width: "100%",
                    resize: "vertical",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--hair)",
                    background: "var(--surface-2)",
                    color: "var(--text)",
                    padding: "10px 12px",
                    fontSize: 13,
                    fontFamily: "var(--font-body)",
                  }}
                />
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    onClick={() => setShowReport(false)}
                    disabled={reportBusy}
                    style={{ ...ghostBtn, padding: "8px 14px", fontSize: 13, opacity: reportBusy ? 0.6 : 1 }}
                  >
                    {t("people.cancel")}
                  </button>
                  <button
                    type="button"
                    onClick={submitReport}
                    disabled={reportBusy}
                    style={{
                      ...ghostBtn,
                      padding: "8px 14px",
                      fontSize: 13,
                      color: "var(--terra)",
                      borderColor: "rgba(192,86,59,0.35)",
                      opacity: reportBusy ? 0.6 : 1,
                      cursor: reportBusy ? "default" : "pointer",
                    }}
                  >
                    {reportBusy ? t("people.sending") : t("people.sendReport")}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Group chat: join the founder's external t.me link, or set it ── */}
      {showChatCell && (
        <div style={{ ...card, display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="ch-cell-label">{t("projects.chat_title")}</div>
          {project.group_link ? (
            <a
              href={project.group_link}
              target="_blank"
              rel="noreferrer noopener"
              className="ch-btn-primary"
              style={{ width: "100%", justifyContent: "center" }}
            >
              <span aria-hidden>💬</span> {t("projects.join_chat")}
            </a>
          ) : editingLink ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <input
                value={linkDraft}
                onChange={(e) => setLinkDraft(e.target.value)}
                placeholder={t("projects.group_link_ph")}
                style={{
                  width: "100%",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--hair)",
                  background: "var(--surface-2)",
                  color: "var(--text)",
                  padding: "10px 12px",
                  fontSize: 14,
                  fontFamily: "var(--font-body)",
                }}
              />
              <div style={{ fontSize: 12, color: "var(--muted-strong)", lineHeight: 1.5 }}>
                {t("projects.group_link_howto")}
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={() => { setEditingLink(false); setLinkDraft(""); }}
                  disabled={linkBusy}
                  style={{ ...ghostBtn, padding: "9px 16px", fontSize: 13, opacity: linkBusy ? 0.6 : 1 }}
                >
                  {t("people.cancel")}
                </button>
                <button
                  type="button"
                  className="ch-btn-primary"
                  onClick={saveLink}
                  disabled={linkBusy || !linkDraft.trim()}
                  style={{ padding: "9px 18px", fontSize: 13, opacity: linkBusy || !linkDraft.trim() ? 0.55 : 1 }}
                >
                  {t("projects.save")}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => { setLinkDraft(""); setEditingLink(true); }}
              style={{ ...ghostBtn, width: "100%", justifyContent: "center", textAlign: "center" }}
            >
              <span aria-hidden>＋</span> {t("projects.set_group_link")}
            </button>
          )}
        </div>
      )}

      {/* ── Contact channel: a tappable link to the project's public channel ── */}
      {project.channel && (
        <div style={{ ...card, display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="ch-cell-label">{t("projects.contact_channel")}</div>
          <a
            href={channelHref(project.channel)}
            target="_blank"
            rel="noreferrer noopener"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              fontSize: 14,
              color: "var(--amber)",
              textDecoration: "none",
              overflowWrap: "anywhere",
            }}
          >
            <span aria-hidden>↗</span> {project.channel}
          </a>
        </div>
      )}

      <Toast toast={toast} />
    </div>
  );
}
