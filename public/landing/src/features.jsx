// features-regions.jsx — pillars + 14 regions interactive map
const { useState, useEffect, useRef } = React;

// --- Animated SVG icons with pathLength draw-on ---
function DrawIcon({ children, inView, delay = 0 }) {
  const { motion } = window.FramerMotion || {};
  if (!motion) return <svg width="36" height="36" viewBox="0 0 36 36" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round">{children}</svg>;
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
      {React.Children.map(children, (c, i) => React.cloneElement(c, {
        style: { ...(c.props.style || {}) },
        children: undefined,
      },
        <>
          {React.cloneElement(c, { key: i })}
        </>
      ))}
    </svg>
  );
}

function PathDraw({ d, inView, delay = 0, ...rest }) {
  const { motion } = window.FramerMotion || {};
  if (!motion) return <path d={d} {...rest} />;
  return (
    <motion.path
      d={d}
      initial={{ pathLength: 0, opacity: 0 }}
      animate={inView ? { pathLength: 1, opacity: 1 } : {}}
      transition={{ duration: 1.1, delay, ease: 'easeInOut' }}
      {...rest}
    />
  );
}
function CircleDraw({ inView, delay = 0, ...rest }) {
  const { motion } = window.FramerMotion || {};
  if (!motion) return <circle {...rest} />;
  return (
    <motion.circle
      initial={{ pathLength: 0, opacity: 0 }}
      animate={inView ? { pathLength: 1, opacity: 1 } : {}}
      transition={{ duration: 1.1, delay, ease: 'easeInOut' }}
      {...rest}
    />
  );
}

function FeatureCard({ idx, title, body, inView, IconSVG }) {
  const [hover, setHover] = useState(false);
  const active = inView || hover;
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="border-glow group relative rounded-2xl bg-[#13131A] border border-white/[0.06] p-7 lg:p-8 overflow-hidden"
    >
      <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-[#7B6FFF]/10 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      <div className="text-[10px] uppercase tracking-[0.22em] text-text-3 mb-5">0{idx}</div>
      <div className="w-12 h-12 rounded-xl bg-[#7B6FFF]/12 border border-[#7B6FFF]/25 flex items-center justify-center text-[#A78BFA] mb-6">
        <IconSVG inView={active} />
      </div>
      <h3 className="font-display font-bold text-[22px] lg:text-[26px] tracking-[-0.02em] text-text-1">{title}</h3>
      <p className="mt-3 text-[14px] leading-[1.55] text-text-2">{body}</p>
    </div>
  );
}

function FeatureGrid() {
  const [ref, inView] = useInView({ threshold: 0.25 });

  const cards = [
    {
      title: 'Discover people who match.',
      body: '"For You" feed, verified ✓ badges, multi-sort search by skill, region, or readiness.',
      IconSVG: ({ inView }) => (
        <svg width="22" height="22" viewBox="0 0 22 22" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <CircleDraw cx="10" cy="9" r="5" inView={inView} />
          <PathDraw d="M14 13l5 5" inView={inView} delay={0.4} />
        </svg>
      ),
    },
    {
      title: 'Build or join a project.',
      body: 'Startups & volunteering. Apply with one tap. Drafts, founder dashboards, co-applied insights.',
      IconSVG: ({ inView }) => (
        <svg width="22" height="22" viewBox="0 0 22 22" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <PathDraw d="M3 17V8l8-5 8 5v9" inView={inView} />
          <PathDraw d="M3 17h16" inView={inView} delay={0.3} />
          <PathDraw d="M9 17v-6h4v6" inView={inView} delay={0.5} />
        </svg>
      ),
    },
    {
      title: 'Real opportunities.',
      body: 'Hackathons, grants, scholarships, meetups — admin-curated and sorted by deadline.',
      IconSVG: ({ inView }) => (
        <svg width="22" height="22" viewBox="0 0 22 22" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <PathDraw d="M11 2l2.5 5.5 6 .7-4.4 4.2 1.2 6-5.3-2.9-5.3 2.9 1.2-6L2.5 8.2l6-.7L11 2z" inView={inView} />
        </svg>
      ),
    },
  ];

  return (
    <section id="features" ref={ref} className="relative py-28 lg:py-36">
      <div className="max-w-[1240px] mx-auto px-5 lg:px-8">
        <div className="max-w-[640px]">
          <div className="text-[11px] uppercase tracking-[0.22em] text-[#A78BFA] font-semibold mb-4">What you get</div>
          <h2 className="font-display font-bold text-[36px] sm:text-[46px] lg:text-[58px] leading-[1.04] tracking-[-0.025em]">
            Three things, done well.
          </h2>
          <p className="mt-5 text-[16px] text-text-2 max-w-[520px]">
            BFU is small on purpose. Each surface is sharp, fast, and built to be used inside Telegram every day.
          </p>
        </div>
        <div className="mt-14 grid md:grid-cols-3 gap-5">
          {cards.map((c, i) => <FeatureCard key={c.title} idx={i + 1} inView={inView} {...c} />)}
        </div>
      </div>
    </section>
  );
}

Object.assign(window, { FeatureGrid });
