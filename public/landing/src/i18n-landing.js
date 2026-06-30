// i18n-landing.js — trilingual layer for the BFU marketing landing.
// Plain JS (NOT babel/jsx). MUST load with a normal <script src> BEFORE the
// text/babel scripts so the globals exist when components define themselves.
//
// Exposes on window:
//   BFU_LANG            — { get(), set(code) } backed by localStorage
//   BFU_T(key)          — translated value for the current lang (string OR array/obj)
//   onBFULangChange(fn) — subscribe; returns an unsubscribe fn
//   setBFULang(code)    — persist + notify listeners
//   useBFULang()        — React hook -> [lang, setLang], re-renders on change
//   __bfuLangListeners  — the underlying Set (pub/sub)
//
// Scope: the WHOLE landing page (every section), three languages.

(function () {
  var STORAGE_KEY = 'bfu_landing_lang';
  var LANGS = ['en', 'uz', 'ru'];

  // ---- translations ------------------------------------------------------
  // Natural, fluent Uzbek (Latin, using o' / g') and Russian — written for an
  // Uzbek youth audience, not machine-literal.
  var DICT = {
    en: {
      // nav
      'nav.features': 'Features',
      'nav.regions': 'Regions',
      'nav.events': 'Notifications',

      // hero
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

      // manifesto
      'manifesto.kicker': 'Manifesto',
      'manifesto.p1': 'Two-thirds of Uzbekistan is under 30. The talent is everywhere — the discovery isn’t.',
      'manifesto.p2': 'A future founder in Andijon is one message away from a designer in Nukus. But you’ve never met. Grants get awarded to whoever happens to see the post. Hackathons fill from one Telegram channel.',
      'manifesto.p3a': 'BFU is the layer between you and the ',
      'manifesto.p3hl': 'people, projects and opportunities',
      'manifesto.p3b': ' you don’t know about yet — built where you already are.',

      // product film
      'film.eyebrow': 'The product · 5 beats',
      'film.step': 'Step',
      'film.of': 'of',
      'film.keepScrolling': 'keep scrolling',
      'film.beats': [
        { title: 'Open the bot. No download.', body: 'BFU lives inside Telegram. Tap a link, the Mini App opens — that’s it. No App Store, no second account, no install.' },
        { title: 'Build a profile in your language.', body: 'Pick English, O‘zbekcha, or Русский. Every screen is fully trilingual — switch any time, you don’t lose your work.' },
        { title: 'AI reads your bio.', body: 'A short bio is enough. AI tags what you know, what you want, and what you’re preparing for — skills, knowledges, interests, preparations, goals.' },
        { title: 'We surface the people who fit.', body: 'A “For You” feed ranks the members whose tags overlap with yours — not by who posted last, by who actually matches.' },
        { title: 'One tap to apply. One tap to accept.', body: 'Browse projects, apply with one button. Founders see who applied and accept right inside the bot. Notifications arrive in Telegram, where you already are.' },
      ],

      // features
      'features.kicker': 'What you get',
      'features.h2': 'Three things, done well.',
      'features.sub': 'BFU is small on purpose. Each surface is sharp, fast, and built to be used inside Telegram every day.',
      'features.cards': [
        { title: 'Discover people who match.', body: '“For You” feed, verified ✓ badges, multi-sort search by skill, region, or readiness.' },
        { title: 'Build or join a project.', body: 'Startups & volunteering. Apply with one tap. Drafts, founder dashboards, co-applied insights.' },
        { title: 'Real opportunities.', body: 'Hackathons, grants, scholarships, meetups — admin-curated and sorted by deadline.' },
      ],

      // regions
      'regions.kicker': '14 regions',
      'regions.h2': 'From Tashkent to Nukus.',
      'regions.p': 'Every region of Uzbekistan, one tap away. Hover a region to see active members in three scripts.',
      'regions.liveTag': 'live members · real geography',
      'regions.loading': 'loading live members…',
      'regions.members': 'members',
      'regions.projects': 'projects',
      'regions.capital': 'Capital',
      'regions.region': 'Region',
      'regions.explore': 'Explore',

      // marquee
      'marquee.kicker': 'Telegram-native',
      'marquee.h2': 'Notifications where you already are.',
      'marquee.p': 'Applications, invites, weekly digests, verifications — BFU pings you inside the bot. No separate inbox to check.',

      // AI matching
      'ai.kicker': 'AI matching',
      'ai.h2': 'Your bio, read by AI.',
      'ai.p': 'Drop a sentence about yourself. AI tags it across five dimensions — then we surface the people whose tags overlap with yours.',
      'ai.yourBio': 'Your bio',
      'ai.reading': 'AI is reading',
      'ai.matchesRanked': 'Matches — ranked',
      'ai.footer.a': 'Match · ranked by overlap across ',
      'ai.footer.hl': 'skills, knowledges, interests, preparations & goals',
      'ai.footer.b': ' — not by who posted last.',
      'ai.groups': ['skills', 'knowledges', 'interests', 'preparations', 'goals'],

      // leaderboard
      'lead.kicker': 'Invites & referrals',
      'lead.h2a': 'Build the future ',
      'lead.h2hl': 'together',
      'lead.h2b': ' — bring a friend.',
      'lead.p': 'Every BFU member has a unique invite link. When the people you bring complete registration, they count toward your spot on the weekly and monthly leaderboards — and toward real prizes.',
      'lead.getYours': 'Get yours',
      'lead.topInviters': 'Top inviters',
      'lead.tab.weekly': 'weekly',
      'lead.tab.monthly': 'monthly',
      'lead.tab.allTime': 'all-time',
      'lead.noInvites': 'No invites yet.',
      'lead.beFirst': 'Be the first to share your link — your name will appear here.',
      'lead.loading': 'Loading top inviters…',
      'lead.invites': 'invites',
      'lead.liveNote': 'Live from BFU · weekly resets each Monday, Tashkent time',

      // trust
      'trust.kicker': 'Trust & safety',
      'trust.items': [
        { title: 'Verified by humans.', body: 'Admins review every new profile. Verified members get a ✓ that other members can see.' },
        { title: 'Your data, your call.', body: 'Your location is never shown to other members. You control what your profile says, when, and to whom.' },
        { title: 'Reportable & accountable.', body: 'Every project and member is reportable; every admin action is logged. A small team, but a fair one.' },
      ],

      // faq
      'faq.kicker': 'FAQ',
      'faq.h2': 'Questions, answered.',
      'faq.items': [
        { q: 'Is it free?', a: 'Yes. Always free for students. We do not charge members for finding co-founders, joining projects, or applying to opportunities.' },
        { q: 'Do I need a Telegram account?', a: 'Yes. BFU lives inside Telegram as a Mini App, so you don’t have to install anything new. If you already use Telegram, you already have BFU — just open the bot.' },
        { q: 'What languages does it support?', a: 'Three: O‘zbekcha, Русский and English. Every screen is fully trilingual, and you can switch any time without losing your work.' },
        { q: 'How do you verify members?', a: 'Admins review each profile before granting a verification badge. We look at who the person says they are, what they’re working on, and whether their bio and links check out. Verified members get a ✓ that other members can see.' },
      ],

      // final cta
      'final.kicker': 'Ready?',
      'final.h2a': 'Your team is ',
      'final.h2hl': 'already here.',
      'final.h2b': 'Open the bot.',
      'final.p': 'One tap inside Telegram and you’re in. No App Store, no signup form, no second account.',
      'final.cta': 'Open in Telegram',
      'final.browse': 'or browse the regions →',

      // footer
      'footer.desc': 'Bright Futures Uzbekistan. A Telegram-native platform connecting students, founders and volunteers across all 14 regions.',
      'footer.made': 'Made in Uzbekistan',
      'footer.poweredBy': 'Powered by',
      'footer.linksTitle': 'Links',
      'footer.contactTitle': 'Contact',
      'footer.linkTelegram': 'Open in Telegram',
      'footer.linkRegions': 'Regions',
      'footer.linkEvents': 'Notifications',
      'footer.copyright': '© Bright Futures Uzbekistan · Built with ❤ in Tashkent.',
      'footer.status': 'All systems operational',
    },

    uz: {
      'nav.features': 'Imkoniyatlar',
      'nav.regions': 'Hududlar',
      'nav.events': 'Bildirishnomalar',

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

      'manifesto.kicker': 'Manifest',
      'manifesto.p1': 'O‘zbekistonning uchdan ikki qismi 30 yoshgacha. Iste’dod hamma joyda — faqat bir-birini topa olmaydi.',
      'manifesto.p2': 'Andijondagi bo‘lajak asoschi Nukusdagi dizaynerdan bitta xabar narida. Lekin siz hech tanishmagansiz. Grantlar e’lonni ko‘rib qolgan kishiga tegadi. Hakatonlar bitta Telegram kanaldan to‘ladi.',
      'manifesto.p3a': 'BFU — siz bilan hali bilmagan ',
      'manifesto.p3hl': 'odamlar, loyihalar va imkoniyatlar',
      'manifesto.p3b': ' o‘rtasidagi ko‘prik — siz allaqachon bo‘lgan joyda qurilgan.',

      'film.eyebrow': 'Mahsulot · 5 qadam',
      'film.step': 'Qadam',
      'film.of': '/',
      'film.keepScrolling': 'pastga suring',
      'film.beats': [
        { title: 'Botni oching. Yuklab olish shart emas.', body: 'BFU Telegram ichida yashaydi. Havolani bosasiz — Mini App ochiladi, tamom. App Store yo‘q, ikkinchi akkaunt yo‘q, o‘rnatish yo‘q.' },
        { title: 'Profilni o‘z tilingizda yarating.', body: 'English, O‘zbekcha yoki Русский — tanlang. Har bir ekran to‘liq uch tilda. Istalgan vaqt tilni almashtirasiz, ma’lumotlaringiz yo‘qolmaydi.' },
        { title: 'AI bio’ngizni o‘qiydi.', body: 'Qisqa bio yetarli. AI siz nimani bilishingiz, nimani xohlashingiz va nimaga tayyorlanayotganingizni teglaydi — ko‘nikma, bilim, qiziqish, tayyorgarlik, maqsad.' },
        { title: 'Sizga mos odamlarni topamiz.', body: '“Siz uchun” tasmasi teglaringiz mos kelgan a’zolarni saralaydi — kim oxirgi yozgani bo‘yicha emas, kim haqiqatan mos kelishi bo‘yicha.' },
        { title: 'Bir bosishda ariza. Bir bosishda qabul.', body: 'Loyihalarni ko‘ring, bitta tugma bilan ariza bering. Asoschilar kim ariza berganini ko‘radi va bot ichida qabul qiladi. Bildirishnomalar Telegramga keladi — siz allaqachon o‘sha yerdasiz.' },
      ],

      'features.kicker': 'Nima olasiz',
      'features.h2': 'Uch narsa, puxta bajarilgan.',
      'features.sub': 'BFU ataylab sodda. Har bir ekran tezkor, aniq va har kuni Telegram ichida ishlatish uchun qurilgan.',
      'features.cards': [
        { title: 'Sizga mos odamlarni toping.', body: '“Siz uchun” tasmasi, tasdiqlangan ✓ belgilar, ko‘nikma, hudud yoki tayyorlik bo‘yicha qidiruv.' },
        { title: 'Loyiha quring yoki qo‘shiling.', body: 'Startaplar va ko‘ngillilik. Bitta bosishda ariza. Qoralama, asoschi paneli, birgalikda ariza tahlili.' },
        { title: 'Haqiqiy imkoniyatlar.', body: 'Hakaton, grant, stipendiya, uchrashuvlar — admin tomonidan saralangan va muddati bo‘yicha tartiblangan.' },
      ],

      'regions.kicker': '14 hudud',
      'regions.h2': 'Toshkentdan Nukusgacha.',
      'regions.p': 'O‘zbekistonning har bir hududi bir bosish narida. Hududga bosing — faol a’zolarni uch yozuvda ko‘ring.',
      'regions.liveTag': 'jonli a’zolar · haqiqiy geografiya',
      'regions.loading': 'jonli a’zolar yuklanmoqda…',
      'regions.members': 'a’zo',
      'regions.projects': 'loyiha',
      'regions.capital': 'Poytaxt',
      'regions.region': 'Hudud',
      'regions.explore': 'Ko‘rish',

      'marquee.kicker': 'Telegram ichida',
      'marquee.h2': 'Bildirishnomalar — siz allaqachon bo‘lgan joyda.',
      'marquee.p': 'Arizalar, takliflar, haftalik xulosalar, tasdiqlar — BFU sizga bot ichida xabar beradi. Alohida tekshiradigan pochta yo‘q.',

      'ai.kicker': 'AI moslashtirish',
      'ai.h2': 'Bio’ngizni AI o‘qiydi.',
      'ai.p': 'O‘zingiz haqingizda bitta jumla yozing. AI uni besh o‘lchovda teglaydi — keyin teglaringiz mos kelgan odamlarni ko‘rsatamiz.',
      'ai.yourBio': 'Sizning bio',
      'ai.reading': 'AI o‘qimoqda',
      'ai.matchesRanked': 'Mos kelganlar — saralangan',
      'ai.footer.a': 'Moslik · ',
      'ai.footer.hl': 'ko‘nikma, bilim, qiziqish, tayyorgarlik va maqsad',
      'ai.footer.b': ' bo‘yicha saralangan — kim oxirgi yozgani bo‘yicha emas.',
      'ai.groups': ['ko‘nikma', 'bilim', 'qiziqish', 'tayyorgarlik', 'maqsad'],

      'lead.kicker': 'Takliflar',
      'lead.h2a': 'Kelajakni ',
      'lead.h2hl': 'birga',
      'lead.h2b': ' quraylik — do‘stingizni taklif qiling.',
      'lead.p': 'Har bir BFU a’zosida o‘zining taklif havolasi bor. Siz taklif qilgan odamlar ro‘yxatdan o‘tsa, ular haftalik va oylik reytingdagi o‘rningizga — va haqiqiy sovrinlarga hisoblanadi.',
      'lead.getYours': 'Havolani oling',
      'lead.topInviters': 'Eng faol takliflovchilar',
      'lead.tab.weekly': 'haftalik',
      'lead.tab.monthly': 'oylik',
      'lead.tab.allTime': 'butun davr',
      'lead.noInvites': 'Hozircha takliflar yo‘q.',
      'lead.beFirst': 'Havolangizni birinchi bo‘lib ulashing — ismingiz shu yerda chiqadi.',
      'lead.loading': 'Takliflovchilar yuklanmoqda…',
      'lead.invites': 'taklif',
      'lead.liveNote': 'BFU’dan jonli · har dushanba Toshkent vaqti bilan yangilanadi',

      'trust.kicker': 'Ishonch va xavfsizlik',
      'trust.items': [
        { title: 'Odam tomonidan tasdiqlangan.', body: 'Adminlar har bir yangi profilni ko‘rib chiqadi. Tasdiqlangan a’zolar boshqalar ko‘radigan ✓ belgisini oladi.' },
        { title: 'Ma’lumotingiz — sizning ixtiyoringizda.', body: 'Manzilingiz boshqa a’zolarga hech qachon ko‘rsatilmaydi. Profilingiz nima deyishini, qachon va kimga — o‘zingiz boshqarasiz.' },
        { title: 'Shikoyat qilinadi va javobgar.', body: 'Har bir loyiha va a’zo haqida shikoyat qilish mumkin; har bir admin amali qayd etiladi. Jamoa kichik, lekin adolatli.' },
      ],

      'faq.kicker': 'Savol-javob',
      'faq.h2': 'Savollar, javoblari bilan.',
      'faq.items': [
        { q: 'Bepulmi?', a: 'Ha. Talabalar uchun har doim bepul. Hammuassis topish, loyihaga qo‘shilish yoki imkoniyatlarga ariza berish uchun a’zolardan pul olmaymiz.' },
        { q: 'Telegram akkaunti kerakmi?', a: 'Ha. BFU Telegram ichida Mini App sifatida ishlaydi, shuning uchun yangi narsa o‘rnatish shart emas. Telegramdan foydalanayotgan bo‘lsangiz, BFU allaqachon sizda — botni oching.' },
        { q: 'Qaysi tillarni qo‘llab-quvvatlaydi?', a: 'Uchta: O‘zbekcha, Русский va English. Har bir ekran to‘liq uch tilda, istalgan vaqt ma’lumotni yo‘qotmasdan tilni almashtirasiz.' },
        { q: 'A’zolarni qanday tasdiqlaysiz?', a: 'Adminlar tasdiq belgisini berishdan oldin har bir profilni ko‘rib chiqadi. Inson kimligini, nima ustida ishlayotganini, bio va havolalari to‘g‘riligini tekshiramiz. Tasdiqlangan a’zolar boshqalar ko‘radigan ✓ belgisini oladi.' },
      ],

      'final.kicker': 'Tayyormisiz?',
      'final.h2a': 'Jamoangiz ',
      'final.h2hl': 'allaqachon shu yerda.',
      'final.h2b': 'Botni oching.',
      'final.p': 'Telegram ichida bitta bosish — va siz ichidasiz. App Store yo‘q, ro‘yxatdan o‘tish shakli yo‘q, ikkinchi akkaunt yo‘q.',
      'final.cta': 'Telegramda ochish',
      'final.browse': 'yoki hududlarni ko‘ring →',

      'footer.desc': 'Bright Futures Uzbekistan. Talabalar, asoschilar va ko‘ngillilarni 14 hudud bo‘ylab bog‘laydigan Telegram platformasi.',
      'footer.made': 'O‘zbekistonda yaratilgan',
      'footer.poweredBy': 'Hamkorlikda',
      'footer.linksTitle': 'Havolalar',
      'footer.contactTitle': 'Aloqa',
      'footer.linkTelegram': 'Telegramda ochish',
      'footer.linkRegions': 'Hududlar',
      'footer.linkEvents': 'Bildirishnomalar',
      'footer.copyright': '© Bright Futures Uzbekistan · Toshkentda ❤ bilan qurilgan.',
      'footer.status': 'Barcha tizimlar ishlamoqda',
    },

    ru: {
      'nav.features': 'Возможности',
      'nav.regions': 'Регионы',
      'nav.events': 'Уведомления',

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

      'manifesto.kicker': 'Манифест',
      'manifesto.p1': 'Две трети Узбекистана — моложе 30. Талант повсюду, но люди не находят друг друга.',
      'manifesto.p2': 'Будущий основатель в Андижане — в одном сообщении от дизайнера в Нукусе. Но вы никогда не встречались. Гранты достаются тому, кто случайно увидел пост. Хакатоны набираются из одного Telegram-канала.',
      'manifesto.p3a': 'BFU — это слой между тобой и ещё незнакомыми тебе ',
      'manifesto.p3hl': 'людьми, проектами и возможностями',
      'manifesto.p3b': ' — там, где ты уже есть.',

      'film.eyebrow': 'Продукт · 5 шагов',
      'film.step': 'Шаг',
      'film.of': 'из',
      'film.keepScrolling': 'листай дальше',
      'film.beats': [
        { title: 'Открой бота. Без скачивания.', body: 'BFU живёт внутри Telegram. Нажми ссылку — Mini App открывается, и всё. Нет App Store, нет второго аккаунта, нет установки.' },
        { title: 'Создай профиль на своём языке.', body: 'Выбери English, O‘zbekcha или Русский. Каждый экран полностью на трёх языках — меняй язык в любой момент, ничего не теряя.' },
        { title: 'ИИ читает твою биографию.', body: 'Достаточно короткого описания. ИИ размечает, что ты знаешь, чего хочешь и к чему готовишься — навыки, знания, интересы, подготовка, цели.' },
        { title: 'Мы находим тех, кто подходит.', body: 'Лента «Для тебя» ранжирует участников, чьи теги совпадают с твоими — не по тому, кто написал последним, а по реальному совпадению.' },
        { title: 'Одно нажатие — заявка. Одно — приём.', body: 'Смотри проекты, подавай заявку одной кнопкой. Основатели видят, кто откликнулся, и принимают прямо в боте. Уведомления приходят в Telegram, где ты уже есть.' },
      ],

      'features.kicker': 'Что ты получаешь',
      'features.h2': 'Три вещи, сделанные хорошо.',
      'features.sub': 'BFU намеренно компактный. Каждый экран быстрый, чёткий и создан для ежедневного использования в Telegram.',
      'features.cards': [
        { title: 'Находи подходящих людей.', body: 'Лента «Для тебя», значки ✓, поиск с сортировкой по навыкам, региону и готовности.' },
        { title: 'Создай проект или присоединись.', body: 'Стартапы и волонтёрство. Заявка одним нажатием. Черновики, панель основателя, аналитика откликов.' },
        { title: 'Реальные возможности.', body: 'Хакатоны, гранты, стипендии, встречи — отобраны админами и отсортированы по сроку.' },
      ],

      'regions.kicker': '14 регионов',
      'regions.h2': 'От Ташкента до Нукуса.',
      'regions.p': 'Каждый регион Узбекистана — в одно нажатие. Наведи на регион и увидь активных участников в трёх письменностях.',
      'regions.liveTag': 'живые участники · реальная география',
      'regions.loading': 'загрузка участников…',
      'regions.members': 'участн.',
      'regions.projects': 'проектов',
      'regions.capital': 'Столица',
      'regions.region': 'Регион',
      'regions.explore': 'Открыть',

      'marquee.kicker': 'Внутри Telegram',
      'marquee.h2': 'Уведомления там, где ты уже есть.',
      'marquee.p': 'Заявки, приглашения, еженедельные сводки, проверки — BFU пишет тебе прямо в бот. Нет отдельной почты, которую надо проверять.',

      'ai.kicker': 'Подбор ИИ',
      'ai.h2': 'Твою биографию читает ИИ.',
      'ai.p': 'Напиши одно предложение о себе. ИИ размечает его по пяти измерениям — затем мы показываем людей, чьи теги совпадают с твоими.',
      'ai.yourBio': 'Твоя биография',
      'ai.reading': 'ИИ читает',
      'ai.matchesRanked': 'Совпадения — по рейтингу',
      'ai.footer.a': 'Совпадение · по пересечению ',
      'ai.footer.hl': 'навыков, знаний, интересов, подготовки и целей',
      'ai.footer.b': ' — а не по тому, кто написал последним.',
      'ai.groups': ['навыки', 'знания', 'интересы', 'подготовка', 'цели'],

      'lead.kicker': 'Приглашения',
      'lead.h2a': 'Строй будущее ',
      'lead.h2hl': 'вместе',
      'lead.h2b': ' — приведи друга.',
      'lead.p': 'У каждого участника BFU есть уникальная ссылка-приглашение. Когда приведённые тобой люди завершают регистрацию, они идут в зачёт твоего места в недельном и месячном рейтинге — и к реальным призам.',
      'lead.getYours': 'Получить ссылку',
      'lead.topInviters': 'Лучшие приглашающие',
      'lead.tab.weekly': 'неделя',
      'lead.tab.monthly': 'месяц',
      'lead.tab.allTime': 'всё время',
      'lead.noInvites': 'Пока нет приглашений.',
      'lead.beFirst': 'Поделись ссылкой первым — твоё имя появится здесь.',
      'lead.loading': 'Загрузка приглашающих…',
      'lead.invites': 'пригл.',
      'lead.liveNote': 'Живые данные BFU · сброс каждый понедельник по Ташкенту',

      'trust.kicker': 'Доверие и безопасность',
      'trust.items': [
        { title: 'Проверка людьми.', body: 'Админы проверяют каждый новый профиль. Проверенные участники получают ✓, который видят другие.' },
        { title: 'Твои данные — твой выбор.', body: 'Твоя геолокация никогда не показывается другим участникам. Ты сам решаешь, что говорит твой профиль, когда и кому.' },
        { title: 'Можно пожаловаться, есть ответственность.', body: 'На каждый проект и участника можно пожаловаться; каждое действие админа фиксируется. Команда небольшая, но честная.' },
      ],

      'faq.kicker': 'Вопросы',
      'faq.h2': 'Вопросы и ответы.',
      'faq.items': [
        { q: 'Это бесплатно?', a: 'Да. Для студентов всегда бесплатно. Мы не берём с участников плату за поиск сооснователей, участие в проектах или подачу заявок на возможности.' },
        { q: 'Нужен ли аккаунт Telegram?', a: 'Да. BFU работает внутри Telegram как Mini App, поэтому ничего нового устанавливать не нужно. Если ты уже пользуешься Telegram — BFU уже у тебя, просто открой бота.' },
        { q: 'Какие языки поддерживаются?', a: 'Три: O‘zbekcha, Русский и English. Каждый экран полностью на трёх языках, и язык можно менять в любой момент, ничего не теряя.' },
        { q: 'Как вы проверяете участников?', a: 'Админы проверяют каждый профиль перед выдачей значка. Мы смотрим, кем человек себя называет, над чем работает и сходятся ли его биография и ссылки. Проверенные участники получают ✓, который видят другие.' },
      ],

      'final.kicker': 'Готов?',
      'final.h2a': 'Твоя команда ',
      'final.h2hl': 'уже здесь.',
      'final.h2b': 'Открой бота.',
      'final.p': 'Одно нажатие в Telegram — и ты внутри. Нет App Store, нет формы регистрации, нет второго аккаунта.',
      'final.cta': 'Открыть в Telegram',
      'final.browse': 'или посмотреть регионы →',

      'footer.desc': 'Bright Futures Uzbekistan. Платформа внутри Telegram, объединяющая студентов, основателей и волонтёров во всех 14 регионах.',
      'footer.made': 'Сделано в Узбекистане',
      'footer.poweredBy': 'При поддержке',
      'footer.linksTitle': 'Ссылки',
      'footer.contactTitle': 'Контакты',
      'footer.linkTelegram': 'Открыть в Telegram',
      'footer.linkRegions': 'Регионы',
      'footer.linkEvents': 'Уведомления',
      'footer.copyright': '© Bright Futures Uzbekistan · Сделано с ❤ в Ташкенте.',
      'footer.status': 'Все системы работают',
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

  // Returns a string OR array/object depending on the key.
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
      setState(window.BFU_LANG.get());
      return off;
    }, []);
    return [lang, window.setBFULang];
  };
})();
