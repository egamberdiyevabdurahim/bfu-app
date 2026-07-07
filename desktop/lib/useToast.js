"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Shared toast state with a SINGLE managed timer. Replaces the ad-hoc
// `setTimeout(() => setToast(null), 3000)` scattered through flash()/showToast()
// in ProjectManager / RequestsList / MentorsBrowser / PartnerDetail, which each
// leaked timers and fired setState after unmount, and let stacked toasts clear
// each other early. `flash(text, tone)` shows a toast for `duration` ms; the
// timer is reset on every flash and cleared on unmount.
export function useToast(duration = 3000) {
  const [toast, setToast] = useState(null); // { text, tone } | null
  const timer = useRef(null);

  const clear = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const flash = useCallback(
    (text, tone = "ok") => {
      clear();
      setToast({ text, tone });
      timer.current = setTimeout(() => {
        setToast(null);
        timer.current = null;
      }, duration);
    },
    [clear, duration]
  );

  // Clear any pending timer on unmount.
  useEffect(() => clear, [clear]);

  return { toast, flash };
}
