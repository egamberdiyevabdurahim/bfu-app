"use client";

import { useEffect, useState } from "react";
import { bfu } from "@/lib/client-api";

// Small additive island for the public /projects browse page. Probes auth via
// GET /users/me (through the authed proxy): when the reader is logged in it
// surfaces "Your projects" + "Start a project"; when anonymous it renders
// nothing (the page stays a clean public discovery surface). Purely additive —
// the SSR grid is untouched.
export default function StartProjectCTA() {
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    let alive = true;
    bfu("/users/me")
      .then((me) => alive && setAuthed(!!me?.id))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (!authed) return null;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <a href="/projects/mine" className="ch-btn-ghost">
        <span style={{ fontSize: 15, color: "var(--amber)" }}>◆</span> Your projects
      </a>
      <a href="/projects/new" className="ch-btn-primary">
        + Start a project
      </a>
    </div>
  );
}
