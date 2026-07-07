import { redirect } from "next/navigation";
import { getMe } from "@/lib/session";
import AdminShell from "@/components/dashboard/AdminShell";
import AdminBroadcast from "@/components/dashboard/AdminBroadcast";

// /dashboard/broadcast — the announcement composer. SUPER-ADMIN only (the
// backend gates POST /admin/broadcast with get_super_admin_user). SERVER wrapper
// gates on session; non-admins get the graceful card, plain admins get a
// "super-admins only" note inside the composer.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Broadcast — Command center",
  description: "Send a Telegram announcement to the whole bazaar.",
};

const ADMIN_ROLES = new Set(["admin", "super_admin"]);

export default async function DashboardBroadcastPage() {
  const me = await getMe();
  if (!me) redirect("/login");

  const forbidden = !ADMIN_ROLES.has(me.role);

  return (
    <AdminShell
      active="broadcast"
      kicker="Command center · Broadcast"
      title="Speak to the"
      titleAccent="whole bazaar"
      subtitle="A single Telegram message to every member — optionally just one region, or only verified builders."
      forbidden={forbidden}
    >
      {!forbidden && <AdminBroadcast me={me} />}
    </AdminShell>
  );
}
