// regions.jsx — real-geometry choropleth map of Uzbekistan
// Region paths come from window.UZ_REGIONS (ported from GeoJSON in uz-geo-data.js).
const { useState, useMemo } = React;

// Each geo region carries {en, ru, uz, path}. We match it to the live
// /public/regions response by substring fragments on name_en, so client-side
// ordering is never trusted. `capital` flags Tashkent city.
const GEO_MATCH = {
  'Tashkent city':              { match: ['tashkent city', 'toshkent shahri', 'toshkent city'], capital: true },
  'Tashkent region':            { match: ['tashkent region', 'toshkent region', 'toshkent vil'] },
  'Namangan region':            { match: ['namangan'] },
  'Fergana region':             { match: ['fergana', 'farg'] },
  'Andijan region':             { match: ['andij'] },
  'Syrdarya region':            { match: ['sirdar', 'syrdar'] },
  'Jizzakh region':             { match: ['jizz', 'jizak'] },
  'Navoi region':               { match: ['navoi', 'navoiy'] },
  'Samarkand region':           { match: ['samar'] },
  'Kashkadarya province':       { match: ['qashqa', 'kashka'] },
  'Surkhandarya region':        { match: ['surxon', 'surkhan'] },
  'Bukhara region':             { match: ['bukhara', 'buxoro'] },
  'Khorezm region':             { match: ['khorezm', 'xorazm'] },
  'Republic of Karakalpakstan': { match: ['karakalpak', 'qoraqalpog'] },
};

// Rough interior point = mean of all coordinate pairs in the path string.
// Good enough for pin + tooltip placement on these blobby region shapes.
function pathCentroid(path) {
  const nums = path.match(/-?\d+\.?\d*/g) || [];
  let sx = 0, sy = 0, n = 0;
  for (let i = 0; i + 1 < nums.length; i += 2) {
    sx += parseFloat(nums[i]); sy += parseFloat(nums[i + 1]); n++;
  }
  return n ? [sx / n, sy / n] : [400, 265];
}

function buildRegions(live) {
  const list = Array.isArray(live) ? live : [];
  const geo = window.UZ_REGIONS || [];
  return geo.map(g => {
    const cfg = GEO_MATCH[g.en] || { match: [] };
    let hit = null;
    for (const fragment of cfg.match) {
      hit = list.find(r => (r.name_en || '').toLowerCase().includes(fragment));
      if (hit) break;
    }
    const [cx, cy] = pathCentroid(g.path);
    return {
      id: g.en,
      name: { uz: g.uz, ru: g.ru, en: g.en },
      path: g.path,
      cx, cy,
      capital: !!cfg.capital,
      members:  hit ? (hit.member_count  || 0) : 0,
      projects: hit ? (hit.project_count || 0) : 0,
      regionId: hit ? hit.id : null,
    };
  });
}

function RegionTooltip({ r, maxMembers }) {
  if (!r) return null;
  const pct = maxMembers > 0 ? Math.min(100, Math.round((r.members / maxMembers) * 100)) : 0;
  // Clamp tooltip inside the 800x531 viewBox.
  const x = Math.max(8, Math.min(r.cx - 100, 800 - 208));
  const y = Math.max(8, r.cy - 92);
  return (
    <foreignObject x={x} y={y} width="200" height="84" style={{ pointerEvents: 'none', overflow: 'visible' }}>
      <div className="rounded-xl bg-[#13131A]/95 border border-[#7B6FFF]/40 px-3 py-2 backdrop-blur-md shadow-[0_18px_50px_rgba(0,0,0,0.5)]">
        <div className="text-[12.5px] font-display font-bold text-white tracking-[-0.01em] leading-tight">{r.name.uz}</div>
        <div className="text-[9.5px] text-text-3 leading-tight">{r.name.ru} · {r.name.en}</div>
        <div className="mt-1.5 flex items-center justify-between text-[10px]">
          <span className="text-[#A78BFA]">{r.members} {BFU_T('regions.members')}</span>
          <span className="text-text-3">{r.capital ? BFU_T('regions.capital') : BFU_T('regions.region')}</span>
        </div>
        <div className="mt-1 h-[2px] rounded-full bg-white/[0.07] overflow-hidden">
          <div className="h-full bg-gradient-to-r from-[#7B6FFF] to-[#A78BFA]" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </foreignObject>
  );
}

function RegionsMap({ reduced }) {
  useBFULang(); // re-render labels on language change
  const [hovered, setHovered] = useState(null);
  const live = (window.useBFURegions && window.useBFURegions()) || null;
  const regions = useMemo(() => buildRegions(live), [live]);
  const maxMembers = useMemo(() => regions.reduce((m, r) => Math.max(m, r.members), 0), [regions]);
  const hRegion = regions.find(r => r.id === hovered);
  const viewBox = window.UZ_VIEWBOX || '0 0 800 531';

  // Choropleth fill: faint when empty, brighter with more members.
  const fillFor = (r) => {
    const t = maxMembers > 0 ? r.members / maxMembers : 0;
    const a = 0.10 + t * 0.55;
    return `rgba(123,111,255,${a.toFixed(3)})`;
  };

  return (
    <section id="regions" className="relative py-28 lg:py-36 overflow-hidden">
      <div className="max-w-[1240px] mx-auto px-5 lg:px-8">
        <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-10 items-end">
          <div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-[#4ECDC4] font-semibold mb-4">{BFU_T('regions.kicker')}</div>
            <h2 className="font-display font-bold text-[36px] sm:text-[46px] lg:text-[58px] leading-[1.04] tracking-[-0.025em]">
              {BFU_T('regions.h2')}
            </h2>
          </div>
          <p className="text-[16px] text-text-2 max-w-[440px] lg:pb-2">
            {BFU_T('regions.p')}
          </p>
        </div>

        <div className="mt-12 relative rounded-3xl border border-white/[0.06] bg-gradient-to-br from-[#13131A] to-[#0c0c14] overflow-hidden">
          <div className="relative">
            <div className="absolute inset-0 dot-grid opacity-[0.18] pointer-events-none" />
            <svg viewBox={viewBox} className="w-full h-[360px] sm:h-[460px] lg:h-[540px]" preserveAspectRatio="xMidYMid meet">
              <defs>
                <radialGradient id="pinGlow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%"   stopColor="#A78BFA" stopOpacity="0.6" />
                  <stop offset="100%" stopColor="#A78BFA" stopOpacity="0" />
                </radialGradient>
                <radialGradient id="pinFill" cx="30%" cy="30%" r="70%">
                  <stop offset="0%"   stopColor="#D6CCFF" />
                  <stop offset="60%"  stopColor="#7B6FFF" />
                  <stop offset="100%" stopColor="#3a2f88" />
                </radialGradient>
              </defs>

              {/* region polygons (real geometry) */}
              {regions.map(r => {
                const active = hovered === r.id;
                return (
                  <path
                    key={r.id}
                    d={r.path}
                    fill={active ? 'rgba(167,139,250,0.85)' : fillFor(r)}
                    stroke={active ? '#D6CCFF' : 'rgba(167,139,250,0.30)'}
                    strokeWidth={active ? 1.4 : 0.7}
                    style={{ cursor: 'pointer', transition: 'fill 0.2s, stroke 0.2s' }}
                    onMouseEnter={() => setHovered(r.id)}
                    onMouseLeave={() => setHovered(null)}
                  />
                );
              })}

              {/* capital + active pins */}
              {regions.map(r => {
                if (!r.capital && hovered !== r.id) return null;
                const active = hovered === r.id;
                const rad = r.capital ? 4.5 : 3.5;
                return (
                  <g key={`pin-${r.id}`} transform={`translate(${r.cx},${r.cy})`} style={{ pointerEvents: 'none' }}>
                    <circle r={r.capital ? 11 : 9} fill="url(#pinGlow)" opacity={active ? 0.95 : 0.6} />
                    <circle r={rad} fill="url(#pinFill)" stroke="#fff" strokeOpacity="0.9" strokeWidth="0.6" />
                  </g>
                );
              })}

              {/* tooltip */}
              {hRegion && <RegionTooltip r={hRegion} maxMembers={maxMembers} />}
            </svg>

            <div className="absolute left-5 top-5 flex items-center gap-2 text-[10px] text-text-3 bg-black/30 backdrop-blur-sm px-2.5 py-1.5 rounded-full border border-white/[0.06]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#A78BFA] soft-pulse" />
              {live ? BFU_T('regions.liveTag') : BFU_T('regions.loading')}
            </div>
          </div>
        </div>

        {/* Region strip */}
        <div className="mt-8 -mx-5 lg:-mx-8 px-5 lg:px-8">
          <div className="flex gap-3 overflow-x-auto pb-3" style={{ scrollbarWidth: 'thin' }}>
            {regions.map(r => (
              <a
                key={r.id}
                href={r.regionId ? `/r/${r.regionId}` : '#'}
                onMouseEnter={() => setHovered(r.id)}
                onMouseLeave={() => setHovered(null)}
                className="group shrink-0 w-[210px] rounded-2xl bg-[#13131A] border border-white/[0.06] p-4 hover:border-[#7B6FFF]/40 hover:bg-[#15131e] transition relative overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-[#7B6FFF]/0 via-transparent to-[#A78BFA]/0 group-hover:from-[#7B6FFF]/10 group-hover:to-[#A78BFA]/5 transition" />
                <div className="relative">
                  <div className="text-[13px] font-display font-bold tracking-[-0.01em] text-white truncate">{r.name.uz}</div>
                  <div className="text-[10px] text-text-3 mt-0.5 truncate">{r.name.en} · {r.name.ru}</div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-[11px] text-[#A78BFA] font-semibold">
                      {r.members} {BFU_T('regions.members')}
                      {r.projects > 0 && <span className="text-text-3"> · {r.projects} {BFU_T('regions.projects')}</span>}
                    </span>
                    <span className="text-[11px] text-text-3 group-hover:text-[#A78BFA] transition">→ {BFU_T('regions.explore')}</span>
                  </div>
                </div>
              </a>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

Object.assign(window, { RegionsMap });
