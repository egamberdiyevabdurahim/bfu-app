import { useT } from "./i18n";
import { FontLoader } from "./components/Shared";

export const Landing = () => {
  const { t, lang, setLang } = useT();
  const tgUrl = "https://t.me/BrightFuturesUzbekistan_bot";

  const features = [
    { emoji: "🚀", title: t("land.f1.title"), body: t("land.f1.body") },
    { emoji: "🤝", title: t("land.f2.title"), body: t("land.f2.body") },
    { emoji: "📅", title: t("land.f3.title"), body: t("land.f3.body") },
  ];

  return (
    <>
      <FontLoader />
      <div style={{
        minHeight: "100dvh", background: "var(--bg)", color: "var(--text)",
        fontFamily: "var(--font-body)", overflow: "auto",
      }}>
        <div style={{ maxWidth: 920, margin: "0 auto", padding: "28px 22px 60px" }}>

          {/* Top bar */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 50 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: "linear-gradient(135deg, var(--accent), #A78BFA)",
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
              }}>✦</div>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, letterSpacing: "-0.01em" }}>BFU</div>
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              {["en","uz","ru"].map(l => (
                <button key={l} onClick={() => setLang(l)} style={{
                  padding: "6px 10px", fontSize: 12, fontWeight: 600,
                  background: lang === l ? "var(--accent-dim)" : "transparent",
                  color: lang === l ? "var(--accent)" : "var(--text-3)",
                  border: `1px solid ${lang === l ? "var(--accent)" : "var(--border)"}`,
                  borderRadius: 99, cursor: "pointer", textTransform: "uppercase",
                }}>{l}</button>
              ))}
            </div>
          </div>

          {/* Hero */}
          <div style={{ textAlign: "center", padding: "20px 0 36px" }}>
            <div style={{
              fontFamily: "var(--font-display)", fontSize: 42, fontWeight: 800,
              lineHeight: 1.05, letterSpacing: "-0.02em", marginBottom: 14,
            }}>{t("land.hero.title")}</div>
            <p style={{ color: "var(--text-2)", fontSize: 17, lineHeight: 1.55, maxWidth: 580, margin: "0 auto 28px" }}>
              {t("land.hero.body")}
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              <a href={tgUrl} target="_blank" rel="noopener noreferrer" style={{
                padding: "14px 26px", fontWeight: 700, fontSize: 15, textDecoration: "none",
                background: "var(--accent)", color: "#fff", borderRadius: 12,
                boxShadow: "0 8px 32px var(--accent-glow)", fontFamily: "var(--font-display)",
              }}>{t("land.cta.telegram")}</a>
              <a href="/app" style={{
                padding: "14px 26px", fontWeight: 700, fontSize: 15, textDecoration: "none",
                background: "var(--surface-2)", color: "var(--text)", borderRadius: 12,
                border: "1px solid var(--border)", fontFamily: "var(--font-display)",
              }}>{t("land.cta.web")}</a>
            </div>
          </div>

          {/* Features */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 14, marginTop: 18,
          }}>
            {features.map((f, i) => (
              <div key={i} style={{
                background: "var(--surface)", border: "1px solid var(--border)",
                borderRadius: 14, padding: "18px 18px 20px",
              }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>{f.emoji}</div>
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{f.title}</div>
                <div style={{ color: "var(--text-2)", fontSize: 13, lineHeight: 1.55 }}>{f.body}</div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div style={{ marginTop: 60, padding: "20px 0", borderTop: "1px solid var(--border)",
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        flexWrap: "wrap", gap: 12, color: "var(--text-3)", fontSize: 12 }}>
            <div>© Bright Futures Uzbekistan</div>
            <div style={{ display: "flex", gap: 16 }}>
              <a href={tgUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--text-2)", textDecoration: "none" }}>Telegram</a>
              <a href="/app" style={{ color: "var(--text-2)", textDecoration: "none" }}>{t("land.cta.web")}</a>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
