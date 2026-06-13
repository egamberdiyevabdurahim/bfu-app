// i18n-landing.js — tiny trilingual layer for the BFU marketing landing.
// Plain JS (NOT babel/jsx). MUST load with a normal <script src> BEFORE the
// text/babel scripts so the globals exist when components define themselves.
//
// Exposes on window:
//   BFU_LANG            — { get(), set(code) } backed by localStorage
//   BFU_T(key)          — translated string for the current lang (falls back to en)
//   onBFULangChange(fn) — subscribe; returns an unsubscribe fn
//   setBFULang(code)    — persist + notify listeners
//   useBFULang()        — React hook -> [lang, setLang], re-renders on change
//   __bfuLangListeners  — the underlying Set (pub/sub)
//
// Scope: hero + nav + chips + stat labels only. Other sections stay English.

(function () {
  var STORAGE_KEY = 'bfu_landing_lang';
  var LANGS = ['en', 'uz', 'ru'];

  // ---- translations ------------------------------------------------------
  // Natural, fluent Uzbek (Latin, using o' / g') and Russian — written for an
  // Uzbek youth audience, not machine-literal.
  var DICT = {
    en: {
      'nav.features': 'Features',
      'nav.regions': 'Regions',
      'nav.events': 'Events',
      'nav.partners': 'Partners',

      'hero.kicker': 'Bright Futures Uzbekistan',
      'hero.headline': 'Where young Uzbekistan builds the future.',
      'hero.subhead.a': 'Find your co-founders, your team, your next opportunity —',
      'hero.subhead.b': 'inside Telegram, in your language.',

      'cta.telegram': 'Open in Telegram',
      'cta.inside': "See what's inside",

      'chip.regions': '14 regions',
      'chip.trilingual': 'Trilingual',
      'chip.aiMatched': 'AI-matched',
      'chip.verified': 'Verified members',
      'chip.free': 'Free',

      'stat.members': 'Members',
      'stat.projects': 'Projects',
      'stat.regions': 'Regions',
    },

    uz: {
      'nav.features': 'Imkoniyatlar',
      'nav.regions': 'Hududlar',
      'nav.events': 'Tadbirlar',
      'nav.partners': 'Hamkorlar',

      'hero.kicker': 'Bright Futures Uzbekistan',
      'hero.headline': 'Yosh O‘zbekiston kelajagini shu yerda quradi.',
      'hero.subhead.a': 'Hammuassis, jamoa va yangi imkoniyatingizni toping —',
      'hero.subhead.b': 'Telegram ichida, o‘z tilingizda.',

      'cta.telegram': 'Telegramda ochish',
      'cta.inside': 'Ichida nima borligini ko‘ring',

      'chip.regions': '14 hudud',
      'chip.trilingual': 'Uch tilda',
      'chip.aiMatched': 'AI tanlovi',
      'chip.verified': 'Tasdiqlangan a’zolar',
      'chip.free': 'Bepul',

      'stat.members': 'A’zolar',
      'stat.projects': 'Loyihalar',
      'stat.regions': 'Hududlar',
    },

    ru: {
      'nav.features': 'Возможности',
      'nav.regions': 'Регионы',
      'nav.events': 'События',
      'nav.partners': 'Партнёры',

      'hero.kicker': 'Bright Futures Uzbekistan',
      'hero.headline': 'Здесь молодой Узбекистан строит будущее.',
      'hero.subhead.a': 'Найди сооснователей, команду и новую возможность —',
      'hero.subhead.b': 'прямо в Telegram, на твоём языке.',

      'cta.telegram': 'Открыть в Telegram',
      'cta.inside': 'Посмотреть, что внутри',

      'chip.regions': '14 регионов',
      'chip.trilingual': 'На трёх языках',
      'chip.aiMatched': 'Подбор ИИ',
      'chip.verified': 'Проверенные участники',
      'chip.free': 'Бесплатно',

      'stat.members': 'Участники',
      'stat.projects': 'Проекты',
      'stat.regions': 'Регионы',
    },
  };

  // ---- detection + persistence ------------------------------------------
  function detect() {
    try {
      var nav = (navigator.language || navigator.userLanguage || 'en').toLowerCase();
      if (nav.indexOf('uz') === 0) return 'uz';
      if (nav.indexOf('ru') === 0) return 'ru';
      return 'en';
    } catch (_) {
      return 'en';
    }
  }

  function readStored() {
    try {
      var v = localStorage.getItem(STORAGE_KEY);
      if (v && LANGS.indexOf(v) !== -1) return v;
    } catch (_) {}
    return null;
  }

  var current = readStored() || detect();

  // ---- pub/sub -----------------------------------------------------------
  var listeners = new Set();
  function notify() {
    listeners.forEach(function (fn) {
      try { fn(current); } catch (_) {}
    });
  }

  function setLang(code) {
    if (LANGS.indexOf(code) === -1) return;
    if (code === current) return;
    current = code;
    try { localStorage.setItem(STORAGE_KEY, code); } catch (_) {}
    notify();
  }

  // ---- public API --------------------------------------------------------
  window.__bfuLangListeners = listeners;

  window.BFU_LANG = {
    get: function () { return current; },
    set: function (code) { setLang(code); },
  };

  window.BFU_T = function (key) {
    var table = DICT[current] || DICT.en;
    if (table && table[key] != null) return table[key];
    if (DICT.en[key] != null) return DICT.en[key];
    return key;
  };

  window.setBFULang = setLang;

  window.onBFULangChange = function (fn) {
    listeners.add(fn);
    return function () { listeners.delete(fn); };
  };

  // React hook (React is a global UMD here). Returns [lang, setLang].
  window.useBFULang = function () {
    var React = window.React;
    var ref = React.useState(current);
    var lang = ref[0];
    var setState = ref[1];
    React.useEffect(function () {
      var off = window.onBFULangChange(function (next) { setState(next); });
      // sync in case it changed between render and effect
      setState(window.BFU_LANG.get());
      return off;
    }, []);
    return [lang, window.setBFULang];
  };
})();
