import { redirect } from "next/navigation";
import { getMe } from "@/lib/session";
import { getCity } from "@/lib/bfu-api";
import { getT } from "@/lib/i18n/server";
import AppTopBar from "@/components/nav/AppTopBar";
import SiteFooter from "@/components/ui/SiteFooter";
import HomeDashboard from "@/components/home/HomeDashboard";
import OnboardingGate from "@/components/onboarding/OnboardingGate";

// /home reads the httpOnly session cookie, so it can never be statically cached
// or ISR-revalidated — it is per-user and must render fresh each request.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Your bazaar — Bright Futures Uzbekistan",
  description: "Your firelit corner of the city of builders.",
};

// First name for the warm greeting — the display name's first token, with any
// trailing punctuation stripped so callers can append their own.
function firstName(me) {
  const name = me?.display_name || me?.name || "";
  const token = name.split(" ").filter(Boolean)[0];
  return (token || "builder").replace(/[.,;:]+$/, "");
}

// Flatten a handful of real builders from the city payload's region clusters for
// the dashboard's "city tonight" avatar stack (deduped, first ~6). No fabricated
// presence — just whoever the payload reports.
function cityBuilders(city) {
  const out = [];
  const seen = new Set();
  for (const region of city?.regions || []) {
    for (const b of region?.people || []) {
      if (!b || b.id == null || seen.has(b.id)) continue;
      seen.add(b.id);
      out.push({
        id: b.id,
        label: b.display_name || b.name || "Builder",
        photo_url: b.photo_url || null,
      });
      if (out.length >= 6) return out;
    }
  }
  return out;
}

const EMPTY_CITY = { stats: {}, regions: [] };

export default async function HomePage() {
  const me = await getMe();
  if (!me) redirect("/login");

  const { t } = await getT();

  let cityRaw;
  try {
    cityRaw = (await getCity()) || EMPTY_CITY;
  } catch {
    cityRaw = EMPTY_CITY;
  }
  const city = { stats: cityRaw.stats || {}, builders: cityBuilders(cityRaw) };

  return (
    <AppTopBar active="home" me={me}>
        {/* First-login welcome flow — self-hides unless me.onboarding_completed
            is exactly false. Portals to <body>, so placement here is harmless. */}
        <OnboardingGate me={me} firstName={firstName(me)} />

        {/* Welcome hero. The launchpad tiles that used to live here were removed
            (they duplicated the left sidebar) — /home is now a real dashboard. */}
        <div style={{ marginTop: 8, marginBottom: 4 }}>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "var(--amber)",
            }}
          >
            {t("home.lamps_lit")}
          </div>
          <h1
            style={{
              margin: "14px 0 0",
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: "clamp(38px, 8vw, 62px)",
              lineHeight: 1.02,
              letterSpacing: "-0.02em",
              color: "var(--text)",
              overflowWrap: "break-word",
            }}
          >
            {t("home.welcome_prefix")}{" "}
            <span
              style={{
                fontFamily: "var(--font-accent)",
                fontStyle: "italic",
                fontWeight: 400,
                color: "var(--amber)",
              }}
            >
              {firstName(me)}
            </span>
          </h1>
          <p
            style={{
              margin: "18px 0 0",
              fontFamily: "var(--font-accent)",
              fontStyle: "italic",
              fontSize: "clamp(18px, 2.4vw, 22px)",
              lineHeight: 1.35,
              color: "var(--muted-strong)",
              maxWidth: 560,
            }}
          >
            {t("home.hero_sub")}
          </p>
        </div>

        <HomeDashboard profile={me} city={city} />

        <SiteFooter tagline={t("home.footer_tagline")} />
    </AppTopBar>
  );
}
