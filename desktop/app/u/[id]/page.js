import { notFound } from "next/navigation";
import { getPublicProfile } from "@/lib/bfu-api";
import TopBar from "@/components/TopBar";
import AmbientTicker from "@/components/AmbientTicker";
import Atmosphere from "@/components/Atmosphere";
import IdentityStrip from "@/components/IdentityStrip";
import HeroBuildingCell from "@/components/HeroBuildingCell";
import ReputationCell from "@/components/ReputationCell";
import LookingForCell from "@/components/LookingForCell";
import AchievementsCell from "@/components/AchievementsCell";
import VouchesCell from "@/components/VouchesCell";
import ConnectionsCell from "@/components/ConnectionsCell";
import PersonActions from "@/components/people/PersonActions";

export async function generateMetadata({ params }) {
  const { id } = await params;
  const profile = await getPublicProfile(id);
  if (!profile) return { title: "Profile not found — BFU" };

  const description = profile.currently_building
    ? `Building: ${profile.currently_building}`
    : (profile.about || "Bright Futures Uzbekistan builder").slice(0, 160);

  return {
    title: `${profile.name} — Bright Futures Uzbekistan`,
    description,
    openGraph: {
      title: `${profile.name} — Bright Futures Uzbekistan`,
      description,
      url: profile.canonical_url,
      images: [{ url: profile.og_image_url, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      images: [profile.og_image_url],
    },
  };
}

export default async function ProfilePage({ params }) {
  const { id } = await params;
  const profile = await getPublicProfile(id);
  if (!profile) notFound();

  return (
    <main style={{ position: "relative", minHeight: "100vh" }}>
      <Atmosphere />
      <div style={{ position: "relative", zIndex: 2, maxWidth: 1200, margin: "0 auto",
        padding: "26px 40px 96px" }}>
        <TopBar />
        <AmbientTicker />
        <IdentityStrip profile={profile} />

        {/* Additive client island: the viewer-specific People & Trust controls
            (follow / interest / intro / endorse / vouch + the AI trio). Calls
            the AUTHED GET /users/{id} on mount; degrades to "This is you" on
            your own profile and a login prompt for anon readers. The SSR
            content above/below stays fully public. */}
        <div style={{ marginTop: 28, maxWidth: 460 }}>
          <PersonActions
            userId={profile.id}
            personName={profile.name}
            aboutText={profile.about}
            lang="en"
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20,
          marginTop: 40, alignItems: "stretch" }}>
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

        <div style={{ marginTop: 60, paddingTop: 26, borderTop: "1px solid var(--hair)",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.16em",
            textTransform: "uppercase", color: "var(--muted)" }}>
            {profile.canonical_url?.replace(/^https?:\/\//, "")}
          </div>
          <div style={{ fontFamily: "var(--font-accent)", fontStyle: "italic", fontSize: 18,
            color: "var(--muted)" }}>
            Someone is always building right now.
          </div>
        </div>
      </div>
    </main>
  );
}
