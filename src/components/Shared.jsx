import { useState } from "react";
import { Icon } from "./Icons";
import { useT } from "../i18n";

// Warm "firelit" gradient per user — replaces the old random-hue avatar bg.
// Deterministic from the name so a person keeps the same ember/amber/teal tone.
const AV_GRADIENTS = [
  ["#FF6A3D", "#C0563B"], // ember → terra
  ["#E8A15C", "#C0563B"], // amber → terra
  ["#5EC5B6", "#12564F"], // teal-bright → teal
  ["#7FB069", "#12564F"], // green → teal
  ["#E8A15C", "#FF6A3D"], // amber → ember
];

export const AvatarEl = ({ name = "?", size = 40, photoUrl = null }) => {
  const safeName = name?.trim() || "?";
  const initials = safeName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const [g0, g1] = AV_GRADIENTS[(safeName.charCodeAt(0) || 0) % AV_GRADIENTS.length];
  const [failed, setFailed] = useState(false);
  if (photoUrl && !failed) {
    return (
      <img
        src={photoUrl}
        alt={initials}
        onError={() => setFailed(true)}
        className="avatar"
        style={{ width: size, height: size, objectFit: "cover", border: "1px solid var(--hair)" }}
      />
    );
  }
  return (
    <div className="avatar" style={{
      width: size, height: size, fontSize: size * 0.4,
      background: `linear-gradient(135deg, ${g0}, ${g1})`,
      color: "#160E08", border: "none",
    }}>
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
    { id: "events", emoji: "◷", label: t("nav.events") },
    { id: "settings", icon: "settings", label: t("nav.profile") },
  ];
  return (
    <nav style={{
      position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)",
      width: "100%", maxWidth: 430,
      background: "rgba(20,18,15,0.94)", backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)",
      borderTop: "1px solid var(--hair)",
      display: "flex", alignItems: "center",
      padding: "8px 4px calc(12px + var(--safe-b))",
      zIndex: 100,
    }}>
      {tabs.map(tab => {
        const on = active === tab.id;
        return (
          <button key={tab.id} onClick={() => onChange(tab.id)} style={{
            flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
            background: "none", border: "none", cursor: "pointer", padding: "6px 0",
            color: on ? "var(--amber)" : "var(--muted)",
            transition: "color 0.2s", position: "relative",
          }}>
            {on && (
              <div style={{
                position: "absolute", top: -8, left: "50%", transform: "translateX(-50%)",
                width: 30, height: 3, background: "linear-gradient(90deg, var(--amber), var(--terra))",
                borderRadius: "0 0 4px 4px", boxShadow: "0 0 10px rgba(232,161,92,0.6)",
              }} />
            )}
            {tab.icon
              ? <Icon name={tab.icon} size={22} strokeWidth={on ? 2.2 : 1.7} />
              : <span style={{ fontSize: 21, lineHeight: 1, opacity: on ? 1 : 0.75 }}>{tab.emoji}</span>}
            <span style={{ fontSize: 10, fontWeight: on ? 700 : 500, fontFamily: "var(--font-display)", letterSpacing: "0.02em" }}>
              {tab.label}
            </span>
          </button>
        );
      })}
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
    height: "var(--app-h, 100dvh)", overflowY: "auto", overflowX: "hidden",
    paddingBottom: 90,
    animation: "fadeUp 0.35s ease",
    ...style,
  }}>
    {children}
  </div>
);

// The Chorsu "firelit Chorsu bazaar" design system, ported from the desktop app
// (desktop/app/globals.css) and adapted for the mobile Mini App. Same tokens &
// class names the screens already use — so re-skinning is design-system-wide —
// but restyled: warm #0B0A08 dark, ember/amber palette, Bricolage Grotesque +
// Instrument Serif (italic accents) + Space Mono, pill buttons, hairline cards.
export const FontLoader = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=Instrument+Serif:ital@0;1&family=Space+Mono:wght@400;700&display=swap');
    @import url('https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700,900&display=swap');

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      /* Chorsu firelit palette */
      --bg: #0B0A08;
      --surface: #1A1815;
      --surface-2: #232019;
      --surface-3: #2E2A22;
      --hair: #332E26;
      --ember: #FF6A3D;
      --amber: #E8A15C;
      --terra: #C0563B;
      --teal: #12564F;
      --teal-bright: #5EC5B6;
      --green: #7FB069;
      --text: #F5F1E8;
      --text-2: #C6BEAF;   /* muted-strong */
      --text-3: #A8A093;   /* muted */

      /* Back-compat aliases so existing inline var(--*) usages re-skin cleanly */
      --accent: #E8A15C;
      --accent-dim: rgba(232,161,92,0.14);
      --accent-glow: rgba(255,106,61,0.30);
      --coral: #C0563B;
      --mint: #5EC5B6;
      --border: #332E26;

      --app-h: 100dvh;
      --safe-b: env(safe-area-inset-bottom, 0px);
      --safe-t: env(safe-area-inset-top, 0px);
      --radius: 20px;
      --radius-sm: 12px;
      --radius-xs: 8px;
      --radius-pill: 99px;
      --font-display: 'Bricolage Grotesque', sans-serif;
      --font-accent: 'Instrument Serif', serif;
      --font-mono: 'Space Mono', monospace;
      --font-body: 'Satoshi', 'Bricolage Grotesque', sans-serif;
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

    ::selection { background: rgba(232,161,92,0.28); color: var(--text); }

    button, a, [role="button"], input, select, textarea { touch-action: manipulation; }
    button, [role="button"] { min-height: 36px; }
    ::-webkit-scrollbar { width: 0px; }

    @keyframes fadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes slideInRight { from { opacity: 0; transform: translateX(24px); } to { opacity: 1; transform: translateX(0); } }
    @keyframes cardFloat { 0%, 100% { transform: translateY(0) rotate(-1deg); } 50% { transform: translateY(-6px) rotate(-1deg); } }
    @keyframes spin { 100% { transform: rotate(360deg); } }
    @keyframes shimmer { 100% { background-position: -200% 0; } }

    /* Serif italic accent — the signature Chorsu flourish for names/highlights */
    .accent-serif { font-family: var(--font-accent); font-style: italic; font-weight: 400; color: var(--amber); }

    .btn-primary {
      background: linear-gradient(135deg, var(--amber), var(--terra));
      color: #160E08;
      border: none;
      border-radius: var(--radius-pill);
      font-family: var(--font-body);
      font-weight: 700;
      font-size: 15px;
      padding: 14px 24px;
      cursor: pointer;
      width: 100%;
      transition: transform 0.18s cubic-bezier(0.2,1.3,0.4,1), box-shadow 0.2s ease;
      box-shadow: 0 8px 26px rgba(232,161,92,0.26);
    }
    .btn-primary:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 12px 34px rgba(232,161,92,0.34); }
    .btn-primary:active:not(:disabled) { transform: translateY(0); }
    .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

    .btn-ghost {
      background: rgba(35,32,25,0.6);
      color: var(--text);
      border: 1px solid var(--hair);
      border-radius: var(--radius-pill);
      font-family: var(--font-body);
      font-weight: 500;
      font-size: 14px;
      padding: 12px 20px;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .btn-ghost:hover { border-color: var(--amber); background: rgba(35,32,25,0.9); }

    .chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: var(--surface-2);
      border: 1px solid var(--hair);
      border-radius: var(--radius-pill);
      padding: 5px 12px;
      font-size: 12px;
      font-weight: 500;
      color: var(--text-2);
      font-family: var(--font-body);
    }
    .chip.active {
      background: var(--accent-dim);
      border-color: var(--amber);
      color: var(--amber);
    }

    .input-field {
      background: var(--surface-2);
      border: 1px solid var(--hair);
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
    .input-field:focus { border-color: var(--amber); }

    .card {
      background: var(--surface);
      border: 1px solid var(--hair);
      border-radius: var(--radius);
      padding: 16px;
    }

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
      color: var(--amber);
      flex-shrink: 0;
    }

    .tag {
      display: inline-block;
      background: var(--accent-dim);
      color: var(--amber);
      border-radius: 6px;
      padding: 3px 8px;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.02em;
    }

    .section-label {
      font-family: var(--font-mono);
      font-size: 11px;
      font-weight: 400;
      letter-spacing: 0.16em;
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
      background: var(--amber);
      border: 3px solid var(--surface);
      cursor: pointer;
      box-shadow: 0 0 10px rgba(232,161,92,0.4);
    }
  `}</style>
);
