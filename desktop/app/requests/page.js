import { redirect } from "next/navigation";
import { getMe } from "@/lib/session";
import AppTopBar from "@/components/nav/AppTopBar";
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
    <AppTopBar active="requests" me={me}>
        <div style={{ marginTop: 8, marginBottom: 8 }}>
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
    </AppTopBar>
  );
}
