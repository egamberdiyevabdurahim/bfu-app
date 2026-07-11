"use client";

import { useEffect, useState } from "react";
import { bfu } from "@/lib/client-api";
import { gradientFor, initials } from "@/lib/avatar";
import { useToast } from "@/lib/useToast";
import { useT } from "@/components/i18n/LocaleProvider";

// "Applications" — the founder's inbox. Loads GET /projects/my-requests, which
// returns the PENDING applications submitted TO the current user's projects
// (ApplicationOut[]: applicant, project_name, project_type, role, status,
// created_at). Grouped by project, each row Accept/Reject-able inline
// (PATCH /projects/{project_id}/applications/{id} {action}), and each links to
// the project's manage page and the applicant's profile.
//
// IMPORTANT: despite the /requests route name, the backend endpoint is the
// founder inbox — there is no "my outgoing applications" list endpoint. A
// builder tracks their own application status per-project via the Apply control
// on /p/{id} (my_application_status), not here.

function Avatar({ id, name, photo, size = 42 }) {
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

export default function RequestsList() {
  const t = useT();
  const [state, setState] = useState("loading"); // loading | ready | error
  const [apps, setApps] = useState([]);
  const [busy, setBusy] = useState(null);
  // Shared, timer-managed toast (no leaked setTimeout / setState-after-unmount).
  const { toast, flash } = useToast();

  useEffect(() => {
    let alive = true;
    bfu("/projects/my-requests")
      .then((res) => {
        if (!alive) return;
        setApps(Array.isArray(res) ? res : []);
        setState("ready");
      })
      .catch(() => alive && setState("error"));
    return () => {
      alive = false;
    };
  }, []);

  async function decide(app, action) {
    setBusy(app.id);
    const prev = apps;
    setApps((cur) => cur.filter((x) => x.id !== app.id));
    try {
      await bfu(`/projects/${app.project_id}/applications/${app.id}`, {
        method: "PATCH",
        body: { action },
      });
      flash(action === "accept" ? t("projmanage.req_accepted") : t("projmanage.application_declined"));
    } catch (e) {
      setApps(prev);
      flash(e?.message || t("projmanage.application_update_error"), "err");
    } finally {
      setBusy(null);
    }
  }

  if (state === "loading") {
    return (
      <div style={{ marginTop: 28, color: "var(--muted-strong)", fontSize: 14 }}>
        <span className="ch-spin" aria-hidden style={{ marginRight: 8 }}>◠</span>
        {t("projmanage.req_loading")}
      </div>
    );
  }
  if (state === "error") {
    return (
      <div style={{ marginTop: 8, color: "var(--terra)", fontSize: 14 }} role="status">
        {t("projmanage.req_load_error")}
      </div>
    );
  }

  if (apps.length === 0) {
    return (
      <div className="ch-empty" style={{ marginTop: 8 }}>
        <span className="ch-empty-k">{t("projmanage.req_empty_k")}</span>
        <div className="ch-empty-t">{t("projmanage.req_empty_t")}</div>
        <div className="ch-empty-s">
          {t("projmanage.req_empty_s")}
        </div>
        <a href="/web/projects/mine" className="ch-btn-ghost" style={{ marginTop: 8 }}>
          {t("projmanage.your_projects")} →
        </a>
      </div>
    );
  }

  // Group by project for a tidy inbox.
  const byProject = new Map();
  for (const a of apps) {
    if (!byProject.has(a.project_id)) byProject.set(a.project_id, []);
    byProject.get(a.project_id).push(a);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      {[...byProject.entries()].map(([pid, list]) => (
        <section key={pid}>
          <div className="ch-slab" style={{ margin: "0 0 16px" }}>
            <span className="ch-slab-k">{list[0].project_type === "volunteering" ? t("projmanage.type_volunteering") : t("projmanage.type_startup")}</span>
            <h2>
              {/* The project name itself is now the link to its cockpit. */}
              <a
                href={`/web/projects/${pid}/manage`}
                style={{ color: "inherit", textDecoration: "none" }}
              >
                {list[0].project_name}
              </a>
            </h2>
            <span className="ch-slab-line" />
            <a
              href={`/web/projects/${pid}/manage`}
              style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--amber)", textDecoration: "none", whiteSpace: "nowrap" }}
            >
              {t("projmanage.manage_link")} →
            </a>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {list.map((app) => {
              const a = app.applicant || {};
              const name = a.display_name || t("projmanage.a_builder");
              return (
                <div
                  key={app.id}
                  className="ch-cell-static"
                  style={{ display: "flex", alignItems: "center", gap: 16, padding: 18, flexWrap: "wrap" }}
                >
                  <Avatar id={a.id} name={name} photo={a.photo_url} />
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <a
                      href={`/web/u/${a.id}`}
                      style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 17, color: "var(--text)", textDecoration: "none" }}
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
                  <div style={{ display: "flex", gap: 10, marginLeft: "auto", alignItems: "center" }}>
                    <button
                      type="button"
                      onClick={() => decide(app, "accept")}
                      disabled={busy === app.id}
                      className="ch-btn-primary"
                      style={{ padding: "10px 18px", fontSize: 13, opacity: busy === app.id ? 0.6 : 1 }}
                    >
                      {t("projmanage.accept")}
                    </button>
                    <button
                      type="button"
                      onClick={() => decide(app, "decline")}
                      disabled={busy === app.id}
                      style={{
                        padding: "10px 16px",
                        fontSize: 13,
                        borderRadius: "var(--radius-pill)",
                        background: "rgba(192,86,59,0.1)",
                        border: "1px solid rgba(192,86,59,0.3)",
                        color: "var(--terra)",
                        cursor: busy === app.id ? "default" : "pointer",
                        opacity: busy === app.id ? 0.6 : 1,
                      }}
                    >
                      {t("projmanage.reject")}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}

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
