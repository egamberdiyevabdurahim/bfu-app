import Link from "next/link";
import { getProjects } from "@/lib/bfu-api";
import { asset } from "@/lib/asset";
import { getT } from "@/lib/i18n/server";
import SiteTopBar from "@/components/nav/SiteTopBar";
import ProjectsHeader from "@/components/ProjectsHeader";
import ProjectFilterBar from "@/components/ProjectFilterBar";
import ProjectBrowseCard from "@/components/ProjectBrowseCard";
import StartProjectCTA from "@/components/projects/StartProjectCTA";
import SiteFooter from "@/components/ui/SiteFooter";

// The nav (SiteTopBar) reads the viewer's session cookie via getMe(), so this
// route must render per-request. The projects data is still ISR-cached inside
// getProjects()'s fetch wrapper.
export const dynamic = "force-dynamic";

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
  // asset() adds the "/web" basePath — metadataBase resolves this against the root
  // domain, which is the Mini App, not us. See lib/asset.js.
  const ogImage = asset("/bfu-mark.png");

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
  const { t } = await getT();
  const data = await loadProjects();
  const stats = data?.stats || {};
  const projects = Array.isArray(data?.projects) ? data.projects : [];
  const hasProjects = projects.length > 0;

  return (
    <SiteTopBar active="projects" maxWidth={1280}>
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
              <span className="ch-empty-k">{t("projects.empty_quiet_k")}</span>
              <div className="ch-empty-t">{t("projects.empty_quiet_t")}</div>
              <div className="ch-empty-s">{t("projects.empty_quiet_s")}</div>
              {/* An empty screen with no action is a dead end, and with few users
                  the app NEEDS projects — so this is the one place that must ASK
                  for one. Deliberately NOT reusing <StartProjectCTA> here: it's a
                  client island that probes GET /users/me and returns null on anon
                  OR on any transient error, so the single CTA that must always be
                  present could silently vanish. It also ships a second "Your
                  projects" ghost button, which is meaningless when you have none.
                  /projects is auth-gated in middleware.js, so every reader of this
                  state is already logged in — an unconditional link is simpler and
                  strictly safer.
                  next/link applies the "/web" basePath automatically; a plain <a>
                  would have to spell out "/web/projects/new". */}
              <Link
                href="/projects/new"
                className="ch-btn-primary"
                style={{ marginTop: 8 }}
              >
                <span aria-hidden>🚀</span>
                {t("projects.start_project")}
              </Link>
            </div>
          </div>
        )}

        <SiteFooter
          tagline={t("projects.footer_tagline")}
          host="brightfuturesuzbekistan.uz"
        />
    </SiteTopBar>
  );
}
