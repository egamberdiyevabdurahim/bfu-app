import { redirect } from "next/navigation";
import { getMe } from "@/lib/session";
import RegisterFlow from "@/components/register/RegisterFlow";

// Per-user (reads the session cookie) → never cached.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Join — Bright Futures Uzbekistan",
  description: "Finish setting up your builder profile.",
};

export default async function RegisterPage({ searchParams }) {
  const me = await getMe();
  // Must be authenticated (came through the Telegram handshake) to register.
  if (!me) redirect("/login");

  // ?preview=1 lets an already-registered member (e.g. the founder) walk the
  // wizard for review WITHOUT the redirect and WITHOUT being able to submit.
  const sp = (await searchParams) || {};
  const preview = (sp.preview === "1" || sp.preview === "true") && me.is_registered;

  // Already a member → home, unless they're explicitly previewing.
  if (me.is_registered && !preview) redirect("/home");

  // The wizard fetches regions/schools/centers/groups client-side (it needs
  // region-scoped calls), so the page only has to gate + render.
  return <RegisterFlow me={me} preview={preview} />;
}
