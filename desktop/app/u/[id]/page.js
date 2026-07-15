import { notFound } from "next/navigation";
import { getPublicProfile } from "@/lib/bfu-api";
import { FLAGS } from "@/lib/flags";
import SiteTopBar from "@/components/nav/SiteTopBar";
import IdentityStrip from "@/components/IdentityStrip";
import HeroBuildingCell from "@/components/HeroBuildingCell";
import ReputationCell from "@/components/ReputationCell";
import LookingForCell from "@/components/LookingForCell";
import ProfileStatsCell from "@/components/ProfileStatsCell";
import ProjectsListCell from "@/components/ProjectsListCell";
import SkillsCell from "@/components/SkillsCell";
import PortfolioCell from "@/components/PortfolioCell";
import AchievementsCell from "@/components/AchievementsCell";
import VouchesCell from "@/components/VouchesCell";
import ConnectionsCell from "@/components/ConnectionsCell";
import PersonActions from "@/components/people/PersonActions";
import SiteFooter from "@/components/ui/SiteFooter";
import { getT } from "@/lib/i18n/server";

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

  const { t } = await getT();
  const host = profile.canonical_url?.replace(/^https?:\/\//, "").replace(/\/$/, "");

  return (
    <SiteTopBar active="people" maxWidth={1200}>
        <IdentityStrip profile={profile} />

        {/* Two-column body: the public bento (left, the main story) and the
            viewer-specific People & Trust rail (right). On narrow viewports the
            rail drops below the bento. The rail is an additive client island —
            it calls the AUTHED GET /users/{id} on mount, degrades to "This is
            you" on your own profile and a login prompt for anon readers; the
            SSR bento stays fully public. */}
        <div className="u-profile-body" style={{ marginTop: 40 }}>
          {/* V1: the social-proof cells (rating, badges, vouches) and the
              collaborator/follower cell are hidden — they render empty on a young
              user base. Flip FLAGS.TRUST / FLAGS.CONNECTIONS to bring them back;
              every cell below spans the full grid row, so the bento reads the same
              with two cells or six.

              The Stats / Projects / Skills / Portfolio cells are the desktop twin
              of the Mini App's UserProfileModal — they render the rich payload the
              page already receives (stats, founded_projects/member_projects, skills,
              portfolio_links). Each self-guards and returns null when its slice is
              empty, so a null cell contributes nothing to the grid and the bento
              never shows a blank tile. Skills is an analysis attribute (not social
              proof), so it is intentionally NOT gated behind FLAGS.TRUST. */}
          <div className="ch-grid u-profile-bento" style={{ alignItems: "stretch" }}>
            <HeroBuildingCell profile={profile} />
            {FLAGS.TRUST && <ReputationCell rating={profile.rating} />}
            <LookingForCell lookingFor={profile.looking_for} />
            <ProfileStatsCell stats={profile.stats} />
            <ProjectsListCell
              founded={profile.founded_projects}
              member={profile.member_projects}
            />
            <SkillsCell
              skills={profile.skills}
              knowledges={profile.knowledges}
              interests={profile.interests}
            />
            <PortfolioCell links={profile.portfolio_links} />
            {FLAGS.TRUST && <AchievementsCell achievements={profile.achievements} />}
            {FLAGS.TRUST && (
              <VouchesCell vouches={profile.vouches} vouchCount={profile.vouch_count} />
            )}
            {FLAGS.CONNECTIONS && (
              <ConnectionsCell
                collaborators={profile.collaborators}
                followerCount={profile.follower_count}
                region={profile.region}
              />
            )}
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

        <SiteFooter tagline={t("profile.footer_tagline")} host={host} />

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
