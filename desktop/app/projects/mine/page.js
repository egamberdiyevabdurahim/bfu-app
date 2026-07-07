import { redirect } from "next/navigation";
import { getMe } from "@/lib/session";
import Atmosphere from "@/components/Atmosphere";
import ProjectsTopBar from "@/components/projects/ProjectsTopBar";
import MyProjectsList from "@/components/projects/MyProjectsList";

// /projects/mine — "Your projects". Per-user + uncacheable. The server wrapper
// gates on the session and passes meId down; the client list loads
// GET /projects/mine on mount (with a loading state) so the list is always fresh
// after a create/edit/delete without an ISR window.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Your projects — Bright Futures Uzbekistan",
  description: "The projects you've started and the teams you've joined.",
};

export default async function MyProjectsPage() {
  const me = await getMe();
  if (!me) redirect("/login");

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
        <ProjectsTopBar active="mine" />

        <div style={{ marginTop: 40, marginBottom: 30 }}>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "var(--amber)",
            }}
          >
            Your corner of the bazaar
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
            Your{" "}
            <span
              style={{
                fontFamily: "var(--font-accent)",
                fontStyle: "italic",
                fontWeight: 400,
                color: "var(--amber)",
              }}
            >
              projects
            </span>
          </h1>
        </div>

        <MyProjectsList meId={me.id} />
      </div>
    </main>
  );
}
