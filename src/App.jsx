import { useState, useEffect } from "react";
import { FontLoader, BottomNav } from "./components/Shared";
import { AuthScreen } from "./screens/AuthScreen";
import { CityScreen } from "./screens/CityScreen";
import { ProjectsScreen } from "./screens/ProjectsScreen";
import { MentorsScreen } from "./screens/MentorsScreen";
import { ProfileScreen } from "./screens/ProfileScreen";
import { EventsScreen } from "./screens/EventsScreen";
import { UserProfileModal } from "./components/UserProfileModal";
import { storage, users, projects } from "./api";
import { useT } from "./i18n";
import { Landing } from "./Landing";
import { RegionLandingScreen } from "./RegionLandingScreen";
import { ProjectDetail } from "./components/ProjectDetail";
import { MessagesScreen } from "./components/MessagesScreen";
import { Onboarding } from "./components/Onboarding";
import { WebBridge } from "./components/WebBridge";
import { ChannelReminder } from "./components/ChannelReminder";
import { startUpdateCheck } from "./updateCheck";
import { FLAGS } from "./flags";

function publicRoute() {
  const path = window.location.pathname;
  const inTelegram = !!window.Telegram?.WebApp?.initData;
  if (path.startsWith("/r/")) {
    const id = parseInt(path.split("/")[2] || "", 10);
    return Number.isFinite(id) ? { kind: "region", id } : null;
  }
  // Show landing at "/" only for browser visitors (no Telegram WebApp).
  if (path === "/" && !inTelegram) return { kind: "landing" };
  return null;
}

export default function App() {
  const pub = publicRoute();
  if (pub?.kind === "landing") return <Landing />;
  if (pub?.kind === "region") return <RegionLandingScreen regionId={pub.id} />;
  return <MiniApp />;
}

function MiniApp() {
  const { t, setLang } = useT();
  // null = loading, false = not authed, true = authed+registered
  const [authed, setAuthed] = useState(null);
  const [me, setMe] = useState(null);
  const [activeTab, setActiveTab] = useState("city");
  const [deepLink, setDeepLink] = useState(null);
  const [deepUserId, setDeepUserId] = useState(null);
  const [deepProject, setDeepProject] = useState(null);
  // Messaging overlay (opened from anywhere via a `bfu:open-messages` event —
  // City toolbar glyph = list; profile "Message" / project "Team chat" pass a
  // conversation id to jump straight into a thread).
  const [msgOpen, setMsgOpen] = useState(false);
  const [msgConv, setMsgConv] = useState(null);
  const [updateReady, setUpdateReady] = useState(false);
  const [bootError, setBootError] = useState(false); // transient failure verifying the session
  // First-run walkthrough. Server-side truth is me.onboarding_completed; this
  // flag only lets us hide the overlay OPTIMISTICALLY on skip/finish so a failed
  // POST can never trap a new member inside it.
  const [onbDismissed, setOnbDismissed] = useState(false);

  useEffect(() => {
    const stop = startUpdateCheck();
    const onUpd = () => setUpdateReady(true);
    window.addEventListener("bfu:update-available", onUpd);
    return () => { stop?.(); window.removeEventListener("bfu:update-available", onUpd); };
  }, []);

  useEffect(() => {
    const handleSignout = () => {
      setAuthed(false); setMe(null); setActiveTab("city");
      setDeepLink(null); setDeepUserId(null); setMsgOpen(false);
      setOnbDismissed(false); // next account on this device gets its own walkthrough
    };
    window.addEventListener("bfu:signout", handleSignout);
    return () => window.removeEventListener("bfu:signout", handleSignout);
  }, []);

  useEffect(() => {
    const onOpenMessages = (e) => {
      setMsgConv(e?.detail?.conversationId ?? null);
      setMsgOpen(true);
    };
    window.addEventListener("bfu:open-messages", onOpenMessages);
    return () => window.removeEventListener("bfu:open-messages", onOpenMessages);
  }, []);

  useEffect(() => {
    const onOpenProject = (e) => {
      const id = e?.detail?.projectId;
      if (id) projects.get(id).then(setDeepProject).catch(() => {});
    };
    window.addEventListener("bfu:open-project", onOpenProject);
    return () => window.removeEventListener("bfu:open-project", onOpenProject);
  }, []);

  useEffect(() => {
    const onOpenEvent = (e) => {
      const id = e?.detail?.eventId;
      if (id) { setDeepLink({ tab: "events", eventId: id }); setActiveTab("events"); }
    };
    window.addEventListener("bfu:open-event", onOpenEvent);
    return () => window.removeEventListener("bfu:open-event", onOpenEvent);
  }, []);

  // On mount: verify existing token and registration status
  useEffect(() => {
    if (!storage.getAccess()) {
      setAuthed(false);
      return;
    }
    users.me()
      .then(user => {
        // Guard against a stale session leaking across Telegram account
        // switches on a shared device: localStorage is per-client, not
        // per-account, so a token for user A must not be trusted when a
        // different Telegram account (B) opens the app.
        const tgId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
        if (tgId && user.telegram_id && Number(tgId) !== Number(user.telegram_id)) {
          storage.clear();
          setAuthed(false);
          return;
        }
        setMe(user);
        if (user.language) setLang(user.language);
        if (user.is_registered) {
          setAuthed(true);
          _parseDeepLink(true);
        } else {
          setAuthed("register");
        }
      })
      .catch((e) => {
        // Only force re-auth on a REAL auth failure. A network blip / 5xx /
        // cold-start must NOT nuke a valid session — keep the token and show a
        // retriable "couldn't connect" screen instead of bouncing to login.
        if (e?.message === "Session expired" || e?.status === 401 || e?.status === 403) {
          storage.clear();
          setAuthed(false);
        } else {
          setBootError(true); // transient — token preserved, retry re-verifies
        }
      });
  }, []);

  // Keep App's `me` fresh when a child (EditProfile) saves — otherwise the
  // denied-fields lock + banner stay stuck until the app is killed/reopened.
  useEffect(() => {
    const refresh = () => users.me().then(setMe).catch(() => {});
    window.addEventListener("bfu:me-updated", refresh);
    return () => window.removeEventListener("bfu:me-updated", refresh);
  }, []);

  const _hasStartParam = () => !!(
    window.Telegram?.WebApp?.initDataUnsafe?.start_param ||
    new URLSearchParams(window.location.search).get("startapp")
  );

  const _parseDeepLink = (isAuthed) => {
    const startParam =
      window.Telegram?.WebApp?.initDataUnsafe?.start_param ||
      new URLSearchParams(window.location.search).get("startapp");
    if (!startParam) return;
    const sp = String(startParam);
    let m;
    if ((m = sp.match(/^req_(startup|volunteering)_(\d+)$/))) {
      // Both startup + volunteering applications live in the unified Projects tab now.
      const appId = Number(m[2]);
      setDeepLink({ tab: "projects", appId });
      if (isAuthed) setActiveTab("projects");
    } else if ((m = sp.match(/^event_(\d+)$/))) {
      const eventId = Number(m[1]);
      setDeepLink({ tab: "events", eventId });
      if (isAuthed) setActiveTab("events");
    } else if ((m = sp.match(/^user_(\d+)$/))) {
      // Admin link to a specific user's profile
      if (isAuthed) setDeepUserId(Number(m[1]));
    } else if ((m = sp.match(/^project_(\d+)$/))) {
      if (isAuthed) {
        projects.get(Number(m[1])).then(setDeepProject).catch(() => {});
      }
    }
  };

  const handleAuthComplete = (isNewRegistration = false) => {
    setAuthed(true);
    users.me().then(setMe).catch(() => {});
    // Parse + apply the start param NOW. Previously deep links were only
    // parsed on the already-logged-in mount path, so first-time and
    // returning-after-expiry users (exactly the ones bot re-engagement
    // buttons target) landed on Discover and the event/project/profile
    // link was silently dropped.
    _parseDeepLink(true);
    if (!isNewRegistration && !_hasStartParam()) setActiveTab("city");
  };

  // First-run walkthrough — only for a member the SERVER says hasn't seen it.
  // Strict `=== false`: if the field is ever missing (older backend) we show
  // nothing rather than replaying the cards for every existing member.
  const showOnboarding =
    authed === true && me?.onboarding_completed === false && !onbDismissed;

  const handleOnboardingDone = () => {
    setOnbDismissed(true);
    // Keep the loaded `me` consistent — the `bfu:me-updated` listener refetches
    // it, and without this a slow POST could briefly re-arm the overlay.
    setMe((u) => (u ? { ...u, onboarding_completed: true } : u));
    // The last card promises City, and City is the default tab. A pending deep
    // link (event / project / application) still wins — dropping it would strip
    // the bot's re-engagement links of their target.
    if (!deepLink && !deepUserId && !deepProject) setActiveTab("city");
  };

  const deniedFields = (() => {
    try { return me?.denied_fields ? JSON.parse(me.denied_fields) : []; }
    catch { return []; }
  })();

  // When the profile is locked we force them into the Profile tab (which folds in
  // edit/settings) so they can fix it.
  const forceSettings = deniedFields.length > 0;
  const requestedTab = forceSettings ? "profile" : activeTab;

  const screens = {
    city:     <CityScreen />,
    projects: <ProjectsScreen
                  deepLinkAppId={deepLink?.tab === "projects" ? deepLink.appId : null}
                  onDeepLinkConsumed={() => setDeepLink(null)} />,
    // Mentors is hidden for V1 — flip FLAGS.MENTORING to bring the screen back.
    ...(FLAGS.MENTORING ? { mentors: <MentorsScreen /> } : {}),
    events:   <EventsScreen
                  deepLinkEventId={deepLink?.tab === "events" ? deepLink.eventId : null}
                  me={me}
                  embedded
                  onBack={() => setActiveTab("city")} />,
    profile:  <ProfileScreen />,
  };

  // A tab that isn't in the map (e.g. a stale "mentors" while the flag is off)
  // would render blank — fall back to the default tab instead.
  const effectiveTab = Object.prototype.hasOwnProperty.call(screens, requestedTab)
    ? requestedTab
    : "city";

  // Transient boot failure (network / 5xx / cold start): the token is still
  // valid, so offer a retry instead of dropping to the login screen.
  if (bootError) {
    return (
      <>
        <FontLoader />
        <div style={{ maxWidth: 430, margin: "0 auto", height: "var(--app-h, 100dvh)", background: "var(--bg)",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 24, textAlign: "center" }}>
          <div style={{ fontSize: 34 }} aria-hidden>📡</div>
          <div style={{ color: "var(--text)", fontSize: 15, fontWeight: 600 }}>{t("common.connectError")}</div>
          <div style={{ color: "var(--text-3)", fontSize: 13, lineHeight: 1.5 }}>{t("common.connectErrorHint")}</div>
          <button type="button" onClick={() => window.location.reload()} className="btn-primary"
            style={{ marginTop: 4, padding: "12px 28px", width: "auto" }}>
            {t("common.retry")}
          </button>
        </div>
      </>
    );
  }

  // Loading state
  if (authed === null) {
    return (
      <>
        <FontLoader />
        <div style={{ maxWidth: 430, margin: "0 auto", height: "var(--app-h, 100dvh)", background: "var(--bg)",
          display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ color: "var(--text-3)", fontSize: 13 }}>{t("common.loading")}</div>
        </div>
      </>
    );
  }

  const denyBanner = deniedFields.length > 0 && (
    <div style={{
      position: "absolute", top: 0, left: 0, right: 0, zIndex: 90,
      background: "rgba(255,107,107,0.12)", borderBottom: "1px solid rgba(255,107,107,0.35)",
      padding: "10px 16px", display: "flex", alignItems: "center", gap: 10,
    }}>
      <span style={{ fontSize: 18 }}>⚠️</span>
      <div style={{ flex: 1, minWidth: 0, fontSize: 12, color: "#FFCDCD", lineHeight: 1.45 }}>
        <div style={{ fontWeight: 700, color: "#FF6B6B" }}>{t("deny.banner.title")}</div>
        <div>{t("deny.banner.body", { fields: deniedFields.join(", ") })}</div>
        {me?.denied_note && (
          <div style={{ marginTop: 4, fontStyle: "italic", color: "#FFB3B3" }}>{me.denied_note}</div>
        )}
      </div>
    </div>
  );

  return (
    <>
      <FontLoader />
      <div style={{ maxWidth: 430, margin: "0 auto", height: "var(--app-h, 100dvh)", position: "relative",
        background: "var(--bg)", overflow: "hidden" }}>
        {updateReady && (
          <button onClick={() => window.location.reload()} style={{
            position: "absolute", top: "calc(var(--safe-t) + 8px)", left: "50%", transform: "translateX(-50%)",
            zIndex: 500, display: "flex", alignItems: "center", gap: 8, padding: "8px 16px",
            borderRadius: 99, border: "1px solid var(--amber, #E8A15C)", cursor: "pointer",
            background: "linear-gradient(135deg, var(--ember, #FF6A3D), var(--terra, #C0563B))",
            color: "#160E08", fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 12.5,
            boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
          }}>↻ {t("update.reload")}</button>
        )}
        {(authed === false || authed === "register") ? (
          <AuthScreen
            onComplete={handleAuthComplete}
            forceRegister={authed === "register"}
          />
        ) : (
          <>
            {denyBanner}
            <div key={effectiveTab} style={{
              height: "100%", overflowY: "auto", overflowX: "hidden",
              paddingTop: denyBanner ? 70 : 0,
            }}>
              {screens[effectiveTab]}
            </div>
            {!forceSettings && <BottomNav active={effectiveTab} onChange={setActiveTab} />}
            {/* Quiet pointer to the fuller desktop app — self-hides on phones,
                and on the walkthrough (which owns the screen for a new member).
                Same !forceSettings gate as the nav: a locked profile is the one
                thing we want them fixing, not a second screen to go read it on. */}
            {!forceSettings && !showOnboarding && <WebBridge />}
            {/* Gentle, recurring "join the BFU channel" nudge — replaces the old
                hard group-join gate in registration. Never blocking; hidden while
                a locked profile or the walkthrough owns the screen. */}
            {!forceSettings && !showOnboarding && <ChannelReminder />}
          </>
        )}
        {deepUserId && (
          <UserProfileModal userId={deepUserId} onClose={() => setDeepUserId(null)} />
        )}
        {deepProject && (
          <ProjectDetail
            project={deepProject}
            me={me}
            onClose={() => setDeepProject(null)}
            onUpdate={(p) => setDeepProject(p)}
          />
        )}
        {msgOpen && me && (
          <MessagesScreen
            meId={me.id}
            initialConversationId={msgConv}
            onClose={() => setMsgOpen(false)}
          />
        )}
        {/* Above everything (z-450): a brand-new member reads the three cards
            first, then lands on City. Rendered last so it also covers a modal a
            deep link may have opened underneath. */}
        {showOnboarding && <Onboarding onDone={handleOnboardingDone} />}
      </div>
    </>
  );
}
