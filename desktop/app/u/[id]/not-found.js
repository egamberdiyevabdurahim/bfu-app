import { getT } from "@/lib/i18n/server";

export default async function ProfileNotFound() {
  const { t } = await getT();
  return (
    <main style={{ minHeight: "100vh", background: "#0B0A08", color: "#F5F1E8",
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", gap: 12, fontFamily: "sans-serif" }}>
      <h1 style={{ fontFamily: "'Bricolage Grotesque', sans-serif" }}>{t("profile.not_found_title")}</h1>
      <p style={{ color: "#A8A093" }}>{t("profile.not_found_body")}</p>
    </main>
  );
}
