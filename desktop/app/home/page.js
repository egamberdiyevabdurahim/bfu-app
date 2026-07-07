import { redirect } from "next/navigation";
import { getMe } from "@/lib/session";
import { getCity } from "@/lib/bfu-api";
import AppTopBar from "@/components/nav/AppTopBar";
import SiteFooter from "@/components/ui/SiteFooter";
import HomeDashboard from "@/components/home/HomeDashboard";

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

// Empty-but-valid city slice so HomeDashboard's "city tonight" module renders a
// calm quiet state if /public/city is briefly unavailable (instead of throwing).
const EMPTY_CITY = { stats: {}, weekday: "", regions: [], threads: [] };

export default async function HomePage() {
  const me = await getMe();
  if (!me) redirect("/login");

  let city;
  try {
    city = (await getCity()) || EMPTY_CITY;
  } catch {
    city = EMPTY_CITY;
  }

  return (
    <AppTopBar active="home" me={me}>
        {/* Welcome hero — Bricolage headline + Instrument-serif accent line. The
            launchpad tiles that used to live here were removed: they duplicated
            the left sidebar. /home is now a real dashboard (HomeDashboard). */}
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
            The lamps are lit
          </div>
          <h1
            style={{
              margin: "14px 0 0",
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: "clamp(38px, 8vw, 62px)",
              lineHeight: 1.0,
              letterSpacing: "-0.02em",
              color: "var(--text)",
              overflowWrap: "break-word",
            }}
          >
            Welcome back,{" "}
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
              fontSize: 22,
              lineHeight: 1.35,
              color: "var(--muted-strong)",
              maxWidth: 560,
            }}
          >
            The bazaar is humming and your workshop is right where you left it.
          </p>
        </div>

        <HomeDashboard profile={me} city={city} />

        <SiteFooter tagline="The city never really sleeps." />
    </AppTopBar>
  );
}
