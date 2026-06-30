# BFU Mini App — Full Redesign Brief (Batch G handoff for Claude Design)

> **Purpose.** This is the single document the founder feeds into **Claude Design** to drive a complete visual redesign of the Bright Futures Uzbekistan (BFU) Telegram Mini App. The app has just absorbed a large data + feature buildout (Batches A–F): rich profiles, a trust layer, connections/feeds, discovery, mentor booking, and analytics. The interface was built screen-by-screen and now needs to be **re-elevated as one coherent, professional, rich product**.
>
> **What this is NOT.** This is not an implementation plan. Do not have Claude Design (or anyone) hand-code the app from this. It is a design direction: brand truth + the current map + the new surfaces + per-screen direction. Designs come out of Claude Design; engineering wires them up afterward as a separate batch.
>
> **Stack reality (so designs stay buildable).** React 19 + Vite, all UI is **dark-first**, mobile-only (max content width **430px**, real-world floor **~360px Android**), rendered **inside Telegram**. Trilingual: **uz / ru / en**. No Tailwind in the app itself (the landing page uses it; the app uses CSS variables + inline styles). Keep the design system token-driven so it maps cleanly to the existing CSS variables.

---

## 1. Brand system (use these EXACTLY — do not invent new colors)

The app's canonical theme lives in `src/components/Shared.jsx` (the `FontLoader` `:root` block). The marketing landing page (`public/landing/index.html`) shares the same palette. These two must stay visually consistent.

### 1.1 Colors (hex — authoritative)

| Token | Hex | Role |
|---|---|---|
| `--bg` | `#0A0A0F` | App background (near-black, slight violet) |
| `--surface` | `#13131A` | Card background (default raised surface) |
| `--surface-2` | `#1C1C28` | Inputs, chips, secondary buttons, inner tiles |
| `--surface-3` | `#252535` | Highest surface / pressed / skeleton highlight |
| `--accent` | `#7B6FFF` | **Primary brand violet** — CTAs, active states, links |
| `--accent-2` | `#A78BFA` | Lighter violet — gradients, mentor accents, secondary |
| `--accent-dim` | `rgba(123,111,255,0.15)` | Accent tint fills (active chips, badges) |
| `--accent-glow` | `rgba(123,111,255,0.35)` | Button glow / shadow |
| `--coral` (`--accent` of "danger/intentions") | `#FF6B6B` | Errors, report, "open to startups" badge, unread dot |
| `--mint` | `#4ECDC4` | Volunteering, success, "active" status, knowledge tag |
| `--amber` | `#FFB347` | Ratings (stars), warnings, deadlines, connector/inviter badges, interests |
| `--text` | `#F0F0FF` | Primary text (near-white, slight violet) |
| `--text-2` | `#A6A6C0` | Secondary text / body copy |
| `--text-3` | `#83839B` | Muted / labels / placeholders |
| `--border` | `rgba(255,255,255,0.07)` | Hairline borders everywhere |

**Semantic color usage (already established — keep consistent):**
- **Violet `#7B6FFF`** = the spine of the brand. Discover, primary CTAs, verified ✓, links, founder/cofounder.
- **Mint `#4ECDC4`** = volunteering + "active/positive" everywhere.
- **Amber `#FFB347`** = ratings/stars, deadlines, warnings, status badges.
- **Coral `#FF6B6B`** = destructive / report / "open to startups" intention / unread.
- **`#A78BFA`** = mentor mode + "interest" + softer secondary accent.
- Tag categories have fixed colors: **skills → violet, knowledge → mint, interests → amber, preparing-for → `#A78BFA`, goals → coral.** (See `UserProfileModal.TAG_COLORS`.) Preserve this mapping.

### 1.2 Typography

- **Display / headings:** `Syne` (weights 500–800). Letter-spacing tight (`-0.02em` on big text). Used for titles, names, stat numbers, nav labels, buttons.
- **Body:** `DM Sans` (weights 300–700). All paragraph + UI copy.
- Fonts loaded from Google Fonts. Keep both; do not introduce a third family.
- Pattern: tiny **uppercase section labels** — `Syne`, 11px, weight 700, `letter-spacing: 0.12em`, `--text-3`. This "section-label" is a recurring rhythm device; keep it.

### 1.3 Radius, spacing, elevation

- `--radius: 16px` (cards), `--radius-sm: 10px` (buttons, inputs, inner tiles), `--radius-xs: 6px` (tags). Bottom sheets use **24px** top corners. Pills/chips use **20px–99px**.
- Spacing rhythm: screen gutter **20px**, card padding **16px**, inter-card gap **12px**, section gap **18px**.
- Elevation is done with **subtle borders + accent glow**, not heavy drop shadows. Primary buttons get `box-shadow: 0 4px 24px var(--accent-glow)`.

### 1.4 Existing visual language (preserve + elevate, don't replace)

- **Gradient accents.** `linear-gradient(135deg, #7B6FFF, #A78BFA)` for hero CTAs / story share; `linear-gradient(135deg, var(--accent-dim), var(--surface-2))` for "special" cards (invite card). Landing page leans harder into mesh-gradient blobs, animated gradient text sweep, dot-grid overlays, hairline shimmer — **the app can borrow more of this energy**; today it is comparatively flat.
- **Chips & tags.** Pill chips (`.chip`), colored category tags (`.tag`), status badges (rounded 99px, tinted bg + colored text). These are everywhere and are good — make them more consistent.
- **Cards.** `.card` = `--surface` + hairline border + 16px radius. The dominant unit. The redesign should give cards more hierarchy (cover imagery, avatars, richer headers) rather than the current uniform flat rows.
- **Avatars.** Initial-based fallback with a deterministic color from a 6-color set (`#7B6FFF #FF6B6B #4ECDC4 #FFB347 #A78BFA #34D399`), ringed border. Keep.
- **Skeletons.** Shimmer loaders already exist (`.skeleton`, `SkeletonList`). Keep + extend to every new surface.
- **Motion.** `fadeUp`, `slideUp` (sheets), staggered list entrance. Subtle, fast (0.2–0.35s). Keep restrained — this is inside Telegram, not a showcase site.

---

## 2. Current information architecture & navigation map

### 2.1 Shell

- Single-column mobile app, **max-width 430px**, centered, `height: 100dvh`, `overflow: hidden`. Lives inside `MiniApp()` in `src/App.jsx`.
- **Bottom tab bar** (`BottomNav` in `Shared.jsx`), fixed, frosted (`rgba(13,13,20,0.95)` + `blur(20px)`), 5 tabs. Active tab = violet, with a small top indicator bar.
- Auth/registration is a separate full-screen flow shown when not registered.
- A **deny banner** can pin to the top (red) when an admin has rejected profile fields, forcing the user into Settings/Edit.

### 2.2 Five bottom-nav tabs

| Tab | Icon | Screen | What it is |
|---|---|---|---|
| **Discover** | compass | `DiscoverScreen` | People feed — the home screen. Filters, sort, search/map/roles/inbox actions. |
| **Startups** | rocket | `StartupScreen` | Startup projects: Browse / My Startups / Requests tabs. |
| **Volunteer** | heart | `VolunteerScreen` | Volunteer projects — same structure as Startups. |
| **Events** | 📅 (emoji) | `EventsScreen` | Opportunities feed: hackathons, grants, scholarships, meetups. |
| **Profile** | settings | `SettingsScreen` | Own profile + invite/leaderboard + entry to Edit, Mentors, Admin. |

### 2.3 Modals, sheets & sub-screens (overlay layer)

These open *over* the tabs — they are where most of the new richness lives.

- **`UserProfileModal`** (bottom sheet, 88dvh) — the most important surface. Another user's full profile: header (avatar, name, ✓, @username, badges, age/gender, follower count), connect actions (Follow, Intro, Chat, Interest, Report), AI "Why you match", AI icebreakers, intentions, **mentor card + Book**, about (+AI translate), category tag groups (with **skill endorsement** buttons), `ProfileExtras` (stats/projects/portfolio/rating/mutuals/collaborators), and **vouches**.
- **`ProjectDetail`** (bottom sheet) — full project: goal, about, fit badge, members (w/ roles), skills/regions/age/gender requirements, **project updates feed**, **open roles** (apply inline), follow, and creator-only stats.
- **`ProjectForm`** — create/edit a project (inline in Startup/Volunteer "post" tab).
- **`InboxModal`** — Activity (notifications) + Connections (matches) tabs.
- **`SearchModal`** — global search: People / Projects / Events.
- **`MapModal`** — SVG heatmap of Uzbekistan, member/project density per region.
- **`OpenRolesScreen`** — searchable cross-project open-roles list.
- **`MentorsScreen`** — directory of mentors.
- **`MentorSheets`** — `BookSlotSheet` (mentee books), `MentorSlotsSheet` (mentor manages slots), `BookingsSheet` (history).
- **`RateSheet`** — post-project rating of cohort members.
- **`PartnersModal`** — partner directory + opportunity posting (partner owners).
- **`EditProfileScreen`** — full-screen own-profile editor (incl. mentor-mode fields, portfolio links, currently-building, location).
- **`AdminScreen`** — full-screen admin console (Dashboard / Users / Projects / Locations / Reports / Events / Partners / Broadcast).
- **`AuthScreen`** — multi-step registration wizard.

### 2.4 Sitemap (concise)

```
MiniApp (max 430px, dark, bottom tabs)
├── [tab] Discover ........ people feed
│        ├── SearchModal · MapModal · OpenRolesScreen · InboxModal (header actions)
│        └── UserProfileModal → MentorSheets.BookSlotSheet
├── [tab] Startups ........ Browse / Mine / Requests → ProjectDetail · ProjectForm
├── [tab] Volunteer ....... Browse / Mine / Requests → ProjectDetail · ProjectForm
├── [tab] Events .......... feed + filters → PartnersModal
└── [tab] Profile ......... own profile + invite/leaderboard + achievements
         ├── EditProfileScreen
         ├── MentorsScreen · MentorSlotsSheet · BookingsSheet
         ├── RateSheet (post-project)
         └── AdminScreen (admins only) — 8 tabs

Public / outside Telegram (browser):
├── /            → marketing Landing (public/landing)
├── /r/{id}      → RegionLandingScreen
└── /u/{id}      → PUBLIC WEB PROFILE  ← NEW (Batch B), needs design (see §3)
```

---

## 3. New data surfaces to design for (the WHY of this redesign)

Batches A–F added a lot of data and a few whole features. Much of it is currently bolted onto existing screens as plain rows and small badges — it needs **first-class visual treatment**. Group the redesign effort around these:

### A — Rich profile
- **Founded vs joined projects** (separate lists, active/closed status).
- **Live stats** — projects founded / joined / applications accepted (stat tiles).
- **Currently building** — a "what I'm working on right now" highlight.
- **Portfolio links** — free-form labeled links (pill buttons today).
> Today these stack as small `surface-2` rows at the bottom of the profile sheet. They deserve a real "profile body" with hierarchy.

### B — Trust layer
- **Skill endorsements** — 👍 counts on each skill tag, tappable to endorse.
- **Vouches** — short written testimonials with author attribution.
- **Ratings** — ★ average + count, from post-project rating.
- **Mutual connections** — preview avatars + count.
- **Verified ✓ + badges** — verified, early-adopter 🌱, connector 🤝, top-inviter 🏆.
- **Public web profile `/u/{id}`** — a **browser-facing, shareable profile page** (outside Telegram). This barely exists visually and is a flagship "make us look professional" surface. Needs its own responsive design (works on desktop + mobile web, OG image, shareable).
> Trust signals are scattered (a star here, a badge there, vouches at the very bottom). The redesign should make BFU *feel* trustworthy by composing these into a coherent reputation presentation. **Note:** a numeric/tiered reputation score is DEFERRED (founder decision) — design the trust block so a score can slot in later without a re-layout.

### C — Connections
- **Follow** (users *and* projects) + follower counts.
- **Project updates feed** — founders post updates; followers/members see them (currently a plain left-border list inside ProjectDetail).
- **Role-specific apply** — apply to a *named role*, not just "the project".
- **Mentor mode + in-app booking/calendar** — full flow: mentor card on profile → pick a slot → booking states (requested/confirmed/declined) → both-sides history. This is a multi-step flow that currently lives in functional-but-plain bottom sheets.

### D — Discovery & org
- **Open roles list** — searchable across all projects (currently a thin list).
- **Frequent collaborators** — derived "people you build with most" (avatars + shared-project count).
- **Achievements / quests** — earned + locked badges with progress bars (2-col grid today).
- **Project group chat** — deep-link "open the group" flow (bots can't create groups).

### E — Analytics & admin (⚠ mostly NOT YET in the UI — design from scratch)
- **Founder funnel** — views → apply → accept conversion. *No screen exists yet.*
- **Cohort retention**, **region heatmap** (the `MapModal` is the seed), **skill-gap report**. *Backend-side; no real dashboard in the app yet — only `/admin/stats` (5 number cards).*
> This is the biggest "design from nothing" opportunity. The current Admin **Dashboard** tab is five flat stat cards. The redesign should propose a proper **analytics dashboard** (funnel visualization, retention curve, region heatmap reusing the Uzbekistan SVG, skill-gap bars) that lives in/alongside the Admin console. Keep it dark, on-brand, and legible on a phone.

### F — Extras
- **Resume/CV export (PDF)** from the profile.
- **Bot inline mode** — share a project into any chat (share affordances).
- **Sticker pack** — assets (out of scope for screen design, but the brand should extend to stickers).

---

## 4. Screen-by-screen redesign direction

> Format per screen: **Current** (1 line) · **Problems** · **Direction**. Keep designs dark-first, ≤430px, and trilingual-safe. Feed these to Claude Design one screen at a time (§6).

### 4.1 Discover (home) — `DiscoverScreen`
- **Current:** Header (kicker + title + 4 round action buttons), a sort `<select>` + "verified only" toggle + horizontal filter chips, then a flat list of person cards (avatar, name, ✓, intention badges, age/gender, 80-char bio, up to 4 skill tags).
- **Problems:** This is the *home* screen but reads like a settings list — low energy, weak hierarchy, the 4 header icons compete with the title, the sort dropdown looks like a form control, person cards are uniform and don't surface the new trust signals (rating, mutuals, endorsements).
- **Direction:** Make this the *flagship* screen. Give it a confident header (consider a subtle mesh-gradient/dot-grid band borrowing from the landing page). Promote **"For You"** (AI match) as the default, visually distinct mode. Redesign the person card into a richer unit: larger avatar, name + verified + a **trust strip** (★ rating · mutuals · top endorsed skill), intention badges, and 1–2 standout skills — so users feel the depth of profiles before tapping. Turn the sort/filter row into proper segmented controls / chip filters. Keep the 4 actions (search, map, roles, inbox) but make them feel like a deliberate toolbar, with the unread inbox badge clear.

### 4.2 User Profile — `UserProfileModal` (highest priority)
- **Current:** 88dvh bottom sheet. Header → a wall of action buttons (Follow/Intro/Chat/Interest/Report) → "Why match" → "Icebreakers" → intentions → mentor card → about → tag groups (skills endorsable) → ProfileExtras → vouches.
- **Problems:** Everything is stacked vertically at one altitude — 5+ action buttons wrap awkwardly, AI tools (match/icebreakers) look like more buttons, and the genuinely impressive content (projects, stats, ratings, vouches, endorsements) is buried below the fold. On a 360px screen this is a long, flat scroll.
- **Direction:** This is the surface that must scream "professional." Give it a clear **identity header** (avatar, name, ✓, badges, @username, follower/rating summary inline). Collapse actions into a **primary CTA + an overflow** (Intro primary; Follow/Chat secondary; Interest/Report tucked away). Treat AI tools (Why-match, Icebreakers, Translate) as a distinct, lighter "AI assist" affordance, not peer buttons. Compose the body into legible sections with the section-label rhythm: **Trust** (rating, endorsements, vouches, mutuals together), **Building** (currently-building + projects + stats), **Skills/Interests** (tag groups), **Mentor** (if any). Consider light internal tabs or anchored sections if it gets long. Endorsement and vouch interactions should feel rewarding (micro-animation on tap).

### 4.3 Public Web Profile — `/u/{id}` (NEW, browser, flagship)
- **Current:** Effectively non-designed (a route exists; this is a from-scratch surface).
- **Problems:** This is what people share *outside* Telegram — on it rests BFU's external credibility. It must look like a polished personal page, responsive on desktop and mobile web, with a strong OG/share image.
- **Direction:** Design a standalone **dark, on-brand profile page** (can be richer than the in-app sheet — wider layout on desktop, hero with avatar + name + verified + headline/"currently building", trust block with rating + endorsements + vouches, project portfolio grid, links, and a clear "Open in Telegram / Join BFU" CTA). Mirror the landing page's polish (gradient accents, dot grid) since both are public-facing. Provide an OG share card design too.

### 4.4 Startups & Volunteer — `StartupScreen` / `VolunteerScreen`
- **Current:** Top tabs (Browse / Mine / Requests), a "+" to post, and a list of project cards with status badges; Requests shows applicant cards with accept/decline.
- **Problems:** Two near-identical screens; project cards are text-heavy and flat (no imagery, weak signal of what the project *is*); the three modes (browse/mine/requests) aren't visually distinct; applicant management feels utilitarian.
- **Direction:** Redesign the **project card** as the hero unit: type glyph/cover, name + goal, a compact requirements row (skills · regions · age), member avatars stack, **open-roles count**, and a fit indicator. Differentiate the three tabs (browse = discovery energy; Mine = management; Requests = an inbox/triage feel with clear accept/decline). Unify Startup & Volunteer under one design language differentiated only by accent (violet vs mint) so they read as siblings, not duplicates.

### 4.5 Project Detail — `ProjectDetail`
- **Current:** Bottom sheet: name, goal, about, fit badge, members w/ roles, requirement chips, **updates feed** (left-border list), **roles** (apply inline), follow, creator stats.
- **Problems:** A lot of distinct content types (description, people, requirements, updates, roles, stats) share one flat scroll; the updates feed and the open-roles — both new, both important — look like minor lists; creator stats are an afterthought.
- **Direction:** Give the sheet a strong header (project identity + follow + primary action). Section the body clearly: **About/requirements**, **Team** (avatar-rich, roles as chips), **Open roles** (each a real apply affordance — this is a key conversion point), **Updates** (make it feel like a feed/timeline, the social heart of the project), and a **group-chat** entry. For creators, give stats a small dashboard treatment (views/applies/accepts) rather than inline numbers.

### 4.6 Events — `EventsScreen`
- **Current:** Category filter chips + a feed of event cards (cover image, type, deadline in orange, description, matched ✨, external link).
- **Problems:** Closest to "good" already, but cards can feel generic; deadlines (the scarcity hook) and "matched for you" signal could be stronger; Partners is hidden behind one button.
- **Direction:** Keep the feed model; strengthen the card (cover treatment, prominent **type badge** + **deadline urgency**, "matched for you" as a real highlight). Make category filters feel like a polished segmented row. Surface Partners more intentionally (it's where opportunities originate).

### 4.7 Profile (own) — `SettingsScreen`
- **Current:** Own profile summary, completion meter, tag chips, gradient **invite card + leaderboard**, achievements grid, mentor availability, and entries to Edit / Mentors / Admin.
- **Problems:** Mixes identity, growth (invite), gamification (achievements), and admin/utility into one long scroll; the invite card is the most polished thing on the screen while the actual *profile* is plain; achievements and mentor controls fight for attention.
- **Direction:** Lead with **identity** — show the user their own profile the way others see it (preview of the rich profile, with a completion nudge). Then a clear **Build/Trust** summary (your stats, achievements as a tidy showcase). Keep the invite/referral + leaderboard as a distinct, rewarding module (it's good — make the rest match its quality). Group utilities (Edit, Mentor mode, Admin, language, sign-out) into a clean settings cluster, visually separated from the profile/gamification content.

### 4.8 Achievements — `AchievementsSection`
- **Current:** 2-col grid; earned = accent-dim full-opacity, locked = dimmed with a thin progress bar.
- **Problems:** Reads as a minor sub-section; locked/earned contrast is weak; progress feels incidental.
- **Direction:** Make achievements feel like a **rewarding collection** — distinct earned vs locked states, satisfying progress visualization, and a sense of "what's next." Consider a hero "latest unlocked" moment. This is cheap dopamine that makes the app feel alive; give it polish.

### 4.9 Mentors directory + booking — `MentorsScreen` / `MentorSheets`
- **Current:** Mentor list (avatar, topics, open-slots count); booking via plain bottom sheets with `datetime-local` inputs and state badges.
- **Problems:** Mentor mode is a flagship feature (full in-app booking) but presents as a basic list + raw form controls; booking states (requested/confirmed/declined) aren't visually clear; the calendar/slot picking is unstyled.
- **Direction:** Elevate mentors into **credible expert cards** (photo, headline, topics, rating, availability-at-a-glance). Redesign the booking flow as a real **calendar/slot picker** (not a bare datetime input) with clear states and confirmations. For mentors managing their own slots, give a clean availability manager. Make `BookingsSheet` a legible two-sided history with status pills.

### 4.10 Open Roles — `OpenRolesScreen`
- **Current:** Debounced search + a thin list of role rows (project glyph + role + project name).
- **Problems:** A genuinely useful discovery feature presented as a bare search list; no sense of project context or urgency.
- **Direction:** Make each role a richer result (role title, project + type, key required skills, maybe member count / fit), grouped or filterable, with a fast path to apply. This should feel like a job board, tuned for BFU.

### 4.11 Inbox / notifications — `InboxModal`
- **Current:** Two tabs (Activity, Connections); notification rows with actor avatar, type emoji, text, timestamp, unread dot.
- **Direction:** Keep the two-tab model; tighten the row design, group by time (Today / This week), make unread state and actionable items (e.g. "rate your cohort", "accept request") visually distinct and tappable. This is the re-engagement surface — make it feel current.

### 4.12 Search — `SearchModal`
- **Current:** Search input + results grouped People / Projects / Events with type badges.
- **Direction:** Strong, focused search field; clearer result grouping and per-type result design (people show trust signals, projects show type/roles, events show deadline). Add empty/initial states (suggestions, recent).

### 4.13 Map / region heatmap — `MapModal`
- **Current:** SVG Uzbekistan, regions opacity-ramped by member density, selected-region stat card.
- **Direction:** Keep the SVG map (it's distinctive). Improve the density legend, selection state, and the stats card. **Reuse this exact map** as the basis for the admin **region heatmap** analytics (§4.16) so the two share a visual language.

### 4.14 Partners — `PartnersModal`
- **Current:** Partner directory (logo/initials, ✓, about) + opportunity-posting form for partner owners; partner profile view with events/opportunities.
- **Direction:** Give partners a **credible directory** look (logo cards, verification, what they offer). The owner-side posting flow should feel like a clean mini-CMS. Partner profiles should showcase their opportunities like a mini event feed.

### 4.15 Edit Profile — `EditProfileScreen`
- **Current:** Full-screen form: personal fields, intention toggle cards, Telegram username, bio (with AI "improve"), currently-building, portfolio links (max 5), location share, mentor-mode fields; inline validation + warning banners.
- **Problems:** A long single form; lots of distinct concepts (identity, intentions, social, portfolio, mentor) in one scroll; warning banners (name change, bio re-review) and denied-field states need to be clear without being scary.
- **Direction:** Keep it a focused form but **section it** (Identity · Intentions · About & portfolio · Mentor mode · Location), with the AI-assist (bio improve) and the toggle cards as polished, reassuring controls. Make validation and the "this change needs re-review" warnings legible and calm. The intention toggle cards are good — extend that pattern.

### 4.16 Admin console + analytics — `AdminScreen` (+ NEW dashboards)
- **Current:** Full-screen, 8 tab-pills: **Dashboard** (5 flat stat cards), Users, Projects, Locations, Reports, Events, Partners, Broadcast — all dense management lists.
- **Problems:** It's functional but utilitarian; the **Dashboard** tab is just five numbers; the richer Batch E analytics (**funnel, cohort retention, region heatmap, skill-gap**) have **no UI at all yet**.
- **Direction:** Two jobs. (1) **Tidy the management tabs** into a consistent admin design language (clear tab nav, scannable rows, safe destructive actions, status badges). (2) **Design the analytics dashboards from scratch**: a **funnel** (views → apply → accept) visualization, a **retention** curve/cohort grid, a **region heatmap** (reuse the Uzbekistan SVG), and a **skill-gap** bar chart. All dark, on-brand, phone-legible (charts must survive 360px — prefer horizontal bars, compact funnels, and the map over dense multi-series line charts). This is the centerpiece of the "founder/admin looks professional" goal.

### 4.17 Auth / registration — `AuthScreen`
- **Current:** Multi-step wizard (language → basic info → location → about → intentions → group confirmations) with an animated gradient progress bar, "Step X of Y", group-join verification cards, animated welcome card.
- **Direction:** This is the **first impression** — make it feel premium and effortless. Keep the stepper but elevate the welcome moment (lean into landing-page energy), make each step feel light (one decision at a time), and make the group-join verification + location steps clear and trustworthy. Strong finish on "Complete Registration".

---

## 5. Cross-cutting requirements (apply to EVERY screen)

### 5.1 Telegram Mini App constraints
- **Runs inside Telegram's webview.** Telegram draws its own **close / collapse** buttons in a reserved strip at the very top. Headers must clear them: the app exposes `--safe-t` (content-safe top inset; see `tg.js`). **Never place tappable UI flush to the top edge** — pad by `--safe-t`.
- **Bottom safe area:** `--safe-b` (`env(safe-area-inset-bottom)`); the bottom nav already accounts for it. Honor it on any bottom-mounted CTA or sheet.
- **Header & background colors** are set to `#0A0A0F` via the SDK — designs must assume that exact chrome color so there's no seam.
- **Native feel:** haptics fire on key actions; vertical swipes are disabled (the app manages its own scroll). Bottom sheets that slide up from the bottom are the established modal idiom — keep using them. Avoid patterns that fight Telegram's gestures.
- **No browser chrome** — there's no URL bar, no native back button reliably; in-app back affordances (header back arrows, sheet close) must be explicit.

### 5.2 Responsive / small screens
- Design at **390–430px**, but **everything must hold at ~360px** (common cheap Android). Watch button rows that wrap (the profile action row already wraps badly), 3-up stat tiles, and chip rows.
- Single column only. Horizontal scroll is acceptable for chip/filter rows and avatar stacks, nowhere else.
- Minimum tap target ~36–44px (already enforced on buttons).

### 5.3 Trilingual (uz / ru / en) — text expansion
- All copy comes from `src/i18n.jsx`. **Russian and Uzbek run noticeably longer than English** — never design to pin English text widths. Buttons, chips, badges, nav labels, and section titles must tolerate ~1.4× longer strings without clipping or breaking layout. Prefer wrapping/auto-size over truncation for meaningful labels. Test mentally in Russian (the longest).
- Nav labels are short by design (`Discover/Kashf et/Люди`) — keep new labels short and translatable.

### 5.4 Dark-first, performance, accessibility
- **Dark is the only theme.** No light mode. All surfaces are near-black with violet undertone; maintain contrast (`--text` on `--bg` is the baseline; don't drop body copy below `--text-2` for anything important).
- **Performance:** keep imagery light, animations short and GPU-friendly (transform/opacity only). Skeletons for every async surface. This runs on mid/low-end Android over Uzbek mobile networks — favor crisp, lightweight design over heavy effects (save the heaviest gradient/mesh work for the public web profile and landing, not the in-app hot paths).
- **Contrast & legibility:** colored-on-tinted text (e.g. mint text on mint-15% bg) must stay readable; verify the trust/badge colors against their tinted backgrounds.

---

## 6. How to use this with Claude Design

1. **Lock the brand first.** Paste §1 (colors, fonts, radius, the existing visual-language notes) into Claude Design as the design-system foundation before generating any screen. Every output must use these exact tokens — the redesign should look like *the same product, leveled up*, not a different app.
2. **Feed screens one at a time.** Use §4 screen-by-screen. For each, give Claude Design: the **Current** + **Problems** + **Direction** lines, the relevant **new data surfaces** from §3, and the **cross-cutting** rules from §5. Generate, react, iterate on that one screen, then move on.
3. **Start with the two flagships:** the **User Profile** (§4.2) and the **Public Web Profile** (§4.3) — they carry the most "make us look professional" weight and set the bar for everything else. Then Discover (§4.1) as the home, then the analytics dashboards (§4.16) as the from-scratch showcase.
4. **Keep components consistent.** Cards, chips, badges, avatars, section labels, bottom sheets, stat tiles, and the bottom nav recur everywhere — design them once as shared components and reuse, so the whole app feels unified.
5. **Respect the constraints in every frame:** dark, ≤430px (check 360px), `--safe-t` top padding, Telegram-native sheet idiom, and trilingual text room.
6. **Export** each finished screen, keep them in a shared design file/library, and hand off to engineering as **Batch H (implementation)** — this redesign is *not* auto-coded from this brief.

---

### Appendix — file pointers (for engineering wiring, not for Design)
- Brand tokens (authoritative): `src/components/Shared.jsx` → `FontLoader` `:root`. Landing mirror: `public/landing/index.html`.
- Shell + nav: `src/App.jsx` (`MiniApp`), `src/components/Shared.jsx` (`BottomNav`, `Page`, `AvatarEl`, `SkeletonList`, buttons/chips/cards CSS).
- Telegram glue + safe-area: `src/tg.js`. i18n: `src/i18n.jsx`. API surface: `src/api.js`.
- Screens: `src/screens/*`. Overlays/components: `src/components/*`.
- Public profile route `/u/{id}` and region `/r/{id}` are handled outside `MiniApp` (see `src/App.jsx` routing + `RegionLandingScreen.jsx`).
- **Note:** `FounderFunnel.jsx` does **not** exist yet — the founder funnel and the other Batch E analytics dashboards (§4.16) are to be designed from scratch.
