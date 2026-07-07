# Founder screenshot feedback — verbatim capture (2026-07-08)

Source: 73 annotated screenshots in `C:\Users\egamb\Desktop\New folder\`.
Pass 1 = capture every annotation verbatim, grouped by page. Recommendations added in pass 2.

## HOME (`/home`) — screens 001500–001507
- **Sidebar (left nav):** "I didn't like design of here + can't scroll + when after clicking it's going upwards again" — dislikes the sidebar design; it can't scroll; and after clicking a nav item the scroll jumps back to top.
- **Powered by Marstiff:** "Here in every page, we should add Powered by Marstiff [logo]" — add a "Powered by Marstiff" credit + logo on every page.
- **Tiles duplicate nav:** "We have these on navigation panel, why we need it?" — the launchpad tiles (City/Projects/People/Mentors/Events/Partners/Your projects/Applications/Saved/Sessions/Settings/Command center) duplicate the sidebar nav → questions why they're needed.

## CITY (`/city`) — screens 001511–001520, 001524–001531
- **Filter pills broken:** "As you can see, we have errors here / These are not working at all" — the filter pill row (All/Online now/Tashkent City/Tashkent/Jizzakh/Samarkand/Looking for co-founder/Mentors/Python programming/Teaching math/SAT prep/Teaching). Clicking pills changes the LIVE header text but the SAME 4 builder cards stay → filters don't actually filter results.
- **Builder card names blue-boxed** (Abdurahim E, Bislan K, Aziz A, Quvonchbek A) — flagged; likely the underlined names read like broken links.
- **Threads / "Just arrived":** "If I click it, it's just return here without any filters" — the Serendipity "Threads from here → Just arrived" card link doesn't apply a filter, just reloads /city.

## PROJECTS discovery (`/projects`) — screen 001537
- **Cards "errors":** "As you can see, we have errors here" — the two project cards (Just test / ptbooks) flagged; underlined title + underlined italic goal read like broken links / errors.

## CONNECTIONS (`/connections`) — screen 001540
- (No annotation — appears clean.)

## MENTORS (`/mentors`) — screen 001545
- **Mark own card:** "Should mark that it's me" — in "Mentors in the city", the founder's own card should be marked as "you" (no Book-a-session on your own card).

## EVENTS (`/events`) — screens 001549–001553
- **Segmented control active state (Uz):** "Bir tarafni bosganda, bosilgan taraf kattalashishi kerak" = when you click a tab, the clicked/active tab should get bigger / stand out more.

## PARTNERS (`/partners`) — screen 001557
- (No annotation — appears clean.)

## YOUR PROJECTS (`/projects/mine`) — screen 001600
- **Card not clickable (Uz):** "Bosganda kirmayapti" = clicking the "Just test" card doesn't open it. The owned-project card should navigate to the project (only the Manage button works now).

## APPLICATIONS (`/requests`) — screen 001603
- (No annotation — clean empty state.)

## SAVED (`/favorites`) — screen 001606
- (No annotation — clean empty state.)

## CONNECTIONS again (`/connections`) — screen 001611
- **Nav active-state bug (Uz):** "Connections ni bosganda, People ga utib qolitti" = clicking the "Connections" sidebar item activates/highlights "People" instead. The nav maps /connections → active "people"; founder finds it wrong/confusing.

## SESSIONS (`/bookings`) — screen 001616
- (No annotation — clean empty state.)

## SETTINGS (`/settings`) — screens 001619–001627
- (No annotation — Identity/AI coach/Looking-for/Skills/Portfolio/Region/Invite/CV all look fine.)

## DASHBOARD overview + subtabs — screens 001632–001716
- Overview, Users, Projects (moderation queue), Reports, Broadcast, Events, Partners — **all clean, no annotations.** Admin surface is solid.

## DASHBOARD / PLACES (`/dashboard/places`) — screens 001720–001727
- **Pagination (Uz):** "Agar bundan tevadagi narsalar judaham ko'payib ketsa bunga qanday tushaman. Btw nafaqat bu yerni, balki ko'p datalar bo'lish ehtimoli bor bo'lgan har bir joyga pagination qo'yish kerak" = if these lists (Schools 26 / Learning Centers 42) grow large, how to handle? Add **pagination to EVERY list likely to hold a lot of data** (Places, Users, Projects, logs, etc.).

## DASHBOARD / SYSTEM (`/dashboard/system`) — screens 001730–001737
- **Pagination:** "Same here also" (blue box on "Error log 55 recent") → paginate the audit log + error log too.
- **Error log reveals real backend errors** (worth checking if still active):
  - `POST /users/me/finalize` → validation error: `portfolio_links` "Input should be a valid list, input: None" (repeated, Jul 3).
  - `GET /users/me/notifications` → "cannot import name 'avatar_url' from app.routers.public" (Jun 30).
  - `GET /users/discover` → validation errors on `portfolio_links` (Jun 30).
  - `POST /auth/telegram` → duplicate key on `ix_users_telegram_id` (May 20–21, historical).

## NOTIFICATIONS (`/notifications`) — screens 001741–001748
- **Clickable + exact info + who-viewed (big):** "Most of things should be clickabel. And btw, not someone but there should be exact info. And btw, we should add the function which tells who viewed their profile."
  1. Each notification should be **clickable** → deep-link to its target (project/person/session/intro).
  2. Show **exact info** (real names) instead of anonymized "Someone …".
  3. **NEW FEATURE:** "who viewed your profile" — profile-view tracking + surfacing.
- **Profile dropdown menu broken:** blue box on the avatar caret menu (View public profile / Edit profile / Log out) → "These aren't working at all." The bottom profile menu actions don't work.

## PUBLIC PROFILE — own (`/u/1`) — screens 001751–001758
- (No annotation.) Minor observed: footer canonical shows `…/u/5` while URL is `/u/1` — possible canonical/id mismatch to verify.

## PUBLIC PROFILE — others (`/u/27` Bislan, `/u/23` Sardor) — screens 001803–001818
- **Send message (big / feature):** "On profile, there should be send message" — add a **Send message / DM** action on a person's profile (CONNECT panel currently: Following / I'm interested / Request intro / Report). Implies a messaging feature.
- Otherwise the other-user profiles render well (Connect, A little help: Why you match / Break the ice / Translate bio, Endorse a skill, Vouch box).

## PROJECTS discovery — STARTUPS filter (`/projects`) — screen 001821
- (No new annotation; filter "Startups" active, shows Just test + ptbooks.)

## PROJECTS discovery — VOLUNTEERING filter (`/projects`) — screen 001826
- **Filters must actually filter (Uz):** "Bularni bosganda shular bo'yicha exact data chiqsin" = clicking the All/Startups/Volunteering/Hiring-now pills must return only matching projects. Currently Volunteering still shows both startup cards AND "Nothing here yet under this filter" — contradictory / broken (same class of bug as the city filters).

## PROJECT PAGE — owner + teammate views (`/p/2`, `/p/3`) — screens 001829–001904
- Owner view (`/p/2`): action rail shows "Manage applicants" + Save — clean.
- Teammate view (`/p/3`): "You're on this team / Leave" — clean.
- **TEAM cell (big / feature):** "Full team ro'yxati chiqishi kerak, role lar bilan. Va agar founder bo'lsa, team memberlarni manage qilishham kerak" = the TEAM cell should show the **full team roster with each member's role**, and **founders should be able to manage team members** (roles, remove).
- Manage cockpit (Applicants/Roles/Updates/Ratings/Edit project) — all clean.

## CREATE PROJECT (`/projects/new`) — screens 001911–001922
- (No annotation — the whole create flow looks clean.)

---

# Consolidated themes
**Broken / "not working" (fix regardless):**
1. City filter pills don't filter results (header changes, cards stay).
2. Projects filter pills don't filter (shows cards + "nothing here" contradiction).
3. Profile dropdown menu (View public profile / Edit profile / Log out) doesn't work.
4. City "Threads / Just arrived" link doesn't filter — reloads /city.
5. Owned-project card (`/projects/mine`) not clickable → should open project.
6. Nav active-state: /connections highlights "People" not "Connections".
7. Sidebar can't scroll; and scroll jumps to top after clicking a nav item.

**Design changes flagged:**
8. Sidebar (nav) design disliked — redesign.
9. Home launchpad tiles duplicate the nav → rethink/trim.
10. Add "Powered by Marstiff [logo]" to every page.
11. Segmented control active tab should enlarge/stand out more.
12. Card underline styling on city/projects reads like broken links/errors.
13. Mentors: mark own card as "it's you" (no self-booking).

**Features requested:**
14. Notifications: clickable (deep-link) + exact names (not "Someone").
15. NEW: "who viewed your profile".
16. NEW: "Send message" / DM on people's profiles.
17. Project TEAM cell: full roster + roles; founder can manage members.
18. Pagination on every large/growable list (Places, Users, Projects, logs…).

**Backend errors seen in the error log (verify still active):**
- portfolio_links validation (finalize + discover), avatar_url import error (notifications), telegram duplicate-key (historical).
