import { redirect } from "next/navigation";
import { getMe } from "@/lib/session";
import AdminShell from "@/components/dashboard/AdminShell";
import AdminSystem from "@/components/dashboard/AdminSystem";

// /dashboard/system — the audit log, error log, and data exports. SERVER
// wrapper: gates on the session (no cookie → /login), then renders the
// AdminShell. Non-admins get the graceful "founders & admins only" card; admins
// get the read-only logs (GET /admin/audit + /admin/errors). The export buttons
// hit super-admin-only endpoints, so they're disabled with a note for plain
// admins (`me` is passed down so the client knows the role).
export const dynamic = "force-dynamic";

export const metadata = {
  title: "System — Command center",
  description: "Audit trail, error log, and full-data exports.",
};

const ADMIN_ROLES = new Set(["admin", "super_admin"]);

export default async function DashboardSystemPage() {
  const me = await getMe();
  if (!me) redirect("/login");

  const forbidden = !ADMIN_ROLES.has(me.role);

  return (
    <AdminShell
      active="system"
      kicker="Command center · System"
      title="Under the"
      titleAccent="floorboards"
      subtitle="Who did what, what broke, and a full export when you need to take the data with you."
      forbidden={forbidden}
    >
      {!forbidden && <AdminSystem me={me} />}
    </AdminShell>
  );
}
