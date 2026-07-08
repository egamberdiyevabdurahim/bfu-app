"use client";

import { useEffect } from "react";
import { bfu } from "@/lib/client-api";

// Fire-and-forget presence pinger. While a logged-in tab is VISIBLE, POST
// /users/me/heartbeat on mount and every 60s; pause when the tab is hidden and
// resume on visibility/focus. The backend then reports this user as "online"
// for 5 minutes, which drives every real presence indicator in the app.
//
// Mounted once inside AppShell. Renders nothing. Every failure is silently
// swallowed — presence must never surface an error to the user.
const PING_MS = 60000;

export default function PresenceHeartbeat() {
  useEffect(() => {
    let timer = null;
    const ping = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      bfu("/users/me/heartbeat", { method: "POST" }).catch(() => {});
    };
    const stop = () => {
      if (timer) window.clearInterval(timer);
      timer = null;
    };
    const start = () => {
      stop();
      timer = window.setInterval(ping, PING_MS);
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else {
        ping();
        start();
      }
    };

    ping(); // initial beat on mount
    start();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", ping);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", ping);
    };
  }, []);

  return null;
}
