"use client";

import { useEffect, useRef, useState } from "react";

/** Cubic ease-out count-up from 0 to `target`, matching the approved
 * Chorsu Profile.dc.html reference's timing (1100-1500ms, randomized). */
export function useCountUp(target) {
  const [value, setValue] = useState(0);
  const frameRef = useRef(null);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { setValue(target); return undefined; }
    if (!target) { setValue(0); return undefined; }

    const duration = 1100 + Math.random() * 400;
    const start = performance.now();

    const tick = (now) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(target * eased));
      if (p < 1) frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frameRef.current);
  }, [target]);

  return value;
}
