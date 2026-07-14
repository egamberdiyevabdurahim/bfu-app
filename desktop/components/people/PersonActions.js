"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { bfu } from "@/lib/client-api";
import { useToast } from "@/lib/useToast";
import { useT } from "@/components/i18n/LocaleProvider";
import { FLAGS } from "@/lib/flags";

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
// V1 launch — the founder cut this panel down to Follow / Message / Report.
// Everything else is behind a flag; nothing was deleted, so flipping the flag in
// lib/flags.js brings the surface (and its handler + backend route) straight back:
//
//   FLAGS.INTEREST_INTRO → "💜 I'm interested" + "👋 Request intro" button row
//                          (handlers: express(), requestIntro())
//   FLAGS.AI_ASSIST      → the whole "A LITTLE HELP" card: Why you match,
//                          Break the ice, Translate bio (handlers: runAi(),
//                          copyLine(); result surfaces: <AiPanel/>)
//   FLAGS.TRUST          → per-skill endorse + vouch composer (pre-existing)
//
// The AI calls are all on-demand (click → runAi), so with FLAGS.AI_ASSIST off no
// why-match/icebreaker/translate request is ever issued. The mount-time fetch
// below stays: it powers Follow (is_following / follower_count) and self/anon
// detection, which all survive the cut.
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
// Reads the shared useToast shape: { text, tone }.
function Toast({ toast }) {
  if (!toast?.text) return null;
  const isError = toast.tone === "error";
  const border = isError ? "rgba(192,86,59,0.5)" : "rgba(255,106,61,0.4)";
  const accent = isError ? "var(--terra)" : "var(--ember)";
  return (
    <div
      className="ch-toast ch-toast-show"
      style={{ border: `1px solid ${border}` }}
      role="status"
      aria-live="polite"
    >
      <span className="ch-toast-tx" style={{ color: "var(--text)" }}>
        <b style={{ color: accent }}>{toast.text}</b>
      </span>
    </div>
  );
}

export default function PersonActions({ userId, personName, aboutText, lang = "en" }) {
  const t = useT();
  const router = useRouter();
  const [state, setState] = useState("loading"); // loading | anon | self | ready | error
  const [me, setMe] = useState(null);
  const [profile, setProfile] = useState(null);
  const [reloadKey, setReloadKey] = useState(0); // bump to retry after an error

  const [busy, setBusy] = useState(false); // follow/interest/intro shared lock
  const [msgBusy, setMsgBusy] = useState(false); // open-DM lock
  const { toast, flash } = useToast(3200); // shared single-timer toast (no leak/race)

  // Report
  const [showReport, setShowReport] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reported, setReported] = useState(false);
  const [reportBusy, setReportBusy] = useState(false);

  // Vouch composer
  const [vouchText, setVouchText] = useState("");
  const [vouchBusy, setVouchBusy] = useState(false);
  const [myVouch, setMyVouch] = useState(null); // { id, text } when I've vouched

  // AI trio
  const [ai, setAi] = useState({}); // { whymatch|icebreak|translate: { loading, error, data } }
  const [copied, setCopied] = useState(-1);

  useEffect(() => {
    let alive = true;
    setState("loading");
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
        if (FLAGS.TRUST && meRes && Array.isArray(p?.vouches)) {
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
  }, [userId, reloadKey]);

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
      flash(e?.message || t("people.followUpdateError"), "error");
    } finally {
      setBusy(false);
    }
  }

  // ── Interest (soft ping) — V1: hidden (FLAGS.INTEREST_INTRO) ──────────────
  async function express() {
    if (!FLAGS.INTEREST_INTRO || busy) return;
    setBusy(true);
    try {
      const r = await bfu(`/users/${userId}/interest`, { method: "POST" });
      flash(r?.mutual ? t("people.match") : t("people.interestSent"));
    } catch (e) {
      flash(e?.status === 429 ? t("people.interestCooldown") : (e?.message || t("people.interestError")), "error");
    } finally {
      setBusy(false);
    }
  }

  // ── Message (open/create the in-app DM) ───────────────────────────────────
  async function openMessage() {
    if (msgBusy) return;
    setMsgBusy(true);
    try {
      const r = await bfu(`/conversations/dm/${userId}`, { method: "POST" });
      if (r?.id) {
        router.push(`/messages?c=${r.id}`);
      } else {
        router.push("/messages");
      }
    } catch (e) {
      // 400 = blocked either way / self; anything else = transient.
      flash(
        e?.status === 400
          ? t("people.messagingUnavailable")
          : e?.message || t("people.conversationError"),
        "error"
      );
      setMsgBusy(false);
    }
  }

  // ── Request intro — V1: hidden (FLAGS.INTEREST_INTRO) ─────────────────────
  async function requestIntro() {
    if (!FLAGS.INTEREST_INTRO || busy) return;
    setBusy(true);
    try {
      await bfu(`/users/${userId}/intro`, { method: "POST" });
      flash(t("people.introSent"));
    } catch (e) {
      flash(e?.status === 429 ? t("people.introCooldown") : (e?.message || t("people.introError")), "error");
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
      flash(e?.message || t("people.endorseError"), "error");
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
      flash(t("people.vouchPosted"));
    } catch (e) {
      flash(e?.message || t("people.vouchPostError"), "error");
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
      flash(t("people.vouchRemoved"));
    } catch (e) {
      flash(e?.message || t("people.vouchRemoveError"), "error");
    } finally {
      setVouchBusy(false);
    }
  }

  // ── Report ────────────────────────────────────────────────────────────────
  async function submitReport() {
    if (reportBusy) return;
    setReportBusy(true);
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
      flash(t("people.reportSent"));
    } catch (e) {
      flash(e?.message || t("people.reportError"), "error");
    } finally {
      setReportBusy(false);
    }
  }

  // ── AI trio — V1: hidden (FLAGS.AI_ASSIST) ────────────────────────────────
  // Guarded so no why-match / icebreakers / bio-translate request can be issued
  // while the buttons that trigger them are not rendered.
  async function runAi(kind) {
    if (!FLAGS.AI_ASSIST) return;
    setAi((s) => ({ ...s, [kind]: { loading: true, error: null, data: null } }));
    try {
      let path;
      if (kind === "whymatch") path = `/users/${userId}/why-match`;
      else if (kind === "icebreak") path = `/users/${userId}/icebreakers`;
      else path = `/users/${userId}/bio/translate`;
      const data = await bfu(path, { params: { lang } });
      setAi((s) => ({ ...s, [kind]: { loading: false, error: null, data } }));
    } catch (e) {
      const msg = e?.status === 429 ? t("people.aiCooldown") : (e?.message || t("people.aiError"));
      setAi((s) => ({ ...s, [kind]: { loading: false, error: msg, data: null } }));
    }
  }

  // Copy an icebreaker line — only reachable from the FLAGS.AI_ASSIST card.
  async function copyLine(text, idx) {
    if (!FLAGS.AI_ASSIST) return;
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
    // Reserve roughly the height of the loaded control stack so the CTA cluster
    // doesn't pop in and shift the page once the fetch resolves.
    return (
      <div style={{ ...card, minHeight: 168, display: "flex", flexDirection: "column",
        justifyContent: "center", alignItems: "center", gap: 10, color: "var(--muted-strong)",
        fontSize: 14 }} aria-busy="true">
        <span className="ch-spin" aria-hidden>◠</span>
        {t("people.loadingOptions")}
      </div>
    );
  }

  if (state === "self") {
    return (
      <div style={{ ...card, display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="ch-cell-label">{t("people.thisIsYou")}</div>
        <p style={{ margin: 0, fontSize: 14, color: "var(--muted)", lineHeight: 1.55 }}>
          {t("people.thisIsYouBody")}
        </p>
        <a href="/web/settings" className="ch-btn-primary" style={{ justifyContent: "center" }}>
          {t("people.editProfile")} <span style={{ fontSize: 14 }}>→</span>
        </a>
      </div>
    );
  }

  if (state === "anon") {
    return (
      <div style={{ ...card, display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="ch-cell-label">{t("people.wantToConnect")}</div>
        <p style={{ margin: 0, fontSize: 14, color: "var(--muted)", lineHeight: 1.55 }}>
          {t("people.anonBody", { name: personName || t("people.thisBuilder") })}
        </p>
        <a href="/web/login" className="ch-btn-primary" style={{ justifyContent: "center" }}>
          {t("people.loginToConnect")} <span style={{ fontSize: 14 }}>→</span>
        </a>
      </div>
    );
  }

  if (state === "error" || !profile) {
    return (
      <div style={{ ...card, display: "flex", flexDirection: "column", gap: 12, alignItems: "center",
        textAlign: "center" }}>
        <p style={{ margin: 0, color: "var(--terra)", fontSize: 14 }}>
          {t("people.loadError")}
        </p>
        <button
          type="button"
          onClick={() => setReloadKey((k) => k + 1)}
          style={{ ...ghostBtn, padding: "9px 18px", fontSize: 13 }}
        >
          {t("people.tryAgain")}
        </button>
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
          <div className="ch-cell-label">{t("people.connect")}</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted-strong)" }}>
            {(profile.follower_count || 0) === 1
              ? t("people.followerOne", { n: profile.follower_count || 0 })
              : t("people.followerMany", { n: profile.follower_count || 0 })}
          </div>
        </div>

        <button
          type="button"
          onClick={toggleFollow}
          disabled={busy}
          aria-pressed={!!profile.is_following}
          aria-label={profile.is_following ? t("people.followingAria", { name: personName || t("people.thisBuilder") }) : t("people.followAria", { name: personName || t("people.thisBuilder") })}
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
          <span aria-hidden>{profile.is_following ? "✓" : "+"}</span> {profile.is_following ? t("people.following") : t("people.follow")}
        </button>

        {/* Native in-app DM — the key affordance for the many members with no
            Telegram @username. Opens (find-or-creates) the 1:1 conversation. */}
        <button
          type="button"
          className="ch-btn-primary"
          onClick={openMessage}
          disabled={msgBusy}
          aria-label={t("people.messageAria", { name: personName || t("people.thisBuilder") })}
          style={{ width: "100%", justifyContent: "center", opacity: msgBusy ? 0.6 : 1 }}
        >
          <span aria-hidden>✉</span> {msgBusy ? t("people.opening") : t("people.message")}
        </button>

        {/* I'm interested / Request intro — V1: hidden (FLAGS.INTEREST_INTRO) */}
        {FLAGS.INTEREST_INTRO && (
          <div style={{ display: "flex", gap: 10 }}>
            <button
              type="button"
              onClick={express}
              disabled={busy}
              style={{ ...ghostBtn, flex: 1, textAlign: "center", opacity: busy ? 0.6 : 1 }}
            >
              <span aria-hidden>💜</span> {t("people.imInterested")}
            </button>
            <button
              type="button"
              onClick={requestIntro}
              disabled={busy}
              style={{ ...ghostBtn, flex: 1, textAlign: "center", opacity: busy ? 0.6 : 1 }}
            >
              <span aria-hidden>👋</span> {t("people.requestIntro")}
            </button>
          </div>
        )}

        {/* Report affordance */}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          {reported ? (
            <span style={{ fontSize: 12, color: "var(--muted-strong)" }}>{t("people.reported")} ✓</span>
          ) : (
            <button
              type="button"
              onClick={() => setShowReport((v) => !v)}
              style={{
                background: "none",
                border: "none",
                color: "var(--muted-strong)",
                fontSize: 12,
                cursor: "pointer",
                padding: "4px 2px",
              }}
            >
              <span aria-hidden>⋯</span> {t("people.report")}
            </button>
          )}
        </div>
        {showReport && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <textarea
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              placeholder={t("people.reportPlaceholder")}
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
              <button type="button" onClick={() => setShowReport(false)} disabled={reportBusy} style={{ ...ghostBtn, padding: "8px 14px", fontSize: 13, opacity: reportBusy ? 0.6 : 1 }}>
                {t("people.cancel")}
              </button>
              <button
                type="button"
                onClick={submitReport}
                disabled={reportBusy}
                style={{ ...ghostBtn, padding: "8px 14px", fontSize: 13, color: "var(--terra)", borderColor: "rgba(192,86,59,0.35)", opacity: reportBusy ? 0.6 : 1, cursor: reportBusy ? "default" : "pointer" }}
              >
                {reportBusy ? t("people.sending") : t("people.sendReport")}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* AI trio ("A LITTLE HELP") — V1: hidden (FLAGS.AI_ASSIST).
          The gate wraps the WHOLE card, heading included, so nothing renders as
          an empty titled shell. */}
      {FLAGS.AI_ASSIST && (
      <div style={{ ...card, display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="ch-cell-label">{t("people.aLittleHelp")}</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button type="button" onClick={() => runAi("whymatch")} disabled={ai.whymatch?.loading} style={{ ...ghostBtn, flex: "1 1 auto", fontSize: 13, textAlign: "center", opacity: ai.whymatch?.loading ? 0.6 : 1 }}>
            <span aria-hidden>✦</span> {t("people.whyYouMatch")}
          </button>
          <button type="button" onClick={() => runAi("icebreak")} disabled={ai.icebreak?.loading} style={{ ...ghostBtn, flex: "1 1 auto", fontSize: 13, textAlign: "center", opacity: ai.icebreak?.loading ? 0.6 : 1 }}>
            <span aria-hidden>💬</span> {t("people.breakTheIce")}
          </button>
          {aboutText ? (
            <button type="button" onClick={() => runAi("translate")} disabled={ai.translate?.loading} style={{ ...ghostBtn, flex: "1 1 auto", fontSize: 13, textAlign: "center", opacity: ai.translate?.loading ? 0.6 : 1 }}>
              <span aria-hidden>🌐</span> {t("people.translateBio")}
            </button>
          ) : null}
        </div>

        {/* Why-you-match panel */}
        {ai.whymatch && (
          <AiPanel loading={ai.whymatch.loading} error={ai.whymatch.error} label={t("people.whyYouMatch")}>
            {ai.whymatch.data && (
              <div>
                <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5, color: "var(--text)", fontFamily: "var(--font-accent)", fontStyle: "italic" }}>
                  {ai.whymatch.data.reason || t("people.noSharedSignals")}
                </p>
                {Array.isArray(ai.whymatch.data.shared) && ai.whymatch.data.shared.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
                    {ai.whymatch.data.shared.map((t, i) => (
                      <span key={`${t}-${i}`} className="ch-tag" style={{ color: "var(--amber)", borderColor: "rgba(232,161,92,0.34)" }}>
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
          <AiPanel loading={ai.icebreak.loading} error={ai.icebreak.error} label={t("people.openers")}>
            {ai.icebreak.data && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {(ai.icebreak.data.icebreakers || []).length === 0 && (
                  <span style={{ fontSize: 13, color: "var(--muted-strong)" }}>{t("people.noOpeners")}</span>
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
                      {copied === i ? `${t("people.copied")} ✓` : t("people.copy")}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </AiPanel>
        )}

        {/* Translate panel */}
        {ai.translate && (
          <AiPanel loading={ai.translate.loading} error={ai.translate.error} label={t("people.bioIn", { lang: lang.toUpperCase() })}>
            {ai.translate.data && (
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: "var(--text)" }}>
                {ai.translate.data.translated || t("people.noBioTranslate")}
              </p>
            )}
          </AiPanel>
        )}
      </div>
      )}

      {/* Endorse skills — V1: hidden (FLAGS.TRUST) */}
      {FLAGS.TRUST && skills.length > 0 && (
        <div style={{ ...card, display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="ch-cell-label">{t("people.endorseASkill")}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {skills.map((skill) => {
              const e = endorseMap[skill] || { count: 0, endorsed_by_me: false };
              const on = e.endorsed_by_me;
              return (
                <button
                  key={skill}
                  type="button"
                  onClick={() => toggleEndorse(skill)}
                  title={on ? t("people.removeEndorsement") : t("people.endorseThisSkill")}
                  aria-pressed={on}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 7,
                    fontFamily: "var(--font-mono)",
                    fontSize: 12,
                    padding: "7px 12px",
                    borderRadius: "var(--radius-pill)",
                    cursor: "pointer",
                    background: on ? "rgba(232,161,92,0.16)" : "var(--surface-2)",
                    border: `1px solid ${on ? "var(--amber)" : "var(--hair)"}`,
                    color: on ? "var(--amber)" : "var(--muted-strong)",
                    transition: "all 0.16s ease",
                  }}
                >
                  <span aria-hidden style={{ fontSize: 12 }}>{on ? "✓" : "＋"}</span>
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

      {/* Vouch composer — V1: hidden (FLAGS.TRUST) */}
      {FLAGS.TRUST && (
        <div style={{ ...card, display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="ch-cell-label">
            {myVouch ? t("people.yourVouch") : t("people.vouchFor", { name: personName || t("people.thisBuilder") })}
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
                  {t("people.remove")}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <textarea
                value={vouchText}
                onChange={(e) => setVouchText(e.target.value.slice(0, 280))}
                placeholder={t("people.vouchPlaceholder", { name: personName || t("people.them") })}
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
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted-strong)" }}>
                  {vouchText.length}/280
                </span>
                <button
                  type="button"
                  className="ch-btn-primary"
                  onClick={submitVouch}
                  disabled={vouchBusy || !vouchText.trim()}
                  style={{ padding: "9px 18px", fontSize: 13, opacity: vouchBusy || !vouchText.trim() ? 0.55 : 1 }}
                >
                  {vouchBusy ? t("people.posting") : t("people.postVouch")}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <Toast toast={toast} />
    </div>
  );
}

// Small reusable AI result panel: loading spinner / error / children.
function AiPanel({ loading, error, label, children }) {
  const t = useT();
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
        <div style={{ color: "var(--muted-strong)", fontSize: 13 }}>
          <span className="ch-spin" aria-hidden style={{ marginRight: 8 }}>◠</span>
          {t("people.thinking")}
        </div>
      ) : error ? (
        <div style={{ color: "var(--terra)", fontSize: 13 }}>{error}</div>
      ) : (
        children
      )}
    </div>
  );
}
