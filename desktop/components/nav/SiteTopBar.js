import { getMe } from "@/lib/session";
import AppShell from "@/components/nav/AppShell";
import PublicNav from "@/components/nav/PublicNav";
import Atmosphere from "@/components/Atmosphere";

// The auth-aware site chrome for PUBLIC pages (/city, /projects, /u/[id],
// /p/[id]). A server component that reads the httpOnly session cookie via
// getMe() and WRAPS the page content, so the two auth states share one grammar:
//
//   • logged in  → the FULL left-sidebar app shell (AppShell), so a logged-in
//     user browsing a public page gets the exact same navigation as everywhere
//     else. The page's public content renders inside the shell's main region.
//   • logged out → a clean, refined public top bar (PublicNav) above the same
//     content, inside the firelit <main>/<Atmosphere>/container the public
//     pages used to own themselves.
//
// Public pages therefore pass their content as children:
//
//   <SiteTopBar active="city">{cityContent}</SiteTopBar>
//
// Because getMe() reads cookies, every page that renders <SiteTopBar/> must be
// dynamic — the public pages already set `export const dynamic = "force-dynamic"`.
//
// `maxWidth` tunes the logged-out container width (the city/projects surfaces
// used 1280; profile/project detail used 1200). Ignored when logged in (the
// shell's main region flexes on its own).

export default async function SiteTopBar({ active, children, maxWidth = 1280 }) {
  const me = await getMe();

  if (me) {
    return (
      <AppShell active={active} me={me}>
        {children}
      </AppShell>
    );
  }

  // Logged-out: keep the refined public top bar over the firelit atmosphere.
  return (
    <main style={{ position: "relative", minHeight: "100vh" }}>
      <Atmosphere />
      <div
        style={{
          position: "relative",
          zIndex: 2,
          maxWidth,
          margin: "0 auto",
          padding: "22px 40px 120px",
        }}
      >
        <PublicNav active={active} />
        {children}
      </div>
    </main>
  );
}
