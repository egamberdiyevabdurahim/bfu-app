// hooks.jsx — shared hooks + utilities for BFU landing page
// Exposes: useLibsReady, useCountUp, useInView, useMagnetic, useMouseParallax,
//          useReducedMotionFlag, useCursorBlob, useLenisScroll, smoothScrollTo

const { useState, useEffect, useRef, useCallback, useMemo } = React;

// ----- libs ready (waits for esm.sh modules) -----
function useLibsReady() {
  const [ready, setReady] = useState(!!window.__libsReady);
  useEffect(() => {
    if (window.__libsReady) { setReady(true); return; }
    const h = () => setReady(true);
    window.addEventListener('libs-ready', h);
    return () => window.removeEventListener('libs-ready', h);
  }, []);
  return ready;
}

// ----- reduced motion -----
function useReducedMotionFlag() {
  const [r, setR] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const h = () => setR(mq.matches);
    h(); mq.addEventListener?.('change', h);
    return () => mq.removeEventListener?.('change', h);
  }, []);
  return r;
}

// ----- in view (IntersectionObserver) -----
function useInView(opts = {}) {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          setInView(true);
          if (opts.once !== false) io.disconnect();
        } else if (opts.once === false) {
          setInView(false);
        }
      });
    }, { threshold: opts.threshold ?? 0.2, rootMargin: opts.rootMargin ?? '0px' });
    io.observe(ref.current);
    return () => io.disconnect();
  }, []);
  return [ref, inView];
}

// ----- count up -----
function useCountUp(target, { duration = 1600, start = false } = {}) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!start) return;
    let raf, t0;
    const ease = t => 1 - Math.pow(1 - t, 3);
    const step = (ts) => {
      if (!t0) t0 = ts;
      const p = Math.min(1, (ts - t0) / duration);
      setVal(Math.round(ease(p) * target));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, start]);
  return val;
}

// ----- magnetic button -----
function useMagnetic(strength = 0.35, radius = 80) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(pointer: coarse)').matches) return;
    let raf;
    const onMove = e => {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const dist = Math.hypot(dx, dy);
      if (dist < radius + Math.max(r.width, r.height) / 2) {
        const tx = dx * strength;
        const ty = dy * strength;
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          el.style.transform = `translate3d(${tx}px,${ty}px,0) scale(1.02)`;
        });
      } else {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => { el.style.transform = ''; });
      }
    };
    const onLeave = () => { el.style.transform = ''; };
    window.addEventListener('mousemove', onMove);
    el.addEventListener('mouseleave', onLeave);
    return () => {
      window.removeEventListener('mousemove', onMove);
      el.removeEventListener('mouseleave', onLeave);
      cancelAnimationFrame(raf);
    };
  }, [strength, radius]);
  return ref;
}

// ----- mouse parallax (for phone) -----
function useMouseParallax(maxDeg = 4) {
  const ref = useRef(null);
  const [rot, setRot] = useState({ x: -12, y: 4 });
  useEffect(() => {
    if (window.matchMedia('(pointer: coarse)').matches) return;
    const el = ref.current;
    if (!el) return;
    const onMove = e => {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const nx = (e.clientX - cx) / (window.innerWidth / 2);
      const ny = (e.clientY - cy) / (window.innerHeight / 2);
      setRot({
        x: -12 + (-ny * maxDeg),
        y: 4 + (nx * maxDeg),
      });
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, [maxDeg]);
  return [ref, rot];
}

// ----- cursor blob (desktop only) -----
function CursorBlob() {
  useEffect(() => {
    if (window.matchMedia('(pointer: coarse)').matches) return;
    const el = document.createElement('div');
    el.className = 'cursor-blob';
    document.body.appendChild(el);
    let tx = -100, ty = -100, x = -100, y = -100, raf;
    const onMove = e => { tx = e.clientX; ty = e.clientY; };
    const loop = () => {
      x += (tx - x) * 0.18;
      y += (ty - y) * 0.18;
      el.style.transform = `translate3d(${x - 8}px, ${y - 8}px, 0)`;
      raf = requestAnimationFrame(loop);
    };
    window.addEventListener('mousemove', onMove);
    raf = requestAnimationFrame(loop);
    const onDown = () => { el.style.width = '28px'; el.style.height = '28px'; };
    const onUp   = () => { el.style.width = '16px'; el.style.height = '16px'; };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('mouseup', onUp);
      cancelAnimationFrame(raf);
      el.remove();
    };
  }, []);
  return null;
}

// ----- lenis smooth scroll -----
function useLenisScroll(reduced) {
  // Re-run once the esm.sh libs (Lenis/GSAP) have loaded. The precompiled
  // bundle executes before the deferred lib <script type=module> resolves, so
  // on first mount window.Lenis is undefined — without this dep the effect
  // would bail permanently and smooth scroll + ScrollTrigger would never start.
  const ready = useLibsReady();
  useEffect(() => {
    if (reduced) return;
    if (!window.Lenis) return;
    const lenis = new window.Lenis({
      duration: 1.1,
      easing: t => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      smoothTouch: false,
    });
    window.__lenis = lenis;
    let raf;
    const loop = (t) => {
      lenis.raf(t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    // sync ScrollTrigger
    if (window.ScrollTrigger) {
      lenis.on('scroll', window.ScrollTrigger.update);
      window.ScrollTrigger.refresh();
    }
    return () => {
      cancelAnimationFrame(raf);
      lenis.destroy();
      window.__lenis = null;
    };
  }, [reduced, ready]);
}

function smoothScrollTo(target) {
  const el = typeof target === 'string' ? document.querySelector(target) : target;
  if (!el) return;
  if (window.__lenis) {
    window.__lenis.scrollTo(el, { offset: -60 });
  } else {
    const y = el.getBoundingClientRect().top + window.scrollY - 60;
    window.scrollTo({ top: y, behavior: 'smooth' });
  }
}

// ----- scroll progress -----
function useScrollProgress() {
  const [p, setP] = useState(0);
  useEffect(() => {
    const onScroll = () => {
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      setP(max > 0 ? h.scrollTop / max : 0);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return p;
}

// ----- typing effect -----
function useTyping(text, { speed = 30, start = false, startDelay = 0 } = {}) {
  const [out, setOut] = useState('');
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!start) return;
    setOut(''); setDone(false);
    let i = 0, timer;
    const tick = () => {
      i++;
      setOut(text.slice(0, i));
      if (i >= text.length) { setDone(true); return; }
      timer = setTimeout(tick, speed);
    };
    const initial = setTimeout(tick, startDelay);
    return () => { clearTimeout(initial); clearTimeout(timer); };
  }, [text, speed, start, startDelay]);
  return [out, done];
}

Object.assign(window, {
  useLibsReady, useCountUp, useInView, useMagnetic, useMouseParallax,
  useReducedMotionFlag, CursorBlob, useLenisScroll, smoothScrollTo,
  useScrollProgress, useTyping,
});
