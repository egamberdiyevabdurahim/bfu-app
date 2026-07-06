export default function ProfileNotFound() {
  return (
    <main style={{ minHeight: "100vh", background: "#0B0A08", color: "#F5F1E8",
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", gap: 12, fontFamily: "sans-serif" }}>
      <h1 style={{ fontFamily: "'Bricolage Grotesque', sans-serif" }}>Profile not found</h1>
      <p style={{ color: "#A8A093" }}>This BFU builder doesn't exist (yet).</p>
    </main>
  );
}
