"use client";

import { useEffect, useState } from "react";
import { bfu } from "@/lib/client-api";
import { gradientFor, initials } from "@/lib/avatar";

// Additive island mounted on the public /p/[id] page: the project's update feed.
// SSR content stays intact; this loads GET /projects/{id}/updates on mount and
// renders a warm timeline (newest first). Read for everyone with a session; the
// endpoint requires auth, so anon readers just get nothing rendered (the island
// stays silent rather than showing a login wall — the join island already owns
// that conversation).
//
// Shape confirmed against backend/app/routers/projects.py::list_updates →
//   { updates: [ { id, text, author: {id,display_name,photo_url}|null,
//                  created_at (ISO) } ] }

function timeAgo(iso) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const s = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  const w = Math.round(d / 7);
  if (w < 5) return `${w}w ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function Dot({ author }) {
  const name = author?.display_name || "Founder";
  return (
    <div
      style={{
        width: 34,
        height: 34,
        borderRadius: "50%",
        flex: "0 0 auto",
        background: gradientFor(author?.id ?? 0),
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--font-display)",
        fontWeight: 800,
        fontSize: 13,
        color: "#160E08",
        overflow: "hidden",
      }}
    >
      {author?.photo_url ? (
        <img
          src={author.photo_url}
          alt={name}
          style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }}
        />
      ) : (
        initials(name)
      )}
    </div>
  );
}

export default function ProjectUpdates({ projectId }) {
  const [state, setState] = useState("loading"); // loading | ready | hidden
  const [updates, setUpdates] = useState([]);

  useEffect(() => {
    let alive = true;
    bfu(`/projects/${projectId}/updates`)
      .then((res) => {
        if (!alive) return;
        setUpdates(Array.isArray(res?.updates) ? res.updates : []);
        setState("ready");
      })
      .catch(() => {
        // Anon (401) or transient error → stay out of the way entirely.
        if (alive) setState("hidden");
      });
    return () => {
      alive = false;
    };
  }, [projectId]);

  if (state === "loading" || state === "hidden") return null;

  return (
    <div
      className="ch-cell-static"
      style={{ display: "flex", flexDirection: "column", gap: 20, gridColumn: "span 4" }}
    >
      <div className="ch-cell-label">Project updates</div>

      {updates.length === 0 ? (
        <div style={{ fontSize: 14, color: "var(--muted-strong)", lineHeight: 1.55 }}>
          <span
            style={{
              fontFamily: "var(--font-accent)",
              fontStyle: "italic",
              fontSize: 18,
              color: "var(--muted-strong)",
            }}
          >
            No updates yet.
          </span>
          <div style={{ marginTop: 6 }}>
            When the founder shares progress, it&rsquo;ll appear here.
          </div>
        </div>
      ) : (
        <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 18 }}>
          {/* Timeline spine */}
          <span
            aria-hidden
            style={{
              position: "absolute",
              left: 16,
              top: 6,
              bottom: 6,
              width: 1,
              background: "linear-gradient(var(--hair), transparent)",
            }}
          />
          {updates.map((u) => (
            <div key={u.id} style={{ display: "flex", gap: 14, position: "relative" }}>
              <Dot author={u.author} />
              <div style={{ flex: 1, minWidth: 0, paddingTop: 1 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                  <span
                    style={{
                      fontFamily: "var(--font-display)",
                      fontWeight: 700,
                      fontSize: 14.5,
                      color: "var(--text)",
                    }}
                  >
                    {u.author?.display_name || "Founder"}
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      letterSpacing: "0.06em",
                      color: "var(--muted-strong)",
                    }}
                  >
                    {timeAgo(u.created_at)}
                  </span>
                </div>
                <p
                  style={{
                    margin: "4px 0 0",
                    fontSize: 14,
                    lineHeight: 1.55,
                    color: "var(--muted)",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {u.text}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
