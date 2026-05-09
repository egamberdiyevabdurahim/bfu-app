import { Icon } from "./Icons";

export const AvatarEl = ({ name = "?", size = 40 }) => {
  const safeName = name?.trim() || "?";
  const initials = safeName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const colors = ["#7B6FFF", "#FF6B6B", "#4ECDC4", "#FFB347", "#A78BFA", "#34D399"];
  const bg = colors[(safeName.charCodeAt(0) || 0) % colors.length];
  return (
    <div className="avatar" style={{ width: size, height: size, fontSize: size * 0.38, background: `${bg}22`, border: `2px solid ${bg}44`, color: bg }}>
      {initials}
    </div>
  );
};

export const BottomNav = ({ active, onChange }) => {
  const tabs = [
    { id: "discover", icon: "compass", label: "Discover" },
    { id: "startups", icon: "rocket", label: "Startups" },
    { id: "volunteer", icon: "heart", label: "Volunteer" },
    { id: "settings", icon: "settings", label: "Profile" },
  ];
  return (
    <nav style={{
      position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)",
      width: "100%", maxWidth: 430,
      background: "rgba(13,13,20,0.95)", backdropFilter: "blur(20px)",
      borderTop: "1px solid var(--border)",
      display: "flex", alignItems: "center",
      padding: "8px 4px 20px",
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
          <Icon name={t.icon} size={22} strokeWidth={active === t.id ? 2.2 : 1.6} />
          <span style={{ fontSize: 10, fontWeight: active === t.id ? 700 : 400, fontFamily: "var(--font-display)", letterSpacing: "0.03em" }}>
            {t.label}
          </span>
        </button>
      ))}
    </nav>
  );
};

export const Page = ({ children, style = {} }) => (
  <div style={{
    height: "100vh", overflowY: "auto", overflowX: "hidden",
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
      --text-2: #9090A8;
      --text-3: #5A5A70;
      --border: rgba(255,255,255,0.07);
      --radius: 16px;
      --radius-sm: 10px;
      --radius-xs: 6px;
      --font-display: 'Syne', sans-serif;
      --font-body: 'DM Sans', sans-serif;
    }

    body {
      background: var(--bg);
      color: var(--text);
      font-family: var(--font-body);
      -webkit-font-smoothing: antialiased;
      overflow: hidden;
      height: 100vh;
    }

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
      font-size: 15px;
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
