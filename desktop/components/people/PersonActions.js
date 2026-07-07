"use client";

import { useEffect, useState } from "react";
import { bfu } from "@/lib/client-api";

// Additive client island mounted on the public /u/[id] profile page. The SSR
// content (identity strip, bento cells) stays intact and public; this island
// calls the AUTHED GET /users/{id} on mount (plus /users/me to detect self) to
// learn the viewer's relationship to this person, then renders the People &
// Trust controls (Batch 3):
//
//   • viewing your OWN profile        → "Edit profile" → /settings
//   • not logged in (bfu throws 401)  → "Log in to connect" → /login
//   • else                            → Follow toggle, I'm interested, Request
//                                        intro, per-skill endorse, vouch
//                                        composer, and the AI trio.
//
// Verbs/fields confirmed against backend/app/routers/users.py:
//   authed profile: GET /users/{id}
//       → {id, is_following, endorsements:[{skill,count,endorsed_by_me}],
//          vouches:[{id,text,author:{id,display_name,photo_url},created_at}],
//          follower_count, following_count, mentor, analysis:{skills:[...]}, ...}
//   follow:   POST /follow {target_type:"user",target_id}  → {following,follower_count}
//   unfollow: DELETE /follow {target_type:"user",target_id} → 204
//   interest: POST /users/{id}/interest                     → {ok,mutual}   (24h cooldown → 429)
//   intro:    POST /users/{id}/intro                        → {ok,has_username} (30s cooldown → 429)
//   endorse:  POST /users/{id}/endorse {skill}  (TOGGLE)    → {ok,endorsed,count}
//   vouch:    POST /users/{id}/vouch {text}                 → {ok,id}
//   un-vouch: DELETE /users/{id}/vouch                      → 204
//   report:   POST /users/reports {target_type,target_id,reason}
//   why-match:   GET /users/{id}/why-match?lang=  → {reason, shared:[...]}
//   icebreakers: GET /users/{id}/icebreakers?lang= → {icebreakers:[...]}
//   translate:   GET /users/{id}/bio/translate?lang= → {translated, cached}

const card = {
  borderRadius: "var(--radius)",
  border: "1px solid var(--hair)",
  background: "var(--surface)",
  padding: 22,
};

const ghostBtn = {
  padding: "12px 16px",
  borderRadius: "var(--radius-sm)",
  background: "var(--surface-2)",
  border: "1px solid var(--hair)",
  color: "var(--text)",
  fontFamily: "var(--font-body)",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  transition: "border-color 0.18s ease, background 0.18s ease",
};

// A tiny transient toast, mirroring the .ch-toast styling used across the app.
function Toast({ msg, tone }) {
  if (!msg) return null;
  const border =
    tone === "error" ? "rgba(192,86,59,0.5)" : "rgba(255,106,61,0.4)";
  const accent = tone === "error" ? "var(--terra)" : "var(--ember)";
  return (
    <div
      className="ch-toast ch-toast-show"
      style={{ border: `1px solid ${border}` }}
      aria-live="polite"
    >
      <span className="ch-toast-tx" style={{ color: "var(--text)" }}>
        <b style={{ color: accent }}>{msg}</b>
      </span>
    </div>
  );
}

export default function PersonActions({ userId, personName, aboutText, lang = "en" }) {
  const [state, setState] = useState("loading"); // loading | anon | self | ready | error
  const [me, setMe] = useState(null);
  const [profile, setProfile] = useState(null);

  const [busy, setBusy] = useState(false); // follow/interest/intro shared lock
  const [toast, setToast] = useState(null); // { msg, tone }

  // Report
  const [showReport, setShowReport] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reported, setReported] = useState(false);

  // Vouch composer
  const [vouchText, setVouchText] = useState("");
  const [vouchBusy, setVouchBusy] = useState(false);
  const [myVouch, setMyVouch] = useState(null); // { id, text } when I've vouched

  // AI trio
  const [ai, setAi] = useState({}); // { whymatch|icebreak|translate: { loading, error, data } }
  const [copied, setCopied] = useState(-1);

  function flash(msg, tone) {
    setToast({ msg, tone });
    setTimeout(() => setToast(null), 3200);
  }

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const [p, meRes] = await Promise.all([
          bfu(`/users/${userId}`),
          bfu("/users/me").catch(() => null),
        ]);
        if (!alive) return;
        setProfile(p);
        setMe(meRes);
        // Detect my own vouch on this person (author.id === me.id).
        if (meRes && Array.isArray(p?.vouches)) {
          const mine = p.vouches.find((v) => v.author && v.author.id === meRes.id);
          if (mine) setMyVouch({ id: mine.id, text: mine.text });
        }
        if (meRes && meRes.id === Number(userId)) setState("self");
        else setState("ready");
      } catch (e) {
        if (!alive) return;
        if (e?.status === 401) setState("anon");
        else setState("error");
      }
    }
    load();
    return () => {
      alive = false;
    };
  }, [userId]);

  // ── Follow (optimistic toggle) ────────────────────────────────────────────
  async function toggleFollow() {
    if (busy || !profile) return;
    setBusy(true);
    const wasFollowing = profile.is_following;
    // Optimistic
    setProfile((p) => ({
      ...p,
      is_following: !wasFollowing,
      follower_count: Math.max(0, (p.follower_count || 0) + (wasFollowing ? -1 : 1)),
    }));
    try {
      if (wasFollowing) {
        await bfu("/follow", {
          method: "DELETE",
          body: { target_type: "user", target_id: Number(userId) },
        });
      } else {
        const r = await bfu("/follow", {
          method: "POST",
          body: { target_type: "user", target_id: Number(userId) },
        });
        // Reconcile the authoritative follower count from the server.
        if (r && typeof r.follower_count === "number") {
          setProfile((p) => ({ ...p, follower_count: r.follower_count }));
        }
      }
    } catch (e) {
      // Roll back on failure.
      setProfile((p) => ({
        ...p,
        is_following: wasFollowing,
        follower_count: Math.max(0, (p.follower_count || 0) + (wasFollowing ? 1 : -1)),
      }));
      flash(e?.message || "Couldn't update follow.", "error");
    } finally {
      setBusy(false);
    }
  }

  // ── Interest (soft ping) ──────────────────────────────────────────────────
  async function express() {
    if (busy) return;
    setBusy(true);
    try {
      const r = await bfu(`/users/${userId}/interest`, { method: "POST" });
      flash(r?.mutual ? "It's a match! 🎉 Say hi 👋" : "Interest sent 💜");
    } catch (e) {
      flash(e?.status === 429 ? "Already pinged in the last 24h." : (e?.message || "Couldn't send interest."), "error");
    } finally {
      setBusy(false);
    }
  }

  // ── Request intro ─────────────────────────────────────────────────────────
  async function requestIntro() {
    if (busy) return;
    setBusy(true);
    try {
      await bfu(`/users/${userId}/intro`, { method: "POST" });
      flash("Intro request sent 👋");
    } catch (e) {
      flash(e?.status === 429 ? "Please wait before sending another intro." : (e?.message || "Couldn't request an intro."), "error");
    } finally {
      setBusy(false);
    }
  }

  // ── Endorse a skill (optimistic toggle) ───────────────────────────────────
  async function toggleEndorse(skill) {
    // Optimistic on the endorsements list.
    setProfile((p) => {
      const list = Array.isArray(p.endorsements) ? [...p.endorsements] : [];
      const idx = list.findIndex((e) => e.skill === skill);
      if (idx >= 0) {
        const e = list[idx];
        const nextMine = !e.endorsed_by_me;
        list[idx] = {
          ...e,
          endorsed_by_me: nextMine,
          count: Math.max(0, (e.count || 0) + (nextMine ? 1 : -1)),
        };
      } else {
        list.push({ skill, count: 1, endorsed_by_me: true });
      }
      return { ...p, endorsements: list };
    });
    try {
      const r = await bfu(`/users/${userId}/endorse`, {
        method: "POST",
        body: { skill },
      });
      // Reconcile with the server's authoritative count + state.
      setProfile((p) => {
        const list = Array.isArray(p.endorsements) ? [...p.endorsements] : [];
        const idx = list.findIndex((e) => e.skill === skill);
        const next = { skill, count: r?.count ?? 0, endorsed_by_me: !!r?.endorsed };
        if (idx >= 0) list[idx] = next;
        else list.push(next);
        return { ...p, endorsements: list };
      });
    } catch (e) {
      // Roll back by re-toggling.
      setProfile((p) => {
        const list = Array.isArray(p.endorsements) ? [...p.endorsements] : [];
        const idx = list.findIndex((x) => x.skill === skill);
        if (idx >= 0) {
          const cur = list[idx];
          const revertMine = !cur.endorsed_by_me;
          list[idx] = {
            ...cur,
            endorsed_by_me: revertMine,
            count: Math.max(0, (cur.count || 0) + (revertMine ? 1 : -1)),
          };
        }
        return { ...p, endorsements: list };
      });
      flash(e?.message || "Couldn't endorse.", "error");
    }
  }

  // ── Vouch ─────────────────────────────────────────────────────────────────
  async function submitVouch() {
    const text = vouchText.trim();
    if (!text || vouchBusy) return;
    setVouchBusy(true);
    try {
      const r = await bfu(`/users/${userId}/vouch`, {
        method: "POST",
        body: { text },
      });
      setMyVouch({ id: r?.id, text });
      setVouchText("");
      flash("Vouch posted 🤝");
    } catch (e) {
      flash(e?.message || "Couldn't post your vouch.", "error");
    } finally {
      setVouchBusy(false);
    }
  }

  async function removeVouch() {
    if (vouchBusy) return;
    setVouchBusy(true);
    try {
      await bfu(`/users/${userId}/vouch`, { method: "DELETE" });
      setMyVouch(null);
      flash("Vouch removed.");
    } catch (e) {
      flash(e?.message || "Couldn't remove your vouch.", "error");
    } finally {
      setVouchBusy(false);
    }
  }

  // ── Report ────────────────────────────────────────────────────────────────
  async function submitReport() {
    try {
      await bfu("/users/reports", {
        method: "POST",
        body: {
          target_type: "user",
          target_id: Number(userId),
          reason: reportReason.trim() || null,
        },
      });
      setReported(true);
      setShowReport(false);
      setReportReason("");
      flash("Report sent. Thank you.");
    } catch (e) {
      flash(e?.message || "Couldn't send the report.", "error");
    }
  }

  // ── AI trio ───────────────────────────────────────────────────────────────
  async function runAi(kind) {
    setAi((s) => ({ ...s, [kind]: { loading: true, error: null, data: null } }));
    try {
      let path;
      if (kind === "whymatch") path = `/users/${userId}/why-match`;
      else if (kind === "icebreak") path = `/users/${userId}/icebreakers`;
      else path = `/users/${userId}/bio/translate`;
      const data = await bfu(path, { params: { lang } });
      setAi((s) => ({ ...s, [kind]: { loading: false, error: null, data } }));
    } catch (e) {
      const msg = e?.status === 429 ? "Please wait a moment, then try again." : (e?.message || "Couldn't reach the AI.");
      setAi((s) => ({ ...s, [kind]: { loading: false, error: msg, data: null } }));
    }
  }

  async function copyLine(text, idx) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(idx);
      setTimeout(() => setCopied(-1), 1400);
    } catch {
      /* clipboard blocked — no-op */
    }
  }

  // ── render ────────────────────────────────────────────────────────────────

  if (state === "loading") {
    return (
      <div style={{ ...card, color: "var(--muted)", fontSize: 14, textAlign: "center" }}>
        <span className="ch-spin" aria-hidden style={{ marginRight: 8 }}>◠</span>
        Loading…
      </div>
    );
  }

  if (state === "self") {
    return (
      <div style={{ ...card, display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="ch-cell-label">This is you</div>
        <p style={{ margin: 0, fontSize: 14, color: "var(--muted)", lineHeight: 1.55 }}>
          This is how the city sees your page. Keep it warm and current.
        </p>
        <a href="/settings" className="ch-btn-primary" style={{ justifyContent: "center" }}>
          Edit profile <span style={{ fontSize: 14 }}>→</span>
        </a>
      </div>
    );
  }

  if (state === "anon") {
    return (
      <div style={{ ...card, display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="ch-cell-label">Want to connect?</div>
        <p style={{ margin: 0, fontSize: 14, color: "var(--muted)", lineHeight: 1.55 }}>
          Log in with Telegram to follow {personName || "this builder"}, endorse
          their skills, and say hello.
        </p>
        <a href="/login" className="ch-btn-primary" style={{ justifyContent: "center" }}>
          Log in to connect <span style={{ fontSize: 14 }}>→</span>
        </a>
      </div>
    );
  }

  if (state === "error" || !profile) {
    return (
      <div style={{ ...card, color: "var(--terra)", fontSize: 14, textAlign: "center" }}>
        Couldn't load connection options. Refresh to try again.
      </div>
    );
  }

  const skills = profile.analysis?.skills || [];
  const endorseMap = {};
  for (const e of profile.endorsements || []) endorseMap[e.skill] = e;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Primary connect controls */}
      <div style={{ ...card, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div className="ch-cell-label">Connect</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)" }}>
            {profile.follower_count || 0} follower{(profile.follower_count || 0) === 1 ? "" : "s"}
          </div>
        </div>

        <button
          type="button"
          onClick={toggleFollow}
          disabled={busy}
          className={profile.is_following ? undefined : "ch-btn-primary"}
          style={
            profile.is_following
              ? {
                  ...ghostBtn,
                  width: "100%",
                  justifyContent: "center",
                  textAlign: "center",
                  borderColor: "rgba(127,176,105,0.4)",
                  color: "var(--green)",
                  background: "rgba(127,176,105,0.1)",
                  opacity: busy ? 0.6 : 1,
                }
              : { width: "100%", justifyContent: "center", opacity: busy ? 0.6 : 1 }
          }
        >
          {profile.is_following ? "✓ Following" : "+ Follow"}
        </button>

        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            onClick={express}
            disabled={busy}
            style={{ ...ghostBtn, flex: 1, textAlign: "center", opacity: busy ? 0.6 : 1 }}
          >
            💜 I'm interested
          </button>
          <button
            type="button"
            onClick={requestIntro}
            disabled={busy}
            style={{ ...ghostBtn, flex: 1, textAlign: "center", opacity: busy ? 0.6 : 1 }}
          >
            👋 Request intro
          </button>
        </div>

        {/* Report affordance */}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          {reported ? (
            <span style={{ fontSize: 12, color: "var(--muted)" }}>Reported ✓</span>
          ) : (
            <button
              type="button"
              onClick={() => setShowReport((v) => !v)}
              style={{
                background: "none",
                border: "none",
                color: "var(--muted)",
                fontSize: 12,
                cursor: "pointer",
                padding: "4px 2px",
              }}
            >
              ⋯ Report
            </button>
          )}
        </div>
        {showReport && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <textarea
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              placeholder="What's wrong? (optional)"
              rows={2}
              style={{
                width: "100%",
                resize: "vertical",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--hair)",
                background: "var(--surface-2)",
                color: "var(--text)",
                padding: "10px 12px",
                fontSize: 13,
                fontFamily: "var(--font-body)",
              }}
            />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" onClick={() => setShowReport(false)} style={{ ...ghostBtn, padding: "8px 14px", fontSize: 13 }}>
                Cancel
              </button>
              <button
                type="button"
                onClick={submitReport}
                style={{ ...ghostBtn, padding: "8px 14px", fontSize: 13, color: "var(--terra)", borderColor: "rgba(192,86,59,0.35)" }}
              >
                Send report
              </button>
            </div>
          </div>
        )}
      </div>

      {/* AI trio */}
      <div style={{ ...card, display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="ch-cell-label">A little help</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button type="button" onClick={() => runAi("whymatch")} style={{ ...ghostBtn, flex: "1 1 auto", fontSize: 13, textAlign: "center" }}>
            ✦ Why you match
          </button>
          <button type="button" onClick={() => runAi("icebreak")} style={{ ...ghostBtn, flex: "1 1 auto", fontSize: 13, textAlign: "center" }}>
            💬 Break the ice
          </button>
          {aboutText ? (
            <button type="button" onClick={() => runAi("translate")} style={{ ...ghostBtn, flex: "1 1 auto", fontSize: 13, textAlign: "center" }}>
              🌐 Translate bio
            </button>
          ) : null}
        </div>

        {/* Why-you-match panel */}
        {ai.whymatch && (
          <AiPanel loading={ai.whymatch.loading} error={ai.whymatch.error} label="Why you match">
            {ai.whymatch.data && (
              <div>
                <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5, color: "var(--text)", fontFamily: "var(--font-accent)", fontStyle: "italic" }}>
                  {ai.whymatch.data.reason || "No shared signals found yet."}
                </p>
                {Array.isArray(ai.whymatch.data.shared) && ai.whymatch.data.shared.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
                    {ai.whymatch.data.shared.map((t) => (
                      <span key={t} className="ch-card-t" style={{ color: "var(--amber)", borderColor: "rgba(232,161,92,0.34)" }}>
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </AiPanel>
        )}

        {/* Icebreakers panel */}
        {ai.icebreak && (
          <AiPanel loading={ai.icebreak.loading} error={ai.icebreak.error} label="Openers">
            {ai.icebreak.data && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {(ai.icebreak.data.icebreakers || []).length === 0 && (
                  <span style={{ fontSize: 13, color: "var(--muted)" }}>No openers came back — try again in a moment.</span>
                )}
                {(ai.icebreak.data.icebreakers || []).map((line, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 10,
                      padding: "10px 12px",
                      borderRadius: "var(--radius-sm)",
                      background: "var(--surface-2)",
                      border: "1px solid var(--hair)",
                    }}
                  >
                    <span style={{ flex: 1, fontSize: 14, lineHeight: 1.45, color: "var(--text)" }}>{line}</span>
                    <button
                      type="button"
                      onClick={() => copyLine(line, i)}
                      style={{ background: "none", border: "none", color: copied === i ? "var(--green)" : "var(--amber)", fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}
                    >
                      {copied === i ? "Copied ✓" : "Copy"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </AiPanel>
        )}

        {/* Translate panel */}
        {ai.translate && (
          <AiPanel loading={ai.translate.loading} error={ai.translate.error} label={`Bio in ${lang.toUpperCase()}`}>
            {ai.translate.data && (
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: "var(--text)" }}>
                {ai.translate.data.translated || "No bio to translate."}
              </p>
            )}
          </AiPanel>
        )}
      </div>

      {/* Endorse skills */}
      {skills.length > 0 && (
        <div style={{ ...card, display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="ch-cell-label">Endorse a skill</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {skills.map((skill) => {
              const e = endorseMap[skill] || { count: 0, endorsed_by_me: false };
              const on = e.endorsed_by_me;
              return (
                <button
                  key={skill}
                  type="button"
                  onClick={() => toggleEndorse(skill)}
                  title={on ? "Remove your endorsement" : "Endorse this skill"}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 7,
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    padding: "7px 12px",
                    borderRadius: "var(--radius-pill)",
                    cursor: "pointer",
                    background: on ? "rgba(232,161,92,0.16)" : "var(--surface-2)",
                    border: `1px solid ${on ? "var(--amber)" : "var(--hair)"}`,
                    color: on ? "var(--amber)" : "var(--muted)",
                    transition: "all 0.16s ease",
                  }}
                >
                  <span style={{ fontSize: 12 }}>{on ? "✓" : "＋"}</span>
                  {skill}
                  {e.count > 0 && (
                    <span style={{ fontWeight: 700, color: on ? "var(--amber)" : "var(--text)" }}>{e.count}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Vouch composer */}
      <div style={{ ...card, display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="ch-cell-label">
          {myVouch ? "Your vouch" : `Vouch for ${personName || "this builder"}`}
        </div>
        {myVouch ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <p
              style={{
                margin: 0,
                fontSize: 14,
                lineHeight: 1.55,
                color: "var(--text)",
                fontFamily: "var(--font-accent)",
                fontStyle: "italic",
                padding: "12px 14px",
                borderRadius: "var(--radius-sm)",
                background: "var(--surface-2)",
                border: "1px solid var(--hair)",
              }}
            >
              "{myVouch.text}"
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={removeVouch}
                disabled={vouchBusy}
                style={{ ...ghostBtn, padding: "8px 14px", fontSize: 13, color: "var(--terra)", borderColor: "rgba(192,86,59,0.3)", opacity: vouchBusy ? 0.6 : 1 }}
              >
                Remove
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <textarea
              value={vouchText}
              onChange={(e) => setVouchText(e.target.value.slice(0, 280))}
              placeholder={`Say what it's like to work with ${personName || "them"}…`}
              rows={3}
              style={{
                width: "100%",
                resize: "vertical",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--hair)",
                background: "var(--surface-2)",
                color: "var(--text)",
                padding: "12px 14px",
                fontSize: 14,
                lineHeight: 1.5,
                fontFamily: "var(--font-body)",
              }}
            />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)" }}>
                {vouchText.length}/280
              </span>
              <button
                type="button"
                className="ch-btn-primary"
                onClick={submitVouch}
                disabled={vouchBusy || !vouchText.trim()}
                style={{ padding: "9px 18px", fontSize: 13, opacity: vouchBusy || !vouchText.trim() ? 0.55 : 1 }}
              >
                {vouchBusy ? "Posting…" : "Post vouch"}
              </button>
            </div>
          </div>
        )}
      </div>

      <Toast msg={toast?.msg} tone={toast?.tone} />
    </div>
  );
}

// Small reusable AI result panel: loading spinner / error / children.
function AiPanel({ loading, error, label, children }) {
  return (
    <div
      style={{
        borderRadius: "var(--radius-sm)",
        border: "1px solid rgba(232,161,92,0.24)",
        background: "linear-gradient(150deg, rgba(232,161,92,0.07), rgba(192,86,59,0.04) 60%, var(--surface))",
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div className="ch-cell-label" style={{ color: "var(--amber)" }}>{label}</div>
      {loading ? (
        <div style={{ color: "var(--muted)", fontSize: 13 }}>
          <span className="ch-spin" aria-hidden style={{ marginRight: 8 }}>◠</span>
          Thinking…
        </div>
      ) : error ? (
        <div style={{ color: "var(--terra)", fontSize: 13 }}>{error}</div>
      ) : (
        children
      )}
    </div>
  );
}
