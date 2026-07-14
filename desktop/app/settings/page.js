import { redirect } from "next/navigation";
import { getT } from "@/lib/i18n/server";
import { getMe, getToken } from "@/lib/session";
import { getRegions } from "@/lib/bfu-api";
import { FLAGS } from "@/lib/flags";
import AppTopBar from "@/components/nav/AppTopBar";
import ProfileEditor from "@/components/settings/ProfileEditor";
import NotificationPrefs from "@/components/settings/NotificationPrefs";
import PrivacyPrefs from "@/components/settings/PrivacyPrefs";
import SiteFooter from "@/components/ui/SiteFooter";

const API_BASE = process.env.BFU_API_URL;

// /settings reads the httpOnly session cookie → per-user, never cacheable.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Edit your profile — Bright Futures Uzbekistan",
  // Was "…bio, skills, links and CV." — the CV export is hidden for V1
  // (FLAGS.CV_EXPORT), so the description no longer promises it.
  description: "Your firelit workshop bench — bio, skills and links.",
};

// Authed server-side GET (Bearer token from the session cookie). Returns null
// on any failure so the page still renders — the client rail can retry.
async function authedGet(path, token) {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

function firstName(me) {
  const name = me?.display_name || me?.name || "";
  const token = name.split(" ").filter(Boolean)[0];
  // Strip any trailing punctuation so callers can append their own (the stored
  // name may already end in a period, e.g. "Abdurahim. E" → avoid "Abdurahim..").
  return (token || "builder").replace(/[.,;:]+$/, "");
}

export default async function SettingsPage() {
  const { t } = await getT();
  const me = await getMe();
  if (!me) redirect("/login");

  const token = await getToken();

  // Fetch region options (public) + achievements/invite (authed) in parallel so
  // the editor paints fully-hydrated on first load.
  //
  // The notification-prefs GET runs regardless of FLAGS.NOTIF_PREFS: the "Bot
  // notifications" master switch is always visible, so its on/off state has to be
  // hydrated on first paint even when the 8 category rows stay hidden.
  const [regions, achievements, invite, notifPrefs] = await Promise.all([
    getRegions(),
    authedGet("/users/me/achievements", token),
    authedGet("/users/me/invite", token),
    authedGet("/users/me/notification-prefs", token),
  ]);

  const initial = {
    ...me,
    achievements: achievements?.achievements || [],
    invite: invite || null,
  };

  return (
    <AppTopBar active="settings" me={me}>
        {/* Header */}
        <div style={{ marginTop: 8, marginBottom: 30 }}>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "var(--amber)",
            }}
          >
            {t("settings.eyebrow")}
          </div>
          <h1
            style={{
              margin: "14px 0 0",
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: "clamp(32px, 6vw, 52px)",
              lineHeight: 1.04,
              letterSpacing: "-0.02em",
              color: "var(--text)",
              overflowWrap: "break-word",
            }}
          >
            {t("settings.hero_title_lead")}{" "}
            <span
              style={{
                fontFamily: "var(--font-accent)",
                fontStyle: "italic",
                fontWeight: 400,
                color: "var(--amber)",
              }}
            >
              {t("settings.hero_title_accent")}
            </span>
          </h1>
          <p
            style={{
              margin: "16px 0 0",
              fontFamily: "var(--font-accent)",
              fontStyle: "italic",
              fontSize: 20,
              lineHeight: 1.35,
              color: "var(--muted-strong)",
              maxWidth: 560,
            }}
          >
            {t("settings.hero_subtitle", { name: firstName(me) })}
          </p>
        </div>

        <ProfileEditor initial={initial} regions={regions} />

        {/* Notification preferences. The "Bot notifications" master mute is
            always visible (so a user can go quiet without blocking the bot); the
            8 per-category rows inside stay hidden until FLAGS.NOTIF_PREFS. */}
        <div style={{ marginTop: 26 }}>
          <NotificationPrefs initialPrefs={notifPrefs?.prefs || null} />
        </div>

        {/* Privacy preferences — hidden for V1. The guard sits OUTSIDE the spacer
            <div> on purpose: the marginTop is the gap that separates the block
            from what precedes it, so gating the wrapper (not just its child)
            means a hidden section leaves no ghost 26px band behind. */}
        {FLAGS.PRIVACY_PREFS ? (
          <div style={{ marginTop: 26 }}>
            <PrivacyPrefs initialDmPrivacy={me?.dm_privacy || "everyone"} initialWhoViewed={me?.who_viewed_consent !== false} />
          </div>
        ) : null}

        <SiteFooter tagline={t("settings.footer_tagline")} />
    </AppTopBar>
  );
}
