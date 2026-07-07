import { getCity } from "@/lib/bfu-api";
import SiteTopBar from "@/components/nav/SiteTopBar";
import AmbientTicker from "@/components/AmbientTicker";
import CityHeader from "@/components/CityHeader";
import FilterBar from "@/components/FilterBar";
import RegionCluster from "@/components/RegionCluster";
import ThreadsRail from "@/components/ThreadsRail";
import PresenceToast from "@/components/PresenceToast";
import SiteFooter from "@/components/ui/SiteFooter";

// The nav (SiteTopBar) reads the viewer's session cookie via getMe(), so this
// route must render per-request (it can no longer be statically cached). The
// city data itself is still ISR-cached inside getCity()'s fetch wrapper.
export const dynamic = "force-dynamic";

// The public, logged-out City / Discovery ("building tonight") screen — the
// flagship Chorsu "wander for an hour" surface. SERVER component: it does the
// single batched `getCity()` fetch (ISR revalidate: 60 in the fetch wrapper),
// then composes the reused Chorsu building blocks. Only the leaf components that
// need motion/interaction are client ("use client") — FilterBar, CityHeader,
// AmbientTicker, PresenceToast — so the server/client boundary stays clean.
//
// Fidelity reference: docs/superpowers/mockups/2026-07-06-chorsu-city-discovery.html.

export async function generateMetadata() {
  // Title order normalized to match every sibling page ("<Page> — Bright
  // Futures Uzbekistan"); the OG/Twitter title keeps its own richer phrasing.
  const title = "The city — Bright Futures Uzbekistan";
  const ogTitle = "Bright Futures Uzbekistan — a city of builders";
  const description =
    "Wander the bazaar of Uzbekistan's builders. See who is building right now, " +
    "which cities are lit tonight, and pull a thread you can't unsee.";
  const url = "https://brightfuturesuzbekistan.uz/city";
  // Generic, viewer-agnostic OG — no per-user PIL render needed for the city
  // surface. Reuses the brand mark the app already ships.
  const ogImage = "/bfu-mark.png";

  return {
    metadataBase: new URL("https://brightfuturesuzbekistan.uz"),
    title,
    description,
    openGraph: {
      title: ogTitle,
      description,
      url,
      siteName: "Bright Futures Uzbekistan",
      images: [{ url: ogImage, width: 1200, height: 630 }],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: ogTitle,
      description,
      images: [ogImage],
    },
  };
}

// Empty-but-valid payload. If the upstream `/public/city` is unavailable (e.g.
// the backend hasn't deployed the endpoint yet, or a transient outage during an
// ISR revalidate), the page still renders a coherent quiet-night city — the
// header shows the "bazaar is resting" copy, no clusters/threads/toast — instead
// of throwing and 500-ing the whole route. The next successful revalidate
// (revalidate: 60) swaps in the real data automatically.
const EMPTY_CITY = { stats: {}, weekday: "", regions: [], threads: [] };

// Build the AmbientTicker's lines from REAL payload data only — no fabricated
// presence. Each line is an array of segments; a segment with `hl: true` renders
// in bright ink (--text), matching the mockup's `<b>` highlight. Stats-derived
// lines are gated on a positive count so a quiet night never claims "0 builders
// online". Thread-derived lines carry the real thread's title (highlighted) +
// subtitle. When nothing real can be said we return a single calm line; the
// ticker stops cycling at length <= 1, so it holds that one line instead of
// falling back to the fabricated DEFAULT_LINES.
function buildTickerLines(stats, threads) {
  const lines = [];

  const online = Number(stats?.online_now) || 0;
  if (online > 0) {
    const label = online === 1 ? "builder" : "builders";
    lines.push([
      { t: `${online} ${label} online`, hl: true },
      { t: " right now · someone is always building" },
    ]);
  }

  const cities = Number(stats?.cities_lit) || 0;
  if (cities > 0) {
    const label = cities === 1 ? "city" : "cities";
    lines.push([
      { t: `${cities} ${label} lit`, hl: true },
      { t: " across Uzbekistan tonight" },
    ]);
  }

  const fresh = Number(stats?.new_this_week) || 0;
  if (fresh > 0) {
    const label = fresh === 1 ? "builder" : "builders";
    lines.push([
      { t: `${fresh} new ${label}`, hl: true },
      { t: " joined the city this week" },
    ]);
  }

  for (const thread of threads || []) {
    if (!thread || !thread.title) continue;
    const segs = [{ t: thread.title, hl: true }];
    if (thread.subtitle) segs.push({ t: ` · ${thread.subtitle}` });
    lines.push(segs);
  }

  if (lines.length === 0) {
    // Quiet night: one calm, true line. Length 1 → the ticker holds it and
    // never cycles (and never shows the fabricated defaults).
    return [[{ t: "The bazaar is quiet tonight · " }, { t: "come build", hl: true }]];
  }

  return lines;
}

async function loadCity() {
  try {
    return (await getCity()) || EMPTY_CITY;
  } catch {
    return EMPTY_CITY;
  }
}

export default async function CityPage() {
  const data = await loadCity();
  const stats = data?.stats || {};
  const weekday = data?.weekday || "";
  const regions = data?.regions || [];
  const threads = data?.threads || [];

  // The real online set fed to PresenceToast — flattened across every region
  // cluster, deduped by id. No fabricated presence: only builders the payload
  // reports as `online === true` cycle through the toast (empty set → the toast
  // renders nothing).
  const onlineBuilders = [];
  const seen = new Set();
  for (const region of regions) {
    for (const builder of region.people || []) {
      if (builder && builder.online && !seen.has(builder.id)) {
        seen.add(builder.id);
        onlineBuilders.push(builder);
      }
    }
  }

  // Real ticker lines derived from live stats + threads (no fabricated presence).
  const tickerLines = buildTickerLines(stats, threads);

  return (
    <SiteTopBar active="city" maxWidth={1280}>
        <AmbientTicker lines={tickerLines} />
        <CityHeader stats={stats} weekday={weekday} />

        {/* FilterBar wraps the region clusters as its children so its
            client-side filter (walking [data-cluster] / [data-builder]) can
            show/hide the server-rendered cards without a refetch. */}
        <FilterBar regions={regions}>
          {regions.map((region) => (
            <RegionCluster key={region.id ?? region.name_en} region={region} />
          ))}
        </FilterBar>

        <ThreadsRail threads={threads} />

        <SiteFooter tagline="The city never really sleeps." />

      <PresenceToast builders={onlineBuilders} />
    </SiteTopBar>
  );
}
