"use client";

import { useCallback, useState } from "react";

// One small, app-wide toast built on the existing `.ch-toast` grammar in
// globals.css (bottom-centered pill, fades + rises, transition disabled under
// prefers-reduced-motion). Batches 1–4 each grew a near-identical local `Toast`
// leaf on the same CSS class; this is the shared version new code should use.
//
// Usage:
//   const { toast, showToast, Toast } = useToast();
//   showToast("Marked all read");                 // neutral
//   showToast("Couldn't reach the server", "err"); // error tone
//   return (<> … <Toast /> </>);

/**
 * Presentational toast. Renders nothing when `toast` is null. `tone`:
 *   - "ok"  (default) — ember accent
 *   - "err"           — terracotta accent + border
 */
export function Toast({ toast }) {
  if (!toast) return null;
  const err = toast.tone === "err";
  return (
    <div
      className="ch-toast ch-toast-show"
      role="status"
      aria-live="polite"
      style={{ borderColor: err ? "rgba(192,86,59,0.5)" : "rgba(255,106,61,0.4)" }}
    >
      <span className="ch-toast-tx" style={{ color: "var(--text)" }}>
        {toast.text}
      </span>
    </div>
  );
}

/**
 * Hook that owns the toast state + auto-dismiss timer and hands back a bound
 * `<Toast />` you can drop anywhere in the tree.
 *
 * @param {number} [ttl=3000] ms before the toast auto-dismisses.
 */
export function useToast(ttl = 3000) {
  const [toast, setToast] = useState(null);

  const showToast = useCallback(
    (text, tone = "ok") => {
      setToast({ text, tone });
      // A fresh timer per call; the latest toast wins.
      window.clearTimeout(showToast._t);
      showToast._t = window.setTimeout(() => setToast(null), ttl);
    },
    [ttl]
  );

  const Bound = useCallback(() => <Toast toast={toast} />, [toast]);

  return { toast, showToast, Toast: Bound };
}

export default Toast;
