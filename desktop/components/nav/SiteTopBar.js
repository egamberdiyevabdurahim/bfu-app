import { getMe } from "@/lib/session";
import AppNav from "@/components/nav/AppNav";
import PublicNav from "@/components/nav/PublicNav";

// The auth-aware site nav for PUBLIC pages (/, /city, /projects, /u/[id],
// /p/[id]). A server component: it reads the httpOnly session cookie via
// getMe() and branches:
//   • logged in  → the FULL app nav (AppNav) with the notifications bell +
//     "You" account menu, so a logged-in user browsing a public page can still
//     reach home, settings, projects, notifications, everything.
//   • logged out → the public nav (brand + Explore + a clear "Log in" button).
//
// Because getMe() reads cookies, any page that renders <SiteTopBar/> must be
// dynamic (the public pages already fetch per-request / ISR data, but we force
// dynamic here to be safe — the nav must reflect the *viewer's* auth state, not
// a cached anonymous render).
//
// `me` is passed to AppNav as `initialMe` so the client bar renders correctly on
// first paint without a second /users/me round-trip.

export default async function SiteTopBar({ active }) {
  const me = await getMe();
  return me ? <AppNav active={active} initialMe={me} /> : <PublicNav active={active} />;
}
