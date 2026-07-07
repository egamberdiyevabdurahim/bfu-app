import { redirect } from "next/navigation";
import { getMe } from "@/lib/session";
import AdminShell from "@/components/dashboard/AdminShell";
import AdminPartners from "@/components/dashboard/AdminPartners";

// /dashboard/partners — partner-organisation content management. SERVER wrapper:
// gates on the session (no cookie → /login), then renders the AdminShell.
// Non-admins get the graceful "founders & admins only" card; admins get the
// client table which loads GET /admin/partners on mount (create/edit/delete).
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Partners — Command center",
  description: "Curate the universities, companies, and NGOs backing the bazaar.",
};

const ADMIN_ROLES = new Set(["admin", "super_admin"]);

export default async function DashboardPartnersPage() {
  const me = await getMe();
  if (!me) redirect("/login");

  const forbidden = !ADMIN_ROLES.has(me.role);

  return (
    <AdminShell
      active="partners"
      kicker="Command center · Partners"
      title="Every"
      titleAccent="ally"
      subtitle="The organisations that host events and back projects — verify them, keep their profiles sharp."
      forbidden={forbidden}
    >
      {!forbidden && <AdminPartners />}
    </AdminShell>
  );
}
