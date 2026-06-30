// leaderboard-trust.jsx — Invites & leaderboard, Trust & safety, Partners
const { useState, useEffect, useRef } = React;

// Palette cycled through real leaderboard rows so each card stays colorful
// even though the backend only returns name + initials + region + invites.
const LEADER_COLORS = [
  'from-[#7B6FFF] to-[#A78BFA]',
  'from-[#FF6B6B] to-[#FFB347]',
  'from-[#4ECDC4] to-[#7B6FFF]',
  'from-[#A78BFA] to-[#7B6FFF]',
  'from-[#FFB347] to-[#FF6B6B]',
];

function ConfettiBurst({ trigger }) {
  const { motion } = window.FramerMotion || {};
  if (!motion) return null;
  if (!trigger) return null;
  return (
    <>
      {[...Array(6)].map((_, i) => {
        const angle = (i * (360 / 6)) - 90;
        const r = 38 + (i % 2) * 6;
        const x = Math.cos(angle * Math.PI / 180) * r;
        const y = Math.sin(angle * Math.PI / 180) * r;
        const col = ['#A78BFA', '#7B6FFF', '#4ECDC4', '#FFB347', '#FF6B6B', '#A78BFA'][i];
        return (
          <motion.span
            key={i}
            initial={{ x: 0, y: 0, opacity: 1, scale: 0.6 }}
            animate={{ x, y, opacity: 0, scale: 1 }}
            transition={{ duration: 1.1, delay: 0.3, ease: 'easeOut' }}
            className="absolute left-1/2 top-1/2 w-1.5 h-1.5 rounded-full"
            style={{ background: col, boxShadow: `0 0 8px ${col}` }}
          />
        );
      })}
    </>
  );
}

function LeaderboardSection({ reduced }) {
  useBFULang(); // re-render on language change
  const [ref, inView] = useInView({ threshold: 0.3 });
  const [tab, setTab] = useState('weekly');
  const { motion } = window.FramerMotion || {};
  const tabLabel = { 'weekly': BFU_T('lead.tab.weekly'), 'monthly': BFU_T('lead.tab.monthly'), 'all-time': BFU_T('lead.tab.allTime') };

  // tab → API period
  const period = tab === 'weekly' ? 'week' : tab === 'monthly' ? 'month' : 'all';
  const liveRows = window.useBFULeaderboard ? window.useBFULeaderboard(period) : null;
  const loaded = liveRows !== null && liveRows !== undefined;
  const leaders = (liveRows || []).map((row, i) => ({
    rank: row.rank,
    name: row.name,
    region: row.region || '—',
    invites: row.invites,
    init: row.initials || (row.name || '?').slice(0, 2).toUpperCase(),
    col: LEADER_COLORS[i % LEADER_COLORS.length],
  }));

  return (
    <section ref={ref} className="relative py-28 lg:py-36">
      <div className="max-w-[1240px] mx-auto px-5 lg:px-8">
        <div className="grid lg:grid-cols-[1fr_1.05fr] gap-12 lg:gap-16 items-center">
          <div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-[#A78BFA] font-semibold mb-4">{BFU_T('lead.kicker')}</div>
            <h2 className="font-display font-bold text-[36px] sm:text-[46px] lg:text-[58px] leading-[1.04] tracking-[-0.025em]">
              {BFU_T('lead.h2a')}<span className="bg-gradient-to-br from-[#A78BFA] to-[#7B6FFF] bg-clip-text text-transparent">{BFU_T('lead.h2hl')}</span>{BFU_T('lead.h2b')}
            </h2>
            <p className="mt-6 text-[16px] text-text-2 max-w-[500px] leading-[1.55]">
              {BFU_T('lead.p')}
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-2.5">
              <div className="rounded-xl bg-[#13131A] border border-white/[0.06] px-3.5 py-2.5 font-mono text-[12px] text-white/85 flex items-center gap-2">
                <span className="text-text-3">t.me/BrightFuturesUzbekistan_bot?startapp=</span>
                <span className="text-[#A78BFA]">ref_…</span>
              </div>
              <a
                href="https://t.me/BrightFuturesUzbekistan_bot"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[12px] font-semibold px-3.5 py-2.5 rounded-xl bg-white/[0.05] border border-white/[0.08] hover:bg-white/[0.08] text-white no-underline"
              >{BFU_T('lead.getYours')}</a>
            </div>
          </div>

          <div className="rounded-3xl bg-[#13131A] border border-white/[0.06] p-5 lg:p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="text-[13px] font-semibold text-white">{BFU_T('lead.topInviters')}</div>
              <div className="flex items-center gap-0.5 rounded-full bg-white/[0.04] border border-white/[0.07] p-0.5">
                {['weekly', 'monthly', 'all-time'].map(t => (
                  <button key={t} onClick={() => setTab(t)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition ${tab === t ? 'bg-white/10 text-white' : 'text-text-3 hover:text-text-2'}`}
                  >{tabLabel[t]}</button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              {loaded && leaders.length === 0 && (
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-8 text-center">
                  <div className="text-[13px] text-white font-semibold mb-1">{BFU_T('lead.noInvites')}</div>
                  <div className="text-[11px] text-text-3">{BFU_T('lead.beFirst')}</div>
                </div>
              )}
              {!loaded && (
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-8 text-center">
                  <div className="text-[12px] text-text-3">{BFU_T('lead.loading')}</div>
                </div>
              )}
              {leaders.map((l, i) => (
                <div
                  key={l.rank}
                  className={`relative flex items-center gap-3.5 rounded-xl border p-3 ${l.rank === 1 ? 'bg-gradient-to-br from-[#7B6FFF]/12 via-transparent to-transparent border-[#7B6FFF]/30' : 'bg-white/[0.025] border-white/[0.06]'}`}
                  style={{
                    opacity: inView ? 1 : 0,
                    transform: inView ? 'translateY(0)' : 'translateY(12px)',
                    transition: `all 600ms ease ${i * 100}ms`,
                  }}
                >
                  <div className="relative w-10 h-10 shrink-0">
                    {motion && l.rank === 1 ? (
                      <motion.div
                        initial={{ rotate: 0, scale: 0.6, opacity: 0 }}
                        animate={inView ? { rotate: 360, scale: 1, opacity: 1 } : {}}
                        transition={{ duration: 1.3, ease: 'easeOut', delay: 0.5 }}
                        className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#7B6FFF] to-[#A78BFA] flex items-center justify-center text-white font-display font-bold text-[15px] shadow-[0_8px_24px_rgba(123,111,255,0.5)]"
                      >1</motion.div>
                    ) : (
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-display font-bold text-[14px] ${l.rank === 1 ? 'bg-gradient-to-br from-[#7B6FFF] to-[#A78BFA] text-white' : 'bg-white/[0.05] text-text-2 border border-white/[0.06]'}`}>
                        {l.rank}
                      </div>
                    )}
                    {l.rank === 1 && <ConfettiBurst trigger={inView} />}
                  </div>
                  <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${l.col} flex items-center justify-center text-white font-display font-bold text-[12px] shrink-0`}>{l.init}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13.5px] font-semibold text-white truncate">{l.name}</div>
                    <div className="text-[11px] text-text-3 truncate">{l.region}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-display font-bold text-[18px] tracking-[-0.02em] text-white">{l.invites}</div>
                    <div className="text-[9px] text-text-3 uppercase tracking-[0.18em]">{BFU_T('lead.invites')}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 flex items-center gap-3 text-[11px] text-text-3">
              <span className="w-1.5 h-1.5 rounded-full bg-[#4ECDC4] soft-pulse" />
              {BFU_T('lead.liveNote')}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---- Trust & safety ----
function TrustSafety() {
  useBFULang(); // re-render on language change
  const icons = [
    (
      <svg width="22" height="22" viewBox="0 0 22 22" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 2 L18 5 V11 C18 16 14.5 19 11 20 C7.5 19 4 16 4 11 V5 Z" />
        <path d="M8 11.5 L10.5 14 L14.5 9.5" />
      </svg>
    ),
    (
      <svg width="22" height="22" viewBox="0 0 22 22" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="9" width="14" height="10" rx="2" />
        <path d="M7 9V6.5 a4 4 0 0 1 8 0 V9" />
        <circle cx="11" cy="14" r="1.2" fill="currentColor" />
      </svg>
    ),
    (
      <svg width="22" height="22" viewBox="0 0 22 22" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 4h6l1.5 2H19v11H3z" />
        <path d="M11 10v3M11 15.5v0.5" />
      </svg>
    ),
  ];
  const items = BFU_T('trust.items');
  return (
    <section className="relative py-24">
      <div className="max-w-[1240px] mx-auto px-5 lg:px-8">
        <div className="text-[11px] uppercase tracking-[0.22em] text-text-3 font-semibold mb-8 text-center">{BFU_T('trust.kicker')}</div>
        <div className="grid md:grid-cols-3 gap-5 lg:gap-8">
          {items.map((it, i) => (
            <div key={i} className="rounded-2xl bg-white/[0.02] border border-white/[0.05] p-6 flex flex-col items-start">
              <div className="w-11 h-11 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-[#A78BFA] mb-4">
                {icons[i]}
              </div>
              <h4 className="font-display font-bold text-[18px] text-white tracking-[-0.01em]">{it.title}</h4>
              <p className="mt-2 text-[13.5px] text-text-2 leading-[1.55]">{it.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---- Partners ----
function Partners() {
  return (
    <section id="partners" className="relative py-24 lg:py-32">
      <div className="max-w-[1100px] mx-auto px-5 lg:px-8">
        <div className="rounded-3xl bg-gradient-to-br from-[#13131A] to-[#0c0c14] border border-white/[0.06] p-8 lg:p-12 relative overflow-hidden">
          <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-[#7B6FFF]/15 blur-3xl" />
          <div className="relative grid lg:grid-cols-[1fr_1fr] gap-10 items-center">
            <div>
              <div className="text-[11px] uppercase tracking-[0.22em] text-[#4ECDC4] font-semibold mb-4">For partners</div>
              <h2 className="font-display font-bold text-[32px] sm:text-[42px] leading-[1.04] tracking-[-0.025em]">
                For universities, learning centers, employers, and NGOs.
              </h2>
              <p className="mt-5 text-[15px] text-text-2 max-w-[460px] leading-[1.55]">
                If you train, hire, fund or mentor young Uzbeks — BFU is the layer that gets you in front of them, verified and at scale.
              </p>
            </div>
            <div>
              <ul className="space-y-3">
                {[
                  ['Reach', 'Members in all 14 regions, in three languages.'],
                  ['Targeting', 'Post grants, scholarships, internships filtered by skill, region and readiness.'],
                  ['Verification', 'Verified-only campaigns. Every applicant is a real, reviewed member.'],
                ].map(([k, v]) => (
                  <li key={k} className="flex gap-3">
                    <span className="shrink-0 mt-1 w-5 h-5 rounded-md bg-[#7B6FFF]/15 border border-[#7B6FFF]/30 text-[#A78BFA] flex items-center justify-center text-[11px]">→</span>
                    <div>
                      <div className="text-[14px] font-semibold text-white">{k}</div>
                      <div className="text-[13px] text-text-2">{v}</div>
                    </div>
                  </li>
                ))}
              </ul>
              <a
                href="mailto:partners@brightfuturesuzbekistan.uz"
                className="mt-6 inline-flex items-center gap-2 text-[14px] font-semibold rounded-full px-5 py-3 bg-white/[0.05] border border-white/[0.08] hover:bg-white/[0.1] text-white transition"
              >
                <span>✉</span> partners@brightfuturesuzbekistan.uz
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

Object.assign(window, { LeaderboardSection, TrustSafety, Partners });
