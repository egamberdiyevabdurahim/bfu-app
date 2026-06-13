import { useState } from "react";
import { Icon } from "./Icons";
import { useT } from "../i18n";

export const AvatarEl = ({ name = "?", size = 40, photoUrl = null }) => {
  const safeName = name?.trim() || "?";
  const initials = safeName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const colors = ["#7B6FFF", "#FF6B6B", "#4ECDC4", "#FFB347", "#A78BFA", "#34D399"];
  const bg = colors[(safeName.charCodeAt(0) || 0) % colors.length];
  const [failed, setFailed] = useState(false);
  if (photoUrl && !failed) {
    return (
      <img
        src={photoUrl}
        alt={initials}
        onError={() => setFailed(true)}
        className="avatar"
        style={{ width: size, height: size, objectFit: "cover", border: `2px solid ${bg}44` }}
      />
    );
  }
  return (
    <div className="avatar" style={{ width: size, height: size, fontSize: size * 0.38, background: `${bg}22`, border: `2px solid ${bg}44`, color: bg }}>
      {initials}
    </div>
  );
};

export const BottomNav = ({ active, onChange }) => {
  const { t } = useT();
  const tabs = [
    { id: "discover", icon: "compass", label: t("nav.discover") },
    { id: "startups", icon: "rocket", label: t("nav.startups") },
    { id: "volunteer", icon: "heart", label: t("nav.volunteer") },
    { id: "events", emoji: "📅", label: t("nav.events") },
    { id: "settings", icon: "settings", label: t("nav.profile") },
  ];
  return (
    <nav style={{
      position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)",
      width: "100%", maxWidth: 430,
      background: "rgba(13,13,20,0.95)", backdropFilter: "blur(20px)",
      borderTop: "1px solid var(--border)",
      display: "flex", alignItems: "center",
      padding: "8px 4px calc(14px + var(--safe-b))",
      zIndex: 100,
    }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)} style={{
          flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
          background: "none", border: "none", cursor: "pointer", padding: "6px 0",
          color: active === t.id ? "var(--accent)" : "var(--text-3)",
          transition: "color 0.2s",
          position: "relative",
        }}>
          {active === t.id && (
            <div style={{
              position: "absolute", top: -8, left: "50%", transform: "translateX(-50%)",
              width: 32, height: 3, background: "var(--accent)",
              borderRadius: "0 0 4px 4px",
            }} />
          )}
          {t.icon
            ? <Icon name={t.icon} size={22} strokeWidth={active === t.id ? 2.2 : 1.6} />
            : <span style={{ fontSize: 20, lineHeight: 1, filter: active === t.id ? "none" : "grayscale(0.6) opacity(0.7)" }}>{t.emoji}</span>}
          <span style={{ fontSize: 10, fontWeight: active === t.id ? 700 : 400, fontFamily: "var(--font-display)", letterSpacing: "0.03em" }}>
            {t.label}
          </span>
        </button>
      ))}
    </nav>
  );
};

export const SkeletonList = ({ count = 4 }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "0 20px" }}>
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="card" style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <div className="skeleton" style={{ width: 48, height: 48, borderRadius: "50%", flexShrink: 0 }} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="skeleton" style={{ height: 14, width: "55%" }} />
          <div className="skeleton" style={{ height: 11, width: "85%" }} />
          <div className="skeleton" style={{ height: 11, width: "40%" }} />
        </div>
      </div>
    ))}
  </div>
);

export const Page = ({ children, style = {} }) => (
  <div style={{
    height: "100dvh", overflowY: "auto", overflowX: "hidden",
    paddingBottom: 90,
    animation: "fadeUp 0.35s ease",
    ...style,
  }}>
    {children}
  </div>
);

export const FontLoader = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;1,9..40,300&display=swap');

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg: #0A0A0F;
      --surface: #13131A;
      --surface-2: #1C1C28;
      --surface-3: #252535;
      --accent: #7B6FFF;
      --accent-dim: rgba(123,111,255,0.15);
      --accent-glow: rgba(123,111,255,0.35);
      --coral: #FF6B6B;
      --mint: #4ECDC4;
      --amber: #FFB347;
      --text: #F0F0FF;
      --text-2: #A6A6C0;
      --text-3: #83839B;
      --border: rgba(255,255,255,0.07);
      --app-h: 100dvh;
      --safe-b: env(safe-area-inset-bottom, 0px);
      --radius: 16px;
      --radius-sm: 10px;
      --radius-xs: 6px;
      --font-display: 'Syne', sans-serif;
      --font-body: 'DM Sans', sans-serif;
    }

    html, body, #root { height: var(--app-h); }

    body {
      background: var(--bg);
      color: var(--text);
      font-family: var(--font-body);
      -webkit-font-smoothing: antialiased;
      overflow: hidden;
      overscroll-behavior: none;
    }

    button, a, [role="button"], input, select, textarea { touch-action: manipulation; }
    button, [role="button"] { min-height: 36px; }

    ::-webkit-scrollbar { width: 0px; }

    @keyframes fadeUp {
      from { opacity: 0; transform: translateY(16px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes fadeIn {
      from { opacity: 0; }
      to   { opacity: 1; }
    }
    @keyframes slideInRight {
      from { opacity: 0; transform: translateX(24px); }
      to   { opacity: 1; transform: translateX(0); }
    }
    @keyframes cardFloat {
      0%, 100% { transform: translateY(0px) rotate(-1deg); }
      50% { transform: translateY(-6px) rotate(-1deg); }
    }
    @keyframes spin {
      100% { transform: rotate(360deg); }
    }

    .btn-primary {
      background: var(--accent);
      color: #fff;
      border: none;
      border-radius: var(--radius-sm);
      font-family: var(--font-display);
      font-weight: 600;
      font-size: 15px;
      padding: 14px 24px;
      cursor: pointer;
      width: 100%;
      transition: all 0.2s ease;
      box-shadow: 0 4px 24px var(--accent-glow);
    }
    .btn-primary:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 8px 32px var(--accent-glow); }
    .btn-primary:active:not(:disabled) { transform: translateY(0); }
    .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }

    .btn-ghost {
      background: var(--surface-2);
      color: var(--text-2);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      font-family: var(--font-body);
      font-weight: 500;
      font-size: 14px;
      padding: 12px 20px;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .btn-ghost:hover { background: var(--surface-3); color: var(--text); }

    .chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: var(--surface-2);
      border: 1px solid var(--border);
      border-radius: 20px;
      padding: 4px 10px;
      font-size: 12px;
      font-weight: 500;
      color: var(--text-2);
    }
    .chip.active {
      background: var(--accent-dim);
      border-color: var(--accent);
      color: var(--accent);
    }

    .input-field {
      background: var(--surface-2);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      color: var(--text);
      font-family: var(--font-body);
      font-size: 16px;
      padding: 13px 16px;
      width: 100%;
      outline: none;
      transition: border-color 0.2s;
    }
    .input-field::placeholder { color: var(--text-3); }
    .input-field:focus { border-color: var(--accent); }

    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 16px;
    }

    @keyframes shimmer { 100% { background-position: -200% 0; } }
    .skeleton {
      background: linear-gradient(90deg, var(--surface-2) 25%, var(--surface-3) 37%, var(--surface-2) 63%);
      background-size: 200% 100%;
      animation: shimmer 1.3s ease-in-out infinite;
      border-radius: var(--radius-sm);
    }

    .avatar {
      border-radius: 50%;
      object-fit: cover;
      background: var(--surface-3);
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: var(--font-display);
      font-weight: 700;
      color: var(--accent);
      flex-shrink: 0;
    }

    .tag {
      display: inline-block;
      background: var(--accent-dim);
      color: var(--accent);
      border-radius: 6px;
      padding: 3px 8px;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.02em;
    }

    .section-label {
      font-family: var(--font-display);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--text-3);
      margin-bottom: 12px;
    }

    .dual-thumb {
      position: absolute;
      width: 100%;
      -webkit-appearance: none;
      appearance: none;
      pointer-events: none;
      background: transparent;
      outline: none;
    }
    .dual-thumb::-webkit-slider-thumb {
      -webkit-appearance: none;
      pointer-events: auto;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: var(--accent);
      border: 3px solid var(--surface);
      cursor: pointer;
      box-shadow: 0 0 10px rgba(123,111,255,0.3);
    }
  `}</style>
);
