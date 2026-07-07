"use client";

import { useEffect, useState } from "react";
import { bfu } from "@/lib/client-api";

// Small heart/save toggle island for /p/[id]. Loads the authed GET /projects/{id}
// on mount to learn the initial `is_favorited` state (confirmed exposed in
// ProjectResponse), then optimistically POST/DELETE /projects/{id}/favorite.
//   POST   /projects/{id}/favorite   → 201 {ok:true}
//   DELETE /projects/{id}/favorite   → 204
// Anon readers (401) get nothing — favoriting requires a session.

export default function FavoriteButton({ projectId }) {
  const [state, setState] = useState("loading"); // loading | ready | hidden
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    bfu(`/projects/${projectId}`)
      .then((p) => {
        if (!alive) return;
        setSaved(!!p.is_favorited);
        setState("ready");
      })
      .catch(() => {
        if (alive) setState("hidden");
      });
    return () => {
      alive = false;
    };
  }, [projectId]);

  async function toggle() {
    if (busy) return;
    const next = !saved;
    setSaved(next); // optimistic
    setBusy(true);
    try {
      await bfu(`/projects/${projectId}/favorite`, { method: next ? "POST" : "DELETE" });
    } catch {
      setSaved(!next); // roll back
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading" || state === "hidden") return null;

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={saved}
      aria-label={saved ? "Remove from saved" : "Save this project"}
      title={saved ? "Saved — click to unsave" : "Save this project"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 16px",
        borderRadius: "var(--radius-pill)",
        border: `1px solid ${saved ? "rgba(232,161,92,0.5)" : "var(--hair)"}`,
        background: saved ? "rgba(232,161,92,0.12)" : "var(--surface-2)",
        color: saved ? "var(--amber)" : "var(--muted)",
        cursor: busy ? "default" : "pointer",
        fontFamily: "var(--font-body)",
        fontWeight: 600,
        fontSize: 13.5,
        opacity: busy ? 0.7 : 1,
        transition: "background 160ms ease, border-color 160ms ease, color 160ms ease",
      }}
    >
      <span
        aria-hidden
        style={{
          fontSize: 16,
          lineHeight: 1,
          textShadow: saved ? "0 0 12px rgba(232,161,92,0.5)" : "none",
        }}
      >
        {saved ? "♥" : "♡"}
      </span>
      {saved ? "Saved" : "Save"}
    </button>
  );
}
