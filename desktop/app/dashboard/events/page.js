import { redirect } from "next/navigation";
import { getMe } from "@/lib/session";
import AdminShell from "@/components/dashboard/AdminShell";
import AdminEvents from "@/components/dashboard/AdminEvents";

// /dashboard/events — event content management. SERVER wrapper: gates on the
// session (no cookie → /login), then renders the AdminShell. Non-admins get the
// graceful "founders & admins only" card; admins get the client table which
// loads GET /admin/events on mount (create/edit/approve/delete). Per-user +
// uncacheable.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Events — Command center",
  description: "Create, approve, and curate the events that light up the feed.",
};

const ADMIN_ROLES = new Set(["admin", "super_admin"]);

export default async function DashboardEventsPage() {
  const me = await getMe();
  if (!me) redirect("/login");

  const forbidden = !ADMIN_ROLES.has(me.role);

  return (
    <AdminShell
      active="events"
      kicker="Command center · Events"
      title="Every"
      titleAccent="opportunity"
      subtitle="Post hackathons, scholarships, and internships — approve the ones partners submit, and each announces itself to the group."
      forbidden={forbidden}
    >
      {!forbidden && <AdminEvents />}
    </AdminShell>
  );
}
