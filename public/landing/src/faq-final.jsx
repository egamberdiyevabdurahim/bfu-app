// faq-final.jsx — FAQ accordion, Final CTA full-bleed finale, Footer
const { useState, useEffect, useRef } = React;


function FAQItem({ item, open, onClick }) {
  const ref = useRef(null);
  const [h, setH] = useState(0);
  useEffect(() => {
    if (ref.current) setH(ref.current.scrollHeight);
  }, [item.a]);
  return (
    <div className="border-b border-white/[0.07]">
      <button
        onClick={onClick}
        className="w-full text-left py-5 flex items-center justify-between gap-6 group"
      >
        <span className="font-display font-bold text-[18px] sm:text-[22px] tracking-[-0.01em] text-white group-hover:text-[#D6CCFF] transition">
          {item.q}
        </span>
        <span className={`shrink-0 w-9 h-9 rounded-full border border-white/15 flex items-center justify-center text-white/70 transition-all duration-300 ${open ? 'rotate-45 bg-[#7B6FFF]/15 border-[#7B6FFF]/40 text-[#A78BFA]' : ''}`}>
          <svg width="14" height="14" viewBox="0 0 14 14"><path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
        </span>
      </button>
      <div
        className="overflow-hidden transition-[max-height,opacity] duration-500 ease-[cubic-bezier(.7,0,.2,1)]"
        style={{ maxHeight: open ? h + 32 : 0, opacity: open ? 1 : 0 }}
      >
        <div ref={ref} className="pb-6 pr-12 text-[15px] text-text-2 leading-[1.6] max-w-[760px]">
          {item.a}
        </div>
      </div>
    </div>
  );
}

function FAQ() {
  useBFULang(); // re-render on language change
  const [openIdx, setOpenIdx] = useState(0);
  const FAQS = BFU_T('faq.items');
  return (
    <section className="relative py-28 lg:py-36">
      <div className="max-w-[920px] mx-auto px-5 lg:px-8">
        <div className="text-[11px] uppercase tracking-[0.22em] text-[#A78BFA] font-semibold mb-4">{BFU_T('faq.kicker')}</div>
        <h2 className="font-display font-bold text-[36px] sm:text-[46px] lg:text-[56px] leading-[1.04] tracking-[-0.025em] mb-10">
          {BFU_T('faq.h2')}
        </h2>
        <div>
          {FAQS.map((f, i) => (
            <FAQItem
              key={i}
              item={f}
              open={openIdx === i}
              onClick={() => setOpenIdx(openIdx === i ? -1 : i)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

// ---- Final CTA ----
function FinalCTA() {
  useBFULang(); // re-render on language change
  return (
    <section className="relative overflow-hidden" style={{ minHeight: '80vh' }}>
      <div className="absolute inset-0 -z-10">
        <MeshGradient intensity={1.6} />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-bg" />
        {/* extra intensity */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[80vw] h-[80vw] rounded-full bg-[#7B6FFF]/20 blur-[120px]" />
        <div className="absolute inset-0 dot-grid opacity-[0.18] mix-blend-screen" />
      </div>

      <div className="relative max-w-[1000px] mx-auto px-5 lg:px-8 py-28 lg:py-40 text-center">
        <div className="text-[11px] uppercase tracking-[0.32em] text-[#4ECDC4] font-semibold mb-6">{BFU_T('final.kicker')}</div>
        <h2 className="font-display font-extrabold text-[48px] sm:text-[68px] lg:text-[92px] leading-[0.98] tracking-[-0.03em]">
          {BFU_T('final.h2a')}<br className="hidden sm:block" />
          <span className="bg-gradient-to-br from-white via-[#D6CCFF] to-[#A78BFA] bg-clip-text text-transparent">{BFU_T('final.h2hl')}</span><br />
          {BFU_T('final.h2b')}
        </h2>
        <p className="mt-7 max-w-[520px] mx-auto text-[16px] text-text-2 leading-[1.55]">
          {BFU_T('final.p')}
        </p>

        <div className="mt-10 flex flex-col items-center gap-4">
          <PrimaryCTA href="https://t.me/BrightFuturesUzbekistan_bot" size="lg" className="text-[16px]">
            <span className="text-[18px]">🚀</span> {BFU_T('final.cta')}
          </PrimaryCTA>
          <a
            href="#regions"
            onClick={(e) => { e.preventDefault(); smoothScrollTo('#regions'); }}
            className="text-[13px] text-text-2 hover:text-text-1 transition underline-offset-4 hover:underline"
          >
            {BFU_T('final.browse')}
          </a>
        </div>
      </div>
    </section>
  );
}

// ---- Footer ----
function Footer() {
  useBFULang(); // re-render on language change
  return (
    <footer className="relative border-t border-white/[0.06] bg-[#0A0A0F]">
      <div className="max-w-[1240px] mx-auto px-5 lg:px-8 py-16 lg:py-20">
        <div className="grid lg:grid-cols-[1.2fr_1fr_1fr] gap-10 lg:gap-14">
          <div>
            <a href="#top" className="inline-flex items-center">
              <LogoMark size={40} />
            </a>
            <p className="mt-5 text-[14px] text-text-2 max-w-[320px] leading-[1.55]">
              {BFU_T('footer.desc')}
            </p>
            <div className="mt-5 inline-flex items-center gap-2 text-[13px] text-text-3">
              <span className="font-display font-bold text-text-1">{BFU_T('footer.made')}</span>
              <span>🇺🇿</span>
            </div>
            <div className="mt-4 flex items-center gap-2.5 text-text-3">
              <span className="text-[10px] uppercase tracking-[0.2em] font-semibold">{BFU_T('footer.poweredBy')}</span>
              <span className="font-display font-bold text-[15px] text-text-1 tracking-[-0.01em]">Marstiff</span>
              <img src="/marstiff-logo.png" alt="Marstiff" className="h-5 w-auto object-contain" />
            </div>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-text-3 font-semibold mb-4">{BFU_T('footer.linksTitle')}</div>
            <ul className="space-y-2.5 text-[14px]">
              {[
                [BFU_T('footer.linkTelegram'), 'https://t.me/BrightFuturesUzbekistan_bot'],
                [BFU_T('footer.linkRegions'), '#regions'],
                [BFU_T('footer.linkEvents'), '#events'],
              ].map(([t, h]) => (
                <li key={h}>
                  <a href={h} target={h.startsWith('http') ? '_blank' : undefined} rel="noreferrer" className="text-text-2 hover:text-text-1 transition">{t}</a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-text-3 font-semibold mb-4">{BFU_T('footer.contactTitle')}</div>
            <ul className="space-y-2.5 text-[14px]">
              <li><a href="https://t.me/BrightFuturesUzbekistan" target="_blank" rel="noreferrer" className="text-text-2 hover:text-text-1 transition">@BrightFuturesUzbekistan</a></li>
              <li><a href="https://t.me/BrightFuturesUzbekistan_bot" target="_blank" rel="noreferrer" className="text-text-2 hover:text-text-1 transition">@BrightFuturesUzbekistan_bot</a></li>
              <li><a href="mailto:partners@brightfuturesuzbekistan.uz" className="text-text-2 hover:text-text-1 transition">partners@brightfuturesuzbekistan.uz</a></li>
              <li className="pt-2 text-text-3 text-[12px]">brightfuturesuzbekistan.uz</li>
            </ul>
          </div>
        </div>

        <div className="mt-14 pt-6 border-t border-white/[0.05] flex flex-wrap items-center justify-between gap-3 text-[12px] text-text-3">
          <div>{BFU_T('footer.copyright')}</div>
          <div className="flex items-center gap-4">
            <span>v1.0</span>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#4ECDC4] soft-pulse" />
              {BFU_T('footer.status')}
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}

Object.assign(window, { FAQ, FinalCTA, Footer });
