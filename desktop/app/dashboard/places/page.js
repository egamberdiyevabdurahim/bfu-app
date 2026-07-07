import { redirect } from "next/navigation";
import { getMe } from "@/lib/session";
import AdminShell from "@/components/dashboard/AdminShell";
import AdminPlaces from "@/components/dashboard/AdminPlaces";

// /dashboard/places — schools + learning centers content management. SERVER
// wrapper: gates on the session (no cookie → /login), then renders the
// AdminShell. Non-admins get the graceful "founders & admins only" card; admins
// get the client view which loads GET /admin/schools and
// GET /admin/learning-centers on mount (two sections, each create/edit/delete).
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Places — Command center",
  description: "Map the schools and learning centers, and link their Telegram groups.",
};

const ADMIN_ROLES = new Set(["admin", "super_admin"]);

export default async function DashboardPlacesPage() {
  const me = await getMe();
  if (!me) redirect("/login");

  const forbidden = !ADMIN_ROLES.has(me.role);

  return (
    <AdminShell
      active="places"
      kicker="Command center · Places"
      title="Every"
      titleAccent="hearth"
      subtitle="Schools and learning centers across the country — pin them to a region and link their group so builders find each other locally."
      forbidden={forbidden}
    >
      {!forbidden && <AdminPlaces />}
    </AdminShell>
  );
}
