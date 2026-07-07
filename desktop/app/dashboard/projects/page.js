import { redirect } from "next/navigation";
import { getMe } from "@/lib/session";
import AdminShell from "@/components/dashboard/AdminShell";
import AdminProjects from "@/components/dashboard/AdminProjects";

// /dashboard/projects — the moderation queue. Approving a project is THE gate
// that makes it public (it starts showing on /projects + /p/{id}). SERVER
// wrapper gates on session; non-admins see the graceful card.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Projects — Command center",
  description: "Approve, pin, and moderate every project — approval is what makes them public.",
};

const ADMIN_ROLES = new Set(["admin", "super_admin"]);

export default async function DashboardProjectsPage() {
  const me = await getMe();
  if (!me) redirect("/login");

  const forbidden = !ADMIN_ROLES.has(me.role);

  return (
    <AdminShell
      active="projects"
      kicker="Command center · Projects"
      title="The moderation"
      titleAccent="queue"
      subtitle="Pending projects wait here for your nod. Approve one and it goes public across the city."
      forbidden={forbidden}
    >
      {!forbidden && <AdminProjects me={me} />}
    </AdminShell>
  );
}
