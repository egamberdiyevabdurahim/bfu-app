import { redirect } from "next/navigation";
import { getMe } from "@/lib/session";
import AdminShell from "@/components/dashboard/AdminShell";
import AdminReports from "@/components/dashboard/AdminReports";

// /dashboard/reports — the open-reports list. SERVER wrapper gates on session;
// non-admins see the graceful card.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Reports — Command center",
  description: "Open reports from the community — review the target and resolve.",
};

const ADMIN_ROLES = new Set(["admin", "super_admin"]);

export default async function DashboardReportsPage() {
  const me = await getMe();
  if (!me) redirect("/login");

  const forbidden = !ADMIN_ROLES.has(me.role);

  return (
    <AdminShell
      active="reports"
      kicker="Command center · Reports"
      title="What the city"
      titleAccent="flagged"
      subtitle="Members flag people and projects that don't belong. Open each target, then resolve."
      forbidden={forbidden}
    >
      {!forbidden && <AdminReports />}
    </AdminShell>
  );
}
