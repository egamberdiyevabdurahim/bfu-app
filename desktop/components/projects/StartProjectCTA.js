"use client";

import { useEffect, useState } from "react";
import { bfu } from "@/lib/client-api";
import { useT } from "@/components/i18n/LocaleProvider";

// Small additive island for the public /projects browse page. Probes auth via
// GET /users/me (through the authed proxy): when the reader is logged in it
// surfaces "Your projects" + "Start a project"; when anonymous it renders
// nothing (the page stays a clean public discovery surface). Purely additive —
// the SSR grid is untouched.
export default function StartProjectCTA() {
  const t = useT();
  // loading → reserve space; authed → show CTAs; anon/other → render nothing.
  const [state, setState] = useState("loading"); // loading | authed | hidden

  useEffect(() => {
    let alive = true;
    bfu("/users/me")
      .then((me) => {
        if (alive) setState(me?.id ? "authed" : "hidden");
      })
      .catch(() => {
        // 401 = genuinely anonymous → stay hidden; any transient error also
        // hides the CTA rather than risking a broken action on a public page.
        if (alive) setState("hidden");
      });
    return () => {
      alive = false;
    };
  }, []);

  if (state === "hidden") return null;

  // Reserve the control row's height while probing auth so the header doesn't
  // shift when the CTAs fade in on the common logged-in path.
  if (state === "loading") {
    return <div aria-hidden style={{ height: 44 }} />;
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      <a href="/web/projects/mine" className="ch-btn-ghost">
        <span style={{ fontSize: 15, color: "var(--amber)" }} aria-hidden>◆</span>{" "}
        {t("projects.your_projects")}
      </a>
      <a href="/web/projects/new" className="ch-btn-primary">
        + {t("projects.start_project")}
      </a>
    </div>
  );
}
