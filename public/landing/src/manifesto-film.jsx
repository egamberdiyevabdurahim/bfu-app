// manifesto-film.jsx — Manifesto section + scroll-pinned product film
// Exposes: Manifesto, ProductFilm
const { useState, useEffect, useRef, useMemo } = React;

function Manifesto({ reduced }) {
  useBFULang(); // re-render on language change
  const sectionRef = useRef(null);
  const lineRefs = useRef([]);
  const underlineRef = useRef(null);

  useEffect(() => {
    if (reduced) return;
    if (!window.gsap || !window.ScrollTrigger) return;
    const gsap = window.gsap;
    const ST = window.ScrollTrigger;
    const ctx = gsap.context(() => {
      lineRefs.current.forEach((el) => {
        if (!el) return;
        gsap.fromTo(el,
          { clipPath: 'inset(0 0 100% 0)', y: 30, opacity: 0 },
          {
            clipPath: 'inset(0 0 0% 0)', y: 0, opacity: 1,
            duration: 1.1, ease: 'power3.out',
            scrollTrigger: { trigger: el, start: 'top 80%', toggleActions: 'play none none reverse' },
          });
      });
      if (underlineRef.current) {
        gsap.fromTo(underlineRef.current,
          { scaleX: 0 },
          {
            scaleX: 1,
            duration: 1.4, ease: 'power3.out',
            scrollTrigger: { trigger: underlineRef.current, start: 'top 85%', toggleActions: 'play none none reverse' },
          });
      }
    }, sectionRef);
    return () => ctx.revert();
  }, [reduced]);

  const paragraphs = [BFU_T('manifesto.p1'), BFU_T('manifesto.p2'), null];

  return (
    <section ref={sectionRef} className="relative py-32 lg:py-44 overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      <div className="max-w-[920px] mx-auto px-5 lg:px-8 text-center">
        <div className="text-[11px] uppercase tracking-[0.22em] text-[#A78BFA] font-semibold mb-12">{BFU_T('manifesto.kicker')}</div>
        <div className="space-y-12">
          {paragraphs.map((p, i) => (
            <div key={i} className="overflow-hidden">
              <p
                ref={el => lineRefs.current[i] = el}
                className="font-display font-medium text-[24px] sm:text-[30px] lg:text-[36px] leading-[1.18] tracking-[-0.02em] text-text-1"
              >
                {i === 2 ? (
                  <>
                    {BFU_T('manifesto.p3a')}
                    <span className="relative inline-block">
                      <span className="bg-gradient-to-br from-[#A78BFA] to-[#7B6FFF] bg-clip-text text-transparent">{BFU_T('manifesto.p3hl')}</span>
                      <span
                        ref={underlineRef}
                        className="absolute left-0 right-0 -bottom-1 h-[3px] bg-gradient-to-r from-[#7B6FFF] to-[#A78BFA] rounded-full"
                        style={{ transformOrigin: 'left center', transform: 'scaleX(0)' }}
                      />
                    </span>{BFU_T('manifesto.p3b')}
                  </>
                ) : p}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---- Product Film (scroll-pinned 5 beats) ----
function ProductFilm({ reduced }) {
  useBFULang(); // re-render on language change
  const sectionRef = useRef(null);
  const pinRef = useRef(null);
  const phoneRef = useRef(null);
  const [beat, setBeat] = useState(0);
  const [progress, setProgress] = useState(0);

  // Visual screens + tilts stay constant; copy comes from i18n.
  const SCREENS = [
    WelcomeScreen,
    () => <RegisterScreen activeLang="uz" />,
    BioTagScreen,
    MatchDeckScreen,
    () => <ApplyScreen accepted={progress > 0.92} />,
  ];
  const TILTS = [
    { x: -10, y: 4 }, { x: -8, y: -3 }, { x: -14, y: 6 }, { x: -12, y: -5 }, { x: -9, y: 5 },
  ];
  const copy = BFU_T('film.beats');
  const beats = SCREENS.map((Screen, i) => ({
    eyebrow: `Beat 0${i + 1}`,
    title: copy[i] ? copy[i].title : '',
    body: copy[i] ? copy[i].body : '',
    Screen,
    tilt: TILTS[i],
  }));

  useEffect(() => {
    if (reduced) {
      setBeat(0);
      return;
    }
    if (!window.gsap || !window.ScrollTrigger) return;
    const gsap = window.gsap;
    const ST = window.ScrollTrigger;
    let st;
    const ctx = gsap.context(() => {
      st = ST.create({
        trigger: sectionRef.current,
        start: 'top top',
        end: '+=200%',
        pin: pinRef.current,
        scrub: 1,
        anticipatePin: 1,
        onUpdate: (self) => {
          const p = self.progress;
          setProgress(p);
          const b = Math.min(beats.length - 1, Math.floor(p * beats.length));
          setBeat(b);
        },
      });
    }, sectionRef);
    return () => { st && st.kill(); ctx.revert(); };
  }, [reduced]);

  const current = beats[beat];
  const { motion, AnimatePresence } = window.FramerMotion || {};

  return (
    <section id="film" ref={sectionRef} className="relative" style={{ height: reduced ? 'auto' : '300vh' }}>
      <div ref={pinRef} className="relative h-screen w-full overflow-hidden">
        {/* bg glow */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute left-[10%] top-[20%] w-[40vw] h-[40vw] rounded-full bg-[#7B6FFF]/15 blur-[120px]" />
          <div className="absolute right-[10%] bottom-[10%] w-[35vw] h-[35vw] rounded-full bg-[#4ECDC4]/10 blur-[120px]" />
          <div className="absolute inset-0 dot-grid opacity-20" />
        </div>

        <div className="max-w-[1240px] mx-auto px-5 lg:px-8 h-full flex items-center">
          <div className="grid lg:grid-cols-2 gap-10 w-full items-center">
            {/* Phone column */}
            <div className="flex justify-center order-2 lg:order-1">
              <div
                ref={phoneRef}
                style={{
                  perspective: 1400,
                }}
              >
                <div
                  style={{
                    transform: `rotateX(${current.tilt.x}deg) rotateY(${current.tilt.y}deg)`,
                    transition: 'transform 0.8s cubic-bezier(.2,.7,.2,1)',
                    transformStyle: 'preserve-3d',
                  }}
                >
                  <div className="relative">
                    <div className="absolute -inset-10 rounded-[60px] bg-gradient-to-br from-[#7B6FFF]/35 to-transparent blur-3xl -z-10" />
                    <PhoneFrame w={300} h={620}>
                      <div className="relative w-full h-full">
                        {beats.map((b, i) => {
                          const S = b.Screen;
                          return (
                            <div
                              key={i}
                              className="absolute inset-0 transition-opacity duration-500"
                              style={{ opacity: i === beat ? 1 : 0, pointerEvents: i === beat ? 'auto' : 'none' }}
                            ><S /></div>
                          );
                        })}
                      </div>
                    </PhoneFrame>
                  </div>
                </div>
              </div>
            </div>

            {/* Copy column */}
            <div className="order-1 lg:order-2">
              <div className="text-[11px] uppercase tracking-[0.22em] text-[#A78BFA] font-semibold mb-3">
                {BFU_T('film.eyebrow')}
              </div>
              <div className="relative min-h-[260px]">
                {beats.map((b, i) => (
                  <div
                    key={i}
                    className="absolute inset-0 transition-all duration-500"
                    style={{
                      opacity: i === beat ? 1 : 0,
                      transform: i === beat ? 'translateY(0)' : i < beat ? 'translateY(-16px)' : 'translateY(16px)',
                      pointerEvents: i === beat ? 'auto' : 'none',
                    }}
                  >
                    <div className="text-[12px] uppercase tracking-[0.22em] text-[#4ECDC4]/90 font-semibold">{b.eyebrow}</div>
                    <h3 className="mt-3 font-display font-bold text-[34px] sm:text-[42px] lg:text-[52px] leading-[1.05] tracking-[-0.025em]">{b.title}</h3>
                    <p className="mt-5 text-[16px] sm:text-[17px] leading-[1.55] text-text-2 max-w-[520px]">{b.body}</p>
                  </div>
                ))}
              </div>

              {/* Beat ticker */}
              <div className="mt-8 flex items-center gap-2">
                {beats.map((_, i) => (
                  <div key={i} className="flex-1 h-[3px] rounded-full bg-white/[0.07] overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-[#7B6FFF] to-[#A78BFA]"
                      style={{
                        width: i < beat ? '100%' : i === beat ? `${((progress * beats.length) - beat) * 100}%` : '0%',
                        transition: 'width 0.2s linear',
                      }}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-2.5 text-[11px] text-text-3">
                {BFU_T('film.step')} <span className="text-text-1 font-semibold">{(beat + 1).toString().padStart(2, '0')}</span> {BFU_T('film.of')} {beats.length.toString().padStart(2, '0')} — {BFU_T('film.keepScrolling')}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

Object.assign(window, { Manifesto, ProductFilm });
