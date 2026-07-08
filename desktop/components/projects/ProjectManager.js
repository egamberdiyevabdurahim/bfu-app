"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { bfu } from "@/lib/client-api";
import { gradientFor, initials } from "@/lib/avatar";
import { useCountUp } from "@/lib/useCountUp";
import { useToast } from "@/lib/useToast";
import CreateProjectForm from "@/components/projects/CreateProjectForm";
import StarInput from "@/components/projects/StarInput";
import { useT } from "@/components/i18n/LocaleProvider";

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
  const t = useT();
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
        {t("projmanage.status_pending")}
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
        color: project.is_hiring ? "var(--green)" : "var(--muted-strong)",
        background: project.is_hiring ? "rgba(127,176,105,0.12)" : "var(--surface-2)",
        border: `1px solid ${project.is_hiring ? "rgba(127,176,105,0.3)" : "var(--hair)"}`,
        borderRadius: "var(--radius-pill)",
        padding: "5px 12px",
      }}
    >
      {project.is_hiring ? t("projmanage.status_hiring") : t("projmanage.status_not_hiring")}
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
  const t = useT();
  const a = app.applicant || {};
  const name = a.display_name || t("projmanage.a_builder");
  return (
    <div
      className="ch-cell-static"
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
          <div style={{ marginTop: 3, fontSize: 13, color: "var(--muted-strong)" }}>
            {t("projmanage.applying_as")} <span style={{ color: "var(--amber)" }}>{app.role}</span>
          </div>
        ) : null}
        {a.about ? (
          <div
            style={{
              marginTop: 5,
              fontSize: 13,
              color: "var(--muted-strong)",
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
          {t("projmanage.accept")}
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
          {t("projmanage.reject")}
        </button>
      </div>
    </div>
  );
}

// ── Owner stats tiles ────────────────────────────────────────────────────────
// GET /projects/{id}/stats → {pending, accepted, declined, views, avg_decision_hours|null}

function StatTile({ label, value, suffix, accent }) {
  const n = typeof value === "number" ? value : 0;
  const animated = useCountUp(n);
  const shown = typeof value === "number" ? animated : value;
  return (
    <div
      className="ch-cell-static"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: 20,
        background: accent
          ? "linear-gradient(155deg, rgba(232,161,92,0.08), var(--surface) 62%)"
          : undefined,
        borderColor: accent ? "rgba(232,161,92,0.3)" : undefined,
      }}
    >
      <div className="ch-cell-label">{label}</div>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: 34,
          lineHeight: 1,
          letterSpacing: "-0.01em",
          color: accent ? "var(--amber)" : "var(--text)",
        }}
      >
        {shown}
        {suffix ? (
          <span style={{ fontSize: 15, color: "var(--muted-strong)", marginLeft: 4 }}>{suffix}</span>
        ) : null}
      </div>
    </div>
  );
}

// `refreshKey` lets the parent force a refetch after accept/reject so the tiles
// never disagree with the applicants list.
function StatsStrip({ projectId, refreshKey = 0 }) {
  const t = useT();
  const [stats, setStats] = useState(null);
  const [state, setState] = useState("loading"); // loading | ready | hidden

  useEffect(() => {
    let alive = true;
    bfu(`/projects/${projectId}/stats`)
      .then((s) => {
        if (!alive) return;
        setStats(s);
        setState("ready");
      })
      .catch(() => {
        if (alive) setState("hidden");
      });
    return () => {
      alive = false;
    };
  }, [projectId, refreshKey]);

  if (state !== "ready" || !stats) return null;

  const avg = stats.avg_decision_hours;
  const pending = stats.pending || 0;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
        gap: 14,
      }}
    >
      {/* Accent moved to the actionable metric (Pending, when there is work). */}
      <StatTile label={t("projmanage.stat_pending")} value={pending} accent={pending > 0} />
      <StatTile label={t("projmanage.stat_accepted")} value={stats.accepted || 0} />
      <StatTile label={t("projmanage.stat_declined")} value={stats.declined || 0} />
      <StatTile label={t("projmanage.stat_views")} value={stats.views || 0} />
      <StatTile
        label={t("projmanage.stat_avg_decision")}
        value={avg == null ? "—" : avg}
        suffix={avg == null ? "" : t("projmanage.stat_hours_suffix")}
      />
    </div>
  );
}

// ── Roles editor ─────────────────────────────────────────────────────────────
// GET  /projects/{id}/roles                → { roles:[{id,name,is_filled,created_at}] }
// POST /projects/{id}/roles {name}          → {ok,id}  (409 on dupe)
// PATCH /projects/{id}/roles/{rid} {is_filled} → {ok,is_filled}
// DELETE /projects/{id}/roles/{rid}         → 204

function RolesEditor({ projectId, flash }) {
  const t = useT();
  const [roles, setRoles] = useState([]);
  const [state, setState] = useState("loading"); // loading | ready | error
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let alive = true;
    bfu(`/projects/${projectId}/roles`)
      .then((res) => {
        if (!alive) return;
        setRoles(Array.isArray(res?.roles) ? res.roles : []);
        setState("ready");
      })
      .catch(() => {
        if (alive) setState("error");
      });
    return () => {
      alive = false;
    };
  }, [projectId]);

  async function addRole(e) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || adding) return;
    setAdding(true);
    try {
      const res = await bfu(`/projects/${projectId}/roles`, {
        method: "POST",
        body: { name: trimmed },
      });
      // Optimistic append with the server-issued id.
      setRoles((cur) => [{ id: res.id, name: trimmed, is_filled: false }, ...cur]);
      setName("");
      flash(t("projmanage.roles_added"));
    } catch (err) {
      flash(err?.status === 409 ? t("projmanage.roles_dupe") : err?.message || t("projmanage.roles_add_error"), "err");
    } finally {
      setAdding(false);
    }
  }

  async function toggleFilled(role) {
    const next = !role.is_filled;
    const prev = roles;
    setRoles((cur) => cur.map((r) => (r.id === role.id ? { ...r, is_filled: next } : r)));
    try {
      await bfu(`/projects/${projectId}/roles/${role.id}`, {
        method: "PATCH",
        body: { is_filled: next },
      });
    } catch (err) {
      setRoles(prev);
      flash(err?.message || t("projmanage.roles_update_error"), "err");
    }
  }

  async function removeRole(role) {
    const prev = roles;
    setRoles((cur) => cur.filter((r) => r.id !== role.id));
    try {
      await bfu(`/projects/${projectId}/roles/${role.id}`, { method: "DELETE" });
      flash(t("projmanage.roles_removed"));
    } catch (err) {
      setRoles(prev);
      flash(err?.message || t("projmanage.roles_remove_error"), "err");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div className="ch-cell-static" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="ch-cell-label">{t("projmanage.roles_add_label")}</div>
        <form onSubmit={addRole} style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("projmanage.roles_placeholder")}
            maxLength={80}
            style={{
              flex: 1,
              minWidth: 220,
              padding: "12px 14px",
              borderRadius: "var(--radius-sm)",
              background: "var(--surface-2)",
              border: "1px solid var(--hair)",
              color: "var(--text)",
              fontFamily: "var(--font-body)",
              fontSize: 14,
            }}
          />
          <button
            type="submit"
            className="ch-btn-primary"
            disabled={adding || !name.trim()}
            style={{ opacity: adding || !name.trim() ? 0.6 : 1 }}
          >
            {adding ? t("projmanage.roles_adding") : t("projmanage.roles_add_btn")}
          </button>
        </form>
      </div>

      {state === "loading" ? (
        <div style={{ color: "var(--muted-strong)", fontSize: 14 }}>
          <span className="ch-spin" aria-hidden style={{ marginRight: 8 }}>◠</span>
          {t("projmanage.roles_loading")}
        </div>
      ) : state === "error" ? (
        <div style={{ color: "var(--terra)", fontSize: 14 }} role="status">{t("projmanage.roles_load_error")}</div>
      ) : roles.length === 0 ? (
        <div className="ch-empty" style={{ minHeight: 160 }}>
          <span className="ch-empty-k">{t("projmanage.roles_empty_k")}</span>
          <div className="ch-empty-t">{t("projmanage.roles_empty_t")}</div>
          <div className="ch-empty-s">
            {t("projmanage.roles_empty_s")}
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {roles.map((r) => (
            <div
              key={r.id}
              className="ch-cell-static"
              style={{ display: "flex", alignItems: "center", gap: 14, padding: 16, flexWrap: "wrap" }}
            >
              <span
                style={{
                  flex: 1,
                  minWidth: 160,
                  fontFamily: "var(--font-display)",
                  fontWeight: 700,
                  fontSize: 16,
                  color: r.is_filled ? "var(--muted)" : "var(--text)",
                  textDecoration: r.is_filled ? "line-through" : "none",
                }}
              >
                {r.name}
              </span>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: r.is_filled ? "var(--green)" : "var(--amber)",
                }}
              >
                {r.is_filled ? t("projmanage.role_filled") : t("projmanage.role_open")}
              </span>
              <button
                type="button"
                onClick={() => toggleFilled(r)}
                className="ch-btn-ghost"
                style={{ padding: "8px 14px", fontSize: 12.5 }}
              >
                {r.is_filled ? t("projmanage.role_reopen") : t("projmanage.role_mark_filled")}
              </button>
              <button
                type="button"
                onClick={() => removeRole(r)}
                aria-label={t("projmanage.remove_name_aria", { name: r.name })}
                style={{
                  padding: "8px 12px",
                  borderRadius: "var(--radius-pill)",
                  background: "rgba(192,86,59,0.1)",
                  border: "1px solid rgba(192,86,59,0.28)",
                  color: "var(--terra)",
                  cursor: "pointer",
                  fontSize: 12.5,
                }}
              >
                {t("projmanage.delete")}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Updates composer + own-update list ───────────────────────────────────────
// POST   /projects/{id}/updates {text}       → {ok,id}
// GET    /projects/{id}/updates              → {updates:[{id,text,author,created_at}]}
// DELETE /projects/{id}/updates/{uid}        → 204

function UpdatesComposer({ projectId, meId, flash }) {
  const t = useT();
  const [updates, setUpdates] = useState([]);
  const [state, setState] = useState("loading");
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    let alive = true;
    bfu(`/projects/${projectId}/updates`)
      .then((res) => {
        if (!alive) return;
        setUpdates(Array.isArray(res?.updates) ? res.updates : []);
        setState("ready");
      })
      .catch(() => {
        if (alive) setState("error");
      });
    return () => {
      alive = false;
    };
  }, [projectId]);

  async function post(e) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || posting) return;
    setPosting(true);
    try {
      const res = await bfu(`/projects/${projectId}/updates`, {
        method: "POST",
        body: { text: trimmed },
      });
      setUpdates((cur) => [
        { id: res.id, text: trimmed, author: { id: meId }, created_at: new Date().toISOString() },
        ...cur,
      ]);
      setText("");
      flash(t("projmanage.updates_posted"));
    } catch (err) {
      flash(err?.message || t("projmanage.updates_post_error"), "err");
    } finally {
      setPosting(false);
    }
  }

  async function remove(u) {
    const prev = updates;
    setUpdates((cur) => cur.filter((x) => x.id !== u.id));
    try {
      await bfu(`/projects/${projectId}/updates/${u.id}`, { method: "DELETE" });
    } catch (err) {
      setUpdates(prev);
      flash(err?.message || t("projmanage.updates_delete_error"), "err");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div className="ch-cell-static" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="ch-cell-label">{t("projmanage.updates_post_label")}</div>
        <form onSubmit={post} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t("projmanage.updates_placeholder")}
            maxLength={500}
            rows={3}
            style={{
              width: "100%",
              padding: "12px 14px",
              borderRadius: "var(--radius-sm)",
              background: "var(--surface-2)",
              border: "1px solid var(--hair)",
              color: "var(--text)",
              fontFamily: "var(--font-body)",
              fontSize: 14,
              lineHeight: 1.5,
              resize: "vertical",
            }}
          />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted-strong)" }}>
              {text.length}/500
            </span>
            <button
              type="submit"
              className="ch-btn-primary"
              disabled={posting || !text.trim()}
              style={{ opacity: posting || !text.trim() ? 0.6 : 1 }}
            >
              {posting ? t("projmanage.updates_posting") : t("projmanage.updates_post_btn")}
            </button>
          </div>
        </form>
      </div>

      {state === "loading" ? (
        <div style={{ color: "var(--muted-strong)", fontSize: 14 }}>
          <span className="ch-spin" aria-hidden style={{ marginRight: 8 }}>◠</span>
          {t("projmanage.updates_loading")}
        </div>
      ) : state === "error" ? (
        <div style={{ color: "var(--terra)", fontSize: 14 }} role="status">{t("projmanage.updates_load_error")}</div>
      ) : updates.length === 0 ? (
        <div className="ch-empty" style={{ minHeight: 140 }}>
          <span className="ch-empty-k">{t("projmanage.updates_empty_k")}</span>
          <div className="ch-empty-t">{t("projmanage.updates_empty_t")}</div>
          <div className="ch-empty-s">
            {t("projmanage.updates_empty_s")}
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {updates.map((u) => (
            <div
              key={u.id}
              className="ch-cell-static"
              style={{ display: "flex", alignItems: "flex-start", gap: 14, padding: 16 }}
            >
              <p
                style={{
                  flex: 1,
                  margin: 0,
                  fontSize: 14,
                  lineHeight: 1.55,
                  color: "var(--muted-strong)",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {u.text}
              </p>
              {u.author?.id === meId ? (
                <button
                  type="button"
                  onClick={() => remove(u)}
                  aria-label={t("projmanage.updates_delete_aria")}
                  style={{
                    flex: "0 0 auto",
                    padding: "6px 12px",
                    borderRadius: "var(--radius-pill)",
                    background: "rgba(192,86,59,0.1)",
                    border: "1px solid rgba(192,86,59,0.28)",
                    color: "var(--terra)",
                    cursor: "pointer",
                    fontSize: 12,
                  }}
                >
                  {t("projmanage.delete")}
                </button>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Member ratings ───────────────────────────────────────────────────────────
// GET  /projects/{id}/rateable → {closed, cohort:[{id,display_name,photo_url,rated_by_me}]}
// POST /projects/{id}/ratings {ratee_id, stars, note?} → {ok,id}
// The backend only allows rating once the project is CLOSED (is_active=false).

function RateableRow({ projectId, person, flash, onRated }) {
  const t = useT();
  const [stars, setStars] = useState(0);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(person.rated_by_me);
  const name = person.display_name || t("projmanage.a_teammate");

  async function submit() {
    if (!stars || saving) return;
    setSaving(true);
    try {
      await bfu(`/projects/${projectId}/ratings`, {
        method: "POST",
        body: { ratee_id: person.id, stars, note: note.trim() || null },
      });
      setDone(true);
      flash(t("projmanage.rating_thanks", { name }));
      onRated && onRated(person.id);
    } catch (err) {
      flash(err?.message || t("projmanage.rating_save_error"), "err");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="ch-cell-static" style={{ display: "flex", flexDirection: "column", gap: 14, padding: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <Avatar id={person.id} name={name} photo={person.photo_url} size={40} />
        <a
          href={`/u/${person.id}`}
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: 16,
            color: "var(--text)",
            textDecoration: "none",
          }}
        >
          {name}
        </a>
        {done ? (
          <span
            style={{
              marginLeft: "auto",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--green)",
            }}
          >
            ✓ {t("projmanage.rated")}
          </span>
        ) : null}
      </div>

      {done ? null : (
        <>
          <StarInput value={stars} onChange={setStars} disabled={saving} />
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("projmanage.rating_note_placeholder")}
            maxLength={200}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: "var(--radius-sm)",
              background: "var(--surface-2)",
              border: "1px solid var(--hair)",
              color: "var(--text)",
              fontFamily: "var(--font-body)",
              fontSize: 13.5,
            }}
          />
          <div>
            <button
              type="button"
              onClick={submit}
              className="ch-btn-primary"
              disabled={!stars || saving}
              style={{ opacity: !stars || saving ? 0.6 : 1, padding: "10px 18px", fontSize: 13 }}
            >
              {saving ? t("projmanage.saving") : t("projmanage.rating_submit")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function RatingsPanel({ projectId, flash }) {
  const t = useT();
  const [state, setState] = useState("loading"); // loading | ready | closed-empty | not-closed | forbidden | error
  const [cohort, setCohort] = useState([]);

  useEffect(() => {
    let alive = true;
    bfu(`/projects/${projectId}/rateable`)
      .then((res) => {
        if (!alive) return;
        if (!res?.closed) {
          setState("not-closed");
          return;
        }
        const people = Array.isArray(res?.cohort) ? res.cohort : [];
        setCohort(people);
        setState(people.length === 0 ? "closed-empty" : "ready");
      })
      .catch((err) => {
        if (!alive) return;
        if (err?.status === 403) setState("forbidden");
        else setState("error");
      });
    return () => {
      alive = false;
    };
  }, [projectId]);

  if (state === "loading") {
    return (
      <div style={{ color: "var(--muted-strong)", fontSize: 14 }}>
        <span className="ch-spin" aria-hidden style={{ marginRight: 8 }}>◠</span>
        {t("projmanage.team_loading")}
      </div>
    );
  }
  if (state === "not-closed") {
    return (
      <div className="ch-empty" style={{ minHeight: 180 }}>
        <span className="ch-empty-k">{t("projmanage.ratings_notclosed_k")}</span>
        <div className="ch-empty-t">{t("projmanage.ratings_notclosed_t")}</div>
        <div className="ch-empty-s">
          {t("projmanage.ratings_notclosed_s")}
        </div>
      </div>
    );
  }
  if (state === "forbidden") {
    return (
      <div className="ch-empty" style={{ minHeight: 160 }}>
        <span className="ch-empty-k">{t("projmanage.ratings_forbidden_k")}</span>
        <div className="ch-empty-s" style={{ marginTop: 8 }}>
          {t("projmanage.ratings_forbidden_s")}
        </div>
      </div>
    );
  }
  if (state === "closed-empty") {
    return (
      <div className="ch-empty" style={{ minHeight: 160 }}>
        <span className="ch-empty-k">{t("projmanage.ratings_empty_k")}</span>
        <div className="ch-empty-s" style={{ marginTop: 8 }}>
          {t("projmanage.ratings_empty_s")}
        </div>
      </div>
    );
  }
  if (state === "error") {
    return <div style={{ color: "var(--terra)", fontSize: 14 }} role="status">{t("projmanage.ratings_load_error")}</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <p style={{ margin: 0, fontSize: 14, color: "var(--muted-strong)", lineHeight: 1.55, maxWidth: 560 }}>
        {t("projmanage.ratings_intro")}
      </p>
      {cohort.map((person) => (
        <RateableRow
          key={person.id}
          projectId={projectId}
          person={person}
          flash={flash}
        />
      ))}
    </div>
  );
}

// ── Team management (founder-only) ───────────────────────────────────────────
// GET    /projects/{id}/team            → [{user:{id,display_name,photo_url,is_online}, role, is_founder, joined_at}]
// PATCH  /projects/{id}/team/{user_id}  {role} → {ok,user_id,role}
// DELETE /projects/{id}/team/{user_id}  → 204   (the founder can't be removed)
// The member-role here is a title on an actual teammate — distinct from the OPEN
// hiring roles managed in the Roles tab.

function TeamRow({ projectId, member, onRemoved, flash }) {
  const t = useT();
  const u = member.user || {};
  const name = u.display_name || t("projmanage.a_teammate");
  const [role, setRole] = useState(member.role || "");
  const [savedRole, setSavedRole] = useState(member.role || "");
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const dirty = role.trim() !== (savedRole || "").trim();

  async function saveRole() {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      const res = await bfu(`/projects/${projectId}/team/${u.id}`, {
        method: "PATCH",
        body: { role: role.trim() || null },
      });
      const next = res?.role || "";
      setSavedRole(next);
      setRole(next);
      flash(next ? t("projmanage.team_role_saved", { name }) : t("projmanage.team_role_cleared", { name }));
    } catch (err) {
      flash(err?.message || t("projmanage.team_role_save_error"), "err");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setRemoving(true);
    try {
      await bfu(`/projects/${projectId}/team/${u.id}`, { method: "DELETE" });
      flash(t("projmanage.team_removed", { name }));
      onRemoved(u.id);
    } catch (err) {
      flash(err?.message || t("projmanage.team_remove_error"), "err");
      setRemoving(false);
      setConfirming(false);
    }
  }

  return (
    <div
      className="ch-cell-static"
      style={{ display: "flex", alignItems: "center", gap: 14, padding: 16, flexWrap: "wrap" }}
    >
      <Avatar id={u.id} name={name} photo={u.photo_url} size={40} />
      <div style={{ flex: 1, minWidth: 150 }}>
        <a
          href={`/u/${u.id}`}
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: 16,
            color: "var(--text)",
            textDecoration: "none",
          }}
        >
          {name}
        </a>
        <div style={{ marginTop: 3, display: "flex", alignItems: "center", gap: 8 }}>
          {member.is_founder && (
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "var(--amber)",
              }}
            >
              {t("projmanage.team_founder_you")}
            </span>
          )}
          {u.is_online && (
            <span style={{ fontSize: 12, color: "var(--green)" }}>● {t("projmanage.online")}</span>
          )}
        </div>
      </div>

      {/* Editable member-role */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input
          type="text"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              saveRole();
            }
          }}
          placeholder={t("projmanage.team_role_placeholder")}
          maxLength={80}
          aria-label={t("projmanage.team_role_aria", { name })}
          style={{
            width: 170,
            padding: "9px 12px",
            borderRadius: "var(--radius-sm)",
            background: "var(--surface-2)",
            border: "1px solid var(--hair)",
            color: "var(--text)",
            fontFamily: "var(--font-body)",
            fontSize: 13.5,
          }}
        />
        <button
          type="button"
          onClick={saveRole}
          disabled={!dirty || saving}
          className="ch-btn-ghost"
          style={{ padding: "8px 14px", fontSize: 12.5, opacity: !dirty || saving ? 0.5 : 1 }}
        >
          {saving ? t("projmanage.saving") : t("projmanage.save")}
        </button>
      </div>

      {/* Remove — founder can't be removed (that's you). */}
      {member.is_founder ? null : !confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          aria-label={t("projmanage.remove_name_aria", { name })}
          style={{
            padding: "8px 12px",
            borderRadius: "var(--radius-pill)",
            background: "rgba(192,86,59,0.1)",
            border: "1px solid rgba(192,86,59,0.28)",
            color: "var(--terra)",
            cursor: "pointer",
            fontSize: 12.5,
          }}
        >
          {t("projmanage.remove")}
        </button>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12.5, color: "var(--text)" }}>{t("projmanage.remove_confirm")}</span>
          <button
            type="button"
            onClick={remove}
            disabled={removing}
            style={{
              padding: "8px 12px",
              borderRadius: "var(--radius-pill)",
              background: "var(--terra)",
              border: "none",
              color: "#fff",
              cursor: removing ? "default" : "pointer",
              fontWeight: 700,
              fontSize: 12.5,
              opacity: removing ? 0.6 : 1,
            }}
          >
            {removing ? t("projmanage.removing") : t("projmanage.yes")}
          </button>
          <button type="button" className="ch-btn-ghost" onClick={() => setConfirming(false)} style={{ padding: "8px 12px", fontSize: 12.5 }}>
            {t("projmanage.no")}
          </button>
        </div>
      )}
    </div>
  );
}

function TeamPanel({ projectId, flash }) {
  const t = useT();
  const [state, setState] = useState("loading"); // loading | ready | error
  const [roster, setRoster] = useState([]);

  useEffect(() => {
    let alive = true;
    bfu(`/projects/${projectId}/team`)
      .then((res) => {
        if (!alive) return;
        // Endpoint returns a bare array; tolerate a wrapped shape defensively.
        const list = Array.isArray(res) ? res : res?.team || res?.members || [];
        setRoster(list);
        setState("ready");
      })
      .catch(() => {
        if (alive) setState("error");
      });
    return () => {
      alive = false;
    };
  }, [projectId]);

  function onRemoved(uid) {
    setRoster((cur) => cur.filter((m) => m.user?.id !== uid));
  }

  if (state === "loading") {
    return (
      <div style={{ color: "var(--muted-strong)", fontSize: 14 }}>
        <span className="ch-spin" aria-hidden style={{ marginRight: 8 }}>◠</span>
        {t("projmanage.team_loading")}
      </div>
    );
  }
  if (state === "error") {
    return <div style={{ color: "var(--terra)", fontSize: 14 }} role="status">{t("projmanage.team_load_error")}</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <p style={{ margin: 0, fontSize: 14, color: "var(--muted-strong)", lineHeight: 1.55, maxWidth: 560 }}>
        {t("projmanage.team_intro")}
      </p>
      {roster.map((m) => (
        <TeamRow key={m.user?.id} projectId={projectId} member={m} onRemoved={onRemoved} flash={flash} />
      ))}
    </div>
  );
}

export default function ProjectManager({ projectId, meId }) {
  const t = useT();
  const router = useRouter();
  const [state, setState] = useState("loading"); // loading | ready | error | forbidden
  const [project, setProject] = useState(null);
  const [apps, setApps] = useState([]);
  const [appsFailed, setAppsFailed] = useState(false); // inbox fetch failed
  const [busyApp, setBusyApp] = useState(null); // app id currently deciding
  const [tab, setTab] = useState("applicants"); // applicants | edit | danger
  const [regions, setRegions] = useState([]);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Bumped after each decision so the stats tiles refetch and stay in sync.
  const [statsKey, setStatsKey] = useState(0);
  // Shared, timer-managed toast (no leaked setTimeout / setState-after-unmount).
  const { toast, flash } = useToast();

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
            setAppsFailed(false);
          }
        } catch {
          // Distinguish "no applicants" from "couldn't load applicants" so the
          // Applicants tab doesn't show an empty state while stats claim pending.
          if (alive) {
            setApps([]);
            setAppsFailed(true);
          }
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
      flash(action === "accept" ? t("projmanage.applicant_accepted") : t("projmanage.application_declined"));
      // Keep the header count in sync (derive from the now-shorter list, not a
      // possibly-stale server count that masks 0/null as 1).
      setProject((p) =>
        p
          ? {
              ...p,
              pending_applications_count: Math.max(0, (prev.length || 0) - 1),
              member_count: action === "accept" ? (p.member_count || 0) + 1 : p.member_count,
            }
          : p
      );
      // Refetch the stats tiles so Pending/Accepted/Declined match the list.
      setStatsKey((k) => k + 1);
    } catch (err) {
      // Roll back on failure.
      setApps(prev);
      flash(err?.message || t("projmanage.application_update_error"), "err");
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
      flash(err?.message || t("projmanage.delete_project_error"), "err");
      setDeleting(false);
    }
  }

  if (state === "loading" || state === "forbidden") {
    return (
      <div style={{ marginTop: 8, color: "var(--muted-strong)", fontSize: 14 }}>
        <span className="ch-spin" aria-hidden style={{ marginRight: 8 }}>◠</span>
        {state === "forbidden" ? t("projmanage.redirecting") : t("projmanage.loading_project")}
      </div>
    );
  }
  if (state === "error" || !project) {
    return (
      <div style={{ marginTop: 8, color: "var(--terra)", fontSize: 14 }}>
        {t("projmanage.load_project_error")}
      </div>
    );
  }

  const pending = apps.length;

  const tabBtn = (key, label, count, danger = false) => {
    const on = tab === key;
    const activeColor = danger ? "var(--terra)" : "var(--amber)";
    const activeBg = danger ? "rgba(192,86,59,0.12)" : "rgba(232,161,92,0.12)";
    return (
      <button
        type="button"
        onClick={() => setTab(key)}
        aria-current={on ? "true" : undefined}
        style={{
          padding: "9px 16px",
          borderRadius: "var(--radius-pill)",
          border: `1px solid ${on ? activeColor : "var(--hair)"}`,
          background: on ? activeBg : "transparent",
          color: on ? activeColor : danger ? "var(--terra)" : "var(--muted-strong)",
          cursor: "pointer",
          fontFamily: "var(--font-body)",
          fontWeight: 600,
          fontSize: 13,
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
                fontSize: 11,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "var(--muted-strong)",
              }}
            >
              {project.type === "volunteering" ? t("projmanage.type_volunteering") : t("projmanage.type_startup")} · {t("projmanage.members_count", { n: project.member_count || 0 })} · {t("projmanage.views_count", { n: project.view_count || 0 })}
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
          {t("projmanage.view_public_page")} <span style={{ fontSize: 14 }}>↗</span>
        </a>
      </div>

      {/* Owner stats — firelit tiles, count-up (reduced-motion respected). */}
      <StatsStrip projectId={projectId} refreshKey={statsKey} />

      {/* Tabs — the destructive "Delete" is pushed to the right with a divider
          so it never reads as a peer of the everyday tabs. */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }} role="tablist">
        {tabBtn("applicants", t("projmanage.tab_applicants"), pending)}
        {tabBtn("team", t("projmanage.tab_team"), project.member_count || 0)}
        {tabBtn("roles", t("projmanage.tab_roles"))}
        {tabBtn("updates", t("projmanage.tab_updates"))}
        {tabBtn("ratings", t("projmanage.tab_ratings"))}
        {tabBtn("edit", t("projmanage.tab_edit"))}
        <span
          aria-hidden
          style={{ marginLeft: "auto", width: 1, height: 22, background: "var(--hair)" }}
        />
        {tabBtn("danger", t("projmanage.tab_delete"), null, true)}
      </div>

      {/* Applicants tab */}
      {tab === "applicants" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {appsFailed ? (
            <div className="ch-empty" style={{ minHeight: 220 }}>
              <span className="ch-empty-k">{t("projmanage.applicants_error_k")}</span>
              <div className="ch-empty-t">{t("projmanage.applicants_error_t")}</div>
              <div className="ch-empty-s">
                {t("projmanage.applicants_error_s")}
              </div>
            </div>
          ) : pending === 0 ? (
            <div className="ch-empty" style={{ minHeight: 220 }}>
              <span className="ch-empty-k">{t("projmanage.applicants_empty_k")}</span>
              <div className="ch-empty-t">{t("projmanage.applicants_empty_t")}</div>
              <div className="ch-empty-s">
                {t("projmanage.applicants_empty_s")}
              </div>
            </div>
          ) : (
            apps.map((app) => (
              <ApplicantRow key={app.id} app={app} onDecision={decide} busy={busyApp === app.id} />
            ))
          )}
        </div>
      )}

      {/* Team tab — founder-only roster: set member roles + remove members. */}
      {tab === "team" && <TeamPanel projectId={projectId} flash={flash} />}

      {/* Roles tab — owner-only roles editor. */}
      {tab === "roles" && <RolesEditor projectId={projectId} flash={flash} />}

      {/* Updates tab — composer + own-update list. */}
      {tab === "updates" && <UpdatesComposer projectId={projectId} meId={meId} flash={flash} />}

      {/* Ratings tab — rate teammates once the project has closed. */}
      {tab === "ratings" && <RatingsPanel projectId={projectId} flash={flash} />}

      {/* Edit tab — reuse the create form, pre-filled, in PATCH mode. */}
      {tab === "edit" && <CreateProjectForm regions={regions} mode="edit" initial={project} />}

      {/* Danger tab */}
      {tab === "danger" && (
        <div
          className="ch-cell-static"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 16,
            borderColor: "rgba(192,86,59,0.35)",
            background: "linear-gradient(155deg, rgba(192,86,59,0.06), var(--surface) 60%)",
          }}
        >
          <div className="ch-cell-label" style={{ color: "var(--terra)" }}>
            {t("projmanage.danger_title")}
          </div>
          <p style={{ margin: 0, fontSize: 14, color: "var(--muted-strong)", lineHeight: 1.55, maxWidth: 560 }}>
            {t("projmanage.danger_desc_pre")}<b style={{ color: "var(--text)" }}>{project.name}</b>{t("projmanage.danger_desc_post")}
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
                {t("projmanage.delete_project_btn")}
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 14, color: "var(--text)" }}>{t("projmanage.are_you_sure")}</span>
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
                {deleting ? t("projmanage.deleting") : t("projmanage.yes_delete")}
              </button>
              <button type="button" className="ch-btn-ghost" onClick={() => setConfirmDelete(false)}>
                {t("projmanage.keep_it")}
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
