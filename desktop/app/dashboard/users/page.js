import { redirect } from "next/navigation";
import { getMe } from "@/lib/session";
import AdminShell from "@/components/dashboard/AdminShell";
import AdminUsers from "@/components/dashboard/AdminUsers";

// /dashboard/users — the user moderation table. SERVER wrapper: gates on the
// session (no cookie → /login), then renders the AdminShell. Non-admins get the
// graceful "founders & admins only" card; admins get the client table which
// loads GET /admin/users on mount. Per-user + uncacheable.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Users — Command center",
  description: "Search, verify, and moderate every builder in the bazaar.",
};

const ADMIN_ROLES = new Set(["admin", "super_admin"]);

export default async function DashboardUsersPage() {
  const me = await getMe();
  if (!me) redirect("/login");

  const forbidden = !ADMIN_ROLES.has(me.role);

  return (
    <AdminShell
      active="users"
      kicker="Command center · Users"
      title="Every"
      titleAccent="builder"
      subtitle="Search the roll, verify newcomers, correct profiles, and — when you must — ban or remove."
      forbidden={forbidden}
    >
      {!forbidden && <AdminUsers me={me} />}
    </AdminShell>
  );
}
