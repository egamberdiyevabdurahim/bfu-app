// faq-final.jsx — FAQ accordion, Final CTA full-bleed finale, Footer
const { useState, useEffect, useRef } = React;

const FAQS = [
  { q: 'Is it free?', a: 'Yes. Always free for students. We do not charge members for finding co-founders, joining projects, or applying to opportunities.' },
  { q: 'Do I need a Telegram account?', a: 'Yes. BFU lives inside Telegram as a Mini App, so you don’t have to install anything new. If you already use Telegram, you already have BFU — just open the bot.' },
  { q: 'What languages does it support?', a: 'Three: O‘zbekcha, Русский and English. Every screen is fully trilingual, and you can switch any time without losing your work.' },
  { q: 'How do you verify members?', a: 'Admins review each profile before granting a verification badge. We look at who the person says they are, what they’re working on, and whether their bio and links check out. Verified members get a ✓ that other members can see.' },
  { q: 'Who is behind BFU?', a: 'BFU was founded by Abdurahim Egamberdiyev. It’s built in Uzbekistan, in Uzbek, for Uzbek youth. The product is independent and member-funded.' },
];

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
  const [openIdx, setOpenIdx] = useState(0);
  return (
    <section className="relative py-28 lg:py-36">
      <div className="max-w-[920px] mx-auto px-5 lg:px-8">
        <div className="text-[11px] uppercase tracking-[0.22em] text-[#A78BFA] font-semibold mb-4">FAQ</div>
        <h2 className="font-display font-bold text-[36px] sm:text-[46px] lg:text-[56px] leading-[1.04] tracking-[-0.025em] mb-10">
          Questions, answered.
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
        <div className="text-[11px] uppercase tracking-[0.32em] text-[#4ECDC4] font-semibold mb-6">Ready?</div>
        <h2 className="font-display font-extrabold text-[48px] sm:text-[68px] lg:text-[92px] leading-[0.98] tracking-[-0.03em]">
          Your team is <br className="hidden sm:block" />
          <span className="bg-gradient-to-br from-white via-[#D6CCFF] to-[#A78BFA] bg-clip-text text-transparent">already here.</span><br />
          Open the bot.
        </h2>
        <p className="mt-7 max-w-[520px] mx-auto text-[16px] text-text-2 leading-[1.55]">
          One tap inside Telegram and you’re in. No App Store, no signup form, no second account.
        </p>

        <div className="mt-10 flex flex-col items-center gap-4">
          <PrimaryCTA href="https://t.me/BrightFuturesUzbekistan_bot" size="lg" className="text-[16px]">
            <span className="text-[18px]">🚀</span> Open in Telegram
          </PrimaryCTA>
          <a
            href="#regions"
            onClick={(e) => { e.preventDefault(); smoothScrollTo('#regions'); }}
            className="text-[13px] text-text-2 hover:text-text-1 transition underline-offset-4 hover:underline"
          >
            or browse the regions →
          </a>
        </div>
      </div>
    </section>
  );
}

// ---- Footer ----
function Footer() {
  return (
    <footer className="relative border-t border-white/[0.06] bg-[#0A0A0F]">
      <div className="max-w-[1240px] mx-auto px-5 lg:px-8 py-16 lg:py-20">
        <div className="grid lg:grid-cols-[1.2fr_1fr_1fr] gap-10 lg:gap-14">
          <div>
            <div className="flex items-center gap-2.5">
              <LogoMark size={32} />
              <span className="font-display font-bold text-[18px]">BFU</span>
            </div>
            <p className="mt-5 text-[14px] text-text-2 max-w-[320px] leading-[1.55]">
              Bright Futures Uzbekistan. A Telegram-native platform connecting students, founders and volunteers across all 14 regions.
            </p>
            <div className="mt-5 inline-flex items-center gap-2 text-[13px] text-text-3">
              <span className="font-display font-bold text-text-1">Made in Uzbekistan</span>
              <span>🇺🇿</span>
              <span className="text-[#A78BFA] soft-pulse inline-block">✦</span>
            </div>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-text-3 font-semibold mb-4">Links</div>
            <ul className="space-y-2.5 text-[14px]">
              {[
                ['Open in Telegram', 'https://t.me/BrightFuturesUzbekistan_bot'],
                ['Regions', '#regions'],
                ['Events', '#events'],
                ['Partners', '#partners'],
              ].map(([t, h]) => (
                <li key={t}>
                  <a href={h} target={h.startsWith('http') ? '_blank' : undefined} rel="noreferrer" className="text-text-2 hover:text-text-1 transition">{t}</a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-text-3 font-semibold mb-4">Contact</div>
            <ul className="space-y-2.5 text-[14px]">
              <li><a href="https://t.me/BrightFuturesUzbekistan" target="_blank" rel="noreferrer" className="text-text-2 hover:text-text-1 transition">@BrightFuturesUzbekistan</a></li>
              <li><a href="https://t.me/BrightFuturesUzbekistan_bot" target="_blank" rel="noreferrer" className="text-text-2 hover:text-text-1 transition">@BrightFuturesUzbekistan_bot</a></li>
              <li><a href="mailto:partners@brightfuturesuzbekistan.uz" className="text-text-2 hover:text-text-1 transition">partners@brightfuturesuzbekistan.uz</a></li>
              <li className="pt-2 text-text-3 text-[12px]">brightfuturesuzbekistan.uz</li>
            </ul>
          </div>
        </div>

        <div className="mt-14 pt-6 border-t border-white/[0.05] flex flex-wrap items-center justify-between gap-3 text-[12px] text-text-3">
          <div>© Bright Futures Uzbekistan · Built with <span className="text-[#FF6B6B]">❤</span> in Tashkent.</div>
          <div className="flex items-center gap-4">
            <span>v1.0</span>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#4ECDC4] soft-pulse" />
              All systems operational
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}

Object.assign(window, { FAQ, FinalCTA, Footer });
