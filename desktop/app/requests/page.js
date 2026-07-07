import { redirect } from "next/navigation";
import { getMe } from "@/lib/session";
import Atmosphere from "@/components/Atmosphere";
import ProjectsTopBar from "@/components/projects/ProjectsTopBar";
import RequestsList from "@/components/projects/RequestsList";

// /requests — "Applications": the founder's inbox of pending applications
// submitted TO the current user's projects (GET /projects/my-requests). Per-user
// + uncacheable. The client list loads on mount and lets the founder accept or
// reject inline.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Applications — Bright Futures Uzbekistan",
  description: "Builders asking to join your projects.",
};

export default async function RequestsPage() {
  const me = await getMe();
  if (!me) redirect("/login");

  return (
    <main style={{ position: "relative", minHeight: "100vh" }}>
      <Atmosphere />

      <div
        style={{
          position: "relative",
          zIndex: 2,
          maxWidth: 1100,
          margin: "0 auto",
          padding: "26px 40px 96px",
        }}
      >
        <ProjectsTopBar active="requests" />

        <div style={{ marginTop: 40, marginBottom: 8 }}>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "var(--amber)",
            }}
          >
            Who wants in
          </div>
          <h1
            style={{
              margin: "14px 0 0",
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: 52,
              lineHeight: 1.0,
              letterSpacing: "-0.02em",
              color: "var(--text)",
            }}
          >
            Your{" "}
            <span
              style={{
                fontFamily: "var(--font-accent)",
                fontStyle: "italic",
                fontWeight: 400,
                color: "var(--amber)",
              }}
            >
              applications
            </span>
          </h1>
          <p
            style={{
              margin: "16px 0 0",
              fontFamily: "var(--font-accent)",
              fontStyle: "italic",
              fontSize: 20,
              lineHeight: 1.35,
              color: "var(--muted)",
              maxWidth: 560,
            }}
          >
            Builders asking to join the projects you've started.
          </p>
        </div>

        <RequestsList />
      </div>
    </main>
  );
}
