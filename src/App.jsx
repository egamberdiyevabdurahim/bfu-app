import { useState, useEffect } from "react";
import { FontLoader, BottomNav } from "./components/Shared";
import { AuthScreen } from "./screens/AuthScreen";
import { DiscoverScreen } from "./screens/DiscoverScreen";
import { StartupScreen } from "./screens/StartupScreen";
import { VolunteerScreen } from "./screens/VolunteerScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { storage, users } from "./api";

export default function App() {
  // null = loading, false = not authed, true = authed+registered
  const [authed, setAuthed] = useState(null);
  const [activeTab, setActiveTab] = useState("discover");
  const [deepLink, setDeepLink] = useState(null);

  useEffect(() => {
    const handleSignout = () => {
      setAuthed(false);
      setActiveTab("discover");
      setDeepLink(null);
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
        if (user.is_registered) {
          setAuthed(true);
          _parseDeepLink(true);
        } else {
          // Has token but not finished registration — treat as unauthed
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
    const match = startParam.match(/^req_(startup|volunteering)_(\d+)$/);
    if (match) {
      const tab = match[1] === "startup" ? "startups" : "volunteer";
      const appId = Number(match[2]);
      setDeepLink({ tab, appId });
      if (isAuthed) setActiveTab(tab);
    }
  };

  const handleAuthComplete = (isNewRegistration = false) => {
    setAuthed(true);
    if (deepLink) setActiveTab(deepLink.tab);
    else if (!isNewRegistration) setActiveTab("discover");
  };

  const screens = {
    discover:  <DiscoverScreen />,
    startups:  <StartupScreen  deepLinkAppId={deepLink?.tab === "startups"  ? deepLink.appId : null} />,
    volunteer: <VolunteerScreen deepLinkAppId={deepLink?.tab === "volunteer" ? deepLink.appId : null} />,
    settings:  <SettingsScreen />,
  };

  // Loading state
  if (authed === null) {
    return (
      <>
        <FontLoader />
        <div style={{ maxWidth: 430, margin: "0 auto", height: "100vh", background: "var(--bg)",
          display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ color: "var(--text-3)", fontSize: 13 }}>Loading…</div>
        </div>
      </>
    );
  }

  return (
    <>
      <FontLoader />
      <div style={{ maxWidth: 430, margin: "0 auto", height: "100vh", position: "relative",
        background: "var(--bg)", overflow: "hidden" }}>
        {(authed === false || authed === "register") ? (
          <AuthScreen
            onComplete={handleAuthComplete}
            forceRegister={authed === "register"}
          />
        ) : (
          <>
            <div key={activeTab} style={{ height: "100%", overflowY: "auto", overflowX: "hidden" }}>
              {screens[activeTab]}
            </div>
            <BottomNav active={activeTab} onChange={setActiveTab} />
          </>
        )}
      </div>
    </>
  );
}
