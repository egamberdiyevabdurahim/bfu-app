// chrome.jsx — Topbar, ScrollProgressBar, ChipRow, StatTiles, MeshGradient
const { useState, useEffect, useRef } = React;

function ScrollProgressBar() {
  const p = useScrollProgress();
  return (
    <div className="fixed top-0 inset-x-0 z-[80] pointer-events-none">
      <div className="h-[2px] w-full bg-transparent">
        <div
          className="h-full bg-gradient-to-r from-[#7B6FFF] via-[#A78BFA] to-[#4ECDC4]"
          style={{ width: `${p * 100}%`, transition: 'width 0.08s linear', boxShadow: '0 0 12px rgba(123,111,255,0.7)' }}
        />
      </div>
      <div className="h-[1px] w-full hairline-shimmer" />
    </div>
  );
}

function LogoMark({ size = 36 }) {
  return (
    <div
      className="rounded-[10px] bg-gradient-to-br from-[#7B6FFF] to-[#A78BFA] flex items-center justify-center text-white font-display font-bold shadow-[0_8px_24px_rgba(123,111,255,0.45)]"
      style={{ width: size, height: size, fontSize: size * 0.55 }}
    >✦</div>
  );
}

function LangPills({ value, onChange }) {
  const langs = ['EN', 'UZ', 'RU'];
  return (
    <div className="flex items-center gap-0.5 rounded-full bg-white/[0.04] border border-white/[0.07] p-0.5">
      {langs.map(l => (
        <button
          key={l}
          onClick={() => onChange(l)}
          className={`px-2.5 py-1 rounded-full text-[11px] font-semibold tracking-wide transition ${value === l ? 'bg-white/10 text-white' : 'text-text-3 hover:text-text-1'}`}
        >{l}</button>
      ))}
    </div>
  );
}

function PrimaryCTA({ children, href, className = '', size = 'md', onClick, magnetic = true }) {
  const ref = useMagnetic(magnetic ? 0.32 : 0, 80);
  const sizes = {
    sm: 'px-4 py-2 text-[12px]',
    md: 'px-5 py-2.5 text-[13px]',
    lg: 'px-7 py-3.5 text-[15px]',
  };
  return (
    <a
      ref={magnetic ? ref : null}
      href={href}
      onClick={onClick}
      target={href?.startsWith('http') ? '_blank' : undefined}
      rel="noreferrer"
      className={`btn-glow inline-flex items-center gap-2 rounded-full font-semibold text-white bg-gradient-to-br from-[#7B6FFF] to-[#A78BFA] ${sizes[size]} ${className}`}
      style={{ willChange: 'transform' }}
    >
      {children}
    </a>
  );
}

function GhostCTA({ children, href, onClick, className = '' }) {
  return (
    <a
      href={href}
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-semibold border border-white/15 text-white/85 hover:border-white/35 hover:text-white transition ${className}`}
    >{children}</a>
  );
}

function Topbar() {
  const [lang, setLang] = useState('EN');
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 14);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const nav = [
    { label: 'Features', href: '#features' },
    { label: 'Regions',  href: '#regions' },
    { label: 'Events',   href: '#events' },
    { label: 'Partners', href: '#partners' },
  ];

  return (
    <header className={`fixed top-0 inset-x-0 z-[70] transition-all duration-300 ${scrolled ? 'bg-[#0A0A0F]/80 backdrop-blur-md border-b border-white/[0.05]' : 'bg-transparent'}`}>
      <div className="max-w-[1240px] mx-auto px-5 lg:px-8 h-[64px] flex items-center justify-between">
        <a href="#top" className="flex items-center gap-2.5">
          <LogoMark size={32} />
          <span className="font-display font-bold text-[18px] tracking-[-0.02em]">BFU</span>
        </a>

        <nav className="hidden lg:flex items-center gap-7 text-[13px] text-text-2">
          {nav.map(n => (
            <a
              key={n.label}
              href={n.href}
              onClick={(e) => { e.preventDefault(); smoothScrollTo(n.href); }}
              className="hover:text-text-1 transition relative"
            >{n.label}</a>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-3">
          {/* Language pills removed until the landing is fully trilingual —
              a switcher that doesn't switch is worse than none. The Mini App
              itself is uz/ru/en. */}
          <PrimaryCTA href="https://t.me/BrightFuturesUzbekistan_bot" size="sm">
            Open in Telegram <span className="opacity-90">→</span>
          </PrimaryCTA>
        </div>

        <button className="md:hidden text-white/80 p-2" onClick={() => setMobileOpen(v => !v)} aria-label="menu">
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <path d="M3 7h16M3 12h16M3 17h16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
          </svg>
        </button>
      </div>
      {mobileOpen && (
        <div className="md:hidden border-t border-white/[0.05] bg-[#0A0A0F]/95 backdrop-blur-xl px-5 py-4 space-y-3">
          {nav.map(n => (
            <a
              key={n.label}
              href={n.href}
              onClick={(e) => { e.preventDefault(); smoothScrollTo(n.href); setMobileOpen(false); }}
              className="block text-text-2 text-[14px]"
            >{n.label}</a>
          ))}
          <div className="flex items-center gap-3 pt-2">
            <PrimaryCTA href="https://t.me/BrightFuturesUzbekistan_bot" size="sm" magnetic={false}>Open in Telegram →</PrimaryCTA>
          </div>
        </div>
      )}
    </header>
  );
}

// Beautiful animated CSS mesh-gradient fallback
function MeshGradient({ intensity = 1, className = '' }) {
  const base = 0.55 * intensity;
  return (
    <div className={`absolute inset-0 overflow-hidden ${className}`}>
      <div
        className="mesh-blob mesh-blob-a"
        style={{
          background: 'radial-gradient(circle, #7B6FFF, transparent 65%)',
          width: '60vw', height: '60vw',
          top: '-15vw', left: '-10vw',
          opacity: base,
        }}
      />
      <div
        className="mesh-blob mesh-blob-b"
        style={{
          background: 'radial-gradient(circle, #A78BFA, transparent 65%)',
          width: '50vw', height: '50vw',
          bottom: '-10vw', right: '-8vw',
          opacity: base * 0.9,
        }}
      />
      <div
        className="mesh-blob mesh-blob-a"
        style={{
          background: 'radial-gradient(circle, #4ECDC4, transparent 70%)',
          width: '40vw', height: '40vw',
          top: '40%', left: '50%',
          opacity: base * 0.45,
          animationDelay: '-7s',
        }}
      />
      <div className="absolute inset-0 dot-grid opacity-[0.35] mix-blend-screen" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-bg" />
    </div>
  );
}

Object.assign(window, {
  ScrollProgressBar, Topbar, LogoMark, LangPills,
  PrimaryCTA, GhostCTA, MeshGradient,
});
