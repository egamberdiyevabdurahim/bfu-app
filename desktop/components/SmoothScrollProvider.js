"use client";

import { useEffect, useState } from "react";
import { ReactLenis } from "lenis/react";

export default function SmoothScrollProvider({ children }) {
  // Default to smooth-scroll enabled until mounted (SSR-safe), then re-check the
  // user's prefers-reduced-motion setting on the client and disable Lenis when
  // reduce is set. Lenis has no internal reduced-motion handling of its own, so
  // this gate is required by the design spec (springs collapse, ticker holds,
  // glow static — smooth-scroll hijacking must not run for reduce users).
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduce(mql.matches);
    const onChange = (e) => setReduce(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  if (reduce) {
    return children;
  }

  return (
    <ReactLenis root options={{ lerp: 0.1, duration: 1.1, prevent: shouldPreventLenis }}>
      {children}
    </ReactLenis>
  );
}

// Lenis (root) hijacks EVERY wheel/touch and scrolls the PAGE. That means a
// scrollable region inside a modal — the 30-question registration form, a long
// responses table, any sheet — never receives the wheel: Lenis scrolls the page
// behind instead ("scroll only works outside"). `prevent(node)` returning true
// tells Lenis to leave that event alone so the element's own overflow scroll
// runs natively.
//
// We prevent for anything inside a modal/dialog (role="dialog" / aria-modal) or
// an explicit opt-out (data-lenis-prevent, e.g. the nav drawer). This is the ONE
// place the whole app's modals get correct inner scrolling — no per-modal wiring,
// and new modals are covered automatically as long as they carry role="dialog".
function shouldPreventLenis(node) {
  return (
    typeof node?.closest === "function" &&
    node.closest('[data-lenis-prevent], [role="dialog"], [aria-modal="true"]') != null
  );
}
