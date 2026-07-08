"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { bfu } from "@/lib/client-api";

// Additive client island for the public /p/[id] project page. Calls the authed
// GET /projects/{id}/conversation on mount — which find-or-creates the project's
// team conversation and returns {id} for team members, or 403/401 for everyone
// else. Self-hides (renders nothing) unless the viewer is on the team, so anon
// readers and non-members never see it. On click it opens the team chat thread.
export default function TeamChatButton({ projectId }) {
  const router = useRouter();
  const [convId, setConvId] = useState(null); // null until known / hidden

  useEffect(() => {
    let alive = true;
    bfu(`/projects/${projectId}/conversation`)
      .then((r) => {
        if (alive && r?.id) setConvId(r.id);
      })
      .catch(() => {
        // 401 (anon) / 403 (not on team) / transient → stay hidden.
      });
    return () => {
      alive = false;
    };
  }, [projectId]);

  if (!convId) return null;

  return (
    <div
      style={{
        borderRadius: "var(--radius)",
        border: "1px solid var(--hair)",
        background: "var(--surface)",
        padding: 22,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div className="ch-cell-label">Team chat</div>
      <button
        type="button"
        className="ch-btn-primary"
        onClick={() => router.push(`/messages?c=${convId}`)}
        style={{ width: "100%", justifyContent: "center" }}
      >
        <span aria-hidden>✉</span> Open team chat
      </button>
    </div>
  );
}
