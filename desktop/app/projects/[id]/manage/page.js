import { redirect } from "next/navigation";
import { getMe } from "@/lib/session";
import AppTopBar from "@/components/nav/AppTopBar";
import ProjectManager from "@/components/projects/ProjectManager";

// /projects/[id]/manage — the OWNER cockpit. Per-user + uncacheable. The server
// wrapper gates on the session; the client ProjectManager loads the authed
// GET /projects/{id}, verifies ownership (redirecting non-owners to /p/{id}),
// then renders applicants + edit + delete.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Manage your project — Bright Futures Uzbekistan",
  description: "Review applicants, edit the details, or close your project.",
};

export default async function ManageProjectPage({ params }) {
  const { id } = await params;
  const me = await getMe();
  if (!me) redirect("/login");

  return (
    <AppTopBar active="projects-mine" me={me}>
        <div style={{ marginTop: 8 }}>
          <ProjectManager projectId={id} meId={me.id} />
        </div>
    </AppTopBar>
  );
}
