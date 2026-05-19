import { createContext, useContext, useState, useEffect, useCallback } from "react";

const SUPPORTED = ["en", "uz", "ru"];

const STRINGS = {
  // ── Common ────────────────────────────────────────────────────────────────
  "common.loading": { en: "Loading…", uz: "Yuklanmoqda…", ru: "Загрузка…" },
  "common.loadingProfile": { en: "Loading profile…", uz: "Profil yuklanmoqda…", ru: "Загрузка профиля…" },
  "common.loadMore": { en: "Load More", uz: "Yana yuklash", ru: "Показать ещё" },
  "common.loadingMore": { en: "Loading…", uz: "Yuklanmoqda…", ru: "Загрузка…" },
  "common.save": { en: "Save", uz: "Saqlash", ru: "Сохранить" },
  "common.saving": { en: "Saving…", uz: "Saqlanmoqda…", ru: "Сохранение…" },
  "common.cancel": { en: "Cancel", uz: "Bekor qilish", ru: "Отмена" },
  "common.back": { en: "Back", uz: "Orqaga", ru: "Назад" },
  "common.previous": { en: "Previous", uz: "Oldingi", ru: "Назад" },
  "common.continue": { en: "Continue →", uz: "Davom etish →", ru: "Продолжить →" },
  "common.viewProfile": { en: "View Profile", uz: "Profilni ko‘rish", ru: "Профиль" },
  "common.yo": { en: "{n} y/o", uz: "{n} yosh", ru: "{n} лет" },
  "common.male": { en: "Male", uz: "Erkak", ru: "Мужской" },
  "common.female": { en: "Female", uz: "Ayol", ru: "Женский" },

  // ── Bottom nav ────────────────────────────────────────────────────────────
  "nav.discover": { en: "Discover", uz: "Kashf et", ru: "Люди" },
  "nav.startups": { en: "Startups", uz: "Startaplar", ru: "Стартапы" },
  "nav.volunteer": { en: "Volunteer", uz: "Volontyorlik", ru: "Волонтёрство" },
  "nav.profile": { en: "Profile", uz: "Profil", ru: "Профиль" },

  // ── Auth: welcome ─────────────────────────────────────────────────────────
  "auth.tagline": { en: "BRIGHT FUTURES UZBEKISTAN", uz: "BRIGHT FUTURES UZBEKISTAN", ru: "BRIGHT FUTURES UZBEKISTAN" },
  "auth.welcomeText": {
    en: "Connect with students, co-founders, and volunteers building the future of Uzbekistan.",
    uz: "O‘zbekiston kelajagini qurayotgan talabalar, hammuassislar va volontyorlar bilan bog‘laning.",
    ru: "Объединяйтесь со студентами, сооснователями и волонтёрами, которые строят будущее Узбекистана.",
  },
  "auth.openInTelegram": {
    en: "Please open this app inside Telegram to log in.",
    uz: "Kirish uchun ushbu ilovani Telegram ichida oching.",
    ru: "Чтобы войти, откройте это приложение внутри Telegram.",
  },
  "auth.devLogin": { en: "🔧 Dev Login", uz: "🔧 Dev Login", ru: "🔧 Dev Login" },
  "auth.authenticating": { en: "Authenticating…", uz: "Tasdiqlanmoqda…", ru: "Авторизация…" },
  "auth.authFailed": { en: "Auth failed: {msg}", uz: "Kirishda xatolik: {msg}", ru: "Ошибка входа: {msg}" },

  // ── Auth: registration shell ──────────────────────────────────────────────
  "auth.stepOf": { en: "STEP {a} OF {b}", uz: "{a}-QADAM / {b}", ru: "ШАГ {a} ИЗ {b}" },
  "auth.completeRegistration": { en: "🎉 Complete Registration", uz: "🎉 Ro‘yxatdan o‘tishni yakunlash", ru: "🎉 Завершить регистрацию" },
  "auth.registerFailed": { en: "Failed to register: {msg}", uz: "Ro‘yxatdan o‘tishda xatolik: {msg}", ru: "Не удалось зарегистрироваться: {msg}" },

  // Step 1 — language
  "auth.step.langTitle": { en: "Choose your language", uz: "Tilni tanlang", ru: "Выберите язык" },
  "auth.step.langSub": { en: "You can change this anytime", uz: "Buni istalgan vaqtda o‘zgartirishingiz mumkin", ru: "Это можно изменить в любое время" },

  // Step 2 — basic info
  "auth.step.basicTitle": { en: "Basic Info", uz: "Asosiy ma’lumotlar", ru: "Основная информация" },
  "auth.step.basicSub": { en: "Tell us who you are", uz: "O‘zingiz haqingizda ayting", ru: "Расскажите о себе" },
  "auth.firstName": { en: "First Name", uz: "Ism", ru: "Имя" },
  "auth.lastName": { en: "Last Name", uz: "Familiya", ru: "Фамилия" },
  "auth.firstNamePh": { en: "e.g. Abdurahim", uz: "masalan, Abdurahim", ru: "напр. Abdurahim" },
  "auth.lastNamePh": { en: "e.g. Egamberdiyev", uz: "masalan, Egamberdiyev", ru: "напр. Egamberdiyev" },
  "auth.birthYearPh": { en: "e.g. 2008", uz: "masalan, 2008", ru: "напр. 2008" },
  "auth.gender": { en: "Gender", uz: "Jins", ru: "Пол" },
  "auth.birthYear": { en: "Birth Year", uz: "Tug‘ilgan yil", ru: "Год рождения" },
  "auth.phone": { en: "Phone number", uz: "Telefon raqami", ru: "Номер телефона" },
  "auth.err.firstName": { en: "First name is required", uz: "Ism kiritilishi shart", ru: "Укажите имя" },
  "auth.err.lastName": { en: "Last name is required", uz: "Familiya kiritilishi shart", ru: "Укажите фамилию" },
  "auth.err.gender": { en: "Please select a gender", uz: "Jinsni tanlang", ru: "Выберите пол" },
  "auth.err.birthYear": { en: "Birth year must be between {min} and {max}", uz: "Tug‘ilgan yil {min}–{max} oralig‘ida bo‘lishi kerak", ru: "Год рождения должен быть между {min} и {max}" },
  "auth.err.phone": { en: "Enter a valid phone number (e.g. +998911853616)", uz: "To‘g‘ri telefon raqamini kiriting (masalan, +998911853616)", ru: "Введите корректный номер (например, +998911853616)" },

  // Step 3 — location
  "auth.step.locTitle": { en: "Your location", uz: "Joylashuvingiz", ru: "Ваше местоположение" },
  "auth.step.locSub": { en: "Select your region, school, and language centers", uz: "Hudud, maktab va o‘quv markazlaringizni tanlang", ru: "Выберите регион, школу и учебные центры" },
  "auth.region": { en: "Region", uz: "Hudud", ru: "Регион" },
  "auth.selectRegion": { en: "Select Region…", uz: "Hududni tanlang…", ru: "Выберите регион…" },
  "auth.school": { en: "School / University (Optional)", uz: "Maktab / Universitet (ixtiyoriy)", ru: "Школа / Университет (необязательно)" },
  "auth.searchSchool": { en: "Search school…", uz: "Maktabni qidirish…", ru: "Поиск школы…" },
  "auth.lcs": { en: "Language Centers (Optional)", uz: "O‘quv markazlari (ixtiyoriy)", ru: "Учебные центры (необязательно)" },
  "auth.searchLC": { en: "Search language center…", uz: "O‘quv markazini qidirish…", ru: "Поиск учебного центра…" },
  "auth.selectRegionFirst": { en: "Select a region first", uz: "Avval hududni tanlang", ru: "Сначала выберите регион" },

  // Step 4 — about
  "auth.step.aboutTitle": { en: "About yourself", uz: "O‘zingiz haqingizda", ru: "О себе" },
  "auth.step.aboutSub": { en: "Tell the community who you are. AI will match you to opportunities.", uz: "Hamjamiyatga o‘zingizni tanishtiring. AI sizni imkoniyatlarga moslaydi.", ru: "Расскажите сообществу о себе. ИИ подберёт вам возможности." },
  "auth.aboutPh": { en: "I'm a student from Tashkent interested in EdTech. I know Python and design…", uz: "Men Toshkentlik talabaman, EdTech bilan qiziqaman. Python va dizaynni bilaman…", ru: "Я студент из Ташкента, увлекаюсь EdTech. Знаю Python и дизайн…" },

  // Step 5 — intentions
  "auth.step.intentTitle": { en: "Intentions", uz: "Maqsadlaringiz", ru: "Намерения" },
  "auth.step.intentSub": { en: "What are you looking for in BFU?", uz: "BFU’da nimani qidiryapsiz?", ru: "Что вы ищете в BFU?" },
  "auth.intent.workTitle": { en: "⚡ Open to Co-founding / Work", uz: "⚡ Hammuassislik / Ishga ochiqman", ru: "⚡ Открыт к сооснованию / работе" },
  "auth.intent.workSub": { en: "I want to join startups or find partners.", uz: "Startaplarga qo‘shilmoqchiman yoki hamkor topmoqchiman.", ru: "Хочу присоединяться к стартапам или искать партнёров." },
  "auth.intent.volTitle": { en: "🤝 Open to Volunteering", uz: "🤝 Volontyorlikka ochiqman", ru: "🤝 Открыт к волонтёрству" },
  "auth.intent.volSub": { en: "I want to help with community projects.", uz: "Jamoa loyihalarida yordam bermoqchiman.", ru: "Хочу помогать в общественных проектах." },

  // Step 6 — groups
  "auth.step.groupsTitle": { en: "Join Your Groups", uz: "Guruhlaringizga qo‘shiling", ru: "Вступите в группы" },
  "auth.step.groupsSub": { en: "Join all required groups to complete registration", uz: "Ro‘yxatdan o‘tishni yakunlash uchun barcha guruhlarga qo‘shiling", ru: "Вступите во все группы, чтобы завершить регистрацию" },
  "auth.groups.checking": { en: "Checking groups…", uz: "Guruhlar tekshirilmoqda…", ru: "Проверка групп…" },
  "auth.groups.none": { en: "No groups found. You can proceed.", uz: "Guruhlar topilmadi. Davom etishingiz mumkin.", ru: "Группы не найдены. Можно продолжить." },
  "auth.groups.joined": { en: "✓ Joined", uz: "✓ Qo‘shildingiz", ru: "✓ Вы вступили" },
  "auth.groups.notJoined": { en: "Not joined yet", uz: "Hali qo‘shilmagansiz", ru: "Ещё не вступили" },
  "auth.groups.join": { en: "Join →", uz: "Qo‘shilish →", ru: "Вступить →" },
  "auth.groups.refresh": { en: "🔄 Refresh Status", uz: "🔄 Holatni yangilash", ru: "🔄 Обновить статус" },
  "auth.groups.checkBtn": { en: "Checking…", uz: "Tekshirilmoqda…", ru: "Проверка…" },
  "auth.groups.checkFailed": { en: "Failed to check groups: {msg}", uz: "Guruhlarni tekshirib bo‘lmadi: {msg}", ru: "Не удалось проверить группы: {msg}" },

  // ── Discover ──────────────────────────────────────────────────────────────
  "discover.kicker": { en: "DISCOVER", uz: "KASHF ET", ru: "ЛЮДИ" },
  "discover.title": { en: "People", uz: "Odamlar", ru: "Люди" },
  "discover.noUsers": { en: "No users found", uz: "Foydalanuvchilar topilmadi", ru: "Никого не найдено" },
  "discover.badge.startup": { en: "Startup", uz: "Startap", ru: "Стартап" },
  "discover.badge.volunteer": { en: "Volunteer", uz: "Volontyor", ru: "Волонтёр" },
  "filter.all": { en: "All", uz: "Hammasi", ru: "Все" },

  // ── Project board (startup + volunteer) ───────────────────────────────────
  "startup.kicker": { en: "EXPLORE", uz: "KO‘RIB CHIQING", ru: "ОБЗОР" },
  "startup.title": { en: "Startup Board", uz: "Startap doskasi", ru: "Доска стартапов" },
  "volunteer.kicker": { en: "GIVE BACK", uz: "HISSA QO‘SHING", ru: "ПОМОГИ ДРУГИМ" },
  "volunteer.title": { en: "Volunteer", uz: "Volontyorlik", ru: "Волонтёрство" },
  "board.tab.browse": { en: "browse", uz: "ko‘rish", ru: "обзор" },
  "board.tab.myStartups": { en: "my startups", uz: "mening startaplarim", ru: "мои стартапы" },
  "board.tab.myVolunteering": { en: "my volunteering", uz: "mening loyihalarim", ru: "моё волонтёрство" },
  "board.tab.requests": { en: "requests", uz: "so‘rovlar", ru: "заявки" },
  "board.empty.myStartups": { en: "You haven't created any startups yet.", uz: "Siz hali startap yaratmagansiz.", ru: "Вы ещё не создали ни одного стартапа." },
  "board.empty.startups": { en: "No startups found.", uz: "Startaplar topilmadi.", ru: "Стартапы не найдены." },
  "board.empty.myVolunteering": { en: "You haven't joined any volunteering projects yet.", uz: "Siz hali volontyorlik loyihalariga qo‘shilmagansiz.", ru: "Вы ещё не присоединились к волонтёрским проектам." },
  "board.empty.volunteering": { en: "No volunteering projects found.", uz: "Volontyorlik loyihalari topilmadi.", ru: "Волонтёрские проекты не найдены." },
  "board.empty.reqStartups": { en: "No pending requests for your startups.", uz: "Startaplaringiz uchun kutilayotgan so‘rovlar yo‘q.", ru: "Нет заявок по вашим стартапам." },
  "board.empty.reqProjects": { en: "No pending requests for your projects.", uz: "Loyihalaringiz uchun kutilayotgan so‘rovlar yo‘q.", ru: "Нет заявок по вашим проектам." },
  "board.loadFailed": { en: "Failed to load: {msg}", uz: "Yuklab bo‘lmadi: {msg}", ru: "Не удалось загрузить: {msg}" },
  "board.newNotified": { en: "🔔 NEW — You were notified about this request", uz: "🔔 YANGI — Bu so‘rov haqida xabar berildi", ru: "🔔 НОВОЕ — вам пришло уведомление об этой заявке" },
  "board.accept": { en: "✓ Accept", uz: "✓ Qabul qilish", ru: "✓ Принять" },
  "board.decline": { en: "✗ Decline", uz: "✗ Rad etish", ru: "✗ Отклонить" },
  "board.membersN": { en: "👥 Members: {n}", uz: "👥 A’zolar: {n}", ru: "👥 Участников: {n}" },
  "board.volunteersN": { en: "👥 Volunteers: {n}", uz: "👥 Volontyorlar: {n}", ru: "👥 Волонтёров: {n}" },
  "board.regionsN": { en: "📍 Regions: {n}", uz: "📍 Hududlar: {n}", ru: "📍 Регионов: {n}" },
  "board.skillsN": { en: "💻 Skills: {n}", uz: "💻 Ko‘nikmalar: {n}", ru: "💻 Навыков: {n}" },
  "board.youreMember": { en: "✓ You're a member", uz: "✓ Siz a’zosiz", ru: "✓ Вы участник" },
  "board.youreVolunteer": { en: "✓ You're a volunteer", uz: "✓ Siz volontyorsiz", ru: "✓ Вы волонтёр" },
  "badge.fit": { en: "✓ Fit", uz: "✓ Mos", ru: "✓ Подходит" },
  "badge.notFit": { en: "✗ Not Fit", uz: "✗ Mos emas", ru: "✗ Не подходит" },
  "status.pending": { en: "⏳ Pending", uz: "⏳ Kutilmoqda", ru: "⏳ На рассмотрении" },
  "status.accepted": { en: "✓ Accepted", uz: "✓ Qabul qilingan", ru: "✓ Принято" },
  "status.declined": { en: "✗ Declined", uz: "✗ Rad etilgan", ru: "✗ Отклонено" },

  // ── Project form ──────────────────────────────────────────────────────────
  "pf.postStartup": { en: "Post Startup", uz: "Startap joylash", ru: "Разместить стартап" },
  "pf.postProject": { en: "Post Volunteering Project", uz: "Volontyorlik loyihasini joylash", ru: "Разместить волонтёрский проект" },
  "pf.basicInfo": { en: "Basic Info", uz: "Asosiy ma’lumotlar", ru: "Основное" },
  "pf.namePh": { en: "Project Name *", uz: "Loyiha nomi *", ru: "Название проекта *" },
  "pf.goalPh": { en: "One-liner description *", uz: "Bir qatorli tavsif *", ru: "Краткое описание *" },
  "pf.aboutPh": { en: "Detailed description: What are you building and why? *", uz: "Batafsil tavsif: nima quryapsiz va nega? *", ru: "Подробное описание: что и зачем вы создаёте? *" },
  "pf.contact": { en: "Contact", uz: "Aloqa", ru: "Контакт" },
  "pf.channelPh": { en: "Telegram Channel or Group Link (optional)", uz: "Telegram kanal yoki guruh havolasi (ixtiyoriy)", ru: "Ссылка на Telegram-канал или группу (необязательно)" },
  "pf.requirements": { en: "Requirements & Filters (Optional)", uz: "Talablar va filtrlar (ixtiyoriy)", ru: "Требования и фильтры (необязательно)" },
  "pf.ageRange": { en: "Age Range", uz: "Yosh oralig‘i", ru: "Возрастной диапазон" },
  "pf.on": { en: "On", uz: "Yoniq", ru: "Вкл" },
  "pf.off": { en: "Off", uz: "O‘chiq", ru: "Выкл" },
  "pf.genderLabel": { en: "Gender", uz: "Jins", ru: "Пол" },
  "pf.genderAny": { en: "Any", uz: "Farqi yo‘q", ru: "Любой" },
  "pf.genderMale": { en: "Male only", uz: "Faqat erkaklar", ru: "Только мужчины" },
  "pf.genderFemale": { en: "Female only", uz: "Faqat ayollar", ru: "Только женщины" },
  "pf.targetRegions": { en: "Target Regions", uz: "Maqsadli hududlar", ru: "Целевые регионы" },
  "pf.requiredSkills": { en: "Required Skills", uz: "Kerakli ko‘nikmalar", ru: "Требуемые навыки" },
  "pf.searchSkills": { en: "Search skills (e.g. React, Marketing)…", uz: "Ko‘nikmalarni qidirish (masalan, React, Marketing)…", ru: "Поиск навыков (напр. React, маркетинг)…" },
  "pf.addCustomSkill": { en: 'Press enter to add "{q}" as custom skill', uz: '"{q}" ni qo‘shish uchun Enter bosing', ru: 'Нажмите Enter, чтобы добавить «{q}»' },
  "pf.publishStartup": { en: "Publish Startup", uz: "Startapni e’lon qilish", ru: "Опубликовать стартап" },
  "pf.publishProject": { en: "Publish Project", uz: "Loyihani e’lon qilish", ru: "Опубликовать проект" },
  "pf.validation": { en: "Name, One-liner, and About fields are required!", uz: "Nom, bir qatorli tavsif va batafsil tavsif majburiy!", ru: "Поля «Название», «Краткое описание» и «Описание» обязательны!" },
  "pf.createFailed": { en: "Failed to create project", uz: "Loyihani yaratib bo‘lmadi", ru: "Не удалось создать проект" },

  // ── Project detail ────────────────────────────────────────────────────────
  "pd.yourProject": { en: "👑 Your Project", uz: "👑 Sizning loyihangiz", ru: "👑 Ваш проект" },
  "pd.youreMember": { en: "✓ You're a Member", uz: "✓ Siz a’zosiz", ru: "✓ Вы участник" },
  "pd.leave": { en: "Leave", uz: "Chiqish", ru: "Выйти" },
  "pd.pendingReview": { en: "⏳ Pending Review", uz: "⏳ Ko‘rib chiqilmoqda", ru: "⏳ На рассмотрении" },
  "pd.withdraw": { en: "Withdraw", uz: "Qaytarib olish", ru: "Отозвать" },
  "pd.accepted": { en: "✓ Application Accepted", uz: "✓ Ariza qabul qilindi", ru: "✓ Заявка принята" },
  "pd.declined": { en: "✗ Application Declined", uz: "✗ Ariza rad etildi", ru: "✗ Заявка отклонена" },
  "pd.notHiring": { en: "Not Currently Hiring", uz: "Hozircha qabul yo‘q", ru: "Набор закрыт" },
  "pd.apply": { en: "⚡ Apply to Join", uz: "⚡ Qo‘shilishga ariza", ru: "⚡ Подать заявку" },
  "pd.reqNotMet": { en: "✗ Requirements Not Met", uz: "✗ Talablarga mos emas", ru: "✗ Требования не выполнены" },
  "pd.submitting": { en: "Submitting…", uz: "Yuborilmoqda…", ru: "Отправка…" },
  "pd.about": { en: "About", uz: "Loyiha haqida", ru: "О проекте" },
  "pd.requiredSkills": { en: "Required Skills", uz: "Kerakli ko‘nikmalar", ru: "Требуемые навыки" },
  "pd.targetRegions": { en: "Target Regions", uz: "Maqsadli hududlar", ru: "Целевые регионы" },
  "pd.team": { en: "Team ({n})", uz: "Jamoa ({n})", ru: "Команда ({n})" },
  "pd.founder": { en: "👑 Founder", uz: "👑 Asoschi", ru: "👑 Основатель" },
  "pd.cofounder": { en: "Co-founder", uz: "Hammuassis", ru: "Сооснователь" },
  "pd.contact": { en: "Contact", uz: "Aloqa", ru: "Контакт" },
  "pd.ages": { en: "🎂 Ages {a}–{b}", uz: "🎂 Yosh {a}–{b}", ru: "🎂 Возраст {a}–{b}" },
  "pd.maleOnly": { en: "♂ Male only", uz: "♂ Faqat erkaklar", ru: "♂ Только мужчины" },
  "pd.femaleOnly": { en: "♀ Female only", uz: "♀ Faqat ayollar", ru: "♀ Только женщины" },
  "pd.regionN": { en: "Region {n}", uz: "{n}-hudud", ru: "Регион {n}" },
  "pd.confirmLeave": { en: "Are you sure you want to leave this project?", uz: "Loyihadan chiqmoqchimisiz?", ru: "Вы уверены, что хотите выйти из проекта?" },
  "pd.notQualified": { en: "You don't meet the requirements for this project.", uz: "Siz bu loyiha talablariga mos kelmaysiz.", ru: "Вы не соответствуете требованиям проекта." },

  // ── Settings / Profile ────────────────────────────────────────────────────
  "settings.title": { en: "Profile", uz: "Profil", ru: "Профиль" },
  "settings.editProfile": { en: "Edit Profile", uz: "Profilni tahrirlash", ru: "Редактировать профиль" },
  "settings.adminDashboard": { en: "🛠️ Admin Dashboard", uz: "🛠️ Admin panel", ru: "🛠️ Панель администратора" },
  "settings.signOut": { en: "Sign Out", uz: "Chiqish", ru: "Выйти" },
  "settings.openStartups": { en: "⚡ Open to Startups", uz: "⚡ Startaplarga ochiq", ru: "⚡ Открыт к стартапам" },
  "settings.openVolunteer": { en: "🤝 Open to Volunteer", uz: "🤝 Volontyorlikka ochiq", ru: "🤝 Открыт к волонтёрству" },
  "tag.skills": { en: "Skills", uz: "Ko‘nikmalar", ru: "Навыки" },
  "tag.knowledges": { en: "Knowledge", uz: "Bilimlar", ru: "Знания" },
  "tag.interests": { en: "Interests", uz: "Qiziqishlar", ru: "Интересы" },
  "tag.preparations": { en: "Preparing For", uz: "Tayyorlanmoqda", ru: "Готовится к" },
  "tag.goals": { en: "Goals", uz: "Maqsadlar", ru: "Цели" },

  // ── Edit profile ──────────────────────────────────────────────────────────
  "ep.title": { en: "Edit Profile", uz: "Profilni tahrirlash", ru: "Редактировать профиль" },
  "ep.firstName": { en: "First Name", uz: "Ism", ru: "Имя" },
  "ep.lastName": { en: "Last Name", uz: "Familiya", ru: "Фамилия" },
  "ep.required": { en: "Required", uz: "Majburiy", ru: "Обязательно" },
  "ep.birthYear": { en: "Birth Year", uz: "Tug‘ilgan yil", ru: "Год рождения" },
  "ep.birthYearRange": { en: "Must be between {min} and {max}", uz: "{min}–{max} oralig‘ida bo‘lishi kerak", ru: "Должно быть между {min} и {max}" },
  "ep.phone": { en: "Phone Number", uz: "Telefon raqami", ru: "Номер телефона" },
  "ep.phoneInvalid": { en: "Enter a valid phone number (e.g. +998911853616)", uz: "To‘g‘ri telefon raqamini kiriting (masalan, +998911853616)", ru: "Введите корректный номер (например, +998911853616)" },
  "ep.gender": { en: "Gender", uz: "Jins", ru: "Пол" },
  "ep.nameWarn": { en: "⚠️ Changing your name will update your tag in all your groups", uz: "⚠️ Ismni o‘zgartirsangiz, barcha guruhlardagi tegingiz yangilanadi", ru: "⚠️ Смена имени обновит вашу подпись во всех группах" },
  "ep.intentions": { en: "Intentions", uz: "Maqsadlar", ru: "Намерения" },
  "ep.workTitle": { en: "Open to Co-founding / Work", uz: "Hammuassislik / Ishga ochiq", ru: "Открыт к сооснованию / работе" },
  "ep.workSub": { en: "Join startups or find partners", uz: "Startaplarga qo‘shilish yoki hamkor topish", ru: "Присоединяться к стартапам или искать партнёров" },
  "ep.volTitle": { en: "Open to Volunteering", uz: "Volontyorlikka ochiq", ru: "Открыт к волонтёрству" },
  "ep.volSub": { en: "Help with community projects", uz: "Jamoa loyihalarida yordam berish", ru: "Помогать в общественных проектах" },
  "ep.tgUsername": { en: "Telegram Username", uz: "Telegram username", ru: "Имя пользователя Telegram" },
  "ep.tgUsernamePh": { en: "your_username", uz: "username", ru: "username" },
  "ep.auto": { en: "Auto", uz: "Avto", ru: "Авто" },
  "ep.language": { en: "Language", uz: "Til", ru: "Язык" },
  "ep.bio": { en: "Bio", uz: "Bio", ru: "О себе" },
  "ep.bioPh": { en: "Tell the community who you are…", uz: "Hamjamiyatga o‘zingizni tanishtiring…", ru: "Расскажите сообществу о себе…" },
  "ep.bioReanalyze": { en: "✨ AI will re-analyze your bio after saving", uz: "✨ Saqlangach, AI bio’ngizni qayta tahlil qiladi", ru: "✨ После сохранения ИИ заново проанализирует ваше описание" },
  "ep.saveChanges": { en: "💾 Save Changes", uz: "💾 O‘zgarishlarni saqlash", ru: "💾 Сохранить изменения" },
  "ep.updatingTags": { en: "Updating group tags…", uz: "Guruh teglari yangilanmoqda…", ru: "Обновление подписей в группах…" },
  "ep.saveFailed": { en: "Failed to save: {msg}", uz: "Saqlab bo‘lmadi: {msg}", ru: "Не удалось сохранить: {msg}" },
  "ep.noTgUsername": { en: "You don't have a Telegram username set.", uz: "Sizda Telegram username o‘rnatilmagan.", ru: "У вас не задано имя пользователя Telegram." },
  "ep.fetchFailed": { en: "Failed: {msg}", uz: "Xatolik: {msg}", ru: "Ошибка: {msg}" },

  // ── User profile modal ────────────────────────────────────────────────────
  "um.about": { en: "About", uz: "Haqida", ru: "О себе" },
  "um.openStartups": { en: "⚡ Open to Startups", uz: "⚡ Startaplarga ochiq", ru: "⚡ Открыт к стартапам" },
  "um.openVolunteer": { en: "🤝 Open to Volunteer", uz: "🤝 Volontyorlikka ochiq", ru: "🤝 Открыт к волонтёрству" },
  "um.empty": { en: "This user hasn't filled in their profile yet.", uz: "Bu foydalanuvchi hali profilini to‘ldirmagan.", ru: "Этот пользователь ещё не заполнил профиль." },

  // ── Admin ─────────────────────────────────────────────────────────────────
  "admin.title": { en: "Admin Panel", uz: "Admin panel", ru: "Панель администратора" },
  "admin.tab.dashboard": { en: "Dashboard", uz: "Boshqaruv", ru: "Сводка" },
  "admin.tab.users": { en: "Users", uz: "Foydalanuvchilar", ru: "Пользователи" },
  "admin.tab.projects": { en: "Projects", uz: "Loyihalar", ru: "Проекты" },
  "admin.tab.locations": { en: "Locations", uz: "Joylashuvlar", ru: "Локации" },
  "admin.stat.users": { en: "Total Users", uz: "Jami foydalanuvchilar", ru: "Всего пользователей" },
  "admin.stat.projects": { en: "Projects", uz: "Loyihalar", ru: "Проекты" },
  "admin.stat.regions": { en: "Regions", uz: "Hududlar", ru: "Регионы" },
  "admin.stat.schools": { en: "Schools", uz: "Maktablar", ru: "Школы" },
  "admin.stat.lcs": { en: "Learning Centers", uz: "O‘quv markazlari", ru: "Учебные центры" },
  "admin.searchUsers": { en: "Search by name or @username…", uz: "Ism yoki @username bo‘yicha qidirish…", ru: "Поиск по имени или @username…" },
  "admin.searchProjects": { en: "Search projects…", uz: "Loyihalarni qidirish…", ru: "Поиск проектов…" },
  "admin.verify": { en: "Verify", uz: "Tasdiqlash", ru: "Подтвердить" },
  "admin.verified": { en: "Verified", uz: "Tasdiqlangan", ru: "Подтверждён" },
  "admin.safeDelete": { en: "Safe Delete", uz: "Xavfsiz o‘chirish", ru: "Мягкое удаление" },
  "admin.makeUser": { en: "Make User", uz: "User qilish", ru: "Сделать юзером" },
  "admin.makeAdmin": { en: "Make Admin", uz: "Admin qilish", ru: "Сделать админом" },
  "admin.hardDelete": { en: "Hard Delete", uz: "Butunlay o‘chirish", ru: "Полное удаление" },
  "admin.safeDeleted": { en: "Safe Deleted", uz: "Xavfsiz o‘chirilgan", ru: "Мягко удалён" },
  "admin.approve": { en: "Approve", uz: "Tasdiqlash", ru: "Одобрить" },
  "admin.approved": { en: "Approved", uz: "Tasdiqlangan", ru: "Одобрено" },
  "admin.schools": { en: "Schools", uz: "Maktablar", ru: "Школы" },
  "admin.lcs": { en: "Learning Centers", uz: "O‘quv markazlari", ru: "Учебные центры" },
  "admin.editing": { en: "Editing: {name}", uz: "Tahrirlash: {name}", ru: "Редактирование: {name}" },
  "admin.nameField": { en: "Name", uz: "Nomi", ru: "Название" },
  "admin.namePh": { en: "Name", uz: "Nomi", ru: "Название" },
  "admin.region": { en: "Region (location)", uz: "Hudud (joylashuv)", ru: "Регион (локация)" },
  "admin.selectRegion": { en: "Select region…", uz: "Hududni tanlang…", ru: "Выберите регион…" },
  "admin.regionLabel": { en: "Region: {region}", uz: "Hudud: {region}", ru: "Регион: {region}" },
  "admin.position": { en: "Exact position (lat, long)", uz: "Aniq joylashuv (kenglik, uzunlik)", ru: "Точная позиция (широта, долгота)" },
  "admin.latitude": { en: "Latitude", uz: "Kenglik (latitude)", ru: "Широта" },
  "admin.longitude": { en: "Longitude", uz: "Uzunlik (longitude)", ru: "Долгота" },
  "admin.openMaps": { en: "📍 Open in Maps", uz: "📍 Xaritada ochish", ru: "📍 Открыть на карте" },
  "admin.posLabel": { en: "Position: {pos}", uz: "Joylashuv: {pos}", ru: "Позиция: {pos}" },
  "admin.delete": { en: "Delete", uz: "O‘chirish", ru: "Удалить" },
  "admin.addSchool": { en: "＋ Add school", uz: "＋ Maktab qo‘shish", ru: "＋ Добавить школу" },
  "admin.addLc": { en: "＋ Add learning center", uz: "＋ O‘quv markazi qo‘shish", ru: "＋ Добавить учебный центр" },
  "admin.create": { en: "Create", uz: "Yaratish", ru: "Создать" },
  "admin.creating": { en: "Creating…", uz: "Yaratilmoqda…", ru: "Создание…" },
  "admin.createFailed": { en: "Failed to create: {msg}", uz: "Yaratib bo‘lmadi: {msg}", ru: "Не удалось создать: {msg}" },
  "admin.useBotLoc": { en: "📍 Use my Telegram location", uz: "📍 Telegram joylashuvimdan foydalanish", ru: "📍 Использовать мою локацию из Telegram" },
  "admin.botLocNone": { en: "No location shared with the bot yet. Send a location to the bot first.", uz: "Botga hali joylashuv yuborilmagan. Avval botga joylashuv yuboring.", ru: "Локация боту ещё не отправлена. Сначала отправьте локацию боту." },

  // ── Invite / referral ─────────────────────────────────────────────────────
  "invite.title": { en: "Invite friends", uz: "Do‘stlarni taklif qiling", ru: "Пригласить друзей" },
  "invite.desc": { en: "Share your link. When someone you invite completes registration, it counts toward your rewards.", uz: "Havolangizni ulashing. Taklif qilgan insoningiz ro‘yxatdan to‘liq o‘tsa, bu mukofotlaringizga hisoblanadi.", ru: "Поделитесь ссылкой. Когда приглашённый завершит регистрацию, это засчитается к вашим наградам." },
  "invite.count": { en: "Invited (completed): {n}", uz: "Taklif qilingan (yakunlagan): {n}", ru: "Приглашено (завершили): {n}" },
  "invite.copy": { en: "Copy link", uz: "Havolani nusxalash", ru: "Копировать ссылку" },
  "invite.copied": { en: "Copied!", uz: "Nusxalandi!", ru: "Скопировано!" },
  "invite.share": { en: "Share", uz: "Ulashish", ru: "Поделиться" },
  "invite.shareText": { en: "Join me on Bright Futures Uzbekistan 🇺🇿", uz: "Bright Futures Uzbekistan’ga qo‘shiling 🇺🇿", ru: "Присоединяйся к Bright Futures Uzbekistan 🇺🇿" },

  // ── Location capture ──────────────────────────────────────────────────────
  "loc.label": { en: "Your location (optional)", uz: "Joylashuvingiz (ixtiyoriy)", ru: "Ваша локация (необязательно)" },
  "loc.why": { en: "Helps us connect you with nearby people and opportunities.", uz: "Sizni yaqin atrofdagi odamlar va imkoniyatlar bilan bog‘lashga yordam beradi.", ru: "Помогает связать вас с людьми и возможностями поблизости." },
  "loc.share": { en: "📍 Share my location", uz: "📍 Joylashuvni ulashish", ru: "📍 Поделиться локацией" },
  "loc.sharing": { en: "Getting location…", uz: "Joylashuv olinmoqda…", ru: "Определение локации…" },
  "loc.shared": { en: "✓ Location added", uz: "✓ Joylashuv qo‘shildi", ru: "✓ Локация добавлена" },
  "loc.failed": { en: "Couldn't get location. You can skip this.", uz: "Joylashuvni olib bo‘lmadi. Buni o‘tkazib yuborishingiz mumkin.", ru: "Не удалось определить локацию. Можно пропустить." },

  // ── Discover / match / verified ───────────────────────────────────────────
  "discover.forYou": { en: "For you", uz: "Siz uchun", ru: "Для вас" },
  "common.verified": { en: "Verified", uz: "Tasdiqlangan", ru: "Проверен" },

  // ── Connect / report ──────────────────────────────────────────────────────
  "intro.btn": { en: "👋 Request intro", uz: "👋 Tanishuv so‘rash", ru: "👋 Познакомиться" },
  "intro.sending": { en: "Sending…", uz: "Yuborilmoqda…", ru: "Отправка…" },
  "intro.sent": { en: "✓ Intro sent — they'll get a Telegram message.", uz: "✓ So‘rov yuborildi — ular Telegram orqali xabar oladi.", ru: "✓ Запрос отправлен — придёт сообщение в Telegram." },
  "intro.noUsername": { en: "Set a Telegram @username in your profile so they can reply.", uz: "Ular javob bera olishi uchun profilingizda Telegram @username o‘rnating.", ru: "Укажите Telegram @username в профиле, чтобы вам могли ответить." },
  "report.btn": { en: "Report", uz: "Shikoyat", ru: "Пожаловаться" },
  "report.prompt": { en: "Report this — describe the problem (optional):", uz: "Shikoyat — muammoni yozing (ixtiyoriy):", ru: "Пожаловаться — опишите проблему (необязательно):" },
  "report.sent": { en: "✓ Reported. Thank you.", uz: "✓ Shikoyat yuborildi. Rahmat.", ru: "✓ Жалоба отправлена. Спасибо." },

  // ── Invite leaderboard ────────────────────────────────────────────────────
  "invite.leaderboard": { en: "🏆 Top inviters", uz: "🏆 Eng faol takliflar", ru: "🏆 Лидеры приглашений" },
  "invite.you": { en: "You", uz: "Siz", ru: "Вы" },
  "invite.noLeaders": { en: "Be the first — invite a friend!", uz: "Birinchi bo‘ling — do‘stingizni taklif qiling!", ru: "Будьте первым — пригласите друга!" },

  // ── Admin reports ─────────────────────────────────────────────────────────
  "admin.tab.reports": { en: "Reports", uz: "Shikoyatlar", ru: "Жалобы" },
  "admin.report.row": { en: "{type} #{id} — by user {by}", uz: "{type} #{id} — {by} foydalanuvchidan", ru: "{type} #{id} — от пользователя {by}" },
  "admin.report.resolve": { en: "Resolve", uz: "Hal qilish", ru: "Решить" },
  "admin.report.reopen": { en: "Reopen", uz: "Qayta ochish", ru: "Открыть" },
  "admin.report.resolved": { en: "Resolved", uz: "Hal qilingan", ru: "Решено" },
  "admin.report.none": { en: "No reports.", uz: "Shikoyatlar yo‘q.", ru: "Жалоб нет." },
  "admin.act.deleteSchool": { en: "delete this school", uz: "bu maktabni o‘chirish", ru: "удалить эту школу" },
  "admin.act.deleteLc": { en: "delete this learning center", uz: "bu o‘quv markazini o‘chirish", ru: "удалить этот учебный центр" },
  "admin.groupIdPh": { en: "Group ID (e.g. -100…)", uz: "Guruh ID (masalan, -100…)", ru: "ID группы (напр. -100…)" },
  "admin.groupLinkPh": { en: "Group Link (https://t.me/…)", uz: "Guruh havolasi (https://t.me/…)", ru: "Ссылка на группу (https://t.me/…)" },
  "admin.idLabel": { en: "ID: {id} | Link: {link}", uz: "ID: {id} | Havola: {link}", ru: "ID: {id} | Ссылка: {link}" },
  "admin.set": { en: "Set", uz: "O‘rnatilgan", ru: "Задано" },
  "admin.none": { en: "None", uz: "Yo‘q", ru: "Нет" },
  "admin.userMeta": { en: "ID: {id} | tg: {tg} | {role}", uz: "ID: {id} | tg: {tg} | {role}", ru: "ID: {id} | tg: {tg} | {role}" },
  "admin.loadError": { en: "Error loading data: {msg}", uz: "Ma’lumotlarni yuklashda xatolik: {msg}", ru: "Ошибка загрузки данных: {msg}" },
  "admin.actionFailed": { en: "Action failed: {msg}", uz: "Amal bajarilmadi: {msg}", ru: "Действие не выполнено: {msg}" },
  "admin.saveFailed": { en: "Failed to save", uz: "Saqlab bo‘lmadi", ru: "Не удалось сохранить" },
  "admin.confirm": { en: "Are you sure you want to {action}?", uz: "{action} amalini bajarmoqchimisiz?", ru: "Вы уверены, что хотите: {action}?" },
  "admin.act.verifyUser": { en: "verify user", uz: "foydalanuvchini tasdiqlash", ru: "подтвердить пользователя" },
  "admin.act.unverifyUser": { en: "unverify user", uz: "tasdiqlashni bekor qilish", ru: "снять подтверждение" },
  "admin.act.softDeleteUser": { en: "soft delete user", uz: "foydalanuvchini xavfsiz o‘chirish", ru: "мягко удалить пользователя" },
  "admin.act.hardDeleteUser": { en: "hard delete user", uz: "foydalanuvchini butunlay o‘chirish", ru: "полностью удалить пользователя" },
  "admin.act.changeRole": { en: "change role to {role}", uz: "rolni {role} ga o‘zgartirish", ru: "изменить роль на {role}" },
  "admin.act.softDeleteProject": { en: "soft delete project", uz: "loyihani xavfsiz o‘chirish", ru: "мягко удалить проект" },
  "admin.act.hardDeleteProject": { en: "hard delete project", uz: "loyihani butunlay o‘chirish", ru: "полностью удалить проект" },
  "admin.act.approveProject": { en: "approve project", uz: "loyihani tasdiqlash", ru: "одобрить проект" },
  "admin.act.unapproveProject": { en: "unapprove project", uz: "tasdiqni bekor qilish", ru: "снять одобрение" },
};

function translate(lang, key, vars) {
  const entry = STRINGS[key];
  let s = entry ? (entry[lang] ?? entry.en) : key;
  if (vars) {
    for (const k of Object.keys(vars)) {
      s = s.replace(new RegExp(`\\{${k}\\}`, "g"), String(vars[k]));
    }
  }
  return s;
}

function detectInitial() {
  try {
    const saved = localStorage.getItem("bfu_lang");
    if (saved && SUPPORTED.includes(saved)) return saved;
  } catch { /* ignore */ }
  const tg = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code;
  if (tg) {
    const code = String(tg).slice(0, 2).toLowerCase();
    if (SUPPORTED.includes(code)) return code;
  }
  return "en";
}

const LanguageContext = createContext(null);

export const LanguageProvider = ({ children }) => {
  const [lang, setLangState] = useState(detectInitial);

  const setLang = useCallback((code) => {
    if (!SUPPORTED.includes(code)) return;
    setLangState(code);
    try { localStorage.setItem("bfu_lang", code); } catch { /* ignore */ }
  }, []);

  const t = useCallback((key, vars) => translate(lang, key, vars), [lang]);

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useT = () => {
  const ctx = useContext(LanguageContext);
  if (!ctx) return { lang: "en", setLang: () => {}, t: (k, v) => translate("en", k, v) };
  return ctx;
};
