import { getCity } from "@/lib/bfu-api";
import TopBar from "@/components/TopBar";
import AmbientTicker from "@/components/AmbientTicker";
import Atmosphere from "@/components/Atmosphere";
import CityHeader from "@/components/CityHeader";
import FilterBar from "@/components/FilterBar";
import RegionCluster from "@/components/RegionCluster";
import ThreadsRail from "@/components/ThreadsRail";
import PresenceToast from "@/components/PresenceToast";

// The public, logged-out City / Discovery ("building tonight") screen — the
// flagship Chorsu "wander for an hour" surface. SERVER component: it does the
// single batched `getCity()` fetch (ISR revalidate: 60 in the fetch wrapper),
// then composes the reused Chorsu building blocks. Only the leaf components that
// need motion/interaction are client ("use client") — FilterBar, CityHeader,
// AmbientTicker, PresenceToast — so the server/client boundary stays clean.
//
// Fidelity reference: docs/superpowers/mockups/2026-07-06-chorsu-city-discovery.html.

export async function generateMetadata() {
  const title = "Bright Futures Uzbekistan — a city of builders";
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
      title,
      description,
      url,
      siteName: "Bright Futures Uzbekistan",
      images: [{ url: ogImage, width: 1200, height: 630 }],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
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

  return (
    <main style={{ position: "relative", minHeight: "100vh" }}>
      <Atmosphere />

      <div
        style={{
          position: "relative",
          zIndex: 2,
          maxWidth: 1280,
          margin: "0 auto",
          padding: "22px 40px 120px",
        }}
      >
        <TopBar />
        <AmbientTicker />
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

        <div
          style={{
            marginTop: 64,
            paddingTop: 26,
            borderTop: "1px solid var(--hair)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 20,
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "var(--muted)",
            }}
          >
            brightfuturesuzbekistan.uz
          </span>
          <span
            style={{
              fontFamily: "var(--font-accent)",
              fontStyle: "italic",
              fontSize: 18,
              color: "var(--muted)",
            }}
          >
            The city never really sleeps.
          </span>
        </div>
      </div>

      <PresenceToast builders={onlineBuilders} />
    </main>
  );
}
