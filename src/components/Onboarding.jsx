import { useState } from "react";
import { storage, auth, users } from "../api";
import { useT } from "../i18n";
import { haptic } from "../tg";

// ── First-run walkthrough (3 cards, skippable at every step) ──────────────────
// The #1 complaint about BFU was "people don't know what this is". A new member
// used to finish registration and land on City with zero context. These three
// cards run once — right after sign-up — and then drop them into City (the
// default tab), which is the single action the last card promises.
//
// Persistence reuses what already exists: users.onboarding_completed (already on
// /users/me, already read by the desktop app) + POST /users/me/onboarding-complete
// (idempotent). No migration, no new flag, no localStorage.

const STEPS = ["s1", "s2", "s3"];

// api.js does NOT expose the onboarding-complete call and we don't own that file,
// so we go through the same base URL + token + refresh path req() uses:
//   • BASE   — mirrors api.js (VITE_API_URL, "" = same-origin in prod via the
//              Vercel rewrite, localhost only in dev).
//   • token  — storage.getAccess() (the exact source req() reads).
//   • 401    — auth.refresh() (that IS api.js's _doRefresh) then one retry.
// If api.js ever grows users.onboardingComplete(), the guard below picks it up
// automatically and this fallback goes unused.
const _envBase = import.meta.env.VITE_API_URL;
const BASE = _envBase !== undefined
  ? _envBase
  : (import.meta.env.DEV ? "http://localhost:8000" : "");

async function _post(retry = true) {
  const token = storage.getAccess();
  const res = await fetch(`${BASE}/users/me/onboarding-complete`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (res.status === 401 && retry) {
    await auth.refresh();      // api.js's _doRefresh — rewrites storage tokens
    return _post(false);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json().catch(() => ({ ok: true }));
}

// Module-local, not exported: this file must only export the component (React
// Fast Refresh) and nothing outside the walkthrough needs to call it.
function completeOnboarding() {
  if (typeof users.onboardingComplete === "function") return users.onboardingComplete();
  return _post();
}

const Dots = ({ step }) => (
  <div style={{ display: "flex", justifyContent: "center", gap: 7, marginBottom: 18 }} aria-hidden>
    {STEPS.map((_, i) => (
      <span key={i} style={{
        height: 5, borderRadius: 99,
        width: i === step ? 24 : 5,
        background: i === step
          ? "linear-gradient(90deg, var(--amber), var(--ember))"
          : "var(--surface-3)",
        transition: "width 0.28s ease, background 0.28s ease",
      }} />
    ))}
  </div>
);

export const Onboarding = ({ onDone }) => {
  const { t } = useT();
  const [step, setStep] = useState(0);
  const [closing, setClosing] = useState(false);   // guards a double-tap

  // Both "Skip" and the final "See your city" land here. The overlay is hidden
  // IMMEDIATELY (optimistic) and the network call is fire-and-forget: a failed
  // request must never trap a new member inside the walkthrough. Worst case the
  // flag stays false server-side and they see the three cards once more.
  const finish = () => {
    if (closing) return;
    setClosing(true);
    haptic("impact");
    completeOnboarding().catch(() => {});
    onDone();
  };

  const next = () => {
    if (step >= STEPS.length - 1) { finish(); return; }
    haptic();   // "impact" — the only kind tg.js maps to impactOccurred
    setStep((s) => s + 1);
  };

  const key = STEPS[step];
  const last = step === STEPS.length - 1;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 450, background: "var(--bg)",
      maxWidth: 430, margin: "0 auto", display: "flex", flexDirection: "column",
      overflow: "hidden",
    }} role="dialog" aria-modal="true" aria-label="BFU">
      {/* Same firelit glow as the auth welcome screen */}
      <div style={{
        position: "absolute", top: "12%", left: "50%", transform: "translateX(-50%)",
        width: 380, height: 380, pointerEvents: "none",
        background: "radial-gradient(circle, rgba(255,106,61,0.22) 0%, rgba(232,161,92,0.10) 42%, transparent 72%)",
      }} />

      {/* Header: mark + a persistent Skip (every step has a way out) */}
      <div style={{
        flex: "0 0 auto", position: "relative", zIndex: 1,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "calc(var(--safe-t) + 14px) 20px 0",
      }}>
        <img src="/bfu-mark.png" alt="BFU" style={{
          width: 30, height: 30, objectFit: "contain",
          filter: "drop-shadow(0 8px 24px rgba(232,161,92,0.35))",
        }} />
        <button type="button" onClick={finish} style={{
          background: "none", border: "none", cursor: "pointer", padding: "8px 4px",
          fontFamily: "var(--font-mono)", fontSize: 11.5, letterSpacing: "0.1em",
          textTransform: "uppercase", color: "var(--text-3)",
        }}>
          {t("onb.skip")}
        </button>
      </div>

      {/* Card */}
      <div style={{
        flex: "1 1 auto", position: "relative", zIndex: 1, minHeight: 0,
        overflowY: "auto", WebkitOverflowScrolling: "touch", display: "flex", flexDirection: "column", justifyContent: "center",
        padding: "24px 26px",
      }}>
        <div key={key} style={{ animation: "fadeUp 0.42s ease both" }}>
          <div className="ch-eyebrow" style={{
            fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: "0.22em",
            textTransform: "uppercase", color: "var(--amber)", marginBottom: 14,
          }}>
            {`0${step + 1} / 0${STEPS.length}`}
          </div>
          <h2 style={{
            fontFamily: "var(--font-display)", fontWeight: 800,
            fontSize: last ? 27 : 29, lineHeight: 1.15, letterSpacing: "-0.02em",
            color: "var(--text)", marginBottom: 14,
          }}>
            {t(`onb.${key}.title`)}
          </h2>
          <p style={{
            color: "var(--text-2)", fontSize: 15.5, lineHeight: 1.62, maxWidth: 340,
          }}>
            {t(`onb.${key}.body`)}
          </p>
        </div>
      </div>

      {/* Footer: dots + the one action. Skip stays reachable in the header. */}
      <div style={{
        flex: "0 0 auto", position: "relative", zIndex: 1,
        padding: "14px 26px calc(22px + var(--safe-b))",
        borderTop: "1px solid var(--hair)", background: "var(--bg)",
      }}>
        <Dots step={step} />
        <button type="button" className="btn-primary" onClick={next} disabled={closing}>
          {last ? t("onb.start") : t("onb.next")}
        </button>
      </div>
    </div>
  );
};
