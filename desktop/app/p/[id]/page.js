import { notFound } from "next/navigation";
import { getProject } from "@/lib/bfu-api";
import TopBar from "@/components/TopBar";
import Atmosphere from "@/components/Atmosphere";
import ProjectHero from "@/components/ProjectHero";
import ProjectAboutCell from "@/components/ProjectAboutCell";
import FounderCell from "@/components/FounderCell";
import TeamCell from "@/components/TeamCell";
import ProjectLookingForCell from "@/components/ProjectLookingForCell";

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
        <TopBar />

        <ProjectHero project={project} />

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 20,
            marginTop: 40,
            alignItems: "stretch",
          }}
        >
          <ProjectAboutCell about={project.about} />
          <FounderCell founder={project.founder} />
          <TeamCell team={project.team} teamCount={project.team_count} />
          {hasLookingFor && (
            <ProjectLookingForCell lookingFor={lookingFor} requirements={requirements} />
          )}
        </div>

        <div
          style={{
            marginTop: 60,
            paddingTop: 26,
            borderTop: "1px solid var(--hair)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 20,
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "var(--muted)",
            }}
          >
            {canonicalHost}
          </div>
          <div
            style={{
              fontFamily: "var(--font-accent)",
              fontStyle: "italic",
              fontSize: 18,
              color: "var(--muted)",
            }}
          >
            Every great thing started as someone's project.
          </div>
        </div>
      </div>
    </main>
  );
}
