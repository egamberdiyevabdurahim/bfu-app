"use client";

import { useEffect, useRef, useState } from "react";
import { gradientFor, initials } from "../lib/avatar";
import { useT } from "@/components/i18n/LocaleProvider";

// Cycles a "<name> just came online" toast every ~9s (drifts up per mockup
// `.toast`), drawing ONLY from the real online set the parent passes in
// (builders with online === true). No fabricated presence: if the set is
// empty, or the viewer prefers reduced motion, this renders nothing.
export default function PresenceToast({ builders = [] }) {
  const t = useT();
  const [current, setCurrent] = useState(null);
  const [show, setShow] = useState(false);
  const indexRef = useRef(0);
  const hideRef = useRef(null);

  useEffect(() => {
    if (!builders.length) return undefined;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return undefined;

    const pop = () => {
      const b = builders[indexRef.current % builders.length];
      indexRef.current += 1;
      setCurrent(b);
      setShow(true);
      hideRef.current = setTimeout(() => setShow(false), 3200);
    };

    const first = setTimeout(pop, 2600);
    const cycle = setInterval(pop, 9000);

    return () => {
      clearTimeout(first);
      clearInterval(cycle);
      clearTimeout(hideRef.current);
    };
  }, [builders]);

  // No real online builders (or reduced motion) → render nothing.
  if (!builders.length || !current) return null;

  const name = current.display_name || current.name || t("city.toast.someone");
  const seed = current.id != null ? current.id : name;

  return (
    <div className={`ch-toast${show ? " ch-toast-show" : ""}`} aria-live="polite">
      <span className="ch-toast-av" style={{ background: gradientFor(seed) }}>
        {initials(name)}
      </span>
      <span className="ch-toast-tx">
        <b>{name}</b> {t("city.toast.just_online")}
      </span>
    </div>
  );
}
