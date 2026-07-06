import Link from "next/link";
import Atmosphere from "@/components/Atmosphere";

// Warm, firelit "project not found" state — mirrors app/u/[id]/not-found.js in
// spirit but leans into the Chorsu bento tokens (Bricolage headline, Instrument
// Serif accent, ember glow) instead of the old inline-sans placeholder.
export default function ProjectNotFound() {
  return (
    <main style={{ position: "relative", minHeight: "100vh", overflow: "hidden" }}>
      <Atmosphere />
      <div
        style={{
          position: "relative",
          zIndex: 2,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 18,
          padding: "0 40px",
          textAlign: "center",
        }}
      >
        <div
          className="ch-cell-label"
          style={{ color: "var(--amber)" }}
        >
          Project not found
        </div>
        <h1
          style={{
            margin: 0,
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: 54,
            lineHeight: 1.02,
            letterSpacing: "-0.02em",
            color: "var(--text)",
            maxWidth: 620,
          }}
        >
          This ember has gone out
        </h1>
        <p
          style={{
            margin: 0,
            fontFamily: "var(--font-accent)",
            fontStyle: "italic",
            fontSize: 22,
            color: "var(--muted)",
            maxWidth: 520,
            lineHeight: 1.4,
          }}
        >
          The project you're looking for isn't here — it may be a draft, still
          awaiting approval, or gone.
        </p>
        <Link href="/city" className="ch-btn-primary" style={{ marginTop: 10 }}>
          Wander the city instead <span style={{ fontSize: 14 }}>↗</span>
        </Link>
      </div>
    </main>
  );
}
