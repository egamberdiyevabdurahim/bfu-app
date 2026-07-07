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
  const [err, setErr] = useState("");

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
    setErr("");
    try {
      await bfu(`/projects/${projectId}/favorite`, { method: next ? "POST" : "DELETE" });
    } catch {
      setSaved(!next); // roll back
      setErr(next ? "Couldn't save — try again." : "Couldn't remove — try again.");
    } finally {
      setBusy(false);
    }
  }

  // Anon / failed initial load → own nothing.
  if (state === "hidden") return null;

  // Reserve the pill's footprint while the initial state loads so the action
  // rail doesn't shift when it resolves.
  if (state === "loading") {
    return (
      <span
        aria-hidden
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 16px",
          borderRadius: "var(--radius-pill)",
          border: "1px solid var(--hair)",
          background: "var(--surface-2)",
          width: 104,
          height: 40,
          opacity: 0.55,
        }}
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
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
          color: saved ? "var(--amber)" : "var(--text)",
          cursor: busy ? "default" : "pointer",
          fontFamily: "var(--font-body)",
          fontWeight: 600,
          fontSize: 14,
          opacity: busy ? 0.7 : 1,
          transition: "background 160ms ease, border-color 160ms ease, color 160ms ease",
        }}
      >
        <span
          aria-hidden
          style={{
            fontSize: 16,
            lineHeight: 1,
            color: saved ? "var(--amber)" : "var(--amber)",
            textShadow: saved ? "0 0 12px rgba(232,161,92,0.5)" : "none",
          }}
        >
          {saved ? "♥" : "♡"}
        </span>
        {saved ? "Saved" : "Save"}
      </button>
      <span role="status" aria-live="polite" style={{ minHeight: err ? undefined : 0 }}>
        {err ? (
          <span style={{ fontSize: 12.5, color: "var(--terra)" }}>{err}</span>
        ) : null}
      </span>
    </div>
  );
}
