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
    <ReactLenis root options={{ lerp: 0.1, duration: 1.1 }}>
      {children}
    </ReactLenis>
  );
}
