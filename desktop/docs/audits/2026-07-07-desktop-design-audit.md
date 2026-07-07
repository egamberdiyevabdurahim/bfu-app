Now let me build the consolidated plan. I have all the findings — I'll merge duplicates (the inline-grid responsive bug appears across ~6 files, `#5EC5B6` off-token teal across ~6 files, `.ch-cell:hover` false-affordance across ~4 files, unmanaged `setTimeout` toast races across ~5 files, `--muted` contrast systemic, footer duplication, etc.) and rank them.

## Executive summary

1. **Inline grids defeat the design system's own responsive breakpoints.** Every bento/card grid on `/u/[id]`, `/p/[id]`, dashboard, events, and partners is an inline `gridTemplateColumns: repeat(N,1fr)` that overrides `.ch-grid`'s existing `1080px→2col` media rule (globals.css:811), so these pages never collapse and crush/overflow below ~1080px — and none reach a single column on phones. This is the single most systemic, highest-impact defect.

2. **Fabricated/fake data ships on credibility surfaces.** `HeroBuildingCell` hardcodes `useCountUp(3)` open roles on every profile, `IdentityStrip` always renders a live "online" ping, and `ConnectionsCell` labels a follower count as "connections" — the profile page asserts things the data doesn't support, directly eroding the product's trust premise.

3. **`.ch-cell:hover` glow is a false affordance on passive containers.** Static form sections and cards (`CreateProjectForm`, `ProfileEditor`, `EventsBrowser`, login panel) all reuse `.ch-cell`, so hovering any non-interactive card lights it up like a clickable tile. Needs a `.ch-cell-static` variant.

4. **`--muted` (#A8A093) fails contrast systemically at the tiny sizes it's actually used.** It's the color for 9.5–13px eyebrows, chip text, metric labels, hints, and deadlines across every file — below WCAG AA in most pairings and effectively unreadable for low-vision users. A dedicated readable-secondary token is needed.

5. **Off-token one-off teal `#5EC5B6` proliferates.** The same non-palette aqua appears in `CreateProjectForm`, `ProjectLookingForCell`, `EventsBrowser`, `PartnerDetail`, `ProjectActions`, and the accepted/region pills — six independent hardcodes that will drift from the warm firelit palette. Add one `--teal-bright` token.

6. **Unmanaged `setTimeout` toast timers race and leak.** `flash()` in `ProjectManager`, `RequestsList`, `MentorsBrowser`, `PartnerDetail` all fire `setTimeout(…,3s)` with no ref/cleanup — stacked toasts clear each other early and fire `setState` after unmount. One shared `useToast` hook fixes all instances.

7. **Stale/desynced counts after actions.** After accept/reject, `ProjectManager`'s StatsStrip never refetches (mount-once), so Pending/Accepted tiles disagree with the now-empty list; silent `.catch(()=>[])` fetches render "nobody" empty states when the request actually failed, contradicting the header/stats.

8. **Inline styles inherit no `:focus-visible`, breaking keyboard navigation.** Custom buttons/pills/toggles/cards across `CreateProjectForm`, `StarInput`, `FavoriteButton`, `TeamCell`, `ConnectionsList`, and the mobile drawer have no focus ring; the mobile drawer additionally keeps off-canvas links in the tab order under `aria-hidden` (a WCAG 4.1.2 violation) with no focus trap.

9. **`null`-until-loaded islands cause layout shift (CLS) on primary CTAs.** `FavoriteButton`, `StartProjectCTA`, `OpenRolesCell`, and `PersonActions` render nothing until a client fetch resolves, so Save/Start/action clusters pop in and shift after paint on the common logged-in path.

10. **Empty vs. error vs. loading states diverge and dead-end.** Error states across events, connections, favorites, partners, mentors just say "Refresh to try again" with no retry button; several empty states double as silent error fallbacks; empty-state headline typography is inconsistent between sibling tabs.

11. **Fixed 52–64px hero headlines never clamp.** Every page hero (`dashboard` 60px, profile 64px, projects/new/events/favorites/settings 52px) is a hardcoded px size with `lineHeight` ≤1.0 and no `clamp()`, so titles overflow and near-collide on narrow viewports.

12. **Cross-page chrome grammar drifts because the footer/hero are copy-pasted ~12×.** `/requests` and `/settings` have no footer at all; `/notifications` is centered at 820px while siblings are full-width; hero→content margins jump 6/8/30/34px; overline/tagline/title voice is inconsistent. All rooted in duplicated inline blocks that should be shared components.

13. **The whole desktop app is English-only despite an Uzbek audience.** No i18n layer anywhere; every string is a raw English literal while the sibling landing + Mini App are already trilingual — the largest systemic copy gap.

14. **Silent side-effect writes and dropped data violate user mental models.** ProfileEditor's "Re-run AI analysis" silently PATCHes the bio; incomplete portfolio rows (label without URL) are dropped on save under a "Saved ✓"; age bounds aren't validated client-side.

## Ranked fixes

| Area | Severity | Issue (file:line) | Concrete fix |
|---|---|---|---|
| **Profile page** | Blocker | Fake "Open roles" — `useCountUp(3)` hardcoded on every profile (`components/HeroBuildingCell.js:7`) | Wire real per-project open-roles count from payload; until the field exists, hide the stat rather than animate a fabricated 3. |
| **Nav / a11y** | Blocker | Mobile drawer `<aside>` keeps focusable links in tab order under `aria-hidden` and traps no focus when open (`components/nav/AppShell.js:298`) | Add `inert` (or `tabindex=-1`) to drawer focusables when closed; implement focus trap + initial-focus + restore on open/close; dedupe the desktop `<aside>` so only the visible sidebar is in the a11y tree. |
| **Profile grid** | Blocker→High | Inline `repeat(4,1fr)` never collapses; at 375px each column ~80px, cells crush (`app/u/[id]/page.js:67`) | Replace inline grid with `.ch-grid` class (inherits 1080px→2col) plus a new `@media (max-width:560px){grid-template-columns:1fr}`. |
| **Project detail grid** | High | Inline `repeat(4,1fr)` bento won't collapse below 1080px (`app/p/[id]/page.js:90`) | Same fix — move to `.ch-grid`/extend it; let span-2/span-4 children reflow. |
| **Events grid** | High | Inline `repeat(3,1fr)` overrides media query; no single-col breakpoint (`components/community/EventsBrowser.js:199`) | Add `.ch-grid-3` class with `@media 1080px→2col, 640px→1fr`; apply `className="ch-grid ch-grid-3"`, drop inline. |
| **Partners grid** | High | Inline `repeat(3,1fr)` defeats `.ch-grid` collapse; same at `PartnerDetail.js:343` (`components/community/PartnersList.js:87`) | Drop inline override; let `.ch-grid` own breakpoints or use `repeat(auto-fill,minmax(280px,1fr))`. |
| **Dashboard grid** | High | Inline `repeat(2,minmax(0,1fr))` comment claims it stacks but it can't (`app/dashboard/page.js:130`) | Move to a CSS class with `@media (max-width:760px){grid-template-columns:1fr}`. |
| **Network grid** | High | `.ch-grid` has no single-col breakpoint; PersonCard rows clip at 375px (`app/globals.css:811`) | Add `@media (max-width:560px){.ch-grid{grid-template-columns:1fr}}` (fixes profile/network/all card grids). |
| **Profile / IdentityStrip** | High | "Online" ping always rendered — fake presence on every profile (`components/IdentityStrip.js:27`) | Gate the dot on a real `is_online`/`recently_active` field; remove entirely if no presence data exists. |
| **Profile / Connections** | High | "See all →" is a styled `ch-btn-ghost` with no onClick/href; avatar stack not linked (`components/ConnectionsCell.js:56`) | Wire to the connections route or remove until the destination exists. |
| **CreateProjectForm** | High | Every `Section` uses `.ch-cell`; passive form cards glow on hover (`components/projects/CreateProjectForm.js:42`) | Add `.ch-cell-static` (border/radius/padding, no `:hover` transform/glow); use it for all non-`<a>` Sections. Reuse across ProfileEditor, EventsBrowser, login. |
| **ProfileEditor** | High | Static Sections use `.ch-cell` → ~7 non-interactive cards light up on hover (`components/settings/ProfileEditor.js:29`) | Same `.ch-cell-static`; reserve `.ch-cell` glow for the real "View public profile" `<a>` card. |
| **ProfileEditor** | High | "Re-run AI analysis" silently PATCHes `{about}`, persisting the bio outside the Save CTA (`components/settings/ProfileEditor.js:234`) | Don't auto-persist from analyze — require Save first, or make button copy explicit that analyzing saves the bio; don't partially reseed baseline. |
| **StarInput / a11y** | High | `role=radiogroup` with 5 tabbable radios, no roving tabindex, no arrow-key handling (`components/projects/StarInput.js:41`) | Implement roving tabindex (checked/first = tabindex 0) + Arrow/Home/End to move-and-select; add visible `:focus-visible` ring. |
| **Favorites** | High | No un-save control; decoy static `♥` glyph looks tappable but card just navigates (`components/projects/FavoritesList.js:37`) | Make the heart a real un-save button (stopPropagation + toggle endpoint + optimistic remove), or drop it entirely. |
| **ProjectManager** | High | StatsStrip fetches `/stats` once on mount, never refetches after accept/reject → tiles disagree with list (`components/projects/ProjectManager.js:870`) | Lift stats into ProjectManager (or pass a refresh signal); optimistically decrement Pending / increment Accepted after `decide()`. |
| **Colors / a11y** | High | `--muted` #A8A093 used at 9.5–13px for eyebrows/labels/chips/hints app-wide — sub-AA (`app/globals.css:7`, `:327`) | Add `--muted-strong` (~#C6BEAF, ~7.5:1) for all sub-13px secondary text and chip labels; keep `--muted` for large/decorative only. Bump chip text to ≥12px. |
| **Copy / consistency** | High | H1 "opportunities" contradicts title/nav/tile "Events" (`app/events/page.js:45`) | Make H1 noun match the canonical label ("The events") or rename tile/nav/title to "Opportunities" everywhere. |
| **Copy / consistency** | High | Two differently-labeled tiles ("People", "Connections") point at same `/connections` route (`app/home/page.js:29`) | One canonical noun per route across tile/nav/overline/H1; don't point two tiles at one route on one screen. |
| **Cross-page** | High | `/requests` is the only authed page with no footer (`app/requests/page.js:74`) | Add the shared footer block (extract `<SiteFooter tagline>` and reuse everywhere). |
| **Cross-page** | High | `/notifications` wrapped in `maxWidth:820` while all siblings are full-width (`app/notifications/page.js:22`) | Drop the 820 wrapper (or constrain only the inbox list, keep header+footer full-width). |
| **Public nav** | High | Logged-out container hardcodes `padding:22px 40px 120px` with no responsive step (`components/nav/SiteTopBar.js:50`) | Give it a class with `@media (max-width:640px){padding:18px 18px 90px}`, matching AppShell. |
| **Events pills** | High | "For you" matched-tag pills use `.ch-card-t` which only applies nested in `.ch-card`; renders as bare green run-on text (`components/community/EventsBrowser.js:92`) | Style pills fully inline (or add an un-nested `.ch-tag` utility). |
| **Inputs / a11y** | Medium | Focus done via inline `onFocus` borderColor swap (amber ~2.6:1, 1px, not `:focus-visible`) across forms (`components/projects/CreateProjectForm.js:33`) | Remove `outline:none`; add a real 2px `:focus-visible` outline in globals.css for inputs/selects/textarea; drop the onFocus/onBlur hacks. |
| **Custom controls / a11y** | Medium | Segmented, region pills, Toggle, chip × have no `:focus-visible` (inline styles) (`components/projects/CreateProjectForm.js:140`) | Move to shared classes with `:focus-visible` (2px amber, offset 2px). |
| **ProfileEditor** | Medium | Incomplete portfolio row (label w/o URL) silently dropped on save under "Saved ✓" (`components/settings/ProfileEditor.js:174`) | Block save with inline row error ("Add a URL"), or toast "Some links were incomplete and not saved"; validate URL shape. |
| **CreateProjectForm** | Medium | Age inputs not bound-checked client-side; `age_from=5`/`age_to=999` reach POST (`components/projects/CreateProjectForm.js:334`) | In `submit()` validate 13≤from/to≤100 with inline error before the network call. |
| **CreateProjectForm** | Medium | Fully-wired toast (`showToast`) never called — dead code + missing "no changes" feedback (`components/projects/CreateProjectForm.js:289`) | Implement (diff `buildBody()` vs initial in edit mode → toast "No changes to save") or remove the toast machinery. |
| **CreateProjectForm** | Medium | Cancel `<a>` not disabled during in-flight PATCH → can navigate mid-save (`components/projects/CreateProjectForm.js:571`) | Add `aria-disabled="true"` + `pointer-events:none` while `state==='saving'`. |
| **CreateProjectForm** | Medium | Sticky submit bar occludes last field; no bottom spacer (`components/projects/CreateProjectForm.js:540`) | Full-width anchored bar with top hairline, or add `padding-bottom` ≈ bar height; verify at ~800px tall. |
| **CreateProjectForm** | Medium | Section titles use `.ch-cell-label` (muted 11px) — quieter than the 13px hints below (`components/projects/CreateProjectForm.js:44`) | Promote titles to `--text` (or amber eyebrow); reserve `--muted` for hints. |
| **ProjectManager** | Medium | `flash()` setTimeout has no ref/cleanup → stacked toasts clear early, setState-after-unmount (`components/projects/ProjectManager.js:815`) | Store timer id in a ref; clear on each flash and on unmount. Extract shared `useToast` (also fixes RequestsList/MentorsBrowser/PartnerDetail). |
| **ProjectManager** | Medium | Applicants inbox fails silently to `apps=[]` while stats claim pending exist (`components/projects/ProjectManager.js:928`) | Track "apps failed to load" state; render explicit "Couldn't load applicants — refresh" instead of the empty state. |
| **ProjectManager** | Medium | Accent gradient on "Views" (vanity) not "Pending" (actionable) (`components/projects/ProjectManager.js:249`) | Move accent to Pending (or accent only when >0). |
| **ProjectManager** | Medium | Destructive "Delete" sits as a peer tab with identical styling (`components/projects/ProjectManager.js:1006`) | Right-align Delete with divider and/or terra tint, or move out of the tab strip. |
| **ProjectActions** | Medium | `isOwner` from a second `.catch(()=>null)` `/users/me` → owner shown "Apply" on own project on transient failure (`components/projects/ProjectActions.js:94`) | Derive ownership from a server-provided field (`is_owner`/`creator_id` vs passed `meId`), not a separate fetch. |
| **ProjectActions** | Medium | Role picker has no cancel/back escape (`components/projects/ProjectActions.js:255`) | Add "Skip / apply without a role" or a back control. |
| **ProjectActions** | Medium | `leave()`/`cancel()` fire with no confirm; silently reverts to "Apply" (`components/projects/ProjectActions.js:127`) | Add inline confirm for Leave (matching Delete pattern) + brief "You left" state. |
| **FavoriteButton** | Medium | Returns null until loaded → Save pops in and shifts CTA cluster (`components/projects/FavoriteButton.js:48`) | Render a disabled skeleton pill / reserve height during loading. |
| **Profile** | Medium | Bento ends with lone quarter-width `OpenRolesCell` (no span) + 3 dead columns (`components/projects/OpenRolesCell.js:43`) | Set explicit `gridColumn` (span 2 to pair, or span 4 for its own band). |
| **ProjectHero** | Medium | h1 64px, `lineHeight:0.98`, no maxWidth/overflow-wrap → collisions/overflow (`components/ProjectHero.js:140`) | `line-height:~1.05`, `overflow-wrap:break-word`, `clamp(40px,6vw,64px)`. |
| **ProjectHero** | Medium | `isActive && !isHiring` renders no status pill — undesigned empty (`components/ProjectHero.js:72`) | Add a neutral "Active"/"In progress" pill for that case. |
| **ProjectLookingForCell** | Medium | Skills/knowledges pills keyed by raw string → dup keys on duplicate entries (`components/ProjectLookingForCell.js:118`) | Key by index/composite or dedupe arrays before mapping. |
| **Profile page** | Medium | Empty grid wrapper renders for anon (ProjectUpdates → null) → stranded 20px band (`app/p/[id]/page.js:113`) | Collapse the wrapper when the island is empty (lift emptiness to parent or drop the marginTop). |
| **Profile page** | Medium | Footer host div renders empty span when `canonical_url` null → breaks space-between balance (`app/p/[id]/page.js:74`) | Only render host div when truthy; switch to `flex-end` when absent. |
| **Profile metadata** | Medium | `generateMetadata` assumes `og_image_url` → `[{url:undefined}]` broken cards (`app/u/[id]/page.js:34`) | Include images array only when present; add a site-default OG fallback. |
| **PersonActions** | Medium | `submitReport` has no busy lock; Send never disabled → double POST (`components/people/PersonActions.js:287`) | Add busy lock + disable while in-flight, matching vouch/follow. |
| **PersonActions** | Medium | CTA cluster confined to 460px island, right ~740px empty (`components/people/PersonActions.js:58`) | Place connect controls as a right rail beside IdentityStrip or a full-width action bar. |
| **ProfileCells** | Medium | `ReputationCell`/`AchievementsCell` deref `rating.average`/`achievements.map` with no guard → crash if API omits (`components/ReputationCell.js:21`, `components/AchievementsCell.js:22`) | Default props: `rating = {}`, `achievements = []`; use optional chaining. |
| **Profile** | Medium | Label/value mismatch: `followerCount` shown next to word "connections" (`components/ConnectionsCell.js:43`) | Show a true connections count or rename label to "followers". |
| **IdentityStrip** | Medium | h1 60px + "is building" 40px = two competing giants; `currently_building` no truncation (`components/IdentityStrip.js:47`) | Drop "is building" line to ~22–26px; add `WebkitLineClamp`. |
| **TeamCell / a11y** | Medium | (rolls into inline-focus theme) avatars/verified badge — see Low rows | — |
| **ProfileEditor** | Medium | Sticky save bar and toast both bottom-centered → overlap on secondary actions (`components/settings/ProfileEditor.js:652`) | Offset toast on /settings (e.g. `bottom:96px`) or dock inline. |
| **ProfileEditor** | Medium | `AchievementsLoader` fetches in render body (SSR/StrictMode fragile) (`components/settings/ProfileEditor.js:732`) | Move fetch into `useEffect`; drive loading/empty/list from state. |
| **MentorsBrowser** | Medium | `open_slots` decremented on a mere request, never re-incremented on decline (`components/community/MentorsBrowser.js:513`) | Don't decrement on request; refetch after booking settles. |
| **MentorsBrowser** | Medium | Re-opening BookPanel re-shows an already-requested slot → duplicate booking (`components/community/MentorsBrowser.js:123`) | Lift requested slot ids above the panel, or have server return the slot as no-longer-open. |
| **MentorsBrowser** | Medium | Publishing a slot while list loading/errored → fetch overwrites/drops it (`components/community/MentorsBrowser.js:257`) | Disable publish until `state==='ready'`, or refetch on publish when not ready. |
| **MentorsBrowser** | Medium | datetime-local + note labels not associated with inputs (`components/community/MentorsBrowser.js:307`) | Wrap in `<label>` or add `htmlFor`/`id`; audit all bare labels. |
| **Events** | Medium | Tab switcher uses two `.ch-btn-ghost` pills; active ≈ hover (same amber border/bg); no tab a11y (`components/community/EventsBrowser.js:159`,`:164`) | Build a real segmented control (single container, filled active, `role=tablist`/`tab`/`aria-selected`); make active ≠ hover. |
| **Events** | Medium | Error state offers no in-place retry, only "Refresh" (`components/community/EventsBrowser.js:134`) | Add "Try again" that flips state to loading and refetches. |
| **Events** | Medium | "For you" empty-state says to edit profile but has no link (`components/community/EventsBrowser.js:192`) | Add a "Complete your profile →" link/button. |
| **Partners** | Medium | Detail page has no h1 (three sibling h2s) (`components/community/PartnerDetail.js:314`) | Promote partner name to a single h1; slab headings h2/h3. |
| **Connections list** | Medium | Following cards can never show verified/building (endpoint returns only id/name/photo) (`components/people/ConnectionsList.js:106`) | Enrich `/me/following` projection or render a Following-specific card variant. |
| **Connections list** | Medium | Per-fetch `.catch(()=>[])` renders "nobody" empty state on real failure; outer error unreachable (`components/people/ConnectionsList.js:100`) | Track per-section load status; show section-level error on reject. |
| **Connections list** | Medium | Error state dead-ends with no retry (`components/people/ConnectionsList.js:125`) | Extract loader; add "Try again". |
| **Cards / a11y** | Medium | `.ch-card` has no `:focus-visible` → no ring for keyboard users on card grids (`components/people/ConnectionsList.js:21`) | Add `.ch-card:focus-visible{outline:2px solid var(--amber);offset:2px}`; give avatar img explicit w/h. |
| **PersonActions** | Medium | Loading state collapses then jumps (CLS) where Follow should be (`components/people/PersonActions.js:334`) | Render a skeleton sized to the control stack / reserve min-height. |
| **Dashboard** | Medium | h1 fixed 60px `lineHeight:0.98`, overflows at 375px; siblings 48/40px also unclamped (`app/dashboard/page.js:79`) | `clamp(34px,8vw,60px)` (and for the sibling headlines). |
| **Settings** | Medium | h1 fixed 52px, single 900px breakpoint → cramped 600–900px (`app/settings/page.js:80`) | `clamp(32px,6vw,52px)`; re-check collapse nearer 1024px. |
| **ProfileEditor** | Medium | Portfolio row `flex:0 0 34%` label / `flex:1` url never wrap → URL unusably narrow on mobile (`components/settings/ProfileEditor.js:494`) | `flexWrap:wrap` with `flex:1 1 140px`/`1 1 200px`, or stack below ~420px. |
| **Public nav footer** | Medium | Profile footer missing `flexWrap:wrap` (siblings have it) → URL+tagline collide (`app/u/[id]/page.js:81`) | Add `flexWrap:wrap` + gap (or use shared footer). |
| **Copy** | Medium | Overline grammatical form (imperative/noun/sentence) inconsistent across 13 pages (`app/mentors/page.js:33`) | Standardize to one register (short ≤4-word noun phrase); rewrite outliers. |
| **Copy** | Medium | Hero→content margin drifts 6/8/30/34px across identical heroes (`app/projects/mine/page.js:23`) | One spacing token; extract shared `<PageHero>` component. |
| **Copy** | Medium | Subtitle presence inconsistent among identical heroes (`app/connections/page.js:24`) | All heroes carry a one-line subtitle or none — pick one. |
| **Copy** | Medium | `/settings` also has no footer — two authed pages diverge (`app/settings/page.js:114`) | Add shared footer (or intentionally omit + apply consistently). |
| **Copy** | Medium | Session length "fifteen minutes" vs "15-minute" mixed (`app/home/page.js:32`) | One form ("15 minutes") across tiles/subs/metadata. |
| **Copy** | Medium | Whole app is English-only hardcoded strings; no i18n (`app/connections/page.js:11`) | Introduce the landing/Mini App i18n mechanism; extract all strings to uz/ru/en. Cross-cutting, not per-page. |
| **Copy** | Medium | `/projects` floating top-right CTA above header — lone unanchored action (`app/projects/page.js:79`) | Move Start-CTA into the header row or a clearly-anchored primary button; adopt same pattern on projects/mine/requests. |
| **Login** | Medium | Stale error line never clears on recovery (guarded only by `=== network`) (`app/login/page.js:132`) | Clear `liveError` unconditionally on pending/ok except genuinely terminal states; model recoverable-vs-terminal explicitly. |
| **Login** | Medium | Loading placeholder keeps full amber→terra gradient → dead control looks like live CTA (`app/login/page.js:271`) | Swap gradient for `--surface-2` fill + spinner/shimmer; drop redundant inline opacity. |
| **Colors / a11y** | Medium | Segmented/pills/Toggle convey selected state by color alone (`components/projects/CreateProjectForm.js:194`) | Add a non-color cue (check glyph/bold border); use `role=switch`+`aria-checked` for Toggle. |
| **PersonActions / a11y** | Medium | Emoji not `aria-hidden`; toggles lack `aria-pressed`; state by color+glyph only (`components/people/PersonActions.js:425`) | `aria-hidden` decorative emoji, add `aria-pressed` to Follow/endorse, ensure text/shape cue. |
| **Login** | Medium | (added-in-verify) polling interval re-subscribes on every `liveError` change → poll cadence perturbed (`app/login/page.js:90`) | Read `liveError` via a ref so the 2s interval isn't rebuilt on each error transition. |
| **Colors** | Low | One-off `#5EC5B6` teal across ChipEditor accent, region pills, accepted pill, event/partner meetup chips (`CreateProjectForm.js:448`, `ProjectLookingForCell.js:39`, `ProjectActions.js:239`, `EventsBrowser.js:17`, `PartnerDetail.js:25`) | Add `--teal-bright` (#5EC5B6) token; reference via `var()` everywhere. |
| **Copy** | Low | Raw DB id leaks: `Builder #${id}` (`ProjectManager.js:98`, `RequestsList.js:148`, `RateableRow:624`, `MentorsBrowser.js:461`) | Neutral human label ("A builder"/"New applicant"), no id. |
| **Consistency** | Low | `initials()` copy-pasted in IdentityStrip/VouchesCell/ConnectionsCell while lib/avatar exports it (`components/VouchesCell.js:1`) | Import from `@/lib/avatar`; delete local copies. |
| **Consistency** | Low | ApplicantRow + flash/toast duplicated near-verbatim in RequestsList & ProjectManager, already diverging (`components/projects/RequestsList.js:47`) | Extract shared `<ApplicantRow>`, `<Avatar>`, `useToast`. |
| **RequestsList** | Low | Prominent project `<h2>` isn't a link; only tiny "Manage →" is (`components/projects/RequestsList.js:135`) | Link the project name (or whole slab) to `/manage`. |
| **StarInput** | Low→Med | Empty stars use `var(--hair)` — near-invisible on dark (`components/projects/StarInput.js:30`) | Use `--muted` at reduced opacity / outlined ☆ so all 5 slots read at ~3:1. |
| **FavoriteButton** | Low | Silent rollback on toggle failure — reads as "click did nothing" (`components/projects/FavoriteButton.js:41`) | Surface a transient error + `aria-live` announcement. |
| **FavoriteButton** | Low | Unsaved state uses `--muted` → looks disabled (`components/projects/FavoriteButton.js:66`) | Use `--text`/light amber for unsaved label/glyph. |
| **TeamCell / a11y** | Low | Verified `✓` badge no aria-label at 8px (FounderCell has one) (`components/TeamCell.js:80`) | Add `aria-label='Verified'`; bump to ≥10px. |
| **TeamCell** | Low | Overlapping avatars: no hover z-lift, no `:focus-visible` (`components/TeamCell.js:47`) | Small class with `:hover{z-index:10;translateY(-2px)}` + focus ring. |
| **ConnectionsList** | Low | Cards hard-disable entrance animation but keep hover lift — inconsistent with Discovery grid (`components/people/ConnectionsList.js:23`) | Drop inline `animation:none` for consistency, or make static app-wide. |
| **Login** | Low | Terminal start failure is a dead-end — no retry, requires reload (`app/login/page.js:52`,`:284`) | Render "Try again" (calling `startHandshake`) whenever `liveError` is terminal and `deepLink` null. |
| **Login** | Low | QR "or scan" label renders with no image during generation/failure (`app/login/page.js:289`) | Render label only when `qrDataUrl` exists; dashed 168×168 placeholder while generating. |
| **Login** | Low | Primary Telegram link `rel="noopener"` vs footer's `noopener noreferrer` (`app/login/page.js:256`) | Add `noreferrer`; add "opens in new tab" cue. |
| **StartProjectCTA** | Low | `null` until authed → buttons pop in (CLS) on public page (`components/projects/StartProjectCTA.js:16`); blanket `.catch(()=>{})` hides CTA on transient failure (`:17`) | Reserve space/fade in; distinguish 401 (anon) from other errors. |
| **OpenRolesCell** | Low | Returns null on loading/error → cell disappears/reflows for authed viewer (`components/projects/OpenRolesCell.js:40`) | Fixed-min-height skeleton during loading; null only for anon/empty. |
| **Empty states** | Low | Empty-state headline sizes inconsistent (22/24, Updates omits headline) (`components/projects/ProjectManager.js:379`) | Standardize to `ch-empty-k` + one `ch-empty-t` + `ch-empty-s`; give Updates a headline. |
| **ProjectManager** | Low | Loading/error add `marginTop:28`, ready none → content jumps on load (`components/projects/ProjectManager.js:914`) | One consistent top offset across loading/error/ready. |
| **ProjectManager** | Low | `(count || 1) - 1` masks null/0 as 1 (`components/projects/ProjectManager.js:886`) | `(count || 0)` with `Math.max(0,…)`, or drive from `apps.length`. |
| **RequestsList** | Low | Button cluster no `marginLeft:auto` → drops flush-left on wrap (`components/projects/RequestsList.js:185`) | Add `marginLeft:auto` + `alignItems:center`. |
| **ChipEditor** | Low | Silent case-insensitive dedupe clears draft with no feedback; redundant `.slice(0,60)` (`components/projects/CreateProjectForm.js:64`) | Flash existing chip / "Already added" hint; remove `.slice`. |
| **Chip × / a11y** | Low | ~10px low-contrast hit target below 24px min (`components/projects/CreateProjectForm.js:94`) | ≥24×24 hit area + hover contrast. |
| **Gender select** | Low | `appearance:auto` → native light popup in dark form (`CreateProjectForm.js:529`, `ProfileEditor.js:553`) | `appearance:none` + custom caret + `color-scheme:dark`. |
| **CreateProjectForm** | Low | On submit error, sticky-bottom error can be scrolled out of view (`components/projects/CreateProjectForm.js:270`) | Scroll offending field/bar into view on error (or use the built toast). |
| **CreateProjectForm** | Low | Name-too-short shows a permanently dim CTA with no inline reason (`components/projects/CreateProjectForm.js:303`) | Inline "At least 3 characters" hint once touched. |
| **MentorsBrowser** | Low | flash() timer leak; broken `photo_url` no onError; mentor name link no hover/focus; redundant `/users/me` fetch (`MentorsBrowser.js:402/42/469/223`) | Ref+cleanup on timer; `onError`→initials; hover/underline+focus on name; pass `me.id` down. |
| **MentorsBrowser** | Low | Booked = amber but Requested = green — mixed semantics (`components/community/MentorsBrowser.js:353`) | One mapping (amber=pending, green=confirmed) on both sides. |
| **Events** | Low | EventCard `padding:22` vs system `.ch-cell` 28px (`components/community/EventsBrowser.js:116`) | Inherit 28px (or use 24/28 scale). |
| **Events / a11y** | Low | State region has no `aria-live`/`role=status` (`components/community/EventsBrowser.js:179`) | Wrap in `role=status aria-live=polite`. |
| **Events** | Low | Deadline "by {date}" lowest-contrast smallest on card, yet it's an urgency cue (`components/community/EventsBrowser.js:52`) | Bump to `--text`/`--amber`, 12–13px. |
| **PartnerDetail** | Low | flash() timer no cleanup (`:207`); ownership `Number()==` brittle (`:219`); local-tz deadline (`:129`); no retry on error (`:251`) | Ref+cleanup; `String()==`; send plain date or explicit offset; add "Try again". |
| **Partners / a11y** | Low | Verified `✓` only `title` (`PartnersList.js:97`, `PartnerDetail.js:294`) | `role=img` + `aria-label='Verified partner'`. |
| **ProfileEditor** | Low | Remove-link × no hover/`:focus-visible`; index-key focus bug on mid-delete; auto currently_building placeholder reads as value; invite "Loading…" styled as real link; bio textarea no counter; input labels only via placeholder (`ProfileEditor.js:511/483/407/588/334/484`) | Add hover/focus states; stable row id keys; read-only auto hint chip; dimmed skeleton + disable Copy until link; soft char counter; `aria-label` on portfolio inputs + select. |
| **Copy** | Low | "This slice couldn't load" — dev term in user copy (`app/dashboard/page.js:194`) | "This panel couldn't load" / "This view is restricted". |
| **Copy** | Low | Duplicate footer tagline on /home and /city (`app/city/page.js:197`) | Give /home its own tagline. |
| **Copy** | Low | Title order inverted on /city vs siblings (`app/city/page.js:25`) | Normalize to "<Page> — Bright Futures Uzbekistan". |
| **Copy** | Low | "quiet shelf" repeated in overline+sub; "quiet" motif overused (`app/favorites/page.js:31`) | De-dupe; vary the motif. |
| **Copy** | Low | Home tile promises "where you've applied" but /requests is inbound-only (`app/home/page.js:39`) | Align blurb with actual scope. |
| **Responsive** | Low | ChipEditor add-row / AppShell padding / hero subheads — no wrap / no small-phone step / fixed px (`CreateProjectForm.js:114`, `AppShell.js:544`, `dashboard:97`) | `flexWrap:wrap`; add `@media(max-width:480px)` padding step; `clamp()` subheads. |
| **Nav / a11y** | Low | Avatar alt inconsistency; unread badge count not in link's a11y name at desktop; placeholder-as-instruction low contrast (`AppShell.js:191/234`, `CreateProjectForm.js:385`) | Standardize alt rule; fold count into link `aria-label` both breakpoints; explicit `::placeholder` color ≥4.5:1. |
| **Nits (cluster)** | Nit | On-avatar ink (#0B0A08 vs #160E08), locked-achievement raw `#6b665c`/🔒 emoji vs mono glyphs, straight vs curly quotes, QR 220→168 downscale, `style={{}}` no-op, website strip trailing slash, 9.5/13.5px fractional sizes | Standardize on-avatar ink; token-ize locked color + monochrome lock glyph; curly quotes everywhere; generate QR at 336; remove `style={{}}`; strip trailing slash; round fractional font sizes. |

## Quick wins

Highest value-to-effort, do these first:

1. **Add `@media (max-width:560px){.ch-grid{grid-template-columns:1fr}}` + drop the inline `repeat(N,1fr)` overrides** on `/u/[id]`, `/p/[id]`, events, partners, dashboard. One CSS rule + a handful of one-line deletions fixes the entire blocker-class of mobile grid crush across the app.

2. **Hide the fake "Open roles" stat** (`HeroBuildingCell.js:7`) and **gate the "online" ping** (`IdentityStrip.js:27`) — delete two hardcoded fakes; instantly removes the worst trust hazards.

3. **Add a `.ch-cell-static` class** (no `:hover` glow) and swap it into passive Sections/cards in `CreateProjectForm`, `ProfileEditor`, `EventsBrowser`, login. Kills the false-affordance theme in one class + find-replace.

4. **Add `--muted-strong` and `--teal-bright` tokens** in globals.css; replace the six `#5EC5B6` hardcodes with `var(--teal-bright)`. Token discipline + a contrast lift for free.

5. **Extract one shared `useToast` hook** (ref + cleanup) and replace `flash()`/`showToast` in ProjectManager, RequestsList, MentorsBrowser, PartnerDetail. Fixes toast races + unmount setState leaks in one shot.

6. **Extract `<SiteFooter tagline>` and `<PageHero>` components**; add the footer to `/requests` and `/settings`, drop the `820px` wrapper on `/notifications`, normalize hero margins. Removes ~12 copy-paste blocks and a whole class of chrome drift.

7. **Wire or remove the dead "See all →"** in `ConnectionsCell.js:56` (no onClick/href) — never ship a styled button that does nothing.

8. **Make the Favorites heart a real un-save button** (`FavoritesList.js:37`) — the page's entire purpose currently has no remove control.

9. **Add `.ch-card:focus-visible` and input/select/textarea `:focus-visible` rules** in globals.css; remove the inline `onFocus` border hacks. One stylesheet change restores keyboard focus visibility across every card grid and form.

10. **Fix the events "For you" pills** (`EventsBrowser.js:92`) — style inline (or add `.ch-tag`) so relevance tags render as chips instead of bare green run-on text; and add the missing profile link to the "For you" empty state (`:192`).

Root-cause note for implementation ordering: three shared primitives — **`.ch-grid` responsive rules**, **`.ch-cell-static` / `:focus-visible` in globals.css**, and **shared `useToast` / `<SiteFooter>` / `<PageHero>` components** — collectively resolve the majority of the High/Medium rows. Build those five first, then sweep the per-file behavioral bugs.