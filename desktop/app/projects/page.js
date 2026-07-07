import { getProjects } from "@/lib/bfu-api";
import TopBar from "@/components/TopBar";
import Atmosphere from "@/components/Atmosphere";
import ProjectsHeader from "@/components/ProjectsHeader";
import ProjectFilterBar from "@/components/ProjectFilterBar";
import ProjectBrowseCard from "@/components/ProjectBrowseCard";
import StartProjectCTA from "@/components/projects/StartProjectCTA";

// Screen 4 of the Chorsu desktop app: the public, logged-out "projects
// discovery" surface (`/projects`). SERVER component — it does the single
// batched getProjects() fetch (ISR revalidate: 60 in the fetch wrapper), then
// composes the reused Chorsu firelit building blocks. Only the leaf components
// that need motion/interaction are client — ProjectsHeader (count-ups) and
// ProjectFilterBar (client-side filtering) — so the server/client boundary
// stays clean. Matches the design language of /u/[id], /city and /p/[id].
//
// The backend already orders projects pinned→hiring→newest, so the page renders
// data.projects verbatim.

export async function generateMetadata() {
  const title = "Projects — Bright Futures Uzbekistan";
  const description =
    "Browse the startups and volunteering projects being built across " +
    "Uzbekistan tonight. Find one that's hiring, meet the founders, and join a team.";
  const url = "https://brightfuturesuzbekistan.uz/projects";
  // Generic, viewer-agnostic OG — reuses the brand mark the app already ships
  // (same pattern as /city and /p/[id]). No per-project PIL render.
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

// Empty-but-valid payload. If the upstream `/public/projects` is unavailable
// (backend not deployed yet, or a transient outage during an ISR revalidate),
// the page still renders a coherent quiet workshop — the header shows the
// "no projects lit yet" copy and the empty tile — instead of throwing and
// 500-ing the whole route. The next successful revalidate (revalidate: 60)
// swaps in the real data automatically.
const EMPTY_PROJECTS = { stats: { total: 0, hiring: 0 }, projects: [] };

async function loadProjects() {
  try {
    return (await getProjects()) || EMPTY_PROJECTS;
  } catch {
    return EMPTY_PROJECTS;
  }
}

export default async function ProjectsPage() {
  const data = await loadProjects();
  const stats = data?.stats || {};
  const projects = Array.isArray(data?.projects) ? data.projects : [];
  const hasProjects = projects.length > 0;

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
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
          <StartProjectCTA />
        </div>
        <ProjectsHeader stats={stats} />

        {hasProjects ? (
          // ProjectFilterBar wraps the project grid as its children so its
          // client-side filter (walking [data-project] cards) can show/hide the
          // server-rendered cards without a refetch.
          <ProjectFilterBar>
            <div className="ch-grid" style={{ marginTop: 24 }}>
              {projects.map((project, i) => (
                <ProjectBrowseCard key={project.id ?? i} project={project} index={i} />
              ))}
            </div>
          </ProjectFilterBar>
        ) : (
          <div style={{ marginTop: 40 }}>
            <div className="ch-empty">
              <span className="ch-empty-k">The workshop is quiet</span>
              <div className="ch-empty-t">Post the first project.</div>
              <div className="ch-empty-s">
                The city grows around whoever shows up. Light the first window —
                a startup or a volunteering effort — and others will gather.
              </div>
            </div>
          </div>
        )}

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
            Every great thing started as someone's project.
          </span>
        </div>
      </div>
    </main>
  );
}
