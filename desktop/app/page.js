import { redirect } from "next/navigation";

// The app is behind login. Root → /home; middleware bounces unauthenticated
// visitors from /home (and every other gated route) to /login, so the front
// door is always the Telegram login for logged-out users, and the dashboard for
// members.
export default function Home() {
  redirect("/home");
}
