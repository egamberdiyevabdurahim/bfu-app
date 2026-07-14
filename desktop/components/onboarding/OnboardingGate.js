"use client";

import { useState } from "react";
import OnboardingFlow from "./OnboardingFlow";

// Thin client gate mounted on /home. Renders the first-run experience ONLY for a
// brand-new builder — which OnboardingFlow now resolves to the same 3-card
// walkthrough the Mini App shows (or, with FLAGS.SETUP_WIZARD on, the old 4-step
// setup wizard).
//
// The `!== false` test is deliberately STRICT. onboarding_completed is a tri-state
// in practice:
//   false      → a genuinely new member  → show it
//   true       → already onboarded       → never again
//   undefined  → an older account / a backend that predates the flag → show
//                NOTHING. A loose falsy check (`!me.onboarding_completed`) would
//                replay the welcome screen for every long-standing member the
//                moment the field is missing from a payload. Don't loosen it.
//
// Dismissal is local + immediate (setDismissed) and never waits on the network —
// OnboardingFlow fires POST /users/me/onboarding-complete without awaiting it, so
// a failed request can't trap anyone. Worst case the flag stays false server-side
// and they see the cards once more on the next load.
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
