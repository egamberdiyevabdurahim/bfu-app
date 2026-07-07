import { redirect } from "next/navigation";
import { getMe, getToken } from "@/lib/session";
import { getRegions } from "@/lib/bfu-api";
import Atmosphere from "@/components/Atmosphere";
import ProfileEditor from "@/components/settings/ProfileEditor";

const API_BASE = process.env.BFU_API_URL;

// /settings reads the httpOnly session cookie → per-user, never cacheable.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Edit your profile — Bright Futures Uzbekistan",
  description: "Your firelit workshop bench — bio, skills, links and CV.",
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
  return token || "builder";
}

export default async function SettingsPage() {
  const me = await getMe();
  if (!me) redirect("/login");

  const token = await getToken();

  // Fetch region options (public) + achievements/invite (authed) in parallel so
  // the editor paints fully-hydrated on first load.
  const [regions, achievements, invite] = await Promise.all([
    getRegions(),
    authedGet("/users/me/achievements", token),
    authedGet("/users/me/invite", token),
  ]);

  const initial = {
    ...me,
    achievements: achievements?.achievements || [],
    invite: invite || null,
  };

  return (
    <main style={{ position: "relative", minHeight: "100vh" }}>
      <Atmosphere />

      <div
        style={{
          position: "relative",
          zIndex: 2,
          maxWidth: 1200,
          margin: "0 auto",
          padding: "26px 40px 96px",
        }}
      >
        {/* TopBar — brand mark + back-to-home / public-profile links. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 24,
            padding: "12px 0 8px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <img
              src="/bfu-mark.png"
              alt="BFU"
              style={{
                height: 38,
                width: "auto",
                display: "block",
                filter: "drop-shadow(0 2px 10px rgba(232,161,92,0.25))",
              }}
            />
            <div style={{ width: 1, height: 26, background: "var(--hair)" }} />
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: "var(--muted)",
              }}
            >
              Bright Futures Uzbekistan
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <a href="/home" className="ch-btn-ghost">
              <span style={{ fontSize: 14 }}>←</span> Home
            </a>
            <a href={`/u/${me.id}`} className="ch-btn-ghost">
              <span style={{ fontSize: 15, color: "var(--amber)" }}>✦</span> View public profile
            </a>
          </div>
        </div>

        {/* Header */}
        <div style={{ marginTop: 40, marginBottom: 34 }}>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "var(--amber)",
            }}
          >
            Your workshop bench
          </div>
          <h1
            style={{
              margin: "14px 0 0",
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: 52,
              lineHeight: 1.0,
              letterSpacing: "-0.02em",
              color: "var(--text)",
            }}
          >
            Edit your{" "}
            <span
              style={{
                fontFamily: "var(--font-accent)",
                fontStyle: "italic",
                fontWeight: 400,
                color: "var(--amber)",
              }}
            >
              profile
            </span>
          </h1>
          <p
            style={{
              margin: "16px 0 0",
              fontFamily: "var(--font-accent)",
              fontStyle: "italic",
              fontSize: 20,
              lineHeight: 1.35,
              color: "var(--muted)",
              maxWidth: 560,
            }}
          >
            This is what the city sees, {firstName(me)}. Shape it, and it saves for good.
          </p>
        </div>

        <ProfileEditor initial={initial} regions={regions} />
      </div>
    </main>
  );
}
