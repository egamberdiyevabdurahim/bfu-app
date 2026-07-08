"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { bfu } from "@/lib/client-api";
import { gradientFor, initials } from "@/lib/avatar";

// First-login welcome flow for a brand-new builder. Mounted by OnboardingGate on
// /home only while me.onboarding_completed === false. Four skippable steps:
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

export default function OnboardingFlow({ me = {}, firstName = "builder", onClose }) {
  const router = useRouter();

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
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

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
      setStepError(e?.message || "Couldn't save your region — try again, or skip.");
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
      setStepError(e?.message || "Couldn't save your bio — try again, or skip.");
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
      setCoachError("Write a first line, then let the coach polish it.");
      return;
    }
    setCoachBusy(true);
    try {
      const res = await bfu("/users/me/coach", { method: "POST", body: { kind: "bio", text } });
      setCoachSuggestion(res?.improved || "");
      if (!res?.improved) setCoachError("The coach had nothing to add — it reads well.");
    } catch (e) {
      setCoachError(e?.message || "The coach is resting. Try again in a moment.");
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
    if (e.key !== "Tab") return;
    const root = cardRef.current;
    if (!root) return;
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
            Skip for now
          </button>
        </div>

        {/* Step body */}
        {step === 0 && (
          <Step
            eyebrow="Welcome to the city"
            headingId={headingId}
            title={
              <>
                Welcome to the city,{" "}
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
            intent="Let's light your corner of the bazaar — four quick steps, and you can skip any of them."
          >
            <label style={{ display: "block" }}>
              <span style={labelHint}>Where in Uzbekistan are you building?</span>
              <select
                value={regionId}
                onChange={(e) => setRegionId(e.target.value)}
                aria-label="Your region"
                disabled={regions === null}
                style={selectStyle}
              >
                <option value="">
                  {regions === null ? "Loading regions…" : "— Select your region —"}
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
            eyebrow="Your story"
            headingId={headingId}
            title="Say who you are"
            intent="A line or two the city reads first — and what the AI reads to place you. You can change it anytime."
          >
            <label style={{ display: "block" }}>
              <span style={labelHint}>About you</span>
              <textarea
                value={about}
                onChange={(e) => setAbout(e.target.value.slice(0, 600))}
                rows={5}
                maxLength={600}
                placeholder="What you're building, what you care about, what you're good at…"
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
                {coachBusy ? "Polishing…" : "Polish with AI"}
              </button>
              <span style={{ fontSize: 13, color: "var(--muted-strong)" }}>
                The coach tightens your draft — you decide whether to keep it.
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
                  Coach suggestion
                </div>
                <div style={{ fontSize: 14.5, lineHeight: 1.6, color: "var(--text)" }}>
                  {coachSuggestion}
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button type="button" className="ch-btn-primary" onClick={applyCoach}>
                    Use this
                  </button>
                  <button
                    type="button"
                    className="ch-btn-ghost"
                    onClick={() => setCoachSuggestion("")}
                  >
                    Dismiss
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
                Your Telegram photo will appear on your card automatically — nothing to upload.
              </div>
            ) : null}
          </Step>
        )}

        {step === 2 && (
          <Step
            eyebrow="Find your people"
            headingId={headingId}
            title="Follow a few builders"
            intent="Start your feed with people already at work across the city."
          >
            {builders === null ? (
              <div style={{ color: "var(--muted-strong)", fontSize: 14, padding: "8px 0" }}>
                <span className="ch-spin" aria-hidden style={{ marginRight: 8 }}>
                  ◠
                </span>
                Gathering builders…
              </div>
            ) : builders.length === 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <p style={{ margin: 0, fontSize: 14, color: "var(--muted-strong)", lineHeight: 1.5 }}>
                  The city's still waking up. Wander in and meet people as they arrive.
                </p>
                <a
                  href="/city"
                  className="ch-btn-primary"
                  onClick={() => finish()}
                  style={{ alignSelf: "flex-start" }}
                >
                  Wander the city →
                </a>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {builders.map((b) => {
                  const following = followed.has(b.id);
                  const name = b.display_name || b.name || "Builder";
                  const tagline =
                    b.currently_building ||
                    (b.analysis?.skills || []).slice(0, 2).join(" · ") ||
                    "New in the city";
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
                        aria-label={following ? `Following ${name}` : `Follow ${name}`}
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
                        {following ? "✓ Following" : "+ Follow"}
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
            eyebrow="Optional"
            headingId={headingId}
            title="Rally a team around your idea"
            intent="Building something? Post it, and let the city help you make it real. No rush — you can start whenever."
          >
            <button
              type="button"
              className="ch-btn-primary"
              onClick={startProject}
              style={{ width: "100%", justifyContent: "center", padding: "13px 20px" }}
            >
              Start a project →
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
              ← Back
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
                Saving…
              </>
            ) : isLast ? (
              "Finish"
            ) : (
              "Next →"
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
