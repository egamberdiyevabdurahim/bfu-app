// hero.jsx — Hero section + floating phone
// Exposes: Hero, FloatingPhone
const { useState, useEffect, useRef } = React;

const SPLINE_HERO_URL = 'SPLINE_HERO_URL'; // swap me
const SPLINE_MAP_URL  = 'SPLINE_MAP_URL';  // swap me
window.SPLINE_HERO_URL = SPLINE_HERO_URL;
window.SPLINE_MAP_URL  = SPLINE_MAP_URL;

function HeroHeadline({ reduced }) {
  const [lang] = useBFULang();
  const headline = BFU_T('hero.headline');
  const words = headline.split(/\s+/).filter(Boolean);
  const { motion } = window.FramerMotion || {};
  if (!motion) {
    return (
      <h1 className="font-display font-extrabold text-[42px] sm:text-[56px] lg:text-[72px] leading-[1.02] tracking-[-0.025em]">
        {headline}
      </h1>
    );
  }
  return (
    <h1 className="font-display font-extrabold text-[42px] sm:text-[56px] lg:text-[72px] leading-[1.02] tracking-[-0.025em] text-sweep">
      {words.map((w, i) => (
        <motion.span
          // key includes lang so the word-by-word reveal replays on switch
          key={`${lang}-${w}-${i}`}
          initial={reduced ? false : { opacity: 0, y: 22, filter: 'blur(8px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: 0.7, delay: i * 0.06, ease: [0.2, 0.7, 0.2, 1] }}
          className="inline-block mr-[0.22em]"
        >{w}</motion.span>
      ))}
    </h1>
  );
}

function ChipRow({ items, delayBase = 0.8 }) {
  const { motion } = window.FramerMotion || {};
  if (!motion) {
    return (
      <div className="flex flex-wrap gap-2">
        {items.map(t => <span key={t} className="px-3 py-1.5 rounded-full text-[12px] bg-white/[0.04] border border-white/[0.08] text-text-2">{t}</span>)}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((t, i) => (
        <motion.span
          key={t}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: delayBase + i * 0.08, duration: 0.5 }}
          className="px-3 py-1.5 rounded-full text-[12px] bg-white/[0.04] border border-white/[0.08] text-text-2 backdrop-blur-sm"
        >{t}</motion.span>
      ))}
    </div>
  );
}

function StatTile({ value, suffix = '', label, start }) {
  const n = useCountUp(value, { start, duration: 1600 });
  const display = (value >= 1000) ? n.toLocaleString() : n;
  return (
    <div className="flex flex-col">
      <div className="font-display font-extrabold text-[36px] sm:text-[44px] leading-none tracking-[-0.03em]">
        <span className="bg-gradient-to-br from-white to-[#A78BFA] bg-clip-text text-transparent">
          {display}{suffix}
        </span>
      </div>
      <div className="mt-1.5 text-[11px] uppercase tracking-[0.18em] text-text-3">{label}</div>
    </div>
  );
}

function StatTiles() {
  useBFULang(); // re-render labels on language change
  const [ref, inView] = useInView({ threshold: 0.4 });
  const live = (window.useBFUStats && window.useBFUStats()) || null;
  // Live counts with a small safety floor so the page never looks empty before
  // the page has any data. The floor only applies when the API hasn't responded.
  const members  = live ? live.members  : 1;
  const projects = live ? live.projects : 1;
  const regions  = live ? live.regions  : 14;
  return (
    <div ref={ref} className="grid grid-cols-3 gap-6 sm:gap-10 max-w-[520px]">
      <StatTile value={members}  suffix={members  >= 100 ? '+' : ''} label={BFU_T('stat.members')}  start={inView} />
      <StatTile value={projects} suffix={projects >= 50  ? '+' : ''} label={BFU_T('stat.projects')} start={inView} />
      <StatTile value={regions}                                       label={BFU_T('stat.regions')}  start={inView} />
    </div>
  );
}

// --- Floating phone with parallax, gyro, auto-scroll screens ---
function FloatingPhone({ reduced }) {
  const [parallaxRef, rot] = useMouseParallax(4);
  const screens = [
    <WelcomeScreen key="w" />,
    <RegisterScreen key="r" activeLang="uz" />,
    <ProfileScreen key="p" />,
    <ForYouScreen key="f" />,
    <BotPingScreen key="b" />,
  ];
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (reduced) return;
    const t = setInterval(() => setIdx(i => (i + 1) % screens.length), 4200);
    return () => clearInterval(t);
  }, [reduced, screens.length]);

  return (
    <div
      ref={parallaxRef}
      className="relative mx-auto"
      style={{
        width: 320, height: 660,
        perspective: 1400,
      }}
    >
      <div
        className="relative w-full h-full"
        style={{
          transform: `rotateX(${rot.x}deg) rotateY(${rot.y}deg)`,
          transformStyle: 'preserve-3d',
          transition: 'transform 0.35s cubic-bezier(.2,.7,.2,1)',
        }}
      >
        {/* glow behind */}
        <div className="absolute -inset-12 rounded-[60px] bg-gradient-to-br from-[#7B6FFF]/35 via-transparent to-[#4ECDC4]/20 blur-3xl -z-10" />
        <div className="absolute inset-0 flex items-center justify-center">
          <PhoneFrame w={300} h={620}>
            <div className="relative w-full h-full">
              {screens.map((s, i) => (
                <div
                  key={i}
                  className="absolute inset-0 transition-opacity duration-700"
                  style={{ opacity: idx === i ? 1 : 0, pointerEvents: idx === i ? 'auto' : 'none' }}
                >{s}</div>
              ))}
            </div>
          </PhoneFrame>
        </div>
        {/* screen dots */}
        <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 flex gap-1.5">
          {screens.map((_, i) => (
            <span key={i} className={`w-1.5 h-1.5 rounded-full transition ${idx === i ? 'bg-[#A78BFA] w-5' : 'bg-white/15'}`} />
          ))}
        </div>
      </div>
    </div>
  );
}

function Hero({ reduced }) {
  useBFULang(); // re-render kicker / subhead / CTAs / chips on language change
  const splineRef = useRef(null);
  const [splineFailed, setSplineFailed] = useState(false);
  useEffect(() => {
    // If hero spline URL is the placeholder, treat as missing
    if (SPLINE_HERO_URL === 'SPLINE_HERO_URL' || !SPLINE_HERO_URL.startsWith('http')) {
      setSplineFailed(true);
    }
  }, []);

  return (
    <section id="top" className="relative pt-[110px] pb-[40px] lg:pt-[160px] overflow-hidden">
      {/* background */}
      <div className="absolute inset-0 -z-10">
        {!splineFailed && (
          <div className="absolute inset-0 opacity-[0.55]">
            <spline-viewer ref={splineRef} url={SPLINE_HERO_URL} events-target="global" loading-anim-type="none" />
          </div>
        )}
        <MeshGradient intensity={1} />
      </div>

      <div className="max-w-[1240px] mx-auto px-5 lg:px-8">
        <div className="grid lg:grid-cols-[1.05fr_auto] gap-12 lg:gap-8 items-center">
          <div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-[#4ECDC4] font-semibold mb-5">
              {BFU_T('hero.kicker')}
            </div>

            <HeroHeadline reduced={reduced} />

            <p className="mt-6 max-w-[560px] text-[16px] sm:text-[18px] leading-[1.5] text-text-2">
              {BFU_T('hero.subhead.a')}
              <span className="text-text-1"> {BFU_T('hero.subhead.b')}</span>
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <PrimaryCTA href="https://t.me/BrightFuturesUzbekistan_bot" size="lg">
                <span className="text-[16px]">🚀</span> {BFU_T('cta.telegram')}
              </PrimaryCTA>
              <GhostCTA onClick={(e) => { e.preventDefault(); smoothScrollTo('#film'); }} href="#film">
                {BFU_T('cta.inside')} <span className="opacity-60">↓</span>
              </GhostCTA>
            </div>

            <div className="mt-8">
              <ChipRow
                items={[
                  BFU_T('chip.regions'),
                  BFU_T('chip.trilingual'),
                  BFU_T('chip.aiMatched'),
                  BFU_T('chip.verified'),
                  BFU_T('chip.free'),
                ]}
                delayBase={0.9}
              />
            </div>

            <div className="mt-12">
              <StatTiles />
            </div>
          </div>

          <div className="hidden lg:block relative">
            <FloatingPhone reduced={reduced} />
          </div>
        </div>

        {/* Mobile phone preview */}
        <div className="lg:hidden mt-12 flex justify-center">
          <FloatingPhone reduced={reduced} />
        </div>
      </div>
    </section>
  );
}

Object.assign(window, { Hero, FloatingPhone, ChipRow, StatTiles });
