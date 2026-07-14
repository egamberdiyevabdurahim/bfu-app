"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { bfu } from "@/lib/client-api";
import { asset } from "@/lib/asset";
import { gradientFor, initials } from "@/lib/avatar";
import { useT } from "@/components/i18n/LocaleProvider";
import { FLAGS } from "@/lib/flags";

// ─────────────────────────────────────────────────────────────────────────────
// First-run experience for a brand-new builder. Mounted by OnboardingGate on
// /home only while me.onboarding_completed === false.
//
// THE COLLISION THIS FILE FIXES
// The desktop app and the Mini App used to run DIFFERENT first-runs off the SAME
// server flag (onboarding_completed) and the same idempotent
// POST /users/me/onboarding-complete. So whichever app a new member opened first
// burned the flag — and the other app's first-run never ran for them, ever.
//
// The fix: both apps now show the SAME 3-card walkthrough (the founder-approved
// design, already shipped in the Mini App as src/components/Onboarding.jsx). One
// experience, one flag, no race. The desktop's old 4-step SETUP wizard is NOT
// deleted — it lives on below, behind FLAGS.SETUP_WIZARD (false in V1). Flip the
// flag to true and the wizard comes back exactly as it was.
//
//   FLAGS.SETUP_WIZARD = false (V1) → <Walkthrough/>  — 3 cards, ends on /city
//   FLAGS.SETUP_WIZARD = true       → <SetupWizard/>  — the original 4 steps
//
// Both branches POST /users/me/onboarding-complete on finish OR skip, and both
// dismiss OPTIMISTICALLY: the overlay is hidden before the request settles, so a
// network failure can never trap a new member inside their own welcome screen.
// Worst case the flag stays false and they see the cards once more.
// ─────────────────────────────────────────────────────────────────────────────

export default function OnboardingFlow(props) {
  return FLAGS.SETUP_WIZARD ? <SetupWizard {...props} /> : <Walkthrough {...props} />;
}

// Fire-and-forget. NEVER awaited by a dismiss path — see the note above. The
// endpoint is idempotent, so a retry on the next load costs nothing.
function completeOnboarding() {
  bfu("/users/me/onboarding-complete", { method: "POST" }).catch(() => {});
}

// Tab focus-trap shared by both overlays: keeps keyboard users inside the dialog.
function trapTab(e, root) {
  if (e.key !== "Tab" || !root) return;
  const focusables = Array.from(
    root.querySelectorAll(
      'button, [href], select, textarea, input, [tabindex]:not([tabindex="-1"])'
    )
  ).filter((el) => !el.disabled && el.offsetParent !== null);
  if (!focusables.length) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

// Hide the page behind the overlay from scroll + screen readers' reach.
function useLockedScroll() {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
}

// ═══ V1: the 3-card walkthrough ══════════════════════════════════════════════
// Same three cards, same copy keys (onb.*), same order and same skip-anywhere
// behaviour as the Mini App — restyled for a 1440px screen instead of a 430px
// phone (centred dialog on a dimmed scrim, ch-* design-system buttons, roomier
// type) rather than copying the Mini App's full-bleed mobile sheet verbatim.
const CARDS = ["s1", "s2", "s3"];

function Walkthrough({ onClose }) {
  const router = useRouter();
  const t = useT();

  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState(0);
  const cardRef = useRef(null);
  const doneRef = useRef(false); // guards a double-click / Esc-then-click race

  // Portal only after mount (needs document; also avoids any SSR mismatch).
  useEffect(() => setMounted(true), []);
  useLockedScroll();

  // Move focus into the dialog so keyboard + screen-reader users land here.
  useEffect(() => {
    if (mounted && cardRef.current) cardRef.current.focus();
  }, [mounted]);

  // The single exit. `toCity` is the promise the last card makes ("See your
  // city"); Skip / Esc / scrim just get out of the way and leave you on /home.
  //
  // Order matters: hide FIRST, then fire the request, and never await it.
  function dismiss(toCity) {
    if (doneRef.current) return;
    doneRef.current = true;
    onClose?.();            // optimistic — the overlay is gone this tick
    completeOnboarding();   // fire-and-forget; a failure changes nothing here
    // next/router IS basePath-aware, so "/city" resolves to /web/city. (A plain
    // <a href> would NOT be — that one has to be written "/web/city" by hand.)
    if (toCity) router.push("/city");
  }

  const skip = () => dismiss(false);

  const next = () => {
    if (step >= CARDS.length - 1) {
      dismiss(true);
      return;
    }
    setStep((s) => s + 1);
  };

  if (!mounted) return null;

  const key = CARDS[step];
  const last = step === CARDS.length - 1;
  const headingId = "onboarding-heading";

  const overlay = (
    <div
      role="presentation"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          skip();
          return;
        }
        trapTab(e, cardRef.current);
      }}
      onMouseDown={(e) => {
        // Click on the dim scrim (outside the card) = skip.
        if (e.target === e.currentTarget) skip();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 90,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        overflowY: "auto",
        background: "rgba(11,10,8,0.86)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
      }}
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        tabIndex={-1}
        style={{
          position: "relative",
          overflow: "hidden",
          width: "100%",
          maxWidth: 620,
          margin: "auto",
          background: "linear-gradient(168deg, rgba(255,106,61,0.09), var(--surface) 46%)",
          border: "1px solid var(--hair)",
          borderRadius: "var(--radius)",
          boxShadow: "0 30px 90px rgba(0,0,0,0.6)",
          outline: "none",
        }}
      >
        {/* The same firelit glow the login screen and the Mini App welcome use. */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: -120,
            left: "50%",
            transform: "translateX(-50%)",
            width: 460,
            height: 460,
            pointerEvents: "none",
            background:
              "radial-gradient(circle, rgba(255,106,61,0.20) 0%, rgba(232,161,92,0.09) 42%, transparent 72%)",
          }}
        />

        <div
          style={{
            position: "relative",
            zIndex: 1,
            padding: "clamp(24px, 3.6vw, 36px) clamp(26px, 4vw, 44px) 0",
          }}
        >
          {/* Mark + a persistent Skip: every step has a way out. */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              marginBottom: "clamp(26px, 3.4vw, 40px)",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={asset("/bfu-mark.png")}
              alt="BFU"
              width={30}
              height={30}
              style={{
                width: 30,
                height: 30,
                objectFit: "contain",
                filter: "drop-shadow(0 8px 24px rgba(232,161,92,0.35))",
              }}
            />
            <button
              type="button"
              onClick={skip}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "6px 2px",
                fontFamily: "var(--font-mono)",
                fontSize: 11.5,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--muted-strong)",
              }}
            >
              {t("onb.skip")}
            </button>
          </div>

          {/* The card. `key` re-runs the rise on every step change. It animates
              TRANSFORM only (ch-rise ends at opacity:1, and we start at 1) — the
              copy is never invisible, even for a frame. */}
          <div
            key={key}
            style={{
              minHeight: 210,
              transform: "translateY(10px)",
              animation: "ch-rise 0.45s forwards",
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: "var(--amber)",
              }}
            >
              {`0${step + 1} / 0${CARDS.length}`}
            </div>
            <h2
              id={headingId}
              style={{
                margin: "16px 0 0",
                fontFamily: "var(--font-display)",
                fontWeight: 800,
                fontSize: "clamp(27px, 3.4vw, 38px)",
                lineHeight: 1.1,
                letterSpacing: "-0.02em",
                color: "var(--text)",
                maxWidth: 520,
              }}
            >
              {t(`onb.${key}.title`)}
            </h2>
            <p
              style={{
                margin: "18px 0 0",
                fontSize: 16.5,
                lineHeight: 1.62,
                color: "var(--muted-strong)",
                maxWidth: 480,
              }}
            >
              {t(`onb.${key}.body`)}
            </p>
          </div>
        </div>

        {/* Dots + the one action. Skip stays reachable in the header. */}
        <div
          style={{
            position: "relative",
            zIndex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
            marginTop: "clamp(24px, 3vw, 34px)",
            padding: "20px clamp(26px, 4vw, 44px) clamp(22px, 3vw, 30px)",
            borderTop: "1px solid var(--hair)",
          }}
        >
          <div style={{ display: "flex", gap: 7 }} aria-hidden>
            {CARDS.map((_, i) => (
              <span
                key={i}
                style={{
                  width: i === step ? 26 : 8,
                  height: 8,
                  borderRadius: 99,
                  background:
                    i === step
                      ? "linear-gradient(90deg, var(--amber), var(--ember))"
                      : "var(--hair)",
                  transition: "width 0.28s ease, background 0.28s ease",
                }}
              />
            ))}
          </div>
          <button type="button" className="ch-btn-primary" onClick={next}>
            {last ? t("onb.start") : t("onb.next")}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}

// ═══ Behind FLAGS.SETUP_WIZARD: the original 4-step setup wizard ══════════════
// UNCHANGED and fully working — hidden, not removed. Four skippable steps:
//   1. Welcome + region  → PATCH /users/me { region_id }
//   2. Your bio          → POST /users/me/coach (same as ProfileEditor) + PATCH /users/me { about }
//   3. Discover builders → GET /users/discover + POST/DELETE /follow
//   4. Start a project   → /projects/new (optional)
// Finish / "Skip for now" / Esc → POST /users/me/onboarding-complete, then hide.
//
// Reuses the exact endpoints the profile editor + people surfaces already use;
// the backend addition is only the onboarding flag + complete endpoint.

const TOTAL_STEPS = 4;

// Region <select> chrome copied from ProfileEditor so the dropdown reads the same
// firelit way (custom chevron, dark color-scheme).
const inputBase = {
  width: "100%",
  background: "var(--surface-2)",
  border: "1px solid var(--hair)",
  borderRadius: "var(--radius-sm)",
  color: "var(--text)",
  fontFamily: "var(--font-body)",
  fontSize: 15,
  padding: "12px 14px",
};

const selectStyle = {
  ...inputBase,
  cursor: "pointer",
  appearance: "none",
  WebkitAppearance: "none",
  MozAppearance: "none",
  colorScheme: "dark",
  paddingRight: 40,
  backgroundImage:
    "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'><path d='M1 1l5 5 5-5' fill='none' stroke='%23C6BEAF' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/></svg>\")",
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 14px center",
};

const labelHint = {
  display: "block",
  marginBottom: 8,
  fontSize: 13,
  color: "var(--muted-strong)",
};

function SetupWizard({ me = {}, firstName = "builder", onClose }) {
  const router = useRouter();
  const t = useT();

  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false); // Next/save in flight
  const [stepError, setStepError] = useState("");

  // Step 1 — region.
  const [regionId, setRegionId] = useState(me.region_id != null ? String(me.region_id) : "");
  const [regions, setRegions] = useState(null); // null = loading
  const regionBaseline = useRef(me.region_id != null ? String(me.region_id) : "");

  // Step 2 — bio + AI coach.
  const [about, setAbout] = useState(me.about || "");
  const aboutBaseline = useRef(me.about || "");
  const [coachBusy, setCoachBusy] = useState(false);
  const [coachSuggestion, setCoachSuggestion] = useState("");
  const [coachError, setCoachError] = useState("");

  // Step 3 — discover builders.
  const [builders, setBuilders] = useState(null); // null = not-loaded, [] = none
  const [followed, setFollowed] = useState(() => new Set());
  const [followBusy, setFollowBusy] = useState(() => new Set());

  const cardRef = useRef(null);
  const finishedRef = useRef(false);

  // Portal only after mount (needs document; also avoids any SSR mismatch).
  useEffect(() => setMounted(true), []);

  // Lock background scroll while the overlay is open.
  useLockedScroll();

  // Fetch regions once (authed — same list the profile editor uses).
  useEffect(() => {
    let alive = true;
    bfu("/regions")
      .then((list) => alive && setRegions(Array.isArray(list) ? list : []))
      .catch(() => alive && setRegions([]));
    return () => {
      alive = false;
    };
  }, []);

  // Lazy-load a few builders when the discover step first opens.
  useEffect(() => {
    if (step !== 2 || builders !== null) return;
    let alive = true;
    bfu("/users/discover", { params: { limit: 6 } })
      .then((list) => alive && setBuilders((Array.isArray(list) ? list : []).slice(0, 5)))
      .catch(() => alive && setBuilders([]));
    return () => {
      alive = false;
    };
  }, [step, builders]);

  // Move focus into the dialog on open so keyboard + screen-reader users land here.
  useEffect(() => {
    if (mounted && cardRef.current) cardRef.current.focus();
  }, [mounted]);

  // ── finish / skip ──────────────────────────────────────────────────────────
  async function finish() {
    if (finishedRef.current) return;
    finishedRef.current = true;
    onClose?.(); // optimistic — hide immediately
    try {
      await bfu("/users/me/onboarding-complete", { method: "POST" });
    } catch {
      /* idempotent + re-shown only if it truly never persisted — safe to ignore */
    }
  }

  async function startProject() {
    if (finishedRef.current) return;
    finishedRef.current = true;
    try {
      await bfu("/users/me/onboarding-complete", { method: "POST" });
    } catch {
      /* still navigate — the flag can be set again on next load */
    }
    router.push("/projects/new");
  }

  // ── per-step saves (reuse PATCH /users/me) ─────────────────────────────────
  async function saveRegion() {
    if (regionId === regionBaseline.current) return true;
    try {
      await bfu("/users/me", {
        method: "PATCH",
        body: { region_id: regionId === "" ? null : Number(regionId) },
      });
      regionBaseline.current = regionId;
      return true;
    } catch (e) {
      setStepError(e?.message || t("onboarding.error.region"));
      return false;
    }
  }

  async function saveBio() {
    if (about === aboutBaseline.current) return true;
    try {
      await bfu("/users/me", { method: "PATCH", body: { about } });
      aboutBaseline.current = about;
      return true;
    } catch (e) {
      setStepError(e?.message || t("onboarding.error.bio"));
      return false;
    }
  }

  // ── navigation ─────────────────────────────────────────────────────────────
  async function next() {
    if (busy) return;
    setStepError("");
    if (step === 3) return finish();
    setBusy(true);
    try {
      let ok = true;
      if (step === 0) ok = await saveRegion();
      else if (step === 1) ok = await saveBio();
      if (ok) setStep((s) => Math.min(TOTAL_STEPS - 1, s + 1));
    } finally {
      setBusy(false);
    }
  }

  function back() {
    if (busy) return;
    setStepError("");
    setStep((s) => Math.max(0, s - 1));
  }

  // ── AI bio coach (same mechanism as ProfileEditor) ─────────────────────────
  async function runCoach() {
    setCoachError("");
    setCoachSuggestion("");
    const text = about.trim();
    if (!text) {
      setCoachError(t("onboarding.coach.needFirstLine"));
      return;
    }
    setCoachBusy(true);
    try {
      const res = await bfu("/users/me/coach", { method: "POST", body: { kind: "bio", text } });
      setCoachSuggestion(res?.improved || "");
      if (!res?.improved) setCoachError(t("onboarding.coach.nothingToAdd"));
    } catch (e) {
      setCoachError(e?.message || t("onboarding.coach.resting"));
    } finally {
      setCoachBusy(false);
    }
  }

  function applyCoach() {
    if (!coachSuggestion) return;
    setAbout(coachSuggestion.slice(0, 600));
    setCoachSuggestion("");
  }

  // ── follow toggle (same endpoint as PersonActions) ─────────────────────────
  async function toggleFollow(id) {
    if (followBusy.has(id)) return;
    const isFollowing = followed.has(id);
    setFollowBusy((s) => new Set(s).add(id));
    setFollowed((s) => {
      const n = new Set(s);
      isFollowing ? n.delete(id) : n.add(id);
      return n;
    });
    try {
      await bfu("/follow", {
        method: isFollowing ? "DELETE" : "POST",
        body: { target_type: "user", target_id: id },
      });
    } catch {
      // roll back
      setFollowed((s) => {
        const n = new Set(s);
        isFollowing ? n.add(id) : n.delete(id);
        return n;
      });
    } finally {
      setFollowBusy((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
    }
  }

  // ── focus trap + Esc ───────────────────────────────────────────────────────
  function onKeyDown(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      finish();
      return;
    }
    trapTab(e, cardRef.current);
  }

  if (!mounted) return null;

  const headingId = "onboarding-heading";
  const isLast = step === 3;

  const overlay = (
    <div
      role="presentation"
      onKeyDown={onKeyDown}
      onMouseDown={(e) => {
        // Click on the dim scrim (outside the card) = skip.
        if (e.target === e.currentTarget) finish();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 90,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        overflowY: "auto",
        background: "rgba(11,10,8,0.82)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
      }}
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        tabIndex={-1}
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 540,
          margin: "auto",
          background:
            "linear-gradient(168deg, rgba(255,106,61,0.09), var(--surface) 46%)",
          border: "1px solid var(--hair)",
          borderRadius: "var(--radius)",
          padding: "clamp(22px, 4vw, 34px)",
          boxShadow: "0 30px 90px rgba(0,0,0,0.6)",
          outline: "none",
        }}
      >
        {/* Top bar: progress dots + skip */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 24,
          }}
        >
          <div style={{ display: "flex", gap: 7 }} aria-hidden>
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
              <span
                key={i}
                style={{
                  width: i === step ? 22 : 8,
                  height: 8,
                  borderRadius: 99,
                  background: i <= step ? "var(--amber)" : "var(--hair)",
                  transition: "width 0.25s ease, background 0.25s ease",
                }}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={finish}
            style={{
              background: "none",
              border: "none",
              color: "var(--muted-strong)",
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              letterSpacing: "0.04em",
              cursor: "pointer",
              padding: "4px 2px",
            }}
          >
            {t("onboarding.skip")}
          </button>
        </div>

        {/* Step body */}
        {step === 0 && (
          <Step
            eyebrow={t("onboarding.step1.eyebrow")}
            headingId={headingId}
            title={
              <>
                {t("onboarding.step1.titlePrefix")}{" "}
                <span
                  style={{
                    fontFamily: "var(--font-accent)",
                    fontStyle: "italic",
                    fontWeight: 400,
                    color: "var(--amber)",
                  }}
                >
                  {firstName}
                </span>
              </>
            }
            intent={t("onboarding.step1.intent")}
          >
            <label style={{ display: "block" }}>
              <span style={labelHint}>{t("onboarding.step1.regionLabel")}</span>
              <select
                value={regionId}
                onChange={(e) => setRegionId(e.target.value)}
                aria-label={t("onboarding.step1.regionAria")}
                disabled={regions === null}
                style={selectStyle}
              >
                <option value="">
                  {regions === null ? t("onboarding.step1.loadingRegions") : t("onboarding.step1.selectRegion")}
                </option>
                {(regions || []).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name_en || r.name_uz || r.name_ru || `Region ${r.id}`}
                  </option>
                ))}
              </select>
            </label>
          </Step>
        )}

        {step === 1 && (
          <Step
            eyebrow={t("onboarding.step2.eyebrow")}
            headingId={headingId}
            title={t("onboarding.step2.title")}
            intent={t("onboarding.step2.intent")}
          >
            <label style={{ display: "block" }}>
              <span style={labelHint}>{t("onboarding.step2.aboutLabel")}</span>
              <textarea
                value={about}
                onChange={(e) => setAbout(e.target.value.slice(0, 600))}
                rows={5}
                maxLength={600}
                placeholder={t("onboarding.step2.aboutPlaceholder")}
                style={{ ...inputBase, resize: "vertical", lineHeight: 1.55, minHeight: 120 }}
              />
              <span
                style={{
                  display: "block",
                  marginTop: 6,
                  textAlign: "right",
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  color: about.length > 560 ? "var(--amber)" : "var(--muted-strong)",
                }}
              >
                {about.length}/600
              </span>
            </label>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
              <button
                type="button"
                className="ch-btn-ghost"
                onClick={runCoach}
                disabled={coachBusy}
                style={{ opacity: coachBusy ? 0.6 : 1 }}
              >
                <span style={{ color: "var(--amber)" }} aria-hidden>
                  ✦
                </span>
                {coachBusy ? t("onboarding.step2.polishing") : t("onboarding.step2.polish")}
              </button>
              <span style={{ fontSize: 13, color: "var(--muted-strong)" }}>
                {t("onboarding.step2.coachHint")}
              </span>
            </div>

            {coachError ? (
              <div style={{ fontSize: 13, color: "var(--terra)" }}>{coachError}</div>
            ) : null}
            {coachSuggestion ? (
              <div
                style={{
                  border: "1px solid rgba(232,161,92,0.35)",
                  background: "rgba(232,161,92,0.07)",
                  borderRadius: "var(--radius-sm)",
                  padding: 14,
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                <div className="ch-cell-label" style={{ color: "var(--amber)" }}>
                  {t("onboarding.step2.coachSuggestion")}
                </div>
                <div style={{ fontSize: 14.5, lineHeight: 1.6, color: "var(--text)" }}>
                  {coachSuggestion}
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button type="button" className="ch-btn-primary" onClick={applyCoach}>
                    {t("onboarding.step2.useThis")}
                  </button>
                  <button
                    type="button"
                    className="ch-btn-ghost"
                    onClick={() => setCoachSuggestion("")}
                  >
                    {t("onboarding.step2.dismiss")}
                  </button>
                </div>
              </div>
            ) : null}

            {!me.photo_url ? (
              <div
                style={{
                  fontSize: 12.5,
                  color: "var(--muted-strong)",
                  fontStyle: "italic",
                  fontFamily: "var(--font-accent)",
                }}
              >
                {t("onboarding.step2.photoNote")}
              </div>
            ) : null}
          </Step>
        )}

        {step === 2 && (
          <Step
            eyebrow={t("onboarding.step3.eyebrow")}
            headingId={headingId}
            title={t("onboarding.step3.title")}
            intent={t("onboarding.step3.intent")}
          >
            {builders === null ? (
              <div style={{ color: "var(--muted-strong)", fontSize: 14, padding: "8px 0" }}>
                <span className="ch-spin" aria-hidden style={{ marginRight: 8 }}>
                  ◠
                </span>
                {t("onboarding.step3.gathering")}
              </div>
            ) : builders.length === 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <p style={{ margin: 0, fontSize: 14, color: "var(--muted-strong)", lineHeight: 1.5 }}>
                  {t("onboarding.step3.emptyBody")}
                </p>
                <a
                  href="/web/city"
                  className="ch-btn-primary"
                  onClick={() => finish()}
                  style={{ alignSelf: "flex-start" }}
                >
                  {t("onboarding.step3.wander")}
                </a>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {builders.map((b) => {
                  const following = followed.has(b.id);
                  const name = b.display_name || b.name || t("onboarding.step3.builderFallback");
                  const tagline =
                    b.currently_building ||
                    (b.analysis?.skills || []).slice(0, 2).join(" · ") ||
                    t("onboarding.step3.newInCity");
                  return (
                    <div
                      key={b.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "10px 12px",
                        borderRadius: "var(--radius-sm)",
                        background: "var(--surface-2)",
                        border: "1px solid var(--hair)",
                      }}
                    >
                      <span
                        aria-hidden
                        style={{
                          flex: "0 0 auto",
                          width: 42,
                          height: 42,
                          borderRadius: "50%",
                          overflow: "hidden",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          background: gradientFor(b.id),
                          color: "#160E08",
                          fontFamily: "var(--font-display)",
                          fontWeight: 700,
                          fontSize: 15,
                        }}
                      >
                        {b.photo_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={b.photo_url}
                            alt=""
                            width={42}
                            height={42}
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          />
                        ) : (
                          initials(name)
                        )}
                      </span>
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <span
                          style={{
                            display: "block",
                            fontWeight: 600,
                            fontSize: 14.5,
                            color: "var(--text)",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {name}
                        </span>
                        <span
                          style={{
                            display: "block",
                            fontSize: 12.5,
                            color: "var(--muted-strong)",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {tagline}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleFollow(b.id)}
                        disabled={followBusy.has(b.id)}
                        aria-pressed={following}
                        aria-label={following ? t("onboarding.step3.followingAria", { name }) : t("onboarding.step3.followAria", { name })}
                        style={{
                          flex: "0 0 auto",
                          padding: "8px 14px",
                          borderRadius: "var(--radius-pill)",
                          fontFamily: "var(--font-body)",
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: "pointer",
                          transition: "all 0.16s ease",
                          background: following ? "rgba(127,176,105,0.1)" : "var(--surface)",
                          border: `1px solid ${following ? "rgba(127,176,105,0.4)" : "var(--hair)"}`,
                          color: following ? "var(--green)" : "var(--text)",
                          opacity: followBusy.has(b.id) ? 0.6 : 1,
                        }}
                      >
                        {following ? t("onboarding.step3.following") : t("onboarding.step3.follow")}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </Step>
        )}

        {step === 3 && (
          <Step
            eyebrow={t("onboarding.step4.eyebrow")}
            headingId={headingId}
            title={t("onboarding.step4.title")}
            intent={t("onboarding.step4.intent")}
          >
            <button
              type="button"
              className="ch-btn-primary"
              onClick={startProject}
              style={{ width: "100%", justifyContent: "center", padding: "13px 20px" }}
            >
              {t("onboarding.step4.startProject")}
            </button>
          </Step>
        )}

        {stepError ? (
          <div style={{ marginTop: 14, fontSize: 13, color: "var(--terra)" }}>{stepError}</div>
        ) : null}

        {/* Footer nav */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginTop: 26,
          }}
        >
          {step > 0 ? (
            <button
              type="button"
              className="ch-btn-ghost"
              onClick={back}
              disabled={busy}
              style={{ opacity: busy ? 0.6 : 1 }}
            >
              {t("onboarding.nav.back")}
            </button>
          ) : (
            <span />
          )}

          <button
            type="button"
            className={isLast ? "ch-btn-ghost" : "ch-btn-primary"}
            onClick={next}
            disabled={busy}
            style={{ opacity: busy ? 0.7 : 1 }}
          >
            {busy ? (
              <>
                <span className="ch-spin" aria-hidden>
                  ◠
                </span>{" "}
                {t("onboarding.nav.saving")}
              </>
            ) : isLast ? (
              t("onboarding.nav.finish")
            ) : (
              t("onboarding.nav.next")
            )}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}

// Shared step scaffold: eyebrow + heading + intent line + content stack.
function Step({ eyebrow, headingId, title, intent, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "var(--amber)",
          }}
        >
          {eyebrow}
        </div>
        <h2
          id={headingId}
          style={{
            margin: "12px 0 0",
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: "clamp(26px, 5vw, 34px)",
            lineHeight: 1.08,
            letterSpacing: "-0.02em",
            color: "var(--text)",
          }}
        >
          {title}
        </h2>
        {intent ? (
          <p
            style={{
              margin: "12px 0 0",
              fontSize: 15,
              lineHeight: 1.5,
              color: "var(--muted-strong)",
              maxWidth: 440,
            }}
          >
            {intent}
          </p>
        ) : null}
      </div>
      {children}
    </div>
  );
}
