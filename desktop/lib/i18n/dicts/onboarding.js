// "onboarding" surface translations.
//
// TWO first-run experiences live here, and only one of them runs at a time:
//
//   • onb.*        — the 3-card WALKTHROUGH ("what BFU is"). The V1 default, and
//                    the founder-approved design. These strings are copied
//                    VERBATIM from the Mini App (src/i18n.jsx, same key names) so
//                    a member meets the exact same three cards whether they open
//                    the desktop app or the Mini App first. If you edit one side,
//                    edit the other.
//   • onboarding.* — the old 4-step SETUP WIZARD (region → bio+AI → follow →
//                    start a project). Now behind FLAGS.SETUP_WIZARD (false).
//                    Kept intact so flipping the flag brings it straight back.
export const onboarding = {
  en: {
    // ── 3-card walkthrough (mirrors the Mini App) ──
    "onb.skip": "Skip",
    "onb.next": "Next",
    "onb.start": "See your city",
    "onb.s1.title": "Find a team for your project. Find a project to join.",
    "onb.s1.body":
      "That's BFU — where young people across Uzbekistan find each other and build together.",
    "onb.s2.title": "See your city",
    "onb.s2.body":
      "In City you see who is building near you, and what they're working on. Like someone? Write to them.",
    "onb.s3.title": "Join a project — or start yours",
    "onb.s3.body":
      "In Projects you can join someone's team, or post your own idea and let people come to you.",

    // ── 4-step setup wizard (FLAGS.SETUP_WIZARD) ──
    "onboarding.skip": "Skip for now",

    "onboarding.step1.eyebrow": "Welcome to the city",
    "onboarding.step1.titlePrefix": "Welcome to the city,",
    "onboarding.step1.intent":
      "Let's light your corner of the bazaar — four quick steps, and you can skip any of them.",
    "onboarding.step1.regionLabel": "Where in Uzbekistan are you building?",
    "onboarding.step1.regionAria": "Your region",
    "onboarding.step1.loadingRegions": "Loading regions…",
    "onboarding.step1.selectRegion": "— Select your region —",

    "onboarding.step2.eyebrow": "Your story",
    "onboarding.step2.title": "Say who you are",
    "onboarding.step2.intent":
      "A line or two the city reads first — and what the AI reads to place you. You can change it anytime.",
    "onboarding.step2.aboutLabel": "About you",
    "onboarding.step2.aboutPlaceholder":
      "What you're building, what you care about, what you're good at…",
    "onboarding.step2.polishing": "Polishing…",
    "onboarding.step2.polish": "Polish with AI",
    "onboarding.step2.coachHint": "The coach tightens your draft — you decide whether to keep it.",
    "onboarding.step2.coachSuggestion": "Coach suggestion",
    "onboarding.step2.useThis": "Use this",
    "onboarding.step2.dismiss": "Dismiss",
    "onboarding.step2.photoNote":
      "Your Telegram photo will appear on your card automatically — nothing to upload.",

    "onboarding.step3.eyebrow": "Find your people",
    "onboarding.step3.title": "Follow a few builders",
    "onboarding.step3.intent": "Start your feed with people already at work across the city.",
    "onboarding.step3.gathering": "Gathering builders…",
    "onboarding.step3.emptyBody":
      "The city's still waking up. Wander in and meet people as they arrive.",
    "onboarding.step3.wander": "Wander the city →",
    "onboarding.step3.builderFallback": "Builder",
    "onboarding.step3.newInCity": "New in the city",
    "onboarding.step3.followingAria": "Following {name}",
    "onboarding.step3.followAria": "Follow {name}",
    "onboarding.step3.following": "✓ Following",
    "onboarding.step3.follow": "+ Follow",

    "onboarding.step4.eyebrow": "Optional",
    "onboarding.step4.title": "Rally a team around your idea",
    "onboarding.step4.intent":
      "Building something? Post it, and let the city help you make it real. No rush — you can start whenever.",
    "onboarding.step4.startProject": "Start a project →",

    "onboarding.nav.back": "← Back",
    "onboarding.nav.saving": "Saving…",
    "onboarding.nav.finish": "Finish",
    "onboarding.nav.next": "Next →",

    "onboarding.error.region": "Couldn't save your region — try again, or skip.",
    "onboarding.error.bio": "Couldn't save your bio — try again, or skip.",

    "onboarding.coach.needFirstLine": "Write a first line, then let the coach polish it.",
    "onboarding.coach.nothingToAdd": "The coach had nothing to add — it reads well.",
    "onboarding.coach.resting": "The coach is resting. Try again in a moment.",
  },

  uz: {
    // ── 3-card walkthrough (mirrors the Mini App) ──
    "onb.skip": "O‘tkazib yuborish",
    "onb.next": "Keyingisi",
    "onb.start": "Shahringni ko‘r",
    "onb.s1.title": "Loyihangga jamoa top. Jamoaga loyiha top.",
    "onb.s1.body":
      "BFU shu — O‘zbekiston yoshlari bir-birini topib, birga loyiha quradigan joy.",
    "onb.s2.title": "Shahringni ko‘r",
    "onb.s2.body":
      "City’da yoningda kim nima qurayotganini ko‘rasan. Yoqqan odamga yozasan.",
    "onb.s3.title": "Loyihaga qo‘shil — yoki o‘zingnikini boshla",
    "onb.s3.body":
      "Projects’da birovning jamoasiga qo‘shilasan, yoki o‘z g‘oyangni e’lon qilasan — odamlar o‘zi keladi.",

    // ── 4-step setup wizard (FLAGS.SETUP_WIZARD) ──
    "onboarding.skip": "Hozircha o‘tkazib yuborish",

    "onboarding.step1.eyebrow": "Shaharga xush kelibsiz",
    "onboarding.step1.titlePrefix": "Shaharga xush kelibsiz,",
    "onboarding.step1.intent":
      "Keling, bozordagi o‘z burchagingizni yoritamiz — to‘rtta tez qadam, xohlaganingizni o‘tkazib yuborsangiz ham bo‘ladi.",
    "onboarding.step1.regionLabel": "Oʻzbekistonning qayeridasiz?",
    "onboarding.step1.regionAria": "Sizning hududingiz",
    "onboarding.step1.loadingRegions": "Hududlar yuklanmoqda…",
    "onboarding.step1.selectRegion": "— Hududingizni tanlang —",

    "onboarding.step2.eyebrow": "Sizning hikoyangiz",
    "onboarding.step2.title": "O‘zingiz haqingizda ayting",
    "onboarding.step2.intent":
      "Shahar avval o‘qiydigan bir-ikki qator — va sizni joylashtirish uchun sun'iy intellekt o‘qiydigan matn. Uni istalgan vaqtda o‘zgartirishingiz mumkin.",
    "onboarding.step2.aboutLabel": "Siz haqingizda",
    "onboarding.step2.aboutPlaceholder":
      "Nima yaratayotganingiz, nimaga qadr berishingiz, nimada kuchli ekaningiz…",
    "onboarding.step2.polishing": "Sayqallanmoqda…",
    "onboarding.step2.polish": "AI bilan sayqallash",
    "onboarding.step2.coachHint":
      "Murabbiy qoralamangizni jamlaydi — saqlash yoki saqlamaslikni o‘zingiz hal qilasiz.",
    "onboarding.step2.coachSuggestion": "Murabbiy taklifi",
    "onboarding.step2.useThis": "Shuni ishlatish",
    "onboarding.step2.dismiss": "Rad etish",
    "onboarding.step2.photoNote":
      "Telegram surantingiz kartangizda avtomatik paydo bo‘ladi — hech narsa yuklashning hojati yo‘q.",

    "onboarding.step3.eyebrow": "O‘z odamlaringizni toping",
    "onboarding.step3.title": "Bir nechta quruvchini kuzating",
    "onboarding.step3.intent":
      "Lentangizni shahar bo‘ylab allaqachon ish boshlagan odamlar bilan boshlang.",
    "onboarding.step3.gathering": "Quruvchilar yig‘ilmoqda…",
    "onboarding.step3.emptyBody":
      "Shahar hali uyg‘onmoqda. Aylanib chiqing va kelayotgan odamlar bilan tanishing.",
    "onboarding.step3.wander": "Shahar bo‘ylab aylanish →",
    "onboarding.step3.builderFallback": "Quruvchi",
    "onboarding.step3.newInCity": "Shaharda yangi",
    "onboarding.step3.followingAria": "{name} kuzatilmoqda",
    "onboarding.step3.followAria": "{name}ni kuzatish",
    "onboarding.step3.following": "✓ Kuzatilmoqda",
    "onboarding.step3.follow": "+ Kuzatish",

    "onboarding.step4.eyebrow": "Ixtiyoriy",
    "onboarding.step4.title": "G‘oyangiz atrofida jamoa to‘plang",
    "onboarding.step4.intent":
      "Biror narsa yaratyapsizmi? Uni joylang va shahar uni haqiqatga aylantirishga yordam bersin. Shoshilmang — istalgan vaqtda boshlashingiz mumkin.",
    "onboarding.step4.startProject": "Loyihani boshlash →",

    "onboarding.nav.back": "← Orqaga",
    "onboarding.nav.saving": "Saqlanmoqda…",
    "onboarding.nav.finish": "Tugatish",
    "onboarding.nav.next": "Keyingi →",

    "onboarding.error.region": "Hududingizni saqlab bo‘lmadi — qaytadan urinib ko‘ring yoki o‘tkazib yuboring.",
    "onboarding.error.bio": "Ma'lumotingizni saqlab bo‘lmadi — qaytadan urinib ko‘ring yoki o‘tkazib yuboring.",

    "onboarding.coach.needFirstLine": "Avval bir qator yozing, keyin murabbiy uni sayqallasin.",
    "onboarding.coach.nothingToAdd": "Murabbiyning qo‘shadigan gapi yo‘q ekan — a'lo o‘qilyapti.",
    "onboarding.coach.resting": "Murabbiy dam olmoqda. Bir ozdan so‘ng qayta urinib ko‘ring.",
  },

  ru: {
    // ── 3-card walkthrough (mirrors the Mini App) ──
    "onb.skip": "Пропустить",
    "onb.next": "Далее",
    "onb.start": "Посмотреть город",
    "onb.s1.title": "Найди команду для своего проекта. Найди проект для себя.",
    "onb.s1.body":
      "Это BFU — место, где молодёжь Узбекистана находит друг друга и создаёт проекты вместе.",
    "onb.s2.title": "Посмотри свой город",
    "onb.s2.body":
      "В разделе «Город» видно, кто и что строит рядом. Понравился человек — напиши ему.",
    "onb.s3.title": "Присоединись к проекту — или начни свой",
    "onb.s3.body":
      "В «Проектах» можно вступить в чью-то команду или опубликовать свою идею — и люди придут сами.",

    // ── 4-step setup wizard (FLAGS.SETUP_WIZARD) ──
    "onboarding.skip": "Пропустить пока",

    "onboarding.step1.eyebrow": "Добро пожаловать в город",
    "onboarding.step1.titlePrefix": "Добро пожаловать в город,",
    "onboarding.step1.intent":
      "Давайте зажжём ваш уголок базара — четыре быстрых шага, и любой из них можно пропустить.",
    "onboarding.step1.regionLabel": "В каком регионе Узбекистана вы строите?",
    "onboarding.step1.regionAria": "Ваш регион",
    "onboarding.step1.loadingRegions": "Загрузка регионов…",
    "onboarding.step1.selectRegion": "— Выберите свой регион —",

    "onboarding.step2.eyebrow": "Ваша история",
    "onboarding.step2.title": "Расскажите, кто вы",
    "onboarding.step2.intent":
      "Пара строк, которые город прочитает первыми — и которые ИИ читает, чтобы вас разместить. Их можно изменить в любой момент.",
    "onboarding.step2.aboutLabel": "О вас",
    "onboarding.step2.aboutPlaceholder":
      "Что вы создаёте, что вам важно, в чём вы сильны…",
    "onboarding.step2.polishing": "Шлифуем…",
    "onboarding.step2.polish": "Отшлифовать с ИИ",
    "onboarding.step2.coachHint":
      "Коуч подтягивает ваш черновик — вы сами решаете, оставить его или нет.",
    "onboarding.step2.coachSuggestion": "Предложение коуча",
    "onboarding.step2.useThis": "Использовать это",
    "onboarding.step2.dismiss": "Отклонить",
    "onboarding.step2.photoNote":
      "Ваше фото из Telegram появится на карточке автоматически — ничего загружать не нужно.",

    "onboarding.step3.eyebrow": "Найдите своих людей",
    "onboarding.step3.title": "Подпишитесь на нескольких строителей",
    "onboarding.step3.intent": "Начните свою ленту с людей, которые уже работают по всему городу.",
    "onboarding.step3.gathering": "Собираем строителей…",
    "onboarding.step3.emptyBody":
      "Город ещё просыпается. Пройдитесь по нему и знакомьтесь с людьми по мере их появления.",
    "onboarding.step3.wander": "Прогуляться по городу →",
    "onboarding.step3.builderFallback": "Строитель",
    "onboarding.step3.newInCity": "Новичок в городе",
    "onboarding.step3.followingAria": "Вы подписаны на {name}",
    "onboarding.step3.followAria": "Подписаться на {name}",
    "onboarding.step3.following": "✓ Вы подписаны",
    "onboarding.step3.follow": "+ Подписаться",

    "onboarding.step4.eyebrow": "Необязательно",
    "onboarding.step4.title": "Соберите команду вокруг своей идеи",
    "onboarding.step4.intent":
      "Что-то создаёте? Опубликуйте это, и пусть город поможет воплотить идею в жизнь. Не спешите — начать можно когда угодно.",
    "onboarding.step4.startProject": "Начать проект →",

    "onboarding.nav.back": "← Назад",
    "onboarding.nav.saving": "Сохраняем…",
    "onboarding.nav.finish": "Готово",
    "onboarding.nav.next": "Далее →",

    "onboarding.error.region": "Не удалось сохранить ваш регион — попробуйте снова или пропустите.",
    "onboarding.error.bio": "Не удалось сохранить ваше описание — попробуйте снова или пропустите.",

    "onboarding.coach.needFirstLine": "Напишите первую строку, а потом дайте коучу её отшлифовать.",
    "onboarding.coach.nothingToAdd": "Коучу нечего добавить — читается отлично.",
    "onboarding.coach.resting": "Коуч отдыхает. Попробуйте снова через мгновение.",
  },
};
