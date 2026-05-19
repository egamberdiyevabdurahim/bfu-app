import { useState, useEffect } from "react";
import { FontLoader, BottomNav } from "./components/Shared";
import { AuthScreen } from "./screens/AuthScreen";
import { DiscoverScreen } from "./screens/DiscoverScreen";
import { StartupScreen } from "./screens/StartupScreen";
import { VolunteerScreen } from "./screens/VolunteerScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { EventsScreen } from "./screens/EventsScreen";
import { UserProfileModal } from "./components/UserProfileModal";
import { storage, users } from "./api";
import { useT } from "./i18n";

export default function App() {
  const { t, setLang } = useT();
  // null = loading, false = not authed, true = authed+registered
  const [authed, setAuthed] = useState(null);
  const [me, setMe] = useState(null);
  const [activeTab, setActiveTab] = useState("discover");
  const [deepLink, setDeepLink] = useState(null);
  const [deepUserId, setDeepUserId] = useState(null);

  useEffect(() => {
    const handleSignout = () => {
      setAuthed(false); setMe(null); setActiveTab("discover");
      setDeepLink(null); setDeepUserId(null);
    };
    window.addEventListener("bfu:signout", handleSignout);
    return () => window.removeEventListener("bfu:signout", handleSignout);
  }, []);

  // On mount: verify existing token and registration status
  useEffect(() => {
    if (!storage.getAccess()) {
      setAuthed(false);
      return;
    }
    users.me()
      .then(user => {
        setMe(user);
        if (user.language) setLang(user.language);
        if (user.is_registered) {
          setAuthed(true);
          _parseDeepLink(true);
        } else {
          setAuthed("register");
        }
      })
      .catch(() => {
        storage.clear();
        setAuthed(false);
      });
  }, []);

  const _parseDeepLink = (isAuthed) => {
    const startParam =
      window.Telegram?.WebApp?.initDataUnsafe?.start_param ||
      new URLSearchParams(window.location.search).get("startapp");
    if (!startParam) return;
    const sp = String(startParam);
    let m;
    if ((m = sp.match(/^req_(startup|volunteering)_(\d+)$/))) {
      const tab = m[1] === "startup" ? "startups" : "volunteer";
      const appId = Number(m[2]);
      setDeepLink({ tab, appId });
      if (isAuthed) setActiveTab(tab);
    } else if ((m = sp.match(/^event_(\d+)$/))) {
      const eventId = Number(m[1]);
      setDeepLink({ tab: "events", eventId });
      if (isAuthed) setActiveTab("events");
    } else if ((m = sp.match(/^user_(\d+)$/))) {
      // Admin link to a specific user's profile
      if (isAuthed) setDeepUserId(Number(m[1]));
    }
  };

  const handleAuthComplete = (isNewRegistration = false) => {
    setAuthed(true);
    users.me().then(setMe).catch(() => {});
    if (deepLink) setActiveTab(deepLink.tab);
    else if (!isNewRegistration) setActiveTab("discover");
  };

  const deniedFields = (() => {
    try { return me?.denied_fields ? JSON.parse(me.denied_fields) : []; }
    catch { return []; }
  })();

  // When the profile is locked we force them into Settings/Edit so they can fix it.
  const forceSettings = deniedFields.length > 0;
  const effectiveTab = forceSettings ? "settings" : activeTab;

  const screens = {
    discover:  <DiscoverScreen />,
    startups:  <StartupScreen  deepLinkAppId={deepLink?.tab === "startups"  ? deepLink.appId : null} />,
    volunteer: <VolunteerScreen deepLinkAppId={deepLink?.tab === "volunteer" ? deepLink.appId : null} />,
    events:    <EventsScreen
                  deepLinkEventId={deepLink?.tab === "events" ? deepLink.eventId : null}
                  embedded
                  onBack={() => setActiveTab("discover")} />,
    settings:  <SettingsScreen />,
  };

  // Loading state
  if (authed === null) {
    return (
      <>
        <FontLoader />
        <div style={{ maxWidth: 430, margin: "0 auto", height: "100dvh", background: "var(--bg)",
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
      <div style={{ maxWidth: 430, margin: "0 auto", height: "100dvh", position: "relative",
        background: "var(--bg)", overflow: "hidden" }}>
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
            {!forceSettings && <BottomNav active={activeTab} onChange={setActiveTab} />}
          </>
        )}
        {deepUserId && (
          <UserProfileModal userId={deepUserId} onClose={() => setDeepUserId(null)} />
        )}
      </div>
    </>
  );
}
