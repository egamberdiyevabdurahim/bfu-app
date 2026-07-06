import { notFound } from "next/navigation";
import { getPublicProfile } from "@/lib/bfu-api";

export async function generateMetadata({ params }) {
  const { id } = await params;
  const profile = await getPublicProfile(id);
  if (!profile) return { title: "Profile not found — BFU" };

  const description = profile.currently_building
    ? `Building: ${profile.currently_building}`
    : (profile.about || "Bright Futures Uzbekistan builder").slice(0, 160);

  return {
    title: `${profile.name} — Bright Futures Uzbekistan`,
    description,
    openGraph: {
      title: `${profile.name} — Bright Futures Uzbekistan`,
      description,
      url: profile.canonical_url,
      images: [{ url: profile.og_image_url, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      images: [profile.og_image_url],
    },
  };
}

export default async function ProfilePage({ params }) {
  const { id } = await params;
  const profile = await getPublicProfile(id);
  if (!profile) notFound();

  return (
    <main style={{ position: "relative", minHeight: "100vh" }}>
      <div className="ch-glow-a" />
      <div className="ch-glow-b" />
      <div className="ch-grain" />
      <div style={{ position: "relative", zIndex: 2, maxWidth: 1200, margin: "0 auto",
        padding: "26px 40px 96px" }}>
        <h1 style={{ fontFamily: "var(--font-display)" }}>{profile.name}</h1>
        <p style={{ color: "var(--muted)" }}>
          Full bento layout arrives in Tasks 10-19 — this proves data fetching + metadata work end to end.
        </p>
      </div>
    </main>
  );
}
