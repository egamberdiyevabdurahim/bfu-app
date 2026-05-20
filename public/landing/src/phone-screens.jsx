// phone-screens.jsx — realistic in-app screens for the phone mockup
// Exposes: PhoneFrame, WelcomeScreen, RegisterScreen, ProfileScreen,
//          ForYouScreen, BotPingScreen, ApplyScreen, BioTagScreen, MatchDeckScreen

const { useState, useEffect, useMemo } = React;

// --- Phone bezel + chrome ---
function PhoneFrame({ children, w = 300, h = 620, className = '', innerClass = '' }) {
  return (
    <div
      className={`relative rounded-[42px] phone-shell p-[10px] ${className}`}
      style={{ width: w, height: h }}
    >
      <div className={`relative w-full h-full rounded-[34px] overflow-hidden bg-[#0c0c14] ${innerClass}`}>
        {/* dynamic island */}
        <div className="absolute left-1/2 top-2 -translate-x-1/2 z-30 h-[26px] w-[96px] rounded-full bg-black/90 flex items-center justify-end pr-3 gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-[#4ECDC4]/70" />
          <span className="w-1 h-1 rounded-full bg-white/40" />
        </div>
        {/* status bar */}
        <div className="absolute top-0 inset-x-0 z-20 px-6 pt-2.5 flex items-center justify-between text-[10px] text-white/80 font-medium">
          <span>9:41</span>
          <span className="flex items-center gap-1">
            <svg width="14" height="10" viewBox="0 0 14 10" fill="none"><path d="M1 9 L4 6 L7 8 L13 1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
            <svg width="14" height="10" viewBox="0 0 14 10"><rect x="0.5" y="2.5" width="11" height="5" rx="1.2" stroke="currentColor" fill="none"/><rect x="2" y="4" width="7.5" height="2" fill="currentColor"/><rect x="12" y="4" width="1.2" height="2" fill="currentColor"/></svg>
          </span>
        </div>
        <div className="absolute inset-0 pt-9 pb-1 flex flex-col">
          {children}
        </div>
      </div>
    </div>
  );
}

// --- Telegram-style top bar (used inside the bot mini app) ---
function TGBar({ title = 'Bright Futures UZB', subtitle = 'bot · online', right = null }) {
  return (
    <div className="px-4 pt-1 pb-2.5 flex items-center gap-3 border-b border-white/[0.06]">
      <button className="text-white/60 text-[18px] leading-none">‹</button>
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#7B6FFF] to-[#A78BFA] flex items-center justify-center text-white text-[14px] font-display font-bold shadow-[0_4px_14px_rgba(123,111,255,0.4)]">✦</div>
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-semibold text-white truncate">{title}</div>
        <div className="text-[10px] text-[#4ECDC4]/90">{subtitle}</div>
      </div>
      {right ?? <div className="text-white/50 text-[16px]">⋯</div>}
    </div>
  );
}

// --- Bottom tab bar ---
function TGTabs({ active = 'discover' }) {
  const tabs = [
    { id: 'discover', icon: '◎', label: 'Discover' },
    { id: 'feed',     icon: '✨', label: 'For You' },
    { id: 'projects', icon: '⬢', label: 'Projects' },
    { id: 'events',   icon: '◈', label: 'Events' },
    { id: 'profile',  icon: '◐', label: 'Profile' },
  ];
  return (
    <div className="border-t border-white/[0.06] px-2 pt-1.5 pb-1.5 flex items-center justify-around bg-[#0c0c14]/95 backdrop-blur">
      {tabs.map(t => (
        <div key={t.id} className={`flex flex-col items-center gap-0.5 px-1.5 ${active === t.id ? 'text-[#A78BFA]' : 'text-white/45'}`}>
          <span className="text-[14px] leading-none">{t.icon}</span>
          <span className="text-[8px] font-medium">{t.label}</span>
        </div>
      ))}
    </div>
  );
}

// --- Screen 1: Welcome ---
function WelcomeScreen() {
  return (
    <div className="flex flex-col flex-1 bg-[#0c0c14]">
      <TGBar />
      <div className="flex-1 px-5 pt-6 pb-4 flex flex-col">
        <div className="relative">
          <div className="absolute inset-0 -m-6 rounded-3xl bg-gradient-to-br from-[#7B6FFF]/30 to-transparent blur-2xl" />
          <div className="relative">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#7B6FFF] to-[#A78BFA] flex items-center justify-center text-white text-[24px] font-display font-bold shadow-[0_16px_40px_rgba(123,111,255,0.5)]">✦</div>
            <h3 className="mt-4 font-display font-bold text-[22px] leading-[1.05] tracking-[-0.02em] text-white">Welcome to BFU</h3>
            <p className="mt-2 text-[11.5px] leading-snug text-white/65">
              Find your co-founders, your team, your next opportunity — inside Telegram, in your language.
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-2">
          {[
            ['◎', 'Discover people who match'],
            ['⬢', 'Apply to startups & volunteer'],
            ['◈', 'Hackathons, grants, scholarships'],
          ].map(([i, t]) => (
            <div key={t} className="flex items-center gap-3 bg-white/[0.04] border border-white/[0.06] rounded-xl px-3 py-2">
              <span className="w-7 h-7 rounded-lg bg-[#7B6FFF]/15 text-[#A78BFA] flex items-center justify-center text-[13px]">{i}</span>
              <span className="text-[11px] text-white/85">{t}</span>
            </div>
          ))}
        </div>

        <div className="mt-auto">
          <button className="w-full rounded-xl py-2.5 text-[12px] font-semibold bg-gradient-to-br from-[#7B6FFF] to-[#A78BFA] text-white shadow-[0_10px_30px_rgba(123,111,255,0.45)]">
            Start →
          </button>
          <div className="text-center text-[9px] text-white/35 mt-2">Free for students · No app to install</div>
        </div>
      </div>
    </div>
  );
}

// --- Screen 2: Registration step 1 (language) ---
function RegisterScreen({ activeLang = 'uz' } = {}) {
  return (
    <div className="flex flex-col flex-1 bg-[#0c0c14]">
      <TGBar />
      <div className="px-5 pt-5 pb-4 flex-1 flex flex-col">
        <div className="text-[10px] uppercase tracking-[0.18em] text-[#4ECDC4]/90 font-medium">Step 1 / 4</div>
        <h3 className="mt-1.5 font-display font-bold text-[20px] tracking-[-0.02em] text-white">Choose your language</h3>
        <p className="mt-1 text-[11px] text-white/55">You can change this at any time.</p>

        <div className="mt-5 space-y-2.5">
          {[
            { id: 'en', flag: '🇬🇧', t: 'English',  s: 'English language' },
            { id: 'uz', flag: '🇺🇿', t: "O'zbekcha", s: 'O‘zbek tili' },
            { id: 'ru', flag: '🇷🇺', t: 'Русский',  s: 'Русский язык' },
          ].map(o => {
            const isActive = activeLang === o.id;
            return (
              <div key={o.id} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 border ${isActive ? 'border-[#7B6FFF] bg-[#7B6FFF]/10' : 'border-white/[0.07] bg-white/[0.025]'}`}>
                <span className="text-[18px]">{o.flag}</span>
                <div className="flex-1">
                  <div className="text-[12px] font-semibold text-white">{o.t}</div>
                  <div className="text-[10px] text-white/45">{o.s}</div>
                </div>
                <span className={`w-4 h-4 rounded-full border ${isActive ? 'bg-[#7B6FFF] border-[#A78BFA]' : 'border-white/25'}`}>
                  {isActive && <span className="block w-1.5 h-1.5 rounded-full bg-white m-auto mt-[5px]" />}
                </span>
              </div>
            );
          })}
        </div>

        <div className="mt-auto">
          <button className="w-full rounded-xl py-2.5 text-[12px] font-semibold bg-gradient-to-br from-[#7B6FFF] to-[#A78BFA] text-white">Continue →</button>
        </div>
      </div>
    </div>
  );
}

// --- Screen 3: Profile ---
function ProfileScreen() {
  return (
    <div className="flex flex-col flex-1 bg-[#0c0c14]">
      <TGBar title="Profile" subtitle="@malika_n · Samarqand" />
      <div className="flex-1 overflow-hidden">
        <div className="px-4 pt-3">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#FFB347] to-[#FF6B6B] flex items-center justify-center text-white font-display font-bold text-[18px] border-2 border-white/10">MN</div>
            <div className="flex-1">
              <div className="flex items-center gap-1.5">
                <div className="text-[13px] font-semibold text-white">Malika Nazarova</div>
                <span className="text-[10px] bg-[#4ECDC4]/15 text-[#4ECDC4] px-1.5 py-0.5 rounded-full">✓</span>
              </div>
              <div className="text-[10px] text-white/50">19 · she/her · Samarqand</div>
              <div className="text-[10px] text-[#A78BFA] mt-0.5">★ Invite friends · Climb the leaderboard</div>
            </div>
          </div>

          <div className="mt-3 rounded-xl bg-white/[0.03] border border-white/[0.06] p-2.5">
            <div className="flex items-center justify-between text-[10px] text-white/55">
              <span>Profile completeness</span><span className="text-white/80 font-medium">84%</span>
            </div>
            <div className="mt-1.5 h-1 rounded-full bg-white/[0.07] overflow-hidden">
              <div className="h-full w-[84%] bg-gradient-to-r from-[#7B6FFF] to-[#A78BFA]" />
            </div>
          </div>

          <div className="mt-3">
            <div className="text-[9px] uppercase tracking-[0.15em] text-white/40 mb-1.5">Skills</div>
            <div className="flex flex-wrap gap-1.5">
              {['Python', 'Figma', 'UX research', 'Public speaking', 'English C1'].map(s => (
                <span key={s} className="text-[10px] px-2 py-0.5 rounded-full bg-[#7B6FFF]/12 border border-[#7B6FFF]/25 text-[#D6CCFF]">{s}</span>
              ))}
            </div>
          </div>
          <div className="mt-2.5">
            <div className="text-[9px] uppercase tracking-[0.15em] text-white/40 mb-1.5">Goals</div>
            <div className="flex flex-wrap gap-1.5">
              {['Co-founder', 'EdTech', 'IELTS 7.5'].map(s => (
                <span key={s} className="text-[10px] px-2 py-0.5 rounded-full bg-[#4ECDC4]/10 border border-[#4ECDC4]/25 text-[#A6F0EB]">{s}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
      <TGTabs active="profile" />
    </div>
  );
}

// --- Screen 4: For You ---
function ForYouScreen() {
  const people = [
    { n: 'Diyor R.', loc: 'Tashkent', tags: ['Python', 'AI', 'EdTech'], pct: 92, init: 'DR', col: 'from-[#7B6FFF] to-[#A78BFA]', v: true },
    { n: 'Aziza K.',  loc: 'Bukhara',   tags: ['Figma', 'Brand', 'UX'],  pct: 88, init: 'AK', col: 'from-[#FF6B6B] to-[#FFB347]', v: true },
    { n: 'Sardor M.', loc: 'Andijon',   tags: ['React', 'Startups'],    pct: 81, init: 'SM', col: 'from-[#4ECDC4] to-[#7B6FFF]', v: false },
  ];
  return (
    <div className="flex flex-col flex-1 bg-[#0c0c14]">
      <TGBar title="For You" subtitle="AI-matched · this week" />
      <div className="px-4 pt-3 flex items-center gap-1.5">
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#A78BFA]/15 border border-[#A78BFA]/30 text-[#D6CCFF] font-medium">✨ For You</span>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.08] text-white/55">All regions</span>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.08] text-white/55">Verified</span>
      </div>
      <div className="px-4 pt-2.5 space-y-2 flex-1 overflow-hidden">
        {people.map(p => (
          <div key={p.n} className="rounded-xl bg-white/[0.035] border border-white/[0.07] p-2.5 flex items-center gap-2.5">
            <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${p.col} flex items-center justify-center text-white font-display font-bold text-[12px]`}>{p.init}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1">
                <span className="text-[11.5px] font-semibold text-white truncate">{p.n}</span>
                {p.v && <span className="text-[8px] bg-[#4ECDC4]/15 text-[#4ECDC4] w-3.5 h-3.5 rounded-full flex items-center justify-center">✓</span>}
              </div>
              <div className="text-[9.5px] text-white/45 mt-0.5">{p.loc}</div>
              <div className="flex flex-wrap gap-1 mt-1">
                {p.tags.map(t => <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-[#7B6FFF]/10 text-[#D6CCFF]">{t}</span>)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[11px] font-display font-bold bg-gradient-to-br from-[#A78BFA] to-[#7B6FFF] bg-clip-text text-transparent">{p.pct}%</div>
              <div className="text-[8px] text-white/40 uppercase tracking-wider">match</div>
            </div>
          </div>
        ))}
      </div>
      <TGTabs active="feed" />
    </div>
  );
}

// --- Screen 5: Bot notification ---
function BotPingScreen() {
  return (
    <div className="flex flex-col flex-1 bg-[#0c0c14]">
      <TGBar title="Bright Futures UZB" subtitle="bot · just now" />
      <div className="px-3 pt-3 pb-3 flex-1 flex flex-col gap-2">
        <div className="text-center text-[9px] text-white/35 my-1">Today</div>

        <div className="self-start max-w-[80%] rounded-2xl rounded-bl-md bg-[#1A1A28] border border-white/[0.06] px-3 py-2">
          <div className="text-[10.5px] text-white/85 leading-snug">📬 New from BFU this week — 3 startups match your skills.</div>
          <div className="text-[8.5px] text-white/35 mt-1">10:24</div>
        </div>

        <div className="self-start max-w-[88%] rounded-2xl rounded-bl-md px-3 py-2.5 bg-gradient-to-br from-[#7B6FFF]/25 to-[#A78BFA]/15 border border-[#7B6FFF]/40">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-[10px]">🎉</span>
            <div className="text-[10px] font-semibold text-[#D6CCFF]">Accepted</div>
          </div>
          <div className="text-[11px] text-white leading-snug">
            You're in! Your application to <span className="font-semibold">Solar Farm Project</span> was accepted.
          </div>
          <button className="mt-2 w-full rounded-lg py-1.5 text-[10px] font-semibold bg-white/10 hover:bg-white/15 text-white">Open project →</button>
          <div className="text-[8.5px] text-white/35 mt-1.5">10:32</div>
        </div>

        <div className="self-start max-w-[80%] rounded-2xl rounded-bl-md bg-[#1A1A28] border border-white/[0.06] px-3 py-2">
          <div className="text-[10.5px] text-white/85 leading-snug">🔔 <span className="font-semibold">Ali V.</span> applied to join your project <span className="font-semibold">AI Tutor UZ</span>.</div>
          <div className="text-[8.5px] text-white/35 mt-1">10:33</div>
        </div>
      </div>
    </div>
  );
}

// --- Screen for film beat 5: Apply ---
function ApplyScreen({ accepted = false } = {}) {
  return (
    <div className="flex flex-col flex-1 bg-[#0c0c14]">
      <TGBar title="Solar Farm Project" subtitle="hiring · 4 spots" />
      <div className="px-4 pt-3 flex-1">
        <div className="rounded-xl bg-white/[0.035] border border-white/[0.07] overflow-hidden">
          <div className="h-16 bg-gradient-to-br from-[#FFB347]/40 via-[#FF6B6B]/30 to-[#7B6FFF]/40 relative">
            <div className="absolute right-3 top-2 text-[9px] bg-black/40 text-white/90 px-1.5 py-0.5 rounded">Open</div>
          </div>
          <div className="p-3">
            <div className="text-[12px] font-semibold text-white">Solar Farm Project</div>
            <div className="text-[9.5px] text-white/45 mt-0.5">Tashkent · clean energy · 4 roles</div>
            <div className="mt-2 flex flex-wrap gap-1">
              {['React', 'Renewables', 'GIS'].map(t => <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-[#7B6FFF]/10 text-[#D6CCFF]">{t}</span>)}
            </div>
            <div className="mt-2 flex items-center gap-2 text-[9px] text-white/50">
              <span>★ 92% match</span><span>· 28 viewed</span><span>· 6 applied</span>
            </div>
          </div>
        </div>

        <button className={`mt-3 w-full rounded-xl py-2.5 text-[12px] font-semibold ${accepted ? 'bg-white/[0.08] text-white/60' : 'bg-gradient-to-br from-[#7B6FFF] to-[#A78BFA] text-white shadow-[0_10px_30px_rgba(123,111,255,0.45)]'}`}>
          {accepted ? '✓ Application sent' : '⚡ Apply to Join'}
        </button>
      </div>
    </div>
  );
}

// --- Screen for film beat 3: Bio + tags ---
function BioTagScreen() {
  const groups = [
    { label: 'skills',       items: ['Python', 'Figma'],         color: 'from-[#7B6FFF] to-[#A78BFA]',  text: 'text-[#D6CCFF]', bg: 'bg-[#7B6FFF]/12 border-[#7B6FFF]/30' },
    { label: 'knowledges',   items: ['Product'],                 color: 'from-[#A78BFA] to-[#7B6FFF]',  text: 'text-[#D6CCFF]', bg: 'bg-[#A78BFA]/12 border-[#A78BFA]/30' },
    { label: 'interests',    items: ['EdTech', 'AI'],            color: 'from-[#FFB347] to-[#FF6B6B]',  text: 'text-[#FFD8A5]', bg: 'bg-[#FFB347]/10 border-[#FFB347]/30' },
    { label: 'preparations', items: ['IELTS', 'BFU hackathon'],  color: 'from-[#FF6B6B] to-[#FFB347]',  text: 'text-[#FFB7B7]', bg: 'bg-[#FF6B6B]/10 border-[#FF6B6B]/30' },
    { label: 'goals',        items: ['Co-founder'],              color: 'from-[#4ECDC4] to-[#7B6FFF]',  text: 'text-[#A6F0EB]', bg: 'bg-[#4ECDC4]/10 border-[#4ECDC4]/30' },
  ];
  return (
    <div className="flex flex-col flex-1 bg-[#0c0c14]">
      <TGBar title="Tag your bio" subtitle="Claude is reading…" />
      <div className="px-3.5 pt-3 flex-1 overflow-hidden">
        <div className="rounded-xl bg-white/[0.03] border border-white/[0.07] px-2.5 py-2 text-[10px] text-white/80 leading-snug">
          19, from Samarkand, learning <span className="bg-[#7B6FFF]/25 px-1 rounded">Python</span> and <span className="bg-[#7B6FFF]/25 px-1 rounded">product design</span>. Preparing for <span className="bg-[#FF6B6B]/25 px-1 rounded">IELTS</span>. Want to start in <span className="bg-[#FFB347]/25 px-1 rounded">EdTech</span>.
        </div>
        <div className="mt-2.5 space-y-1.5">
          {groups.map(g => (
            <div key={g.label}>
              <div className="text-[8.5px] uppercase tracking-[0.18em] text-white/35 mb-1">{g.label}</div>
              <div className="flex flex-wrap gap-1">
                {g.items.map(t => (
                  <span key={t} className={`text-[9.5px] px-1.5 py-0.5 rounded-full border ${g.bg} ${g.text}`}>{t}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// --- Screen for film beat 4: match deck ---
function MatchDeckScreen() {
  const cards = [
    { n: 'Diyor R.', loc: 'Tashkent', pct: 92, init: 'DR', tags: ['Python', 'AI'],     col: 'from-[#7B6FFF] to-[#A78BFA]' },
    { n: 'Aziza K.', loc: 'Bukhara',  pct: 88, init: 'AK', tags: ['Figma', 'UX'],      col: 'from-[#FF6B6B] to-[#FFB347]' },
    { n: 'Sardor M.', loc: 'Andijon', pct: 81, init: 'SM', tags: ['React', 'EdTech'], col: 'from-[#4ECDC4] to-[#7B6FFF]' },
  ];
  return (
    <div className="flex flex-col flex-1 bg-[#0c0c14]">
      <TGBar title="Your matches" subtitle="✨ AI-curated" />
      <div className="px-3.5 pt-3 flex-1 relative">
        {cards.map((c, i) => (
          <div
            key={c.n}
            className="absolute left-3.5 right-3.5 rounded-2xl border border-white/[0.07] bg-[#13131A] p-3"
            style={{
              top: 12 + i * 76,
              transform: `rotate(${(i - 1) * 1.4}deg) translateY(${i * 2}px)`,
              boxShadow: '0 18px 40px -10px rgba(0,0,0,0.6)',
              zIndex: 10 - i,
            }}
          >
            <div className="flex items-center gap-2.5">
              <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${c.col} text-white font-display font-bold text-[11px] flex items-center justify-center`}>{c.init}</div>
              <div className="flex-1 min-w-0">
                <div className="text-[11.5px] font-semibold text-white">{c.n}</div>
                <div className="text-[9.5px] text-white/45">{c.loc}</div>
              </div>
              <div className="text-right">
                <div className="text-[14px] font-display font-bold bg-gradient-to-br from-[#A78BFA] to-[#7B6FFF] bg-clip-text text-transparent">{c.pct}%</div>
              </div>
            </div>
            <div className="mt-1.5 flex gap-1">
              {c.tags.map(t => <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-[#7B6FFF]/10 text-[#D6CCFF]">{t}</span>)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, {
  PhoneFrame, WelcomeScreen, RegisterScreen, ProfileScreen,
  ForYouScreen, BotPingScreen, ApplyScreen, BioTagScreen, MatchDeckScreen,
});
