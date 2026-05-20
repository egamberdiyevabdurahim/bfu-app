// marquee-ai.jsx — Bot bubble marquee + AI matching interactive demo
const { useState, useEffect, useRef, useMemo } = React;

const BUBBLES = [
  { e: '🎉', t: 'You’re in! Your application to *Solar Farm Project* was accepted.', cta: 'Open project' },
  { e: '🔔', t: 'New Application! *Ali V.* applied to join your project *AI Tutor UZ*.', cta: 'Review' },
  { e: '🎁', t: 'Someone you invited just completed registration — your invite payoff unlocked.', cta: null },
  { e: '📍', t: 'Location saved. Open the web admin → Locations → Add/Edit.', cta: null },
  { e: '💜', t: 'Someone is interested in your profile on BFU.', cta: 'See who' },
  { e: '📬', t: 'BFU weekly digest — 3 new startups match your skills.', cta: 'Open digest' },
  { e: '✅', t: 'Your BFU profile has been verified. Welcome!', cta: null },
  { e: '⚡', t: 'New hackathon in *Samarqand* opens applications today.', cta: 'Apply' },
  { e: '🏆', t: 'You moved up on this week’s referral leaderboard.', cta: 'Share invite' },
  { e: '🤝', t: '*Diyor R.* wants to connect — 92% skill overlap.', cta: 'Open chat' },
];

function ChatBubble({ b }) {
  // Render *text* as bold
  const parts = b.t.split(/(\*[^*]+\*)/g);
  return (
    <div className="shrink-0 mr-4 max-w-[380px]">
      <div className="rounded-2xl rounded-bl-md bg-[#13131A] border border-white/[0.06] px-4 py-3 flex gap-3 items-start shadow-[0_18px_50px_rgba(0,0,0,0.35)]">
        <div className="shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-[#7B6FFF] to-[#A78BFA] flex items-center justify-center text-white font-display font-bold text-[13px]">✦</div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] text-[#4ECDC4] font-semibold uppercase tracking-wider">BFU bot</div>
          <div className="text-[13px] leading-snug text-white/90 mt-0.5">
            <span className="mr-1.5">{b.e}</span>
            {parts.map((p, i) =>
              p.startsWith('*') ? <strong key={i} className="text-white">{p.slice(1, -1)}</strong> : <span key={i}>{p}</span>
            )}
          </div>
          {b.cta && (
            <button className="mt-2 text-[11px] font-semibold px-2.5 py-1 rounded-md bg-white/[0.06] hover:bg-white/[0.12] text-white/90 border border-white/[0.07] transition">
              {b.cta} →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function MarqueeRow({ direction = 'left', bubbles }) {
  const list = [...bubbles, ...bubbles];
  return (
    <div className="marquee-mask marquee-paused overflow-hidden py-3">
      <div className={`marquee-track ${direction === 'left' ? 'marquee-left' : 'marquee-right'}`}>
        {list.map((b, i) => <ChatBubble key={i} b={b} />)}
      </div>
    </div>
  );
}

function BotMarquee() {
  const rowA = BUBBLES;
  const rowB = [...BUBBLES.slice(5), ...BUBBLES.slice(0, 5)];
  return (
    <section id="events" className="relative py-24 lg:py-32 overflow-hidden">
      <div className="max-w-[1240px] mx-auto px-5 lg:px-8 mb-10">
        <div className="text-[11px] uppercase tracking-[0.22em] text-[#A78BFA] font-semibold mb-4">Telegram-native</div>
        <div className="grid lg:grid-cols-[1fr_0.9fr] gap-8 items-end">
          <h2 className="font-display font-bold text-[36px] sm:text-[46px] lg:text-[58px] leading-[1.04] tracking-[-0.025em]">
            Notifications where you already are.
          </h2>
          <p className="text-[16px] text-text-2 max-w-[460px] lg:pb-2">
            Applications, invites, weekly digests, verifications — BFU pings you inside the bot. No separate inbox to check.
          </p>
        </div>
      </div>

      <div className="space-y-2 pointer-events-none select-none">
        <MarqueeRow direction="left"  bubbles={rowA} />
        <MarqueeRow direction="right" bubbles={rowB} />
      </div>
    </section>
  );
}

// ---- AI matching demo ----

const BIO_TEXT = '19, from Samarkand, learning Python and product design. Preparing for IELTS and the BFU hackathon. Want to start something in EdTech.';

const TAG_MAP = [
  { phrase: 'Python',          group: 'skills',       color: 'bg-[#7B6FFF]/12 border-[#7B6FFF]/30 text-[#D6CCFF]', dotCol: '#7B6FFF' },
  { phrase: 'product design',  group: 'skills',       color: 'bg-[#7B6FFF]/12 border-[#7B6FFF]/30 text-[#D6CCFF]', dotCol: '#7B6FFF' },
  { phrase: 'IELTS',           group: 'preparations', color: 'bg-[#FF6B6B]/12 border-[#FF6B6B]/30 text-[#FFB7B7]', dotCol: '#FF6B6B' },
  { phrase: 'BFU hackathon',   group: 'preparations', color: 'bg-[#FF6B6B]/12 border-[#FF6B6B]/30 text-[#FFB7B7]', dotCol: '#FF6B6B' },
  { phrase: 'EdTech',          group: 'interests',    color: 'bg-[#FFB347]/12 border-[#FFB347]/30 text-[#FFD8A5]', dotCol: '#FFB347' },
  { phrase: 'Samarkand',       group: 'knowledges',   color: 'bg-[#A78BFA]/12 border-[#A78BFA]/30 text-[#D6CCFF]', dotCol: '#A78BFA' },
  { phrase: 'something',       group: 'goals',        color: 'bg-[#4ECDC4]/12 border-[#4ECDC4]/30 text-[#A6F0EB]', dotCol: '#4ECDC4', display: 'Co-founder' },
];

const GROUPS = ['skills', 'knowledges', 'interests', 'preparations', 'goals'];

function HighlightedBio({ text, revealed }) {
  // Mark phrases as <mark>; render others as text
  // Simple sequential matcher
  let i = 0;
  const out = [];
  while (i < text.length) {
    let matched = null;
    for (const t of TAG_MAP) {
      if (text.slice(i, i + t.phrase.length).toLowerCase() === t.phrase.toLowerCase()) {
        matched = t; break;
      }
    }
    if (matched) {
      const isRev = revealed.includes(matched.phrase);
      out.push(
        <span key={i} className={`relative inline-block transition-all duration-500 px-1 rounded ${isRev ? 'bg-white/[0.04] text-text-3' : 'bg-[#7B6FFF]/18 text-white'}`}>
          {text.slice(i, i + matched.phrase.length)}
        </span>
      );
      i += matched.phrase.length;
    } else {
      // append char until next phrase
      let next = text.length;
      for (const t of TAG_MAP) {
        const idx = text.toLowerCase().indexOf(t.phrase.toLowerCase(), i);
        if (idx !== -1 && idx < next) next = idx;
      }
      out.push(<span key={i}>{text.slice(i, next)}</span>);
      i = next;
    }
  }
  return <>{out}</>;
}

function AIMatchingDemo({ reduced }) {
  const [ref, inView] = useInView({ threshold: 0.35 });
  const [typed, done] = useTyping(BIO_TEXT, { speed: 30, start: inView, startDelay: 200 });
  const [revealStep, setRevealStep] = useState(0);
  const { motion, AnimatePresence } = window.FramerMotion || {};

  useEffect(() => {
    if (!done) { setRevealStep(0); return; }
    const phrases = TAG_MAP.map(t => t.phrase);
    let i = 0;
    const tick = () => {
      i++;
      setRevealStep(i);
      if (i < phrases.length) setTimeout(tick, 380);
    };
    const t0 = setTimeout(tick, 400);
    return () => clearTimeout(t0);
  }, [done]);

  const revealedPhrases = TAG_MAP.slice(0, revealStep).map(t => t.phrase);

  const matches = [
    { n: 'Diyor R.', loc: 'Tashkent', pct: 92, init: 'DR', tags: ['Python', 'EdTech', 'AI'], col: 'from-[#7B6FFF] to-[#A78BFA]' },
    { n: 'Aziza K.', loc: 'Bukhara',  pct: 88, init: 'AK', tags: ['Product design', 'UX'],   col: 'from-[#FF6B6B] to-[#FFB347]' },
    { n: 'Sardor M.', loc: 'Andijon', pct: 81, init: 'SM', tags: ['React', 'EdTech'],         col: 'from-[#4ECDC4] to-[#7B6FFF]' },
  ];

  return (
    <section ref={ref} className="relative py-28 lg:py-36 overflow-hidden">
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[60vw] h-[60vw] rounded-full bg-[#7B6FFF]/[0.06] blur-[140px] -z-10" />
      <div className="max-w-[1240px] mx-auto px-5 lg:px-8">
        <div className="max-w-[720px] mb-14">
          <div className="text-[11px] uppercase tracking-[0.22em] text-[#4ECDC4] font-semibold mb-4">AI matching</div>
          <h2 className="font-display font-bold text-[36px] sm:text-[46px] lg:text-[58px] leading-[1.04] tracking-[-0.025em]">
            Your bio, read by Claude.
          </h2>
          <p className="mt-5 text-[16px] text-text-2 max-w-[600px]">
            Drop a sentence about yourself. Anthropic Claude tags it across five dimensions — then we surface the people whose tags overlap with yours.
          </p>
        </div>

        <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-10">
          {/* LEFT: bio + chip groups */}
          <div className="rounded-3xl bg-[#13131A] border border-white/[0.06] p-6 lg:p-8">
            <div className="flex items-center justify-between mb-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-text-3 font-semibold">Your bio</div>
              <div className="flex items-center gap-1.5 text-[10px] text-[#4ECDC4]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#4ECDC4] soft-pulse" />
                Claude is reading
              </div>
            </div>
            <div className="rounded-xl bg-bg/60 border border-white/[0.05] p-4 min-h-[110px] text-[15px] leading-[1.6] text-white/90">
              <HighlightedBio text={typed} revealed={revealedPhrases} />
              {!done && <span className="inline-block w-[2px] h-[16px] bg-[#A78BFA] align-middle ml-0.5 animate-pulse" />}
            </div>

            <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {GROUPS.map((g, gi) => {
                const tagsForGroup = TAG_MAP.filter(t => t.group === g && revealedPhrases.includes(t.phrase));
                return (
                  <div key={g} className="rounded-xl bg-white/[0.02] border border-white/[0.05] p-3 min-h-[110px]">
                    <div className="text-[9px] uppercase tracking-[0.18em] text-text-3 font-semibold mb-2">{g}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {motion ? tagsForGroup.map(t => (
                        <motion.span
                          key={t.phrase}
                          layoutId={`tag-${t.phrase}`}
                          initial={{ opacity: 0, scale: 0.7 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ type: 'spring', stiffness: 350, damping: 22 }}
                          className={`text-[10px] px-2 py-0.5 rounded-full border whitespace-nowrap ${t.color}`}
                        >
                          {t.display || t.phrase}
                        </motion.span>
                      )) : tagsForGroup.map(t => (
                        <span key={t.phrase} className={`text-[10px] px-2 py-0.5 rounded-full border ${t.color}`}>{t.display || t.phrase}</span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* RIGHT: match results */}
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-text-3 font-semibold mb-4">Matches — ranked</div>
            <div className="space-y-3">
              {matches.map((m, i) => {
                const inMatch = revealStep >= TAG_MAP.length;
                return (
                  <div
                    key={m.n}
                    className="rounded-2xl bg-[#13131A] border border-white/[0.06] p-4 flex items-center gap-4 transition-all duration-700"
                    style={{
                      opacity: inMatch ? 1 : 0,
                      transform: inMatch ? 'translateY(0)' : 'translateY(20px)',
                      transitionDelay: `${i * 130}ms`,
                    }}
                  >
                    <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${m.col} flex items-center justify-center text-white font-display font-bold text-[14px] border-2 border-white/10`}>{m.init}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[14px] font-semibold text-white">{m.n}</span>
                        <span className="text-[9px] bg-[#4ECDC4]/15 text-[#4ECDC4] w-4 h-4 rounded-full flex items-center justify-center">✓</span>
                      </div>
                      <div className="text-[11px] text-text-3 mt-0.5">{m.loc}</div>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {m.tags.map(t => <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.06] text-text-2">{t}</span>)}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-display font-extrabold text-[28px] leading-none bg-gradient-to-br from-[#A78BFA] to-[#7B6FFF] bg-clip-text text-transparent">{m.pct}%</div>
                      <div className="text-[9px] text-text-3 uppercase tracking-[0.18em] mt-1">match</div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 text-[12px] text-text-3 leading-relaxed">
              Match · ranked by overlap across <span className="text-white">skills, knowledges, interests, preparations & goals</span> — not by who posted last.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

Object.assign(window, { BotMarquee, AIMatchingDemo });
