// bfu-live.js — fetches real backend data for the landing's "live" stats.
// Exposes: window.BFU_API, useBFUStats, useBFURegions, useBFULeaderboard.
//
// Strategy: fire all three calls on first import, cache the promises, and
// expose React hooks that subscribe to the result. Components keep their
// hardcoded values as the initial render so the page never looks empty,
// then swap in real numbers when the network responds. If the backend is
// unreachable, the page stays on its initial fallback values.

(function () {
  // Production backend on Railway. CORS origins include the custom domain
  // and the vercel.app preview so cross-origin XHR works from either host.
  const API = 'https://bfu-backend-production.up.railway.app';
  window.BFU_API = API;

  const cache = {
    stats: null,
    regions: null,
    leaderboard: { week: null, month: null, all: null },
  };
  const listeners = { stats: new Set(), regions: new Set(), leaderboard: new Set() };

  function notify(key) { listeners[key].forEach(fn => { try { fn(); } catch (_) {} }); }

  async function fetchJSON(path) {
    try {
      const r = await fetch(API + path, { credentials: 'omit' });
      if (!r.ok) throw new Error('http ' + r.status);
      return await r.json();
    } catch (e) {
      console.warn('[bfu-live]', path, e.message);
      return null;
    }
  }

  async function loadStats() {
    const data = await fetchJSON('/public/stats');
    if (data) { cache.stats = data; notify('stats'); }
  }
  async function loadRegions() {
    const data = await fetchJSON('/public/regions');
    if (Array.isArray(data)) { cache.regions = data; notify('regions'); }
  }
  async function loadLeaderboard(period) {
    const data = await fetchJSON('/public/leaderboard?period=' + period);
    if (Array.isArray(data)) {
      cache.leaderboard[period] = data;
      notify('leaderboard');
    }
  }

  // Kick off all fetches immediately at script load.
  loadStats();
  loadRegions();
  loadLeaderboard('week');

  // Tiny hooks that React components can use. Each returns the cached value
  // and re-renders the consumer when a fresh response lands.
  window.useBFUStats = function () {
    const { useState, useEffect } = React;
    const [v, setV] = useState(cache.stats);
    useEffect(() => {
      const f = () => setV(cache.stats);
      listeners.stats.add(f);
      if (cache.stats) f();
      return () => listeners.stats.delete(f);
    }, []);
    return v;
  };

  window.useBFURegions = function () {
    const { useState, useEffect } = React;
    const [v, setV] = useState(cache.regions);
    useEffect(() => {
      const f = () => setV(cache.regions);
      listeners.regions.add(f);
      if (cache.regions) f();
      return () => listeners.regions.delete(f);
    }, []);
    return v;
  };

  window.useBFULeaderboard = function (period) {
    const { useState, useEffect } = React;
    const [v, setV] = useState(cache.leaderboard[period] || null);
    useEffect(() => {
      const f = () => setV(cache.leaderboard[period] || null);
      listeners.leaderboard.add(f);
      if (cache.leaderboard[period]) {
        f();
      } else {
        loadLeaderboard(period);
      }
      return () => listeners.leaderboard.delete(f);
    }, [period]);
    return v;
  };
})();
