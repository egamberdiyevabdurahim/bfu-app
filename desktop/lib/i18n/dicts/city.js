// "city" surface translations.
export const city = {
  en: {
    // — Ambient ticker (page.js buildTickerLines) —
    "city.ticker.online_hl_one": "{n} builder online",
    "city.ticker.online_hl_other": "{n} builders online",
    "city.ticker.online_tail": " right now · someone is always building",
    "city.ticker.cities_hl_one": "{n} city lit",
    "city.ticker.cities_hl_other": "{n} cities lit",
    "city.ticker.cities_tail": " across Uzbekistan tonight",
    "city.ticker.fresh_hl_one": "{n} new builder",
    "city.ticker.fresh_hl_other": "{n} new builders",
    "city.ticker.fresh_tail": " joined the city this week",
    "city.ticker.quiet_lead": "The bazaar is quiet tonight · ",
    "city.ticker.quiet_hl": "come build",
    "city.footer_tagline": "The city never really sleeps.",

    // — Ambient ticker (AmbientTicker.js: Live label + evergreen defaults) —
    "city.ticker.live": "Live",
    "city.ticker.default1_lead": "Someone is always building right now",
    "city.ticker.default1_hl": "the bazaar is warm tonight",
    "city.ticker.default2_lead": "Builders across Uzbekistan are ",
    "city.ticker.default2_hl": "looking for teammates",
    "city.ticker.default3_lead": "Every great team started with ",
    "city.ticker.default3_hl": "one lit window",
    "city.ticker.default4_lead": "New projects light up the city ",
    "city.ticker.default4_hl": "every week",

    // — Hero header (CityHeader.js) —
    "city.header.overline": "Toshkent · {weekday} night",
    "city.header.overline_plain": "Toshkent",
    "city.header.resting": "The bazaar is resting",
    "city.header.lit_one": "builder lit tonight",
    "city.header.lit_other": "builders lit tonight",
    "city.header.sub_quiet": "Quiet hours — come build.",
    "city.header.sub_active": "Someone is always building right now.",
    // The ONE sentence — must match the bot's /start and the landing hero.
    "city.header.purpose": "Find a team for your project. Find a project to join.",
    "city.header.stat_online": "Online now",
    "city.header.stat_cities": "Cities lit",
    "city.header.stat_new": "New this week",

    // — Region cluster (RegionCluster.js) —
    "city.cluster.region_kicker": "Region",
    "city.cluster.tonight": "{name} tonight",
    "city.cluster.lit": "{n} lit",
    "city.cluster.grace_kicker": "Early tonight",
    "city.cluster.grace_title": "The bazaar is small tonight.",
    "city.cluster.grace_sub":
      "Be one of the first to light up {name} — the city grows around whoever shows up.",
    // Two exits out of the grace tile: invite (opens InviteModal in place — the
    // link + Copy live in the dialog, settings.invite_* strings) and an in-page
    // jump to the other region clusters.
    "city.cluster.grace_invite": "👋 Invite a friend",
    "city.cluster.grace_other": "🏙 See other cities",
    "city.cluster.this_city": "This city",

    // — Whole-city empty state (FilterBar.js → CityEmpty, rendered by page.js when
    //   the payload carries zero builders anywhere). The invite button reuses
    //   city.cluster.grace_invite above — one invite label for the surface. —
    "city.empty.kicker": "The bazaar is dark",
    "city.empty.title": "No windows are lit tonight",
    "city.empty.sub":
      "BFU is only just starting here. Invite a friend — a city grows around whoever shows up first.",
    "city.empty.projects": "🚀 Browse projects",

    // — Builder card (BuilderCard.js) —
    "city.card.mentor": "Mentor",
    // Key name kept for stability; the badge is driven by `open_to_work`, so the
    // label says what the data actually means ("Co-founder" read as ambiguous).
    "city.card.cofounder": "Open to work",
    "city.card.volunteer": "Volunteer",
    "city.card.verified": "Verified",
    "city.card.is_building": "is building",
    "city.card.new": "new",

    // — Filter chips (FilterBar.js) —
    "city.filter.all": "All",
    "city.filter.online": "Online now",
    // Same key, same `open_to_work` query param — label only.
    "city.filter.cofounder": "Open to work",
    "city.filter.mentors": "Mentors",
    "city.filter.aria": "Filter builders",
    // No chip matched anything — shown WITH a working "Clear filter" button, so
    // the reader is never stranded on an empty body.
    "city.filter.empty_k": "Nothing under this chip",
    "city.filter.empty_t": "No builders match this filter",
    "city.filter.empty_s":
      "Nobody lit tonight fits what you picked. Clear the filter to see the whole city again.",
    "city.filter.clear": "✕ Clear filter",

    // — Presence toast (PresenceToast.js) —
    "city.toast.someone": "Someone",
    "city.toast.just_online": "just came online",

    // — Serendipity rail (ThreadsRail.js) —
    // The four `kind.*` keys mirror the backend's machine `kind` values; a kind
    // with no key here falls back to a title-case of the raw value.
    "city.threads.kicker": "Serendipity",
    "city.threads.title": "Threads from here",
    "city.threads.kind.rising": "Rising tonight",
    "city.threads.kind.new_in_city": "New in your city",
    "city.threads.kind.skill_cluster": "Same problem",
    "city.threads.kind.open_roles": "They need what you have",
  },

  uz: {
    "city.ticker.online_hl_one": "{n} ta bunyodkor onlayn",
    "city.ticker.online_hl_other": "{n} ta bunyodkor onlayn",
    "city.ticker.online_tail": " ayni damda · kimdir doim bunyod qilmoqda",
    "city.ticker.cities_hl_one": "{n} ta shahar yonib turibdi",
    "city.ticker.cities_hl_other": "{n} ta shahar yonib turibdi",
    "city.ticker.cities_tail": " bugun tunda O‘zbekiston bo‘ylab",
    "city.ticker.fresh_hl_one": "{n} ta yangi bunyodkor",
    "city.ticker.fresh_hl_other": "{n} ta yangi bunyodkor",
    "city.ticker.fresh_tail": " shu hafta shaharga qo‘shildi",
    "city.ticker.quiet_lead": "Bugun tunda bozor sokin · ",
    "city.ticker.quiet_hl": "keling, bunyod qiling",
    "city.footer_tagline": "Shahar hech qachon to‘liq uxlamaydi.",

    "city.ticker.live": "Jonli",
    "city.ticker.default1_lead": "Kimdir ayni damda doim bunyod qilmoqda",
    "city.ticker.default1_hl": "bugun tunda bozor iliq",
    "city.ticker.default2_lead": "O‘zbekiston bo‘ylab bunyodkorlar ",
    "city.ticker.default2_hl": "jamoadosh izlamoqda",
    "city.ticker.default3_lead": "Har bir buyuk jamoa shundan boshlangan — ",
    "city.ticker.default3_hl": "bitta yonayotgan deraza",
    "city.ticker.default4_lead": "Yangi loyihalar shaharni yoritadi ",
    "city.ticker.default4_hl": "har hafta",

    "city.header.overline": "Toshkent · {weekday} kechasi",
    "city.header.overline_plain": "Toshkent",
    "city.header.resting": "Bozor dam olmoqda",
    "city.header.lit_one": "ta bunyodkor bugun tunda yondi",
    "city.header.lit_other": "ta bunyodkor bugun tunda yondi",
    "city.header.sub_quiet": "Sokin damlar — keling, bunyod qiling.",
    "city.header.sub_active": "Kimdir ayni damda doim bunyod qilmoqda.",
    "city.header.purpose": "Loyihangga jamoa top. Jamoaga loyiha top.",
    "city.header.stat_online": "Hozir onlayn",
    "city.header.stat_cities": "Yonayotgan shaharlar",
    "city.header.stat_new": "Shu hafta yangilar",

    "city.cluster.region_kicker": "Hudud",
    "city.cluster.tonight": "{name} bugun tunda",
    "city.cluster.lit": "{n} ta yonmoqda",
    "city.cluster.grace_kicker": "Hali erta",
    "city.cluster.grace_title": "Bugun tunda bozor kichik.",
    "city.cluster.grace_sub":
      "{name}ni yoritgan birinchilardan bo‘ling — shahar kim kelsa, o‘sha odam atrofida o‘sadi.",
    "city.cluster.grace_invite": "👋 Do‘stni taklif qil",
    "city.cluster.grace_other": "🏙 Boshqa shaharlarni ko‘r",
    "city.cluster.this_city": "Bu shahar",

    "city.empty.kicker": "Bozor qorong‘i",
    "city.empty.title": "Bugun tunda birorta deraza yonmayapti",
    "city.empty.sub":
      "BFU bu yerda endigina boshlanmoqda. Do‘stingizni taklif qiling — shahar birinchi bo‘lib kelganlar atrofida o‘sadi.",
    "city.empty.projects": "🚀 Loyihalarni ko‘rish",

    "city.card.mentor": "Mentor",
    "city.card.cofounder": "Ishga ochiq",
    "city.card.volunteer": "Ko‘ngilli",
    "city.card.verified": "Tasdiqlangan",
    "city.card.is_building": "quryapti:",
    "city.card.new": "yangi",

    "city.filter.all": "Barchasi",
    "city.filter.online": "Hozir onlayn",
    "city.filter.cofounder": "Ishga ochiq",
    "city.filter.mentors": "Mentorlar",
    "city.filter.aria": "Bunyodkorlarni filtrlash",
    "city.filter.empty_k": "Bu filtr bo‘yicha hech narsa yo‘q",
    "city.filter.empty_t": "Bu filtrga mos bunyodkor topilmadi",
    "city.filter.empty_s":
      "Bugun tunda yonganlar orasida siz tanlaganiga mos keladigani yo‘q. Butun shaharni qayta ko‘rish uchun filtrni tozalang.",
    "city.filter.clear": "✕ Filtrni tozalash",

    "city.toast.someone": "Kimdir",
    "city.toast.just_online": "hozirgina onlaynga chiqdi",

    "city.threads.kicker": "Tasodif",
    "city.threads.title": "Shu yerdan boshlangan iplar",
    "city.threads.kind.rising": "Bugun tunda ko‘tarilmoqda",
    "city.threads.kind.new_in_city": "Shahringizdagi yangilar",
    "city.threads.kind.skill_cluster": "Bir xil muammo",
    "city.threads.kind.open_roles": "Sizda bor narsa ularga kerak",
  },

  ru: {
    "city.ticker.online_hl_one": "{n} строитель в сети",
    "city.ticker.online_hl_other": "{n} строителей в сети",
    "city.ticker.online_tail": " прямо сейчас · кто-то всегда строит",
    "city.ticker.cities_hl_one": "{n} город светится",
    "city.ticker.cities_hl_other": "{n} городов светятся",
    "city.ticker.cities_tail": " по всему Узбекистану сегодня ночью",
    "city.ticker.fresh_hl_one": "{n} новый строитель",
    "city.ticker.fresh_hl_other": "{n} новых строителей",
    "city.ticker.fresh_tail": " присоединились к городу на этой неделе",
    "city.ticker.quiet_lead": "Сегодня базар тих · ",
    "city.ticker.quiet_hl": "приходите строить",
    "city.footer_tagline": "Город никогда не спит по-настоящему.",

    "city.ticker.live": "В эфире",
    "city.ticker.default1_lead": "Кто-то всегда строит прямо сейчас",
    "city.ticker.default1_hl": "базар тёплый сегодня ночью",
    "city.ticker.default2_lead": "Строители по всему Узбекистану ",
    "city.ticker.default2_hl": "ищут напарников",
    "city.ticker.default3_lead": "Каждая великая команда начиналась с ",
    "city.ticker.default3_hl": "одного зажжённого окна",
    "city.ticker.default4_lead": "Новые проекты озаряют город ",
    "city.ticker.default4_hl": "каждую неделю",

    "city.header.overline": "Ташкент · {weekday} ночь",
    "city.header.overline_plain": "Ташкент",
    "city.header.resting": "Базар отдыхает",
    "city.header.lit_one": "строитель зажёгся сегодня",
    "city.header.lit_other": "строителей зажглись сегодня",
    "city.header.sub_quiet": "Тихие часы — приходите строить.",
    "city.header.sub_active": "Кто-то всегда строит прямо сейчас.",
    "city.header.purpose": "Найди команду для своего проекта. Найди проект для себя.",
    "city.header.stat_online": "Сейчас в сети",
    "city.header.stat_cities": "Светящиеся города",
    "city.header.stat_new": "Новые за неделю",

    "city.cluster.region_kicker": "Регион",
    "city.cluster.tonight": "{name} сегодня ночью",
    "city.cluster.lit": "{n} светятся",
    "city.cluster.grace_kicker": "Ещё рано",
    "city.cluster.grace_title": "Сегодня базар небольшой.",
    "city.cluster.grace_sub":
      "Станьте одним из первых, кто зажжёт {name} — город растёт вокруг тех, кто приходит.",
    "city.cluster.grace_invite": "👋 Пригласить друга",
    "city.cluster.grace_other": "🏙 Посмотреть другие города",
    "city.cluster.this_city": "Этот город",

    "city.empty.kicker": "Базар тёмный",
    "city.empty.title": "Сегодня ночью не светится ни одно окно",
    "city.empty.sub":
      "BFU здесь только начинается. Позовите друга — город растёт вокруг тех, кто приходит первым.",
    "city.empty.projects": "🚀 Смотреть проекты",

    "city.card.mentor": "Ментор",
    "city.card.cofounder": "Открыт к работе",
    "city.card.volunteer": "Волонтёр",
    "city.card.verified": "Подтверждён",
    "city.card.is_building": "строит:",
    "city.card.new": "новый",

    "city.filter.all": "Все",
    "city.filter.online": "Сейчас в сети",
    "city.filter.cofounder": "Открыт к работе",
    "city.filter.mentors": "Менторы",
    "city.filter.aria": "Фильтровать строителей",
    "city.filter.empty_k": "По этому фильтру пусто",
    "city.filter.empty_t": "Под этот фильтр не подходит ни один строитель",
    "city.filter.empty_s":
      "Среди зажжённых сегодня нет никого, кто подходит под выбранное. Сбросьте фильтр, чтобы снова увидеть весь город.",
    "city.filter.clear": "✕ Сбросить фильтр",

    "city.toast.someone": "Кто-то",
    "city.toast.just_online": "только что появился в сети",

    "city.threads.kicker": "Счастливая случайность",
    "city.threads.title": "Нити отсюда",
    "city.threads.kind.rising": "Набирает силу сегодня ночью",
    "city.threads.kind.new_in_city": "Новые в вашем городе",
    "city.threads.kind.skill_cluster": "Та же задача",
    "city.threads.kind.open_roles": "Им нужно то, что есть у вас",
  },
};
