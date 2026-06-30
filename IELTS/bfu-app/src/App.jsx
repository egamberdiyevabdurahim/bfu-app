import { useState, useEffect, useRef } from "react";

// ─── GOOGLE FONTS ────────────────────────────────────────────────────────────
const FontLoader = () => (
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

    /* scrollbar */
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
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    @keyframes shimmer {
      0% { background-position: -200% center; }
      100% { background-position: 200% center; }
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    @keyframes cardFloat {
      0%, 100% { transform: translateY(0px) rotate(-1deg); }
      50% { transform: translateY(-6px) rotate(-1deg); }
    }

    .fade-up { animation: fadeUp 0.4s ease forwards; }
    .fade-in { animation: fadeIn 0.3s ease forwards; }

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
    .btn-primary:hover { transform: translateY(-1px); box-shadow: 0 8px 32px var(--accent-glow); }
    .btn-primary:active { transform: translateY(0); }

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
  `}</style>
);

// ─── ICONS ───────────────────────────────────────────────────────────────────
const Icon = ({ name, size = 20, color = "currentColor", strokeWidth = 1.8 }) => {
  const paths = {
    compass: <><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></>,
    rocket: <><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></>,
    heart: <><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></>,
    users: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></>,
    handshake: <><path d="m11 17 2 2a1 1 0 1 0 3-3"/><path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4"/><path d="m21 3 1 11h-1"/><path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3"/><path d="M3 4h8"/></>,
    star: <><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></>,
    map: <><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" x2="9" y1="3" y2="18"/><line x1="15" x2="15" y1="6" y2="21"/></>,
    search: <><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>,
    bell: <><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></>,
    check: <><polyline points="20 6 9 17 4 12"/></>,
    x: <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
    plus: <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
    arrow_right: <><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></>,
    arrow_left: <><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></>,
    briefcase: <><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></>,
    zap: <><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></>,
    globe: <><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></>,
    code: <><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></>,
    link: <><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></>,
    mail: <><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></>,
    eye: <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>,
    filter: <><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></>,
    trending: <><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
};

// ─── AVATAR PLACEHOLDER ──────────────────────────────────────────────────────
const AvatarEl = ({ name = "?", size = 40, color = "#7B6FFF" }) => {
  const initials = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const colors = ["#7B6FFF", "#FF6B6B", "#4ECDC4", "#FFB347", "#A78BFA", "#34D399"];
  const bg = colors[name.charCodeAt(0) % colors.length];
  return (
    <div className="avatar" style={{ width: size, height: size, fontSize: size * 0.38, background: `${bg}22`, border: `2px solid ${bg}44`, color: bg }}>
      {initials}
    </div>
  );
};

// ─── BOTTOM NAV ──────────────────────────────────────────────────────────────
const BottomNav = ({ active, onChange }) => {
  const tabs = [
    { id: "discover", icon: "compass", label: "Discover" },
    { id: "startups", icon: "rocket", label: "Startups" },
    { id: "partner", icon: "handshake", label: "Partner" },
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

// ─── PAGE WRAPPER ─────────────────────────────────────────────────────────────
const Page = ({ children, style = {} }) => (
  <div style={{
    height: "100vh", overflowY: "auto", overflowX: "hidden",
    paddingBottom: 90,
    animation: "fadeUp 0.35s ease",
    ...style,
  }}>
    {children}
  </div>
);

// ─── SCREEN: AUTH ─────────────────────────────────────────────────────────────
const AuthScreen = ({ onAuth }) => {
  const [step, setStep] = useState("welcome"); // welcome | login | register
  const [form, setForm] = useState({ name: "", username: "", bio: "", skills: [] });
  const [regStep, setRegStep] = useState(0);

  const skillOptions = ["UI/UX", "Frontend", "Backend", "ML/AI", "Business", "Design", "Marketing", "Finance", "DevOps", "Mobile"];

  if (step === "welcome") return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", position: "relative", overflow: "hidden" }}>
      {/* bg glow */}
      <div style={{ position: "absolute", top: "20%", left: "50%", transform: "translateX(-50%)", width: 300, height: 300, background: "radial-gradient(circle, rgba(123,111,255,0.2) 0%, transparent 70%)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: "15%", right: -60, width: 200, height: 200, background: "radial-gradient(circle, rgba(78,205,196,0.15) 0%, transparent 70%)", pointerEvents: "none" }} />

      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 28px", textAlign: "center", gap: 24 }}>
        {/* logo */}
        <div style={{ animation: "cardFloat 3s ease-in-out infinite" }}>
          <div style={{
            width: 80, height: 80, background: "linear-gradient(135deg, var(--accent), #A78BFA)",
            borderRadius: 24, display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 16px 48px rgba(123,111,255,0.4)",
            fontSize: 36,
          }}>✦</div>
        </div>

        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 42, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.1 }}>
            BFU
          </h1>
          <p style={{ fontFamily: "var(--font-display)", fontSize: 14, color: "var(--accent)", letterSpacing: "0.2em", fontWeight: 600, marginTop: 4 }}>
            BRIGHT FUTURES UZBEKISTAN
          </p>
        </div>

        <p style={{ color: "var(--text-2)", fontSize: 16, lineHeight: 1.6, maxWidth: 280 }}>
          Connect with students, co-founders, and volunteers building the future of Uzbekistan.
        </p>

        <div style={{ display: "flex", gap: 12, width: "100%", marginTop: 8 }}>
          <button className="btn-primary" onClick={() => setStep("register")}>Get Started</button>
        </div>
        <button className="btn-ghost" style={{ width: "100%", borderRadius: "var(--radius-sm)" }} onClick={() => setStep("login")}>
          Already have an account
        </button>
      </div>
    </div>
  );

  if (step === "login") return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", padding: "60px 28px 40px" }}>
      <button onClick={() => setStep("welcome")} style={{ background: "none", border: "none", color: "var(--text-2)", cursor: "pointer", alignSelf: "flex-start", marginBottom: 32, display: "flex", alignItems: "center", gap: 6 }}>
        <Icon name="arrow_left" size={18} /> Back
      </button>
      <h2 style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 800, marginBottom: 8 }}>Welcome back</h2>
      <p style={{ color: "var(--text-2)", marginBottom: 32 }}>Sign in to your BFU account</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <input className="input-field" placeholder="Username or email" />
        <input className="input-field" type="password" placeholder="Password" />
        <button className="btn-primary" style={{ marginTop: 8 }} onClick={onAuth}>Sign In</button>
      </div>
    </div>
  );

  // Register multi-step
  const registerSteps = [
    {
      title: "What's your name?",
      sub: "How you'll appear to others",
      content: (
        <input className="input-field" placeholder="Full name" value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
      )
    },
    {
      title: "Pick a username",
      sub: "Your unique handle on BFU",
      content: (
        <div style={{ position: "relative" }}>
          <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--text-3)", fontFamily: "var(--font-display)" }}>@</span>
          <input className="input-field" style={{ paddingLeft: 28 }} placeholder="username" value={form.username}
            onChange={e => setForm(f => ({ ...f, username: e.target.value }))} />
        </div>
      )
    },
    {
      title: "Your skills",
      sub: "Pick all that apply — we'll use this for matching",
      content: (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {skillOptions.map(s => (
            <button key={s} onClick={() => setForm(f => ({
              ...f, skills: f.skills.includes(s) ? f.skills.filter(x => x !== s) : [...f.skills, s]
            }))} className={`chip ${form.skills.includes(s) ? "active" : ""}`} style={{ cursor: "pointer", border: "1px solid", padding: "8px 14px", fontSize: 13 }}>
              {s}
            </button>
          ))}
        </div>
      )
    },
    {
      title: "Short bio",
      sub: "Tell others who you are",
      content: (
        <textarea className="input-field" rows={4} placeholder="I'm a developer building..." value={form.bio}
          onChange={e => setForm(f => ({ ...f, bio: e.target.value }))}
          style={{ resize: "none" }} />
      )
    },
  ];

  const currentStep = registerSteps[regStep];
  const progress = ((regStep + 1) / registerSteps.length) * 100;

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", padding: "60px 28px 40px" }}>
      <button onClick={() => regStep === 0 ? setStep("welcome") : setRegStep(r => r - 1)}
        style={{ background: "none", border: "none", color: "var(--text-2)", cursor: "pointer", alignSelf: "flex-start", marginBottom: 24, display: "flex", alignItems: "center", gap: 6 }}>
        <Icon name="arrow_left" size={18} /> {regStep === 0 ? "Back" : "Previous"}
      </button>

      {/* progress */}
      <div style={{ height: 3, background: "var(--surface-2)", borderRadius: 99, marginBottom: 32, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${progress}%`, background: "var(--accent)", borderRadius: 99, transition: "width 0.4s ease" }} />
      </div>

      <div style={{ marginBottom: 8, color: "var(--text-3)", fontSize: 12, fontFamily: "var(--font-display)", fontWeight: 600, letterSpacing: "0.1em" }}>
        STEP {regStep + 1} OF {registerSteps.length}
      </div>
      <h2 style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 800, marginBottom: 6, animation: "fadeUp 0.3s ease" }}>
        {currentStep.title}
      </h2>
      <p style={{ color: "var(--text-2)", marginBottom: 28, fontSize: 14 }}>{currentStep.sub}</p>

      <div style={{ animation: "fadeUp 0.3s ease" }}>
        {currentStep.content}
      </div>

      <div style={{ marginTop: "auto", paddingTop: 32 }}>
        <button className="btn-primary" onClick={() => regStep < registerSteps.length - 1 ? setRegStep(r => r + 1) : onAuth()}>
          {regStep < registerSteps.length - 1 ? "Continue" : "Create Account"}
        </button>
      </div>
    </div>
  );
};

// ─── DATA ────────────────────────────────────────────────────────────────────
const PEOPLE = [
  { id: 1, name: "Dilnoza Yusupova", username: "dilnoza_dev", role: "Full-stack Developer", uni: "TUIT", skills: ["Frontend", "Backend", "UI/UX"], bio: "Building EdTech tools for Uzbek students. 3 years of React experience.", matches: 94, city: "Tashkent" },
  { id: 2, name: "Jamshid Rakhimov", username: "jamshid_ml", role: "ML Engineer", uni: "NUUz", skills: ["ML/AI", "Backend", "Finance"], bio: "Working on NLP for Uzbek language. Looking for co-founders in fintech.", matches: 88, city: "Tashkent" },
  { id: 3, name: "Nodira Karimova", username: "nodira_ux", role: "UX Designer", uni: "Westminster", skills: ["Design", "UI/UX", "Marketing"], bio: "Design-first approach. I turn complex problems into intuitive interfaces.", matches: 82, city: "Tashkent" },
  { id: 4, name: "Akbar Mirzayev", username: "akbar_ios", role: "iOS Developer", uni: "INHA", skills: ["Mobile", "Frontend", "DevOps"], bio: "2 apps published. Looking for a backend engineer to grow with.", matches: 77, city: "Samarkand" },
];

const STARTUPS = [
  { id: 1, name: "AgroAI", category: "AgriTech", stage: "MVP", team: 2, looking: ["ML/AI", "Business"], desc: "AI-powered crop disease detection for Uzbek farmers using smartphone cameras.", founder: "Jasur T.", raised: null },
  { id: 2, name: "Kitob.uz", category: "EdTech", stage: "Idea", team: 1, looking: ["Frontend", "Design", "Marketing"], desc: "Audiobook platform for Uzbek literature. Making books accessible via mobile.", founder: "Malika R.", raised: null },
  { id: 3, name: "LogiTrack", category: "Logistics", stage: "Pre-seed", team: 4, looking: ["DevOps", "Backend"], desc: "Real-time freight tracking for Central Asian trade routes.", founder: "Timur A.", raised: "$30k" },
  { id: 4, name: "MedBot", category: "HealthTech", stage: "MVP", team: 3, looking: ["Mobile", "ML/AI"], desc: "Telemedicine chatbot trained on Uzbek medical cases. 400+ beta users.", founder: "Zulfiya K.", raised: null },
];

const VOLUNTEERING = [
  { id: 1, title: "Code for Kids", org: "IT Park Uzbekistan", type: "Education", duration: "6 weeks", spots: 3, skills: ["Frontend", "Teaching"], desc: "Teach basic programming to school kids in underserved areas.", deadline: "May 1" },
  { id: 2, title: "Climate Data Dashboard", org: "Eco Uzbekistan", type: "Environment", duration: "3 months", spots: 5, skills: ["Backend", "Design", "ML/AI"], desc: "Build open-source climate monitoring tools for Central Asia.", deadline: "Apr 25" },
  { id: 3, title: "Startup Mentorship", org: "BFU Foundation", type: "Community", duration: "Ongoing", spots: 8, skills: ["Business", "Marketing"], desc: "Mentor early-stage student founders once a week.", deadline: "Rolling" },
];

// ─── SCREEN: DISCOVER ─────────────────────────────────────────────────────────
const DiscoverScreen = () => {
  const [activeFilter, setActiveFilter] = useState("All");
  const [likedIds, setLikedIds] = useState([]);
  const filters = ["All", "Developers", "Designers", "ML/AI", "Business"];

  return (
    <Page>
      <div style={{ padding: "20px 20px 0" }}>
        {/* header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <p style={{ color: "var(--text-3)", fontSize: 12, fontFamily: "var(--font-display)", fontWeight: 600, letterSpacing: "0.1em" }}>GOOD MORNING</p>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800 }}>Discover</h1>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10, width: 38, height: 38, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--text-2)" }}>
              <Icon name="search" size={16} />
            </button>
            <button style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10, width: 38, height: 38, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--text-2)" }}>
              <Icon name="filter" size={16} />
            </button>
          </div>
        </div>

        {/* filters */}
        <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, marginBottom: 20, scrollbarWidth: "none" }}>
          {filters.map(f => (
            <button key={f} onClick={() => setActiveFilter(f)}
              style={{
                flexShrink: 0, background: activeFilter === f ? "var(--accent)" : "var(--surface-2)",
                color: activeFilter === f ? "#fff" : "var(--text-2)",
                border: activeFilter === f ? "none" : "1px solid var(--border)",
                borderRadius: 20, padding: "7px 16px", fontSize: 13, fontWeight: 500,
                cursor: "pointer", transition: "all 0.2s", fontFamily: "var(--font-display)",
              }}>
              {f}
            </button>
          ))}
        </div>

        {/* stats bar */}
        <div style={{
          background: "linear-gradient(135deg, rgba(123,111,255,0.12), rgba(78,205,196,0.08))",
          border: "1px solid var(--accent-dim)", borderRadius: var, padding: "12px 16px",
          display: "flex", gap: 24, marginBottom: 24,
          borderRadius: "var(--radius-sm)",
        }}>
          {[["1.2k+", "Students"], ["340+", "Matches made"], ["89", "Online now"]].map(([n, l]) => (
            <div key={l}>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 18, color: "var(--accent)" }}>{n}</div>
              <div style={{ fontSize: 11, color: "var(--text-3)" }}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* people cards */}
      <div style={{ padding: "0 20px", display: "flex", flexDirection: "column", gap: 12 }}>
        {PEOPLE.map((p, i) => {
          const isLiked = likedIds.includes(p.id);
          return (
            <div key={p.id} className="card" style={{ animation: `fadeUp ${0.1 + i * 0.08}s ease`, cursor: "pointer", position: "relative", overflow: "hidden" }}>
              {/* match badge */}
              <div style={{
                position: "absolute", top: 12, right: 12,
                background: "var(--accent-dim)", border: "1px solid var(--accent)",
                borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 700,
                color: "var(--accent)", fontFamily: "var(--font-display)",
              }}>
                {p.matches}% match
              </div>

              <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <AvatarEl name={p.name} size={48} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16 }}>{p.name}</div>
                  <div style={{ color: "var(--text-2)", fontSize: 13, marginBottom: 4 }}>{p.role} · {p.city}</div>
                  <div style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.5, marginBottom: 10 }}>{p.bio}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {p.skills.map(s => <span key={s} className="tag">{s}</span>)}
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                <button onClick={() => setLikedIds(ids => isLiked ? ids.filter(x => x !== p.id) : [...ids, p.id])}
                  style={{
                    flex: 1, background: isLiked ? "rgba(255,107,107,0.15)" : "var(--surface-2)",
                    border: `1px solid ${isLiked ? "#FF6B6B44" : "var(--border)"}`,
                    color: isLiked ? "#FF6B6B" : "var(--text-2)",
                    borderRadius: "var(--radius-sm)", padding: "9px", cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                    fontSize: 13, fontWeight: 500, transition: "all 0.2s",
                  }}>
                  <Icon name="heart" size={15} strokeWidth={isLiked ? 2 : 1.6} /> {isLiked ? "Liked" : "Like"}
                </button>
                <button style={{
                  flex: 2, background: "var(--accent-dim)", border: "1px solid var(--accent)",
                  color: "var(--accent)", borderRadius: "var(--radius-sm)", padding: "9px",
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                  gap: 6, fontSize: 13, fontWeight: 600, fontFamily: "var(--font-display)",
                  transition: "all 0.2s",
                }}>
                  Connect <Icon name="arrow_right" size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </Page>
  );
};

// ─── SCREEN: STARTUPS ────────────────────────────────────────────────────────
const StartupScreen = () => {
  const [active, setActive] = useState("browse"); // browse | post

  const stageColor = { "Idea": "#FFB347", "MVP": "#4ECDC4", "Pre-seed": "#7B6FFF" };

  return (
    <Page>
      <div style={{ padding: "20px 20px 0" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <p style={{ color: "var(--text-3)", fontSize: 12, fontFamily: "var(--font-display)", fontWeight: 600, letterSpacing: "0.1em" }}>EXPLORE</p>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800 }}>Startup Board</h1>
          </div>
          <button onClick={() => setActive(a => a === "post" ? "browse" : "post")}
            style={{
              background: "var(--accent)", border: "none", borderRadius: 10,
              width: 38, height: 38, display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", color: "#fff",
            }}>
            <Icon name={active === "post" ? "x" : "plus"} size={18} />
          </button>
        </div>

        {/* tabs */}
        <div style={{ display: "flex", background: "var(--surface-2)", borderRadius: "var(--radius-sm)", padding: 3, marginBottom: 20 }}>
          {["browse", "my startups"].map(t => (
            <button key={t} onClick={() => setActive(t)}
              style={{
                flex: 1, background: active === t ? "var(--surface-3)" : "transparent",
                border: "none", borderRadius: 8, padding: "8px",
                color: active === t ? "var(--text)" : "var(--text-3)",
                fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 13,
                cursor: "pointer", transition: "all 0.2s", textTransform: "capitalize",
              }}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {active === "post" ? (
        <div style={{ padding: "0 20px", animation: "fadeUp 0.3s ease" }}>
          <div className="card">
            <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 700, marginBottom: 16 }}>Post Your Startup</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <input className="input-field" placeholder="Startup name" />
              <input className="input-field" placeholder="One-liner description" />
              <textarea className="input-field" rows={3} placeholder="What are you building and why?" style={{ resize: "none" }} />
              <div>
                <div className="section-label">Stage</div>
                <div style={{ display: "flex", gap: 8 }}>
                  {["Idea", "MVP", "Pre-seed", "Seed"].map(s => (
                    <button key={s} className="chip" style={{ cursor: "pointer" }}>{s}</button>
                  ))}
                </div>
              </div>
              <div>
                <div className="section-label">Looking for</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {["Frontend", "Backend", "Design", "ML/AI", "Business", "Marketing"].map(s => (
                    <button key={s} className="chip" style={{ cursor: "pointer" }}>{s}</button>
                  ))}
                </div>
              </div>
              <button className="btn-primary" style={{ marginTop: 8 }}>Post Startup</button>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ padding: "0 20px", display: "flex", flexDirection: "column", gap: 12 }}>
          {STARTUPS.map((s, i) => (
            <div key={s.id} className="card" style={{ animation: `fadeUp ${0.1 + i * 0.08}s ease`, cursor: "pointer" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 17 }}>{s.name}</h3>
                    {s.raised && <span style={{ background: "rgba(52,211,153,0.15)", color: "#34D399", borderRadius: 6, padding: "2px 7px", fontSize: 11, fontWeight: 600 }}>{s.raised} raised</span>}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>by {s.founder} · {s.team} member{s.team > 1 ? "s" : ""}</div>
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0, marginLeft: 8 }}>
                  <span style={{ background: `${stageColor[s.stage]}22`, color: stageColor[s.stage], borderRadius: 6, padding: "3px 8px", fontSize: 11, fontWeight: 600 }}>{s.stage}</span>
                  <span className="tag">{s.category}</span>
                </div>
              </div>

              <p style={{ fontSize: 14, color: "var(--text-2)", lineHeight: 1.6, marginBottom: 12 }}>{s.desc}</p>

              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "var(--font-display)", fontWeight: 600, letterSpacing: "0.06em", marginBottom: 6 }}>LOOKING FOR</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {s.looking.map(l => (
                    <span key={l} style={{ background: "rgba(255,179,71,0.12)", color: "#FFB347", borderRadius: 6, padding: "3px 8px", fontSize: 11, fontWeight: 600 }}>{l}</span>
                  ))}
                </div>
              </div>

              <button style={{
                width: "100%", background: "var(--surface-2)", border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)", padding: "10px", cursor: "pointer",
                color: "var(--text)", fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 13,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              }}>
                <Icon name="zap" size={14} /> Apply to Join
              </button>
            </div>
          ))}
        </div>
      )}
    </Page>
  );
};

// ─── SCREEN: PARTNER ─────────────────────────────────────────────────────────
const PartnerScreen = () => {
  const [step, setStep] = useState("intro"); // intro | fill | results
  const [answers, setAnswers] = useState({ idea: "", skills: [], role: "" });

  const skillOptions = ["UI/UX", "Frontend", "Backend", "ML/AI", "Business", "Design", "Marketing", "Mobile"];

  if (step === "results") return (
    <Page>
      <div style={{ padding: "20px 20px 0" }}>
        <button onClick={() => setStep("intro")} style={{ background: "none", border: "none", color: "var(--text-2)", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, marginBottom: 20 }}>
          <Icon name="arrow_left" size={18} /> Back
        </button>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800, marginBottom: 4 }}>Your Matches</h1>
        <p style={{ color: "var(--text-2)", fontSize: 14, marginBottom: 20 }}>People who complement your profile</p>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {PEOPLE.slice(0, 3).map((p, i) => (
            <div key={p.id} className="card" style={{ animation: `slideInRight ${0.1 + i * 0.1}s ease` }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <AvatarEl name={p.name} size={52} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>{p.name}</div>
                    <span style={{ background: "var(--accent-dim)", color: "var(--accent)", borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700, fontFamily: "var(--font-display)" }}>{p.matches}%</span>
                  </div>
                  <div style={{ color: "var(--text-2)", fontSize: 13, marginBottom: 8 }}>{p.role}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {p.skills.slice(0, 2).map(s => <span key={s} className="tag">{s}</span>)}
                  </div>
                </div>
              </div>
              <button style={{
                width: "100%", marginTop: 12,
                background: "var(--accent)", border: "none", borderRadius: "var(--radius-sm)",
                color: "#fff", fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 13,
                padding: "10px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              }}>
                <Icon name="mail" size={14} /> Send Intro
              </button>
            </div>
          ))}
        </div>
      </div>
    </Page>
  );

  if (step === "fill") return (
    <Page>
      <div style={{ padding: "20px 20px 0" }}>
        <button onClick={() => setStep("intro")} style={{ background: "none", border: "none", color: "var(--text-2)", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, marginBottom: 24 }}>
          <Icon name="arrow_left" size={18} /> Back
        </button>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800, marginBottom: 4 }}>Find a Partner</h2>
        <p style={{ color: "var(--text-2)", fontSize: 14, marginBottom: 24 }}>Tell us about what you're building</p>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div>
            <div className="section-label">Your Idea</div>
            <textarea className="input-field" rows={3} placeholder="Describe what you're building in a sentence or two..." style={{ resize: "none" }}
              value={answers.idea} onChange={e => setAnswers(a => ({ ...a, idea: e.target.value }))} />
          </div>
          <div>
            <div className="section-label">Skills you have</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {skillOptions.map(s => (
                <button key={s} onClick={() => setAnswers(a => ({
                  ...a, skills: a.skills.includes(s) ? a.skills.filter(x => x !== s) : [...a.skills, s]
                }))} className={`chip ${answers.skills.includes(s) ? "active" : ""}`} style={{ cursor: "pointer", padding: "8px 14px", fontSize: 13 }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="section-label">Your Role in the Startup</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {["Technical Co-founder", "Business Co-founder", "Solo (need a team)", "Joining a team"].map(r => (
                <button key={r} onClick={() => setAnswers(a => ({ ...a, role: r }))}
                  className={`chip ${answers.role === r ? "active" : ""}`}
                  style={{ cursor: "pointer", padding: "8px 14px", fontSize: 13 }}>
                  {r}
                </button>
              ))}
            </div>
          </div>
          <button className="btn-primary" onClick={() => setStep("results")}>Find Matches</button>
        </div>
      </div>
    </Page>
  );

  return (
    <Page>
      <div style={{ padding: "20px 20px 0" }}>
        <p style={{ color: "var(--text-3)", fontSize: 12, fontFamily: "var(--font-display)", fontWeight: 600, letterSpacing: "0.1em" }}>CO-FOUNDER</p>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800, marginBottom: 4 }}>Find a Partner</h1>
        <p style={{ color: "var(--text-2)", fontSize: 14, marginBottom: 24 }}>AI-matched co-founders based on your skills and idea</p>

        {/* hero card */}
        <div style={{
          background: "linear-gradient(135deg, rgba(123,111,255,0.2), rgba(78,205,196,0.15))",
          border: "1px solid rgba(123,111,255,0.3)", borderRadius: "var(--radius)",
          padding: "24px 20px", marginBottom: 20, position: "relative", overflow: "hidden",
        }}>
          <div style={{ position: "absolute", top: -20, right: -20, width: 120, height: 120, background: "radial-gradient(circle, rgba(123,111,255,0.3), transparent)", borderRadius: "50%" }} />
          <Icon name="handshake" size={28} color="var(--accent)" />
          <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 20, marginTop: 10, marginBottom: 6 }}>
            Build together.
          </h2>
          <p style={{ color: "var(--text-2)", fontSize: 14, lineHeight: 1.6, marginBottom: 16 }}>
            Tell us what you're building and what skills you have. Our AI finds the people who complete your team.
          </p>
          <button className="btn-primary" onClick={() => setStep("fill")} style={{ width: "auto", padding: "11px 24px" }}>
            Start Matching →
          </button>
        </div>

        {/* how it works */}
        <div className="section-label" style={{ marginBottom: 12 }}>HOW IT WORKS</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[
            { n: "01", title: "Describe your idea", sub: "What problem are you solving?" },
            { n: "02", title: "List your skills", sub: "What do you bring to the table?" },
            { n: "03", title: "Get matched", sub: "AI pairs you with the right people" },
          ].map(s => (
            <div key={s.n} className="card" style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 20, color: "var(--accent)", minWidth: 32 }}>{s.n}</div>
              <div>
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 14 }}>{s.title}</div>
                <div style={{ fontSize: 13, color: "var(--text-3)" }}>{s.sub}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Page>
  );
};

// ─── SCREEN: VOLUNTEER ────────────────────────────────────────────────────────
const VolunteerScreen = () => {
  const typeColor = { Education: "#7B6FFF", Environment: "#4ECDC4", Community: "#FFB347" };
  const [applied, setApplied] = useState([]);

  return (
    <Page>
      <div style={{ padding: "20px 20px 0" }}>
        <p style={{ color: "var(--text-3)", fontSize: 12, fontFamily: "var(--font-display)", fontWeight: 600, letterSpacing: "0.1em" }}>GIVE BACK</p>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800, marginBottom: 4 }}>Volunteer</h1>
        <p style={{ color: "var(--text-2)", fontSize: 14, marginBottom: 20 }}>Use your skills to make an impact</p>

        {/* impact bar */}
        <div style={{
          background: "linear-gradient(135deg, rgba(78,205,196,0.12), rgba(52,211,153,0.08))",
          border: "1px solid rgba(78,205,196,0.2)", borderRadius: "var(--radius-sm)",
          padding: "12px 16px", display: "flex", gap: 24, marginBottom: 20,
        }}>
          {[["48", "Opportunities"], ["230+", "Volunteers"], ["12", "Active now"]].map(([n, l]) => (
            <div key={l}>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 18, color: "#4ECDC4" }}>{n}</div>
              <div style={{ fontSize: 11, color: "var(--text-3)" }}>{l}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {VOLUNTEERING.map((v, i) => {
            const isApplied = applied.includes(v.id);
            const c = typeColor[v.type];
            return (
              <div key={v.id} className="card" style={{ animation: `fadeUp ${0.1 + i * 0.08}s ease` }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ background: `${c}22`, color: c, borderRadius: 6, padding: "3px 8px", fontSize: 11, fontWeight: 600 }}>{v.type}</span>
                  <span style={{ fontSize: 11, color: "var(--text-3)" }}>Deadline: {v.deadline}</span>
                </div>
                <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16, marginBottom: 2 }}>{v.title}</h3>
                <div style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 6 }}>{v.org} · {v.duration}</div>
                <p style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.6, marginBottom: 12 }}>{v.desc}</p>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                  {v.skills.map(s => <span key={s} className="tag">{s}</span>)}
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 12, color: "var(--text-3)" }}>
                    <Icon name="users" size={12} /> {v.spots} spots left
                  </span>
                </div>
                <button onClick={() => setApplied(a => isApplied ? a.filter(x => x !== v.id) : [...a, v.id])}
                  style={{
                    width: "100%", background: isApplied ? "rgba(52,211,153,0.12)" : "var(--surface-2)",
                    border: `1px solid ${isApplied ? "rgba(52,211,153,0.3)" : "var(--border)"}`,
                    borderRadius: "var(--radius-sm)", padding: "10px", cursor: "pointer",
                    color: isApplied ? "#34D399" : "var(--text)",
                    fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 13,
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                    transition: "all 0.2s",
                  }}>
                  {isApplied ? <><Icon name="check" size={14} /> Applied!</> : "Apply Now"}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </Page>
  );
};

// ─── SCREEN: SETTINGS ────────────────────────────────────────────────────────
const SettingsScreen = () => {
  const user = { name: "Abdurahim Egamberdiyev", username: "egamberdiyevabdurahim", role: "Full-stack Developer", uni: "TUIT", skills: ["Frontend", "Backend", "ML/AI"], city: "Tashkent" };
  const [notifs, setNotifs] = useState(true);
  const [visible, setVisible] = useState(true);

  const Toggle = ({ val, onToggle }) => (
    <div onClick={onToggle} style={{
      width: 44, height: 24, background: val ? "var(--accent)" : "var(--surface-3)",
      borderRadius: 12, position: "relative", cursor: "pointer", transition: "background 0.2s", flexShrink: 0,
    }}>
      <div style={{
        position: "absolute", top: 3, left: val ? 23 : 3, width: 18, height: 18,
        background: "#fff", borderRadius: "50%", transition: "left 0.2s",
        boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
      }} />
    </div>
  );

  return (
    <Page>
      <div style={{ padding: "20px 20px 0" }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800, marginBottom: 20 }}>Profile</h1>

        {/* profile card */}
        <div style={{
          background: "linear-gradient(135deg, var(--surface), var(--surface-2))",
          border: "1px solid var(--border)", borderRadius: "var(--radius)",
          padding: "20px", marginBottom: 16,
        }}>
          <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 16 }}>
            <AvatarEl name={user.name} size={60} />
            <div>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 17 }}>{user.name}</div>
              <div style={{ color: "var(--accent)", fontSize: 13, marginBottom: 2 }}>@{user.username}</div>
              <div style={{ color: "var(--text-2)", fontSize: 13 }}>{user.role} · {user.city}</div>
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {user.skills.map(s => <span key={s} className="tag">{s}</span>)}
          </div>
          <button style={{
            width: "100%", marginTop: 14, background: "var(--surface-3)", border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)", padding: "10px", cursor: "pointer", color: "var(--text)",
            fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 13,
          }}>
            Edit Profile
          </button>
        </div>

        {/* stats */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 20 }}>
          {[["12", "Connections"], ["3", "Applied"], ["89%", "Profile"]].map(([n, l]) => (
            <div key={l} className="card" style={{ textAlign: "center", padding: 12 }}>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 20 }}>{n}</div>
              <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>{l}</div>
            </div>
          ))}
        </div>

        {/* settings sections */}
        {[
          {
            label: "PREFERENCES", items: [
              { icon: "bell", label: "Notifications", right: <Toggle val={notifs} onToggle={() => setNotifs(v => !v)} /> },
              { icon: "eye", label: "Profile visible", right: <Toggle val={visible} onToggle={() => setVisible(v => !v)} /> },
              { icon: "globe", label: "Language", right: <span style={{ color: "var(--text-2)", fontSize: 13 }}>English</span> },
            ]
          },
          {
            label: "ACCOUNT", items: [
              { icon: "link", label: "GitHub", right: <span style={{ color: "var(--text-3)", fontSize: 13 }}>Connect</span> },
              { icon: "briefcase", label: "LinkedIn", right: <span style={{ color: "var(--text-3)", fontSize: 13 }}>Connect</span> },
            ]
          },
        ].map(section => (
          <div key={section.label} style={{ marginBottom: 16 }}>
            <div className="section-label">{section.label}</div>
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              {section.items.map((item, i) => (
                <div key={item.label} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "13px 16px",
                  borderBottom: i < section.items.length - 1 ? "1px solid var(--border)" : "none",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Icon name={item.icon} size={16} color="var(--text-2)" />
                    <span style={{ fontSize: 14 }}>{item.label}</span>
                  </div>
                  {item.right}
                </div>
              ))}
            </div>
          </div>
        ))}

        <button style={{
          width: "100%", background: "rgba(255,107,107,0.1)", border: "1px solid rgba(255,107,107,0.2)",
          borderRadius: "var(--radius-sm)", padding: "12px", cursor: "pointer",
          color: "#FF6B6B", fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 14,
          marginBottom: 8,
        }}>
          Sign Out
        </button>
      </div>
    </Page>
  );
};

// ─── APP ROOT ─────────────────────────────────────────────────────────────────
export default function App() {
  const [authed, setAuthed] = useState(false);
  const [activeTab, setActiveTab] = useState("discover");

  const screens = {
    discover: <DiscoverScreen />,
    startups: <StartupScreen />,
    partner: <PartnerScreen />,
    volunteer: <VolunteerScreen />,
    settings: <SettingsScreen />,
  };

  return (
    <>
      <FontLoader />
      <div style={{ maxWidth: 430, margin: "0 auto", height: "100vh", position: "relative", background: "var(--bg)", overflow: "hidden" }}>
        {!authed ? (
          <AuthScreen onAuth={() => setAuthed(true)} />
        ) : (
          <>
            <div key={activeTab} style={{ height: "100%", overflowY: "auto", overflowX: "hidden" }}>
              {screens[activeTab]}
            </div>
            <BottomNav active={activeTab} onChange={setActiveTab} />
          </>
        )}
      </div>
    </>
  );
}
