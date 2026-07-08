"use client";

import { useState } from "react";
import OnboardingFlow from "./OnboardingFlow";

// Thin client gate mounted on /home. Renders the first-login welcome flow ONLY
// for a brand-new builder (me.onboarding_completed === false). Everyone else —
// including any user on a backend that predates the flag (undefined) — sees
// nothing, so the dashboard is never disrupted.
//
// home/page.js is a server component; it passes the already-fetched `me` and the
// derived `firstName` down so this stays a pure client wrapper with no extra
// round-trip.
export default function OnboardingGate({ me, firstName }) {
  const [dismissed, setDismissed] = useState(false);

  if (!me || me.onboarding_completed !== false) return null;
  if (dismissed) return null;

  return (
    <OnboardingFlow me={me} firstName={firstName} onClose={() => setDismissed(true)} />
  );
}
