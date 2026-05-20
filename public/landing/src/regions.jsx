// regions.jsx — interactive map of Uzbekistan
const { useState, useEffect, useRef, useMemo } = React;

// Approximate region positions on a stylized SVG (880 x 460 viewBox).
// `match` is an array of lowercase substrings used to find this region in
// the /public/regions response, so we never trust client-side ordering.
const REGION_LAYOUT = [
  { id: 'kar', name: { uz: 'Qoraqalpog‘iston', ru: 'Каракалпакстан', en: 'Karakalpakstan' },         x: 165, y: 165, match: ['karakalpak'] },
  { id: 'xor', name: { uz: 'Xorazm',           ru: 'Хорезм',           en: 'Khorezm' },              x: 235, y: 215, match: ['khorezm', 'xorazm'] },
  { id: 'nav', name: { uz: 'Navoiy',           ru: 'Навои',            en: 'Navoiy' },               x: 360, y: 240, match: ['navoiy', 'navoi'] },
  { id: 'buk', name: { uz: 'Buxoro',           ru: 'Бухара',           en: 'Bukhara' },              x: 380, y: 290, match: ['bukhara', 'buxoro'] },
  { id: 'qas', name: { uz: 'Qashqadaryo',      ru: 'Кашкадарья',       en: 'Qashqadaryo' },          x: 470, y: 320, match: ['qashqa', 'kashka'] },
  { id: 'sur', name: { uz: 'Surxondaryo',      ru: 'Сурхандарья',      en: 'Surxondaryo' },          x: 530, y: 360, match: ['surxon', 'surkhan'] },
  { id: 'sam', name: { uz: 'Samarqand',        ru: 'Самарканд',        en: 'Samarqand' },            x: 510, y: 270, match: ['samar'] },
  { id: 'jiz', name: { uz: 'Jizzax',           ru: 'Джизак',           en: 'Jizzax' },               x: 565, y: 240, match: ['jizz', 'jizak'] },
  { id: 'sir', name: { uz: 'Sirdaryo',         ru: 'Сырдарья',         en: 'Sirdaryo' },             x: 605, y: 235, match: ['sirdar', 'syrdar'] },
  { id: 'tos', name: { uz: 'Toshkent (vil.)',  ru: 'Ташкентская обл.', en: 'Tashkent region' },      x: 660, y: 215, match: ['tashkent region', 'toshkent region'] },
  { id: 'tsh', name: { uz: 'Toshkent shahri',  ru: 'Ташкент город',    en: 'Tashkent city' },        x: 690, y: 200, match: ['tashkent city', 'toshkent city', 'toshkent shahri'], capital: true },
  { id: 'nam', name: { uz: 'Namangan',         ru: 'Наманган',         en: 'Namangan' },             x: 740, y: 215, match: ['namangan'] },
  { id: 'far', name: { uz: 'Farg‘ona',         ru: 'Фергана',          en: 'Fergana' },              x: 770, y: 245, match: ['fergana', 'farg'] },
  { id: 'and', name: { uz: 'Andijon',          ru: 'Андижан',          en: 'Andijon' },              x: 805, y: 230, match: ['andijon', 'andijan'] },
];

function buildRegions(live) {
  const list = Array.isArray(live) ? live : [];
  return REGION_LAYOUT.map(layout => {
    let hit = null;
    for (const fragment of layout.match) {
      hit = list.find(r => (r.name_en || '').toLowerCase().includes(fragment));
      if (hit) break;
    }
    return {
      ...layout,
      members:  hit ? (hit.member_count  || 0) : 0,
      projects: hit ? (hit.project_count || 0) : 0,
      regionId: hit ? hit.id : null,
    };
  });
}

// Stylized country silhouette — single path approximation of Uzbekistan
const UZ_PATH = `
M 95 155
C 130 110, 200 95, 260 130
C 310 155, 360 145, 410 170
C 460 195, 510 175, 570 195
C 620 210, 660 195, 690 180
C 715 167, 740 175, 780 195
C 815 215, 840 235, 825 265
C 815 285, 790 290, 760 280
C 730 270, 705 285, 685 270
C 660 250, 625 255, 590 245
C 555 235, 520 280, 490 305
C 460 330, 425 340, 405 320
C 385 300, 365 305, 350 295
C 330 280, 300 285, 275 270
C 250 255, 215 265, 190 250
C 160 235, 135 230, 115 215
C 95 200, 85 180, 95 155 Z
`;

function MapPin({ r, onHover, hovered, reduced }) {
  const isActive = hovered === r.id;
  const isCap = r.capital;
  return (
    <g
      transform={`translate(${r.x},${r.y})`}
      onMouseEnter={() => onHover(r.id)}
      onMouseLeave={() => onHover(null)}
      style={{ cursor: 'pointer' }}
    >
      {/* glow */}
      <circle r={isCap ? 18 : 13} fill="url(#pinGlow)" opacity={isActive ? 0.9 : 0.45} />
      {!reduced && (
        <circle r={isCap ? 9 : 6} fill="none" stroke="#A78BFA" strokeWidth="1.2" opacity={isActive ? 0.7 : 0.4}>
          <animate attributeName="r" values={`${isCap?9:6};${isCap?16:11};${isCap?9:6}`} dur="2.4s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.7;0;0.7" dur="2.4s" repeatCount="indefinite" />
        </circle>
      )}
      <circle r={isCap ? 6 : 4} fill="url(#pinFill)" stroke="#fff" strokeOpacity={0.85} strokeWidth="0.8" style={{ transition: 'transform 0.2s', transform: isActive ? 'scale(1.5)' : 'scale(1)' }} />
    </g>
  );
}

function MapTooltip({ r, maxMembers }) {
  if (!r) return null;
  const pct = maxMembers > 0
    ? Math.min(100, Math.round((r.members / maxMembers) * 100))
    : 0;
  return (
    <foreignObject x={r.x - 100} y={r.y - 96} width="200" height="80" style={{ pointerEvents: 'none' }}>
      <div className="rounded-xl bg-[#13131A]/95 border border-[#7B6FFF]/30 px-3 py-2 backdrop-blur-md shadow-[0_18px_50px_rgba(0,0,0,0.45)]">
        <div className="text-[12.5px] font-display font-bold text-white tracking-[-0.01em] leading-tight">{r.name.uz}</div>
        <div className="text-[9.5px] text-text-3 leading-tight">{r.name.ru} · {r.name.en}</div>
        <div className="mt-1.5 flex items-center justify-between text-[10px]">
          <span className="text-[#A78BFA]">{r.members} members</span>
          <span className="text-text-3">{r.capital ? 'Capital' : 'Region'}</span>
        </div>
        <div className="mt-1 h-[2px] rounded-full bg-white/[0.07] overflow-hidden">
          <div className="h-full bg-gradient-to-r from-[#7B6FFF] to-[#A78BFA]" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </foreignObject>
  );
}

function RegionsMap({ reduced }) {
  const [hovered, setHovered] = useState(null);
  const live = (window.useBFURegions && window.useBFURegions()) || null;
  const regions = useMemo(() => buildRegions(live), [live]);
  const maxMembers = useMemo(
    () => regions.reduce((m, r) => Math.max(m, r.members), 0),
    [regions]
  );
  const hRegion = regions.find(r => r.id === hovered);
  const useSpline = typeof window.SPLINE_MAP_URL === 'string' && window.SPLINE_MAP_URL.startsWith('http');

  return (
    <section id="regions" className="relative py-28 lg:py-36 overflow-hidden">
      <div className="max-w-[1240px] mx-auto px-5 lg:px-8">
        <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-10 items-end">
          <div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-[#4ECDC4] font-semibold mb-4">14 regions</div>
            <h2 className="font-display font-bold text-[36px] sm:text-[46px] lg:text-[58px] leading-[1.04] tracking-[-0.025em]">
              From Tashkent to Nukus.
            </h2>
          </div>
          <p className="text-[16px] text-text-2 max-w-[440px] lg:pb-2">
            Every region of Uzbekistan, one tap away. Hover a pin to see active members in three scripts.
          </p>
        </div>

        <div className="mt-12 relative rounded-3xl border border-white/[0.06] bg-gradient-to-br from-[#13131A] to-[#0c0c14] overflow-hidden">
          {useSpline ? (
            <div className="h-[520px]">
              <spline-viewer url={window.SPLINE_MAP_URL} events-target="global" />
            </div>
          ) : (
            <div className="relative">
              <div className="absolute inset-0 dot-grid opacity-[0.18] pointer-events-none" />
              <svg viewBox="0 0 880 460" className="w-full h-[420px] sm:h-[480px] lg:h-[520px]" preserveAspectRatio="xMidYMid meet">
                <defs>
                  <linearGradient id="countryFill" x1="0" x2="1" y1="0" y2="1">
                    <stop offset="0%"   stopColor="#1C1C28" />
                    <stop offset="100%" stopColor="#13131A" />
                  </linearGradient>
                  <linearGradient id="countryStroke" x1="0" x2="1" y1="0" y2="1">
                    <stop offset="0%"   stopColor="#7B6FFF" stopOpacity="0.5" />
                    <stop offset="100%" stopColor="#4ECDC4" stopOpacity="0.4" />
                  </linearGradient>
                  <radialGradient id="pinGlow" cx="50%" cy="50%" r="50%">
                    <stop offset="0%"   stopColor="#A78BFA" stopOpacity="0.55" />
                    <stop offset="100%" stopColor="#A78BFA" stopOpacity="0" />
                  </radialGradient>
                  <radialGradient id="pinFill" cx="30%" cy="30%" r="70%">
                    <stop offset="0%"   stopColor="#D6CCFF" />
                    <stop offset="60%"  stopColor="#7B6FFF" />
                    <stop offset="100%" stopColor="#3a2f88" />
                  </radialGradient>
                </defs>

                {/* country shape */}
                <path d={UZ_PATH} fill="url(#countryFill)" stroke="url(#countryStroke)" strokeWidth="1.2" />
                <path d={UZ_PATH} fill="none" stroke="#A78BFA" strokeOpacity="0.15" strokeWidth="6" filter="blur(8px)" />

                {/* subtle latitude lines */}
                {[200, 280, 360].map(y => (
                  <line key={y} x1="80" x2="830" y1={y} y2={y} stroke="rgba(255,255,255,0.04)" strokeDasharray="2 6" />
                ))}

                {/* pins */}
                {regions.map(r => (
                  <MapPin key={r.id} r={r} onHover={setHovered} hovered={hovered} reduced={reduced} />
                ))}
                {/* tooltip */}
                {hRegion && <MapTooltip r={hRegion} maxMembers={maxMembers} />}
              </svg>

              <div className="absolute left-5 top-5 flex items-center gap-2 text-[10px] text-text-3 bg-black/30 backdrop-blur-sm px-2.5 py-1.5 rounded-full border border-white/[0.06]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#A78BFA] soft-pulse" />
                {live ? 'live members · stylized geography' : 'loading live members…'}
              </div>
            </div>
          )}
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
                      {r.members} member{r.members === 1 ? '' : 's'}
                      {r.projects > 0 && <span className="text-text-3"> · {r.projects} project{r.projects === 1 ? '' : 's'}</span>}
                    </span>
                    <span className="text-[11px] text-text-3 group-hover:text-[#A78BFA] transition">→ Explore</span>
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
