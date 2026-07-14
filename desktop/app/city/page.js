import { getCity } from "@/lib/bfu-api";
import { asset } from "@/lib/asset";
import SiteTopBar from "@/components/nav/SiteTopBar";
import AmbientTicker from "@/components/AmbientTicker";
import CityHeader from "@/components/CityHeader";
import FilterBar, { CityEmpty } from "@/components/FilterBar";
import RegionCluster from "@/components/RegionCluster";
import ThreadsRail from "@/components/ThreadsRail";
import SiteFooter from "@/components/ui/SiteFooter";
import { getT } from "@/lib/i18n/server";

// The nav (SiteTopBar) reads the viewer's session cookie via getMe(), so this
// route must render per-request (it can no longer be statically cached). The
// city data itself is still ISR-cached inside getCity()'s fetch wrapper.
export const dynamic = "force-dynamic";

// The public, logged-out City / Discovery ("building tonight") screen — the
// flagship Chorsu "wander for an hour" surface. SERVER component: it does the
// single batched `getCity()` fetch (ISR revalidate: 60 in the fetch wrapper),
// then composes the reused Chorsu building blocks. Only the leaf components that
// need motion/interaction are client ("use client") — FilterBar, CityHeader,
// AmbientTicker — so the server/client boundary stays clean.
//
// NOTE: components/PresenceToast.js is deliberately NOT mounted here. It cycled a
// "<name> just came online" toast synthesized from the merely currently-online
// set — nobody actually "just" came online, so the event was fabricated. The
// component file is kept (unmounted) in case a real presence-event feed lands.
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
  // asset() adds the "/web" basePath — metadataBase resolves this against the root
  // domain, which is the Mini App, not us. See lib/asset.js.
  const ogImage = asset("/bfu-mark.png");

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
// header shows the "bazaar is resting" copy, no clusters/threads — instead
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
function buildTickerLines(stats, threads, t) {
  const lines = [];

  const online = Number(stats?.online_now) || 0;
  if (online > 0) {
    lines.push([
      {
        t: t(
          online === 1 ? "city.ticker.online_hl_one" : "city.ticker.online_hl_other",
          { n: online }
        ),
        hl: true,
      },
      { t: t("city.ticker.online_tail") },
    ]);
  }

  const cities = Number(stats?.cities_lit) || 0;
  if (cities > 0) {
    lines.push([
      {
        t: t(
          cities === 1 ? "city.ticker.cities_hl_one" : "city.ticker.cities_hl_other",
          { n: cities }
        ),
        hl: true,
      },
      { t: t("city.ticker.cities_tail") },
    ]);
  }

  const fresh = Number(stats?.new_this_week) || 0;
  if (fresh > 0) {
    lines.push([
      {
        t: t(
          fresh === 1 ? "city.ticker.fresh_hl_one" : "city.ticker.fresh_hl_other",
          { n: fresh }
        ),
        hl: true,
      },
      { t: t("city.ticker.fresh_tail") },
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
    return [[{ t: t("city.ticker.quiet_lead") }, { t: t("city.ticker.quiet_hl"), hl: true }]];
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
  const { t } = await getT();
  const data = await loadCity();
  const stats = data?.stats || {};
  const weekday = data?.weekday || "";
  const regions = data?.regions || [];
  const threads = data?.threads || [];

  // Real ticker lines derived from live stats + threads (no fabricated presence).
  const tickerLines = buildTickerLines(stats, threads, t);

  // Is there a single builder anywhere in the city? `regions: []` (a genuinely
  // dark city, or the EMPTY_CITY fallback when the backend is down) used to map
  // to nothing at all — no cluster, so no content and no message: a blank body
  // with no way out. RegionCluster's low-count grace tile cannot cover this; it
  // renders INSIDE a cluster, and here there is no cluster to render it in.
  // Counting people (not regions) also covers a payload that carries regions
  // whose `people` arrays are all empty — that would otherwise paint a row of
  // "0 lit" headers and nothing else.
  const builderCount = regions.reduce(
    (n, r) => n + (Array.isArray(r?.people) ? r.people.length : 0),
    0
  );
  const hasBuilders = builderCount > 0;

  return (
    <SiteTopBar active="city" maxWidth={1280}>
        <AmbientTicker lines={tickerLines} />
        <CityHeader stats={stats} weekday={weekday} />

        {hasBuilders ? (
          // FilterBar wraps the region clusters as its children so its
          // client-side filter (walking [data-cluster] / [data-builder]) can
          // show/hide the server-rendered cards without a refetch. It also owns
          // the "no builders match this filter" state, since it is the only thing
          // that can see how many cards its own filter left standing.
          <FilterBar regions={regions}>
            {regions.map((region) => (
              <RegionCluster key={region.id ?? region.name_en} region={region} />
            ))}
          </FilterBar>
        ) : (
          // Nobody is lit anywhere. Skip the chip row entirely — filtering an
          // empty set is a row of no-op affordances — and give the reader the
          // empty state with two real exits (invite / browse projects) instead.
          <CityEmpty />
        )}

        <ThreadsRail threads={threads} />

        <SiteFooter tagline={t("city.footer_tagline")} />
    </SiteTopBar>
  );
}
