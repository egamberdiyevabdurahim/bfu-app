import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getMe } from "@/lib/session";
import AppTopBar from "@/components/nav/AppTopBar";
import Messenger from "@/components/messages/Messenger";

// /messages — the in-app messenger. Per-user + uncacheable: the server wrapper
// gates on the session (unauth → /login), then the client component loads the
// conversation list on mount and polls for new messages. Reads ?c={id} to open
// a specific conversation (so profile "Message" buttons + message notifications
// deep-link straight into a thread).
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Messages — Bright Futures Uzbekistan",
  description: "Your direct messages and project team chats.",
};

export default async function MessagesPage() {
  const me = await getMe();
  if (!me) redirect("/login");

  return (
    <AppTopBar active="messages" me={me}>
      <div style={{ marginTop: 8, marginBottom: 22 }}>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "var(--amber)",
          }}
        >
          Talk to the city, one thread at a time
        </div>
        <h1
          style={{
            margin: "14px 0 0",
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: "clamp(30px, 5vw, 46px)",
            lineHeight: 1.04,
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
            messages
          </span>
        </h1>
      </div>

      <Suspense
        fallback={
          <div style={{ color: "var(--muted-strong)", fontSize: 14, padding: 40, textAlign: "center" }}>
            <span className="ch-spin" aria-hidden>◠</span> Loading messages…
          </div>
        }
      >
        <Messenger meId={me.id} />
      </Suspense>
    </AppTopBar>
  );
}
