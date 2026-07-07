import { redirect } from "next/navigation";
import { getMe } from "@/lib/session";
import { getRegions } from "@/lib/bfu-api";
import Atmosphere from "@/components/Atmosphere";
import ProjectsTopBar from "@/components/projects/ProjectsTopBar";
import CreateProjectForm from "@/components/projects/CreateProjectForm";

// /projects/new — the "start a project" surface. Reads the httpOnly session
// cookie (per-user), so it can never be cached.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Start a project — Bright Futures Uzbekistan",
  description: "Light a new window in the city — a startup or a volunteering effort.",
};

export default async function NewProjectPage() {
  const me = await getMe();
  if (!me) redirect("/login");

  // Region options for the multi-select (public, ISR-cached).
  const regions = await getRegions();

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
        <ProjectsTopBar active="new" />

        <div style={{ marginTop: 40, marginBottom: 34 }}>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "var(--amber)",
            }}
          >
            Light a new window
          </div>
          <h1
            style={{
              margin: "14px 0 0",
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: 52,
              lineHeight: 1.0,
              letterSpacing: "-0.02em",
              color: "var(--text)",
            }}
          >
            Start a{" "}
            <span
              style={{
                fontFamily: "var(--font-accent)",
                fontStyle: "italic",
                fontWeight: 400,
                color: "var(--amber)",
              }}
            >
              project
            </span>
          </h1>
          <p
            style={{
              margin: "16px 0 0",
              fontFamily: "var(--font-accent)",
              fontStyle: "italic",
              fontSize: 20,
              lineHeight: 1.35,
              color: "var(--muted)",
              maxWidth: 560,
            }}
          >
            Describe what you're building. Once it's approved, the city can find
            it — and builders can ask to join.
          </p>
        </div>

        <CreateProjectForm regions={regions} mode="create" />
      </div>
    </main>
  );
}
