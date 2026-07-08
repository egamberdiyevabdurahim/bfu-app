import { notFound } from "next/navigation";
import { getProject } from "@/lib/bfu-api";
import SiteTopBar from "@/components/nav/SiteTopBar";
import ProjectHero from "@/components/ProjectHero";
import ProjectAboutCell from "@/components/ProjectAboutCell";
import FounderCell from "@/components/FounderCell";
import TeamCell from "@/components/TeamCell";
import ProjectLookingForCell from "@/components/ProjectLookingForCell";
import ProjectActions from "@/components/projects/ProjectActions";
import FavoriteButton from "@/components/projects/FavoriteButton";
import TeamChatButton from "@/components/messages/TeamChatButton";
import OpenRolesCell from "@/components/projects/OpenRolesCell";
import ProjectUpdates from "@/components/projects/ProjectUpdates";
import SiteFooter from "@/components/ui/SiteFooter";

// The nav (SiteTopBar) reads the viewer's session cookie via getMe(), so this
// route renders per-request rather than being statically cached.
export const dynamic = "force-dynamic";

// Screen 3 of the Chorsu desktop app: the public, logged-out project page
// (`/p/[id]`). SERVER component — does the single batched getProject() fetch
// (ISR revalidate: 120 in the fetch wrapper), 404s to notFound() for
// missing/unapproved/draft/deleted projects, then composes the reused Chorsu
// firelit bento building blocks. Matches the design language of /u/[id]
// (profile) and /city (discovery).

export async function generateMetadata({ params }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) return { title: "Project not found — Bright Futures Uzbekistan" };

  const description = (project.goal || project.about || "A project on Bright Futures Uzbekistan")
    .slice(0, 160);
  const title = `${project.name} — Bright Futures Uzbekistan`;
  // Generic, viewer-agnostic OG — the project endpoint ships no per-project PIL
  // render, so reuse the brand mark the app already serves (same pattern as the
  // city surface). No new backend work.
  const ogImage = "/bfu-mark.png";

  return {
    metadataBase: new URL("https://brightfuturesuzbekistan.uz"),
    title,
    description,
    openGraph: {
      title,
      description,
      url: project.canonical_url,
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

export default async function ProjectPage({ params }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();

  const lookingFor = project.looking_for || {};
  const requirements = project.requirements || {};
  const hasLookingFor =
    (lookingFor.skills?.length || 0) > 0 ||
    (lookingFor.knowledges?.length || 0) > 0 ||
    (lookingFor.regions?.length || 0) > 0 ||
    requirements.age_from != null ||
    requirements.age_to != null ||
    !!requirements.gender_req;

  const canonicalHost = (project.canonical_url || "").replace(/^https?:\/\//, "");

  return (
    <SiteTopBar active="projects" maxWidth={1200}>
        <ProjectHero project={project} />

        {/* Additive client island: the viewer-specific join / manage control.
            Sits in the left column of the bento band so it reads as an anchored
            action rail beside the project's About/Team story rather than a
            floating 460px island. Calls the authed GET /projects/{id} on mount;
            degrades to a login prompt when the reader isn't signed in. The SSR
            content stays fully public. */}
        <div
          className="ch-grid"
          style={{ marginTop: 40, alignItems: "start" }}
        >
          <div
            style={{
              gridColumn: "span 2",
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            <ProjectActions projectId={project.id} />
            {/* Save/heart toggle — additive island; self-hides for anon readers. */}
            <FavoriteButton projectId={project.id} />
            {/* Team chat entry — self-hides unless the viewer is on the team. */}
            <TeamChatButton projectId={project.id} />
            {/* Open roles the team is hiring for. Auth-gated read, so it
                self-hides for anon readers or when there are no open roles. */}
            <OpenRolesCell projectId={project.id} />
          </div>

          <ProjectAboutCell about={project.about} />
          <FounderCell founder={project.founder} />
          <TeamCell
            team={project.team}
            teamCount={project.team_count}
            founder={project.founder}
            founderRole={project.founder_role}
          />
          {hasLookingFor && (
            <ProjectLookingForCell lookingFor={lookingFor} requirements={requirements} />
          )}

          {/* Additive island: the project update feed (warm timeline). Read for
              everyone with a session; self-hides for anon readers, in which case
              it renders nothing and no empty band is left behind. */}
          <ProjectUpdates projectId={project.id} />
        </div>

        <SiteFooter
          tagline="Every great thing started as someone’s project."
          host={canonicalHost}
        />
    </SiteTopBar>
  );
}
