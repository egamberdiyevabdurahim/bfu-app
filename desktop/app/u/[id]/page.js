import { notFound } from "next/navigation";
import { getPublicProfile } from "@/lib/bfu-api";
import SiteTopBar from "@/components/nav/SiteTopBar";
import AmbientTicker from "@/components/AmbientTicker";
import IdentityStrip from "@/components/IdentityStrip";
import HeroBuildingCell from "@/components/HeroBuildingCell";
import ReputationCell from "@/components/ReputationCell";
import LookingForCell from "@/components/LookingForCell";
import AchievementsCell from "@/components/AchievementsCell";
import VouchesCell from "@/components/VouchesCell";
import ConnectionsCell from "@/components/ConnectionsCell";
import PersonActions from "@/components/people/PersonActions";

// The nav (SiteTopBar) reads the viewer's session cookie via getMe(), so this
// route renders per-request rather than being statically cached.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  const { id } = await params;
  const profile = await getPublicProfile(id);
  if (!profile) return { title: "Profile not found — BFU" };

  const description = profile.currently_building
    ? `Building: ${profile.currently_building}`
    : (profile.about || "Bright Futures Uzbekistan builder").slice(0, 160);

  // Only attach an OG image when the endpoint actually provides one, so we
  // never emit `[{ url: undefined }]` (which produces broken social cards).
  const ogImages = profile.og_image_url
    ? [{ url: profile.og_image_url, width: 1200, height: 630 }]
    : undefined;

  return {
    title: `${profile.name} — Bright Futures Uzbekistan`,
    description,
    openGraph: {
      title: `${profile.name} — Bright Futures Uzbekistan`,
      description,
      ...(profile.canonical_url ? { url: profile.canonical_url } : {}),
      ...(ogImages ? { images: ogImages } : {}),
    },
    twitter: {
      card: "summary_large_image",
      ...(profile.og_image_url ? { images: [profile.og_image_url] } : {}),
    },
  };
}

export default async function ProfilePage({ params }) {
  const { id } = await params;
  const profile = await getPublicProfile(id);
  if (!profile) notFound();

  const host = profile.canonical_url?.replace(/^https?:\/\//, "").replace(/\/$/, "");

  return (
    <SiteTopBar active="people" maxWidth={1200}>
        <AmbientTicker />
        <IdentityStrip profile={profile} />

        {/* Two-column body: the public bento (left, the main story) and the
            viewer-specific People & Trust rail (right). On narrow viewports the
            rail drops below the bento. The rail is an additive client island —
            it calls the AUTHED GET /users/{id} on mount, degrades to "This is
            you" on your own profile and a login prompt for anon readers; the
            SSR bento stays fully public. */}
        <div className="u-profile-body" style={{ marginTop: 40 }}>
          <div className="ch-grid u-profile-bento" style={{ alignItems: "stretch" }}>
            <HeroBuildingCell profile={profile} />
            <ReputationCell rating={profile.rating} />
            <LookingForCell lookingFor={profile.looking_for} />
            <AchievementsCell achievements={profile.achievements} />
            <VouchesCell vouches={profile.vouches} vouchCount={profile.vouch_count} />
            <ConnectionsCell
              collaborators={profile.collaborators}
              followerCount={profile.follower_count}
              region={profile.region}
            />
          </div>

          <aside className="u-profile-rail">
            <PersonActions
              userId={profile.id}
              personName={profile.name}
              aboutText={profile.about}
              lang="en"
            />
          </aside>
        </div>

        <div style={{ marginTop: 60, paddingTop: 26, borderTop: "1px solid var(--hair)",
          display: "flex", alignItems: "center", justifyContent: host ? "space-between" : "flex-end",
          gap: 20, flexWrap: "wrap" }}>
          {host && (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.16em",
              textTransform: "uppercase", color: "var(--muted-strong)" }}>
              {host}
            </div>
          )}
          <div style={{ fontFamily: "var(--font-accent)", fontStyle: "italic", fontSize: 18,
            color: "var(--muted-strong)" }}>
            Someone is always building right now.
          </div>
        </div>

        {/* Layout: rail beside the bento on wide screens, stacked below it once
            there isn't room for both. Because the rail steals ~360px, the bento
            runs on a 2-column bazaar rhythm here (span-2 cells fill a row,
            span-4 cells span both); it only needs the wider 4-up when the rail
            drops below. Scoped so it can't affect other pages. */}
        <style>{`
          .u-profile-body {
            display: grid;
            grid-template-columns: minmax(0, 1fr) 360px;
            gap: 24px;
            align-items: start;
          }
          .u-profile-body .u-profile-bento {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .u-profile-rail { position: sticky; top: 24px; }
          @media (max-width: 1080px) {
            .u-profile-body { grid-template-columns: 1fr; }
            .u-profile-rail { position: static; max-width: 460px; }
          }
          @media (max-width: 560px) {
            .u-profile-body .u-profile-bento { grid-template-columns: 1fr; }
          }
        `}</style>
    </SiteTopBar>
  );
}
