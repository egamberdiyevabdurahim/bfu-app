# BFU Desktop v2 — locked roadmap (2026-07-08)

Decisions from founder review of the 72 annotated screenshots. Source feedback:
[2026-07-08-founder-screenshot-feedback.md](./2026-07-08-founder-screenshot-feedback.md).

## Locked decisions
- **Sidebar:** rebuild as a Hybrid (Option B structure — primary action, unified search, attention badges, online presence dot, "Powered by Marstiff" credit) + Option A's calmer grouped labels, **plus a collapse toggle**. Fixes: scrollable, sticky active state (no jump-to-top), correct active mapping.
- **Messaging (in-app, native — NOT Telegram, because many profiles have no username):** v1 = **1:1 DMs + project team chats**, with block + report + rate-limit + Telegram push notification on new message.
- **Empty city:** seed/import real builders **and** design graceful "early city" states.
- **i18n:** Uz/Ru/En across the whole desktop app; founder spot-checks Uzbek.
- **Who viewed your profile:** named viewers + (later) a private-browse toggle.
- **Onboarding:** 3–4 skippable first-login steps (region → bio w/ AI coach → follow 3 / see city → optional start project).
- **Mobile/responsive:** deferred to a separate build.

## Round 1 — Make it work (bugs + quick wins)
1. City filter pills actually filter results (not just the header).
2. Projects filter pills actually filter (fix the cards+"nothing here" contradiction).
3. Profile dropdown menu (View public profile / Edit profile / Log out) works.
4. Nav active-state mapping (Connections ≠ People).
5. Sidebar scroll + no scroll-jump after click (folded into the sidebar rebuild).
6. Owned-project card (`/projects/mine`) is clickable → opens project.
7. City "Threads / Just arrived" applies a real filter (or removed).
8. Segmented control active tab clearly enlarges/fills (events "For you").
9. Remove underlines on city/projects card titles+goals (weight/color for hierarchy).
10. Mentors: mark own card "it's you" (no self-booking).
11. "Powered by Marstiff" logo in every page footer. **Need logo file.**
12. Reusable pagination on every growable list (Places/Schools/Learning Centers, Users, Projects, audit log, error log).
13. Sidebar Hybrid + collapse rebuild.
14. Verify/fix live backend errors seen in the error log (portfolio_links validation, avatar_url import).

## Round 2 — Make it valuable
- Home → real dashboard: "needs you now" (pending applicants, intros, session requests, unread), your pulse (profile/project views, followers this week), city tonight, 2–3 contextual quick actions. Kills the nav-duplication tiles.
- Notifications: clickable deep-links + exact actor names (backend: attach actor + target link).
- Real presence (last_seen heartbeat; "online" = active in last N min).
- Global search + ⌘K command palette (people + projects + quick nav).
- Profile completeness meter.

## Round 3 — Make it world-class
- i18n Uz/Ru/En (whole app).
- In-app messaging: 1:1 DMs + project team chats (block/report/rate-limit + Telegram push).
- Who viewed your profile (named + private toggle later).
- Project TEAM cell: full roster + roles; founder manages members.
- Onboarding (3–4 skippable steps).
- Notification preferences center.
- Seed real builders + graceful early-city states.
- Weekly Telegram digest ("N builders want to join you this week").

## Cross-cutting
- Consolidate a small reusable component library (buttons, inputs, cards, modals, tabs, pagination, empty states, toasts) as we go, so everything stays consistent.

## Open inputs needed from founder
- Marstiff logo file → `desktop/public/marstiff-mark.png` (or I trace an SVG).
- Rough expected real-user count at launch (drives seeding).
