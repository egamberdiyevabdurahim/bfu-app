import { redirect } from "next/navigation";
import { getMe } from "@/lib/session";
import RegisterFlow from "@/components/register/RegisterFlow";

// Per-user (reads the session cookie) → never cached.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Join — Bright Futures Uzbekistan",
  description: "Finish setting up your builder profile.",
};

export default async function RegisterPage() {
  const me = await getMe();
  // Must be authenticated (came through the Telegram handshake) to register.
  if (!me) redirect("/login");
  // Already a member → nothing to do here.
  if (me.is_registered) redirect("/home");

  // The wizard fetches regions/schools/centers/groups client-side (it needs
  // region-scoped calls), so the page only has to gate + render.
  return <RegisterFlow me={me} />;
}
