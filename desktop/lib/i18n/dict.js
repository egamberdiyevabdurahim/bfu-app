// Central translation catalog. Flat dotted keys, one table per language.
//
// Authoring rules:
//  • `en` is the source of truth — every key MUST exist here. uz/ru may omit a
//    key and it falls back to English (see translate.js), so a gap degrades
//    gracefully instead of showing a raw key.
//  • Keys are namespaced by surface: `nav.*`, `common.*`, `home.*`, …
//  • {name}-style placeholders are interpolated at call sites via t(key, vars).
//  • "Bright Futures" and "Marstiff" are proper nouns — kept identical in all
//    three languages.
//
// This file merges CORE (shell/nav/home, authored inline below) with per-surface
// namespace modules under ./dicts/*. Each namespace module exports
// `{ en:{...}, uz:{...}, ru:{...} }` of flat dotted keys and is registered in the
// NAMESPACES array. Splitting by surface lets many contributors add translations
// in separate files without colliding on this one.

import { home } from "./dicts/home";
import { profile } from "./dicts/profile";
import { people } from "./dicts/people";
import { projects } from "./dicts/projects";
import { projmanage } from "./dicts/projmanage";
import { city } from "./dicts/city";
import { community } from "./dicts/community";
import { messages } from "./dicts/messages";
import { settings } from "./dicts/settings";
import { inbox } from "./dicts/inbox";
import { login } from "./dicts/login";
import { onboarding } from "./dicts/onboarding";
import { register } from "./dicts/register";
import { misc } from "./dicts/misc";
import { dashboard } from "./dicts/dashboard";

// Every registered namespace module. Namespaces are disjoint by key prefix, so
// order only matters if two modules define the same key (they shouldn't).
const NAMESPACES = [
  home,
  profile,
  people,
  projects,
  projmanage,
  city,
  community,
  messages,
  settings,
  inbox,
  login,
  onboarding,
  register,
  misc,
  dashboard,
];

const CORE = {
  en: {
    // — Shell / common —
    "common.brand": "Bright Futures",
    "common.start_project": "Start a project",
    "common.powered_by": "Powered by",
    "common.search": "Search",
    "common.search_hint": "Search",
    "common.search_city": "Search the city…",
    "common.online": "Online",
    "common.you": "It's you",
    "common.admin": "Admin",
    "common.builder": "Builder",
    "common.loading": "Loading…",
    "common.collapse": "Collapse",
    "common.expand": "Expand",
    "common.menu": "Menu",
    "common.close": "Close",
    "common.your_account": "Your account",
    "common.view_profile": "View profile",
    "common.view_public_profile": "View public profile",
    "common.edit_profile": "Edit profile",
    "common.log_out": "Log out",

    // — Sidebar nav (group headers + items; item keys match navConfig) —
    "nav.group.explore": "Explore",
    "nav.group.you": "You",
    "nav.group.admin": "Admin",
    "nav.city": "City",
    "nav.projects": "Projects",
    "nav.mentors": "Mentors",
    "nav.events": "Events",
    "nav.partners": "Partners",
    "nav.home": "Home",
    "nav.projects-mine": "Your projects",
    "nav.requests": "Applications",
    "nav.messages": "Messages",
    "nav.favorites": "Saved",
    "nav.connections": "Connections",
    "nav.bookings": "Sessions",
    "nav.notifications": "Notifications",
    "nav.settings": "Settings",
    "nav.dashboard": "Command center",

    // — Home hero (server-rendered) —
    "home.lamps_lit": "The lamps are lit",
    "home.welcome_prefix": "Welcome back,",
    "home.hero_sub": "The bazaar is humming and your workshop is right where you left it.",
    "home.footer_tagline": "The city never really sleeps.",
  },

  uz: {
    "common.brand": "Bright Futures",
    "common.start_project": "Loyiha boshlash",
    "common.powered_by": "Hamkorlikda",
    "common.search": "Qidirish",
    "common.search_hint": "Qidirish",
    "common.search_city": "Shaharni qidiring…",
    "common.online": "Onlayn",
    "common.you": "Bu siz",
    "common.admin": "Admin",
    "common.builder": "Bunyodkor",
    "common.loading": "Yuklanmoqda…",
    "common.collapse": "Yig‘ish",
    "common.expand": "Yoyish",
    "common.menu": "Menyu",
    "common.close": "Yopish",
    "common.your_account": "Hisobingiz",
    "common.view_profile": "Profilni ko‘rish",
    "common.view_public_profile": "Ochiq profilni ko‘rish",
    "common.edit_profile": "Profilni tahrirlash",
    "common.log_out": "Chiqish",

    "nav.group.explore": "Kashf eting",
    "nav.group.you": "Siz",
    "nav.group.admin": "Admin",
    "nav.city": "Shahar",
    "nav.projects": "Loyihalar",
    "nav.mentors": "Mentorlar",
    "nav.events": "Tadbirlar",
    "nav.partners": "Hamkorlar",
    "nav.home": "Bosh sahifa",
    "nav.projects-mine": "Loyihalaringiz",
    "nav.requests": "Arizalar",
    "nav.messages": "Xabarlar",
    "nav.favorites": "Saqlangan",
    "nav.connections": "Aloqalar",
    "nav.bookings": "Uchrashuvlar",
    "nav.notifications": "Bildirishnomalar",
    "nav.settings": "Sozlamalar",
    "nav.dashboard": "Boshqaruv markazi",

    "home.lamps_lit": "Chiroqlar yondi",
    "home.welcome_prefix": "Xush kelibsiz,",
    "home.hero_sub": "Bozor gavjum, ustaxonangiz esa siz qoldirgan joyda turibdi.",
    "home.footer_tagline": "Shahar hech qachon to‘liq uxlamaydi.",
  },

  ru: {
    "common.brand": "Bright Futures",
    "common.start_project": "Создать проект",
    "common.powered_by": "При поддержке",
    "common.search": "Поиск",
    "common.search_hint": "Поиск",
    "common.online": "В сети",
    "common.you": "Это вы",
    "common.admin": "Админ",
    "common.loading": "Загрузка…",
    "common.collapse": "Свернуть",
    "common.expand": "Развернуть",
    "common.menu": "Меню",
    "common.close": "Закрыть",
    "common.view_profile": "Открыть профиль",
    "common.log_out": "Выйти",

    "nav.group.explore": "Обзор",
    "nav.group.you": "Вы",
    "nav.group.admin": "Админ",
    "nav.city": "Город",
    "nav.projects": "Проекты",
    "nav.mentors": "Менторы",
    "nav.events": "События",
    "nav.partners": "Партнёры",
    "nav.home": "Главная",
    "nav.projects-mine": "Ваши проекты",
    "nav.requests": "Заявки",
    "nav.messages": "Сообщения",
    "nav.favorites": "Сохранённое",
    "nav.connections": "Связи",
    "nav.bookings": "Сессии",
    "nav.notifications": "Уведомления",
    "nav.settings": "Настройки",
    "nav.dashboard": "Центр управления",

    "home.lamps_lit": "Огни зажжены",
    "home.welcome_prefix": "С возвращением,",
    "home.hero_sub": "Базар гудит, а ваша мастерская там, где вы её оставили.",
    "home.footer_tagline": "Город никогда не спит по-настоящему.",
  },
};

// Merge CORE with every namespace module, per language. Namespaces are keyed by
// disjoint prefixes, so a plain Object.assign is the correct union.
function mergeLang(lang) {
  return Object.assign(
    {},
    CORE[lang] || {},
    ...NAMESPACES.map((ns) => (ns && ns[lang]) || {})
  );
}

export const DICT = {
  en: mergeLang("en"),
  uz: mergeLang("uz"),
  ru: mergeLang("ru"),
};
