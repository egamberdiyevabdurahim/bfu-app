# BFU Redesign — Deep Research (2026-07-01)

> **Purpose.** Seven independent research passes (Telegram Mini App platform excellence,
> premium desktop SaaS design, analogous products, 2025/26 visual trends, adaptive
> desktop+mobile architecture, trust/reputation UI patterns, mobile-friendly data
> visualization) plus one synthesis pass, run before proposing a redesign direction for
> BFU. This document is the companion to `REDESIGN-BRIEF.md` (which covers brand tokens,
> current IA, and screen-by-screen direction) — this doc adds **why**, external precedent,
> and the **desktop + Telegram** architecture question the brief didn't originally scope.

---

## Executive summary

Seven independent research passes converge on the same underlying verdict: **BFU's
foundation (palette, type pairing, motion budget, IA) is already sound — the redesign's
job is discipline and composition, not reinvention.**

The single biggest, cheapest win sitting completely unaddressed is that `tg.js` defines a
`haptic()` helper and **never calls it**, and never touches `BackButton`/`MainButton`/
`showPopup` at all — meaning BFU currently feels like "a webpage in a Telegram frame"
rather than a native Mini App, despite having done the hard invisible plumbing (safe-area,
viewport, expand) correctly. Wiring haptics into ~10 key moments and replacing hand-rolled
back arrows with `BackButton` is near-zero-risk, near-zero-cost, and disproportionately
raises perceived quality.

The second load-bearing finding, echoed independently by the trust-signals,
analogous-products, and visual-trends research: **BFU's trust data (rating, endorsements,
vouches, mutuals, badges) is genuinely strong but architecturally invisible** — scattered
across four unrelated code locations, buried below two AI-utility buttons that have no
business outranking real social proof. No analogous product (LinkedIn, Wellfound, YC
Bookface, Product Hunt) buries credibility below utility tools. Fixing `UserProfileModal`'s
vertical order — identity → one-line trust strip → primary CTA → currently-building
headline → composed Trust card (bento-style) → skills → demoted AI-assist drawer — is the
single highest-leverage screen change available, confirmed correct by three independent
research angles working from different precedent sets.

Third: the founder's ask for "richer, more comfortable" desktop is real and should **not**
be solved with responsive breakpoints on the existing mobile components. Every reference
product with a compact embedded surface plus a real desktop surface (Slack, Discord,
WhatsApp Web, Superhuman, even Linear) treats them as architecturally separate — sharing
tokens, backend, and brand voice, never sharing navigation topology or layout primitives.
BFU's bottom-sheet-heavy modal idiom is precisely the pattern that doesn't reflow into good
desktop UX; it needs a genuine sidebar + master-detail rebuild, seeded by the
already-scoped-but-unbuilt public web profile (`/u/{id}`), which has zero mobile equivalent
to protect and is explicitly the founder's "make us look professional to outsiders" surface.

Fourth: visual richness should concentrate, not spread. 2025/26 award-tier dark UI (Linear,
Arc, Raycast) is built on rationing a single accent color, hairline-border elevation over
shadows, and reserving glass/gradient/motion flourish for a handful of hero moments —
exactly the opposite of adding more decoration everywhere. BFU should apply this discipline
to its existing five-color semantic system while concentrating real richness into named
moments: the Trust block, `/u/{id}`, the from-scratch analytics dashboards, and ~5 reward
micro-interactions (endorse, vouch, rate, achievement unlock, booking confirm).

Fifth: the admin analytics dashboards are the biggest greenfield opportunity and the best
"professional" showcase, but every chart must be self-labeled (no hover-only data, since
touch has no hover) and horizontal-oriented (Uzbek/Russian labels run 1.4x longer than
English, and vertical bars/legends break first on a 360px screen).

**Recommended sequencing:** (1) haptics + BackButton/MainButton wiring — days, zero risk;
(2) `UserProfileModal` trust-strip + reorder — highest-ROI single screen change; (3)
extract tokens/i18n into a shared package; (4) build `/u/{id}` as the seed of a genuinely
separate desktop frontend; (5) Discover card-level trust strip + segmented filters; (6)
desktop sidebar shell + master-detail; (7) from-scratch admin analytics dashboards.

---

## Architecture: desktop + Telegram Mini App

### Recommended: Approach B — two dedicated frontends, one shared backend + token/i18n package

Keep `bfu-app` (the Telegram Mini App) architecturally untouched as the compact,
bottom-tab, bottom-sheet, touch-first primary surface. Build a new, separate desktop web
frontend that talks to the same backend/API surface (`src/api.js` endpoints unchanged) and
shares a published tokens package (`--bg`/`--surface`/`--accent`/`--mint`/`--amber`/
`--coral` + Syne/DM Sans + `TAG_COLORS` extracted from `Shared.jsx`) and the i18n strings
(`src/i18n.jsx`), but owns its own navigation shell (persistent sidebar), layout primitives
(master-detail, dense tables), and screens. Seed it with the already-scoped-but-unbuilt
`/u/{id}` public web profile, then build a desktop shell with sidebar nav + master-detail
Discover, then the from-scratch admin analytics dashboards.

**Pros:**
- Zero risk to the Mini App — the primary surface everyone actually uses is untouched
  except at a thin, low-churn token/i18n package boundary
- Desktop gets to be genuinely desktop-native (sidebar, master-detail, hover states,
  keyboard shortcuts, command palette, dense analytics) with zero compromise from also
  needing to render in a 360px Telegram WebView
- Matches the closest real analogue for a "compact primary device + expansive companion"
  relationship: WhatsApp Web (separate codebase, same account/backend, desktop-native
  master-detail, shared brand tokens)
- Independently deployable/rollback-able; Mini App stays on its current host path, desktop
  can live at its own subdomain
- Fast first win: `/u/{id}` has no existing mobile screen to protect and is already
  flagged in the brief as a flagship, unbuilt, browser-facing surface
- Naturally evolves into a shared component library (Approach C) once 2-3 real desktop
  screens exist and it's clear what's genuinely identical vs. only looked identical before
  being built twice

**Cons:**
- Real duplication cost for any feature wanted at full parity in both places (mitigated by
  NOT aiming for full parity by default — most reference products deliberately don't)
- Two frontends to keep in sync with backend API changes (normal multi-client hygiene)
- Upfront cost to cleanly extract token/i18n into shared packages (~half-day-to-day)
- Needs its own auth flow for desktop (Telegram Login Widget or QR/deep-link handoff,
  since Mini App auth relies on Telegram `initData`) — real but well-scoped, standard

**Effort:** Medium-high upfront (token/i18n extraction + new project scaffold + Telegram
Login Widget + first screen: 1-2 weeks), then roughly linear effort per additional desktop
screen with no compounding "protect mobile from desktop" tax.

### Alternative: Approach C — hybrid shared-primitive library + two composed shells

A middle path where a shared component library (`@bfu/ui` — buttons, chips, tags, avatars,
badges, skeletons, trust-signal components) is extracted up front and imported by both a
mobile shell and a new desktop shell, which each compose navigation/layout differently.

**Pros:** captures more reuse than B for genuinely surface-agnostic atoms; still gives
desktop layout freedom where it structurally needs to differ; lower long-run maintenance
once the shared component API is right.

**Cons:** designing a shared component API before both surfaces exist is genuinely hard —
real risk of recreating desktop/mobile branching one layer down inside "shared"
components; requires monorepo/workspace tooling the current single-package Vite setup
doesn't have; premature-abstraction risk.

**Effort:** similar-to-higher upfront than B if attempted day one; only pays off as a later
refactor once real desktop screens exist to harvest from. **Recommended as B's natural
endpoint, not a starting point.**

### Rejected: Approach A — one responsive React app, shared screens, CSS breakpoints

Keep `bfu-app` as a single codebase; every screen grows breakpoint-aware layouts — bottom
sheets become side panels above ~900px, the bottom tab bar becomes a sidebar, lists become
master-detail via container queries.

**Pros:** lowest short-term cost — one component set, one deploy; guarantees pixel-level
brand consistency by construction.

**Cons:** fights BFU's actual content model — bottom sheets (`UserProfileModal` at 88dvh,
`ProjectDetail`, `MentorSheets`) are the dominant modal idiom and don't "reflow" into good
desktop master-detail; even Linear — one team, no embedded-webview constraint — needed a
custom resize-observer layout engine to make this bearable, and still shipped a
deliberately reduced-scope mobile app rather than unifying. Structurally caps desktop
ambition to avoid destabilizing the primary Mini App surface — the opposite of what's
being asked. **Not recommended.**

---

## Design language: evolve, don't replace

BFU's existing palette (violet `#7B6FFF` / mint `#4ECDC4` / amber `#FFB347` / coral
`#FF6B6B` / `#A78BFA`) and Syne+DM Sans pairing are already correct raw material. Every
2025/26 award-tier dark product (Linear, Arc, Raycast, Vercel Dashboard) converges on the
same finding: **"unbelievable" comes from restraint + precision applied almost everywhere,
plus real richness concentrated in a handful of flawless moments — not more decoration
spread evenly.**

**Concrete rules to lock in:**

1. **Violet becomes the *only* action color, full stop.** CTAs, active nav state, links,
   primary buttons = `#7B6FFF` exclusively. Mint/amber/coral revert to strictly
   semantic/status ink — never a second color competing for "tap this."
2. **One more elevation micro-step**, used only for hover/press states, between `--surface`
   and `--surface-2` — makes the existing 4-token ladder read as continuous instead of 3
   flat plateaus. No 5th "desktop-only" tint; reuse the same ladder, applied more generously.
3. **Reserve real glass (backdrop-filter blur + gradient border) for exactly 3-4
   surfaces:** bottom nav (already frosted, keep), the new Trust-block hero on
   `UserProfileModal`, the `/u/{id}` public profile hero, and the Auth welcome moment.
   Recipe: `rgba(19,19,26,0.6)` + `blur(20-24px)` + a 1px gradient border (violet →
   transparent white) instead of a flat hairline.
4. **Static mesh-gradient blobs, not painted-in gradients:** 1-2 large (60-100px blur),
   low-opacity (12-20%) radial blobs behind a card stack, pinned static (no animation
   loop, GPU-free after first paint) — only behind Discover's header, the Profile hero,
   the public profile, and Auth. Nowhere else.
5. **Bento-grid composition** for the two "a lot of heterogeneous data" problems: the Trust
   block on `UserProfileModal` and the from-scratch Admin analytics dashboard. Cap at 2
   columns / ≤3 row heights on mobile.
6. **Typography stays Syne + DM Sans**, extended not replaced: push the existing
   11px/700/0.12em uppercase section-label device more aggressively as the primary way to
   signal "distinct module" inside bento cells, and add `font-variant-numeric:
   tabular-nums` on every stat number.
7. **Motion stays in the existing 0.2-0.35s budget**, split by purpose: 200-280ms
   flat/fast for anything gating the next tap (unchanged from today), and a
   spring-overshoot bezier (`cubic-bezier(0.34, 1.56, 0.64, 1)`, no JS spring library
   needed) reserved for ~5 named reward moments only: endorsement tap, achievement unlock,
   booking confirmed, follow toggle, vouch submitted.
8. **Ship a reduced-motion fallback** (springs collapse to opacity fades) — non-negotiable
   given the mid/low-end-Android constraint.

**Net effect:** BFU doesn't need a new visual vocabulary. It needs the existing one
enforced with real discipline almost everywhere so the handful of deliberately richer
moments actually stand out instead of competing with a dozen other "special" treatments.

---

## Flagship screen recommendations (beyond REDESIGN-BRIEF.md §4)

### `UserProfileModal` (in-app profile sheet)

Restructure vertical order to: **Header** (avatar, name, ✓, badges, @username) →
**currently-building promoted to a headline** directly under the name (LinkedIn-headline
pattern) → **one-line Trust Strip** (★ rating · mutuals avatar-stack preview · top
endorsed skill · vouch count, each tappable, omit zero-value items) → **one primary CTA**
(Intro, solid violet) + compact secondary row (Follow/Chat) + Interest/Report tucked into a
`showPopup` overflow menu → **composed Trust card** as a bento block (rating summary cell,
ranked-endorsement chips with endorser-avatars-on-tap, attributed vouch quote-cards
showing 2 most recent + "see all N", mutuals avatar-stack) → **Building** section (split
Founded/Joined project lists, each capped 2-3 rows + "show all", founder-crown glyph on
Founded) → Skills/Interests tag groups → Mentor card if applicable → **AI assist demoted**
to a single collapsed "✨ AI insights" expander, not peer-level buttons. Add
`impactOccurred('medium')` + brief scale/particle-burst micro-animation on endorsement
taps, `notificationOccurred('success')` on vouch/booking confirmation, `showConfirm`
(native) for Report.

### Discover (home feed)

Add a one-line trust strip to each person card (★rating · N mutual · endorsed: [top
skill], muted `--text-3`, small icons) — the single biggest gap versus analogous products,
since currently a user must open the full profile to see any trust signal beyond the
match% badge. Replace the native `<select>` sort control with a segmented pill row using
the same visual language as the existing filter chips. Add `selectionChanged()` haptic on
tab switch and `impactOccurred('light')` on filter-chip toggle. Keep "For You" as the
default distinct mode; reserve a static mesh-gradient blob behind the header only.

### Admin analytics dashboard (from-scratch, `AdminScreen` Dashboard tab)

Build four self-labeled, horizontal-oriented, touch-first (no hover-only data)
visualizations as bento cells in a single-column stack:
1. **Founder funnel** as horizontal decreasing-width bars per stage with inline count +
   conversion% + a coral drop-off line between stages, tap-through to underlying list.
2. **Cohort retention** as a compact heat-tinted grid (single-hue opacity ramp on
   `--accent`, not red-green) with a headline "Week-1 retention: X% avg" stat + sparkline
   above it, sticky first column, horizontal-scroll for older weeks.
3. **Region heatmap** reusing the existing `MapModal` SVG as-is (already correct) plus a
   companion ranked top-8 horizontal bar list as an alternate/toggle view.
4. **Skill-gap** as paired horizontal bars (demand in `--accent`/`--coral` when gap is
   large, supply in `--mint` when surplus) sorted by gap size descending, capped to top
   8-10 with "see all."

Every chart prints its actual numbers as text on the shape itself — never require a
hover/tooltip to read a value. Use shaped skeletons matching each chart's final layout.

### Public web profile `/u/{id}` (new desktop-seeding surface)

Build as the first screen of the new dedicated desktop frontend (not inside the Mini App
bundle), using SSR/Next.js if OG-image/share-card generation requires it. Structure:
full-bleed hero with avatar, name, ✓, currently-building headline, then immediately the
enlarged trust strip (before any bio copy) → project portfolio as an image-forward grid
(Behance-style cover thumbnails) → full vouch quote-cards with author photos linking back
to their own public profiles → skills → single clear "Open in Telegram / Join BFU" CTA
placed only after trust content. This is the one surface allowed the landing page's full
mesh-gradient/gradient-text/heavier-glass treatment. Bake a credibility stat (e.g. "★4.8 ·
12 vouches") into the OG share-image design.

---

## Key inspirations

- **WhatsApp Web** — closest literal architectural analogue: phone is the identity root,
  web is a genuinely separate codebase/companion surface with its own master-detail
  layout, sharing only account/data-sync and brand tokens.
- **Linear** — the reference for "restraint IS the premium feel": one accent color
  rationed to essentially one primary action per screen, hairline-border elevation, and
  even they needed a custom layout engine (not CSS breakpoints) plus a deliberately
  reduced-scope mobile app rather than unifying phone and desktop.
- **LinkedIn** (credibility highlights + headline + Featured/Projects) — the direct
  precedent for BFU's Trust Strip and "currently building as headline" recommendations.
- **PostHog retention view** — the concrete precedent for BFU's cohort-retention chart: a
  heat-tinted grid with tappable cells instead of an unreadable multi-line chart.
- **Attio** — the sidebar + fluid list/table + non-modal right-inspector-panel pattern is
  the most directly reusable desktop layout skeleton for BFU's rich profiles and project
  discovery.
- **Discord badge tray + Steam achievement states** — precedent for pulling verified/
  earned badges into the profile header as a tight icon row, and for the
  earned/in-progress-ring/locked-silhouette achievement grid states.

---

## Open questions for the founder

1. **Full parity or deliberate asymmetry** between Mini App and desktop? Every reference
   product (Slack, Discord, WhatsApp, Superhuman) deliberately ships desktop-only power
   features (command palette, keyboard shortcuts, dense analytics) and sometimes reduced
   mobile scope rather than aiming for 1:1 parity — comfortable with desktop being a
   superset in places, or is exact parity a hard requirement?
2. **Desktop auth:** Telegram Login Widget (redirect-based, simpler) vs. QR/deep-link
   handoff from the Mini App (more "companion device" feeling, matches WhatsApp
   Web/Telegram Desktop exactly but more engineering)?
3. **Timeline/resourcing:** run the phased sequence (haptics+BackButton →
   `UserProfileModal` restructure → token extraction → `/u/{id}` → desktop shell →
   analytics) as one continuous effort, or treat `/u/{id}` + desktop as a separate, later
   initiative after the Mini App redesign ships first?
4. **Reputation score timing:** the brief defers it, but the Trust Strip/card reserves a
   slot for it — commit to roughly when it ships, since that affects how much visual
   weight to reserve now?
5. **Desktop domain/hosting:** own subdomain (e.g. `app.brightfuturesuzbekistan.uz`) —
   should the known custom-domain blocker (see project memory) be resolved before or in
   parallel with starting desktop work?
6. **Backend readiness:** how much of the admin analytics data (funnel, retention,
   skill-gap) is already queryable today (Batch E shipped the endpoints) vs. needs new
   aggregation — confirm before scoping the dashboard UI as buildable.

---

## Appendix: full research reports

### A. Telegram Mini App excellence

<details>
<summary>Full report</summary>

Confirmed: BFU defines a `haptic()` helper but **never calls it anywhere**, and never
touches `BackButton`/`MainButton`/`showPopup` at all.

**Platform capabilities vs. BFU status** (sources: core.telegram.org/bots/webapps,
docs.telegram-mini-apps.com):

| Capability | BFU status |
|---|---|
| Safe area insets + events | **Implemented** (`tg.js` `syncSafeArea`) |
| `themeParams` | Not used — correct choice, BFU is deliberately dark-only |
| `BackButton` | **Not used at all** |
| `MainButton`/`SecondaryButton` | **Not used at all** |
| `HapticFeedback` | Helper exists, **called zero times** |
| `viewportHeight`/`viewportStableHeight` | Implemented |
| `showPopup`/`showAlert`/`showConfirm` | Partially used (`tgAlert`/`tgConfirm`) |
| `CloudStorage` | Not used — low priority, BFU has its own backend |
| `disableVerticalSwipes` | Implemented |
| `expand()` / `ready()` | Implemented |

**What makes praised Mini Apps (Blum, Tonkeeper, Notcoin-descendants) feel native, not
"a webpage in a frame":**
- No redundant navigation chrome — never draw a custom back arrow if `BackButton.show()`
  can do it.
- Primary CTA lives in `MainButton` when it's a single dominant action, not a hand-rolled
  sticky button fighting keyboard/z-index.
- Haptics on every meaningful state change: `selectionChanged` on selection,
  `notificationOccurred('success'|'error')` on outcomes, `impactOccurred('light'|'medium')`
  on presses. Cheapest premium-feel investment per engineering-hour that exists.
- Native dialogs (`showPopup`/`showConfirm`) for anything consequential/destructive.
- Zero perceptible boot flicker — `ready()` must fire the instant the shell is paintable.
- Motion mirrors Telegram's own idiom (fast, ~200-300ms, no bounce-overshoot) — BFU
  already gets this right, preserve exactly as-is.
- Respect the gesture surface — `disableVerticalSwipes()` already handled, keep it
  non-negotiable in any new full-screen surface.

**Common mistakes that make Mini Apps feel cheap:**
1. Duplicated/competing navigation (custom "X" + Telegram's own collapse control).
2. Ignoring `viewportStableHeight` during keyboard open.
3. Heavy blur/shadow on low-end Android (BFU already avoids this — keep avoiding).
4. No haptic on rewarding moments (endorsements, achievement unlocks, booking
   confirmation, follow) — the brief already calls these "should feel rewarding"; haptic
   is the missing half.
5. Treating a bottom sheet as a scaled-down full page rather than a focused surface —
   `UserProfileModal` at 88dvh with 5+ wrapping buttons is exactly this anti-pattern.
6. Skipping `notificationOccurred('error')` on validation failures.

**Concrete per-screen application:**
- **Bottom nav:** add `selectionChanged()` on tab switch.
- **Discover:** `impactOccurred('light')` on filter/sort; `notificationOccurred('success')`
  on Follow/Intro completion.
- **UserProfileModal:** replace the wrapping 5-button row with one `MainButton`-style
  primary CTA + compact secondary row + overflow menu for Interest/Report;
  `impactOccurred('medium')` + micro-animation on endorsement taps; native `showConfirm`
  for Report.
- **Bottom sheets generally:** reserve haptics for state changes inside the sheet (booking
  confirmed, rating submitted, role applied), not open/close transitions.
- **Full-screen surfaces** (`AdminScreen`, `EditProfileScreen`, `MentorsScreen`,
  `OpenRolesScreen`): audit for hand-rolled back arrows; replace with
  `BackButton.show()`/`hide()` tied to mount/unmount.
- **Achievements:** pair unlock reveal with `notificationOccurred('success')`.
- **Auth:** `selectionChanged()` on step-forward, `notificationOccurred('success')` on
  "Complete Registration."

**What NOT to change:** dark-only fixed header/background is correct, don't introduce
`themeParams` theming; safe-area/viewport handling in `tg.js` is already best-practice,
only extend with `BackButton`/`MainButton`/haptic call sites; motion timing (0.2-0.35s,
transform/opacity only) already matches native feel — resist longer/bouncier "premium"
motion.

**Sources:** core.telegram.org/bots/webapps · docs.telegram-mini-apps.com (Methods,
Theming, Viewport, Haptic Feedback, Events) · turumburum.com Mini App UX Guide ·
dev.to Mini Apps Creation Handbook · awesome-telegram-mini-apps (GitHub) · BingX Top TON
Mini-Apps 2026 · ton.org/mini-apps

</details>

### B. Premium desktop SaaS design

<details>
<summary>Full report</summary>

**The one meta-pattern all of Linear/Notion/Attio/Clay/Arc/Raycast/Stripe/Vercel/
Superhuman share** — "how do I show a lot without it feeling like a lot":
1. Structural density, visual restraint — lots of information, very little decoration.
2. One accent color, rationed — near-monochrome graphite scale with a single accent
   reserved for one primary action per view.
3. Structure carries hierarchy, not weight/color — sidebar → list/table → detail-pane is
   the load-bearing skeleton everywhere.

**Layout skeleton:** left rail (~220-260px nav) + fluid center (list/table/dashboard) +
right slide-in inspector panel (380-460px, non-modal). Attio's pattern is the most
directly reusable: selecting a record opens a right-hand panel with inline detail without
losing table scroll position — should replace the Mini App's modal-takeover pattern
(`UserProfileModal`, `ProjectDetail`) on desktop. Reserve full-width (no right panel) for
Analytics/Admin dashboards and the public `/u/{id}` profile page.

**Information density without clutter:** dense rows/tables for desktop list views (not
mobile-style cards); 8px grid, fixed row heights; reuse BFU's existing section-label
pattern as table column headers/inspector field labels; default row = trust strip per row
(avatar, name+✓, rating, mutuals, top skill, intention badge); admin dashboards lead with
3-4 hero metric cards (number + delta + sparkline) then one focused chart per concern, not
a wall of charts.

**Command palette:** BFU has zero of this — highest-leverage "professional" lever
available on desktop. Recommend a global `Cmd/Ctrl+K` palette (via `cmdk`, used by
Linear/Vercel/Raycast) combining search+navigate+act, result groups
People/Projects/Events/Actions. Keep v1 to navigate+search.

**Premium dark mode technical specifics:** shadows don't read on near-black backgrounds —
elevation must come from luminance stepping, not shadow. BFU's existing 4-token ladder
(`--bg` → `--surface` → `--surface-2` → `--surface-3`) is already textbook-correct (caps
elevation at 4-5 steps) — reuse as-is, don't add a 5th "desktop-only" tint. Reserve
accent-glow exclusively for true primary CTAs.

**Applying to BFU's three flagship surfaces:**
- Rich profiles: dense row list → right-panel inspector; `/u/{id}` gets a separate
  full-bleed hero treatment since it's shared/marketing-adjacent, not a workspace tool.
- Project discovery: same row+inspector pattern; command palette for create/search/jump.
- Analytics dashboards (biggest greenfield): full-width, no inspector panel; `--mint`/
  `--coral` for good/bad data signal exclusively, violet reserved for navigation/brand.

**Build checklist:** `DesktopShell` component (rail+center+inspector); dense row/table
primitive with 3-state surface ladder; global `Cmd/Ctrl+K` via `cmdk`; no new
color/elevation tokens; dashboard kit (metric card + horizontal bar + cohort heat-grid +
Uzbekistan SVG map); `/u/{id}` gets its own full-bleed, more-gradient-forward treatment.

</details>

### C. Analogous products (LinkedIn, Wellfound, YC Bookface, Product Hunt, Lunchclub, Indie Hackers)

<details>
<summary>Full report</summary>

**Core pattern across all six: identity → proof → activity, in that order, above the
fold.** 1) Identity (photo, name, headline, verification — resolves in 3-6s). 2) Proof
(compact glanceable trust strip, not a wall of separate widgets). 3) Activity/output
(what they've actually done).

**BFU's `UserProfileModal` violates this order badly** — proof layer (rating,
endorsements, vouches, mutuals) is buried at the very bottom, after two AI utility buttons
that have nothing to do with credibility. No analogous product puts "AI assist tools"
above social proof.

**Recommended vertical order** (validated across all six products): Header → Trust strip
(one row: ★rating · mutuals-preview · top endorsed skill · vouch count) → Primary CTA row
→ "Currently building" highlight → Building/Trust section (stats, projects, endorsements,
vouches together) → Skills/Interests → Mentor card → AI assist demoted to a lighter
"AI tools" affordance.

**Trust signals should compose into ONE reputation block, not scatter** — LinkedIn's
"credibility highlights" (2025) explicitly bundles recommendations + endorsement counts +
verification into one visual cluster. BFU currently spreads these across 4 unrelated code
locations. Build a `TrustStrip` component; place under the header, before action buttons.
Design with a reserved leading slot for a future reputation score.

**"Currently building" is doing more work than BFU credits it** — across LinkedIn
(headline), Wellfound (stage/role/looking-for), YC Bookface ("what they're working on
now" = defining feature of a living resume), Indie Hackers (entire product built around
this). Promote `currently_building` to sit directly under the name in the header block,
not inside `ProfileExtras`.

**Founder/project history should read as a timeline/portfolio, not a flat list** — Indie
Hackers/LinkedIn both present work history as a sequence with status. BFU's `ProjectRow`
already does icon+name+active/closed pill (good); gap is founded vs. joined aren't
visually separated enough. Split into labeled Founded (founder-crown glyph) / Joined
sub-sections, capped 2-3 rows + "show all."

**Discovery feed: match/fit signal must be visible on the card, not just inside the
profile** — Lunchclub's entire UX is built around algorithmic match justification being
visible before opening a profile. BFU's `match_pct` badge is directionally right but the
rest of the trust signal set isn't surfaced on the card at all. Add a compact one-line
trust strip to the Discover person card.

**Segmented "mode" navigation, not a `<select>` dropdown** — none of the six analogous
products use a native HTML `<select>` for primary feed control. Replace BFU's sort
`<select>` with a segmented pill row matching the existing filter chip visual language.

**Project pages: team credibility + momentum (updates) are differentiators** — Indie
Hackers' core insight is momentum transparency. BFU's `ProjectDetail` already has both
pieces structurally; gap is presentation — updates render as a plain bordered-list, same
weight as static requirement chips. Give `updates` a timeline treatment (connected
line/dot markers), positioned near Team.

**Public web profile should borrow LinkedIn's "public view" pattern** — same
identity/trust/portfolio hierarchy, wider, single strong CTA. An OG-card/share-preview
design (name + headline + one credibility stat baked into the image) is what makes a
shared link pull people in.

**Summary table: pattern → concrete BFU file change**

| Pattern source | Insight | File / change |
|---|---|---|
| LinkedIn credibility highlights | Trust signals = one composed block near top | `UserProfileModal.jsx` — new `TrustStrip`, moved above action buttons |
| LinkedIn headline / YC "building now" | Currently-building = identity, not a stats card | `UserProfileModal.jsx` header + `ProfileExtras.jsx` |
| Lunchclub / Wellfound list-level fit signal | Trust visible before tap-in | `DiscoverScreen.jsx` — one-line trust strip on card |
| Wellfound / YC segmented filters | No native `<select>` on primary discovery UI | `DiscoverScreen.jsx` — pill row instead |
| Indie Hackers momentum timeline | Updates feed = emotional core | `ProjectDetail.jsx` — timeline treatment |
| Indie Hackers / LinkedIn Featured | Founded/joined split with hierarchy | `ProfileExtras.jsx` — labeled sub-sections |
| LinkedIn public profile pattern | Public page = same hierarchy, wider, one CTA | `/u/{id}` route |
| Product Hunt / LinkedIn verification-as-hero | Verification reads instantly | Keep `checked` ✓ in header, feed into trust strip |

</details>

### D. 2025/26 visual trends

<details>
<summary>Full report</summary>

**Core finding: "unbelievable" in 2025/26 means restraint + precision, not more
decoration.** Every award-caliber dark UI converges on: one accent rationed hard (Linear's
own redesign writeup: accent appears on essentially one primary action per screen); depth
from elevation + hairline borders, not drop shadows; glassmorphism "tamed" — 2026 coverage
frames it as subtle translucent layers + thin gradient borders + noise texture, used
sparingly, not the whole UI; bento-grid modularity as the dominant layout language for
surfacing rich heterogeneous data without reading as a form.

BFU's brief already independently arrived at the right instinct — the fix is "concentrate
the drama into fewer, better-placed moments, and let restraint do the premium work
everywhere else," not "add more gradient."

**Palette evolution rules:**
1. Violet stays the only "action" color — mint/amber/coral become strictly status/
   category ink, never a button someone taps to progress a flow.
2. Neutral surfaces get one more depth micro-step for hover/press continuity.
3. Reserve real glass for 3-4 surfaces only (bottom nav, Trust-block hero, public web
   profile hero, Auth welcome). Recipe: `rgba(19,19,26,0.6)` + `blur(20-24px)` + a 1px
   gradient border (violet → transparent white) rather than a flat hairline — highest-
   leverage "looks expensive" move, near-zero render cost.
4. Mesh gradients: floating orbs behind glass, not painted into it — 1-2 large, very soft
   (60-100px blur), low-opacity (12-20%) static radial blobs, pinned static (no animation
   loop) so it's GPU-free after first paint.
5. Amber for trust/rating stays gold-adjacent — its rarity is the asset, don't expand.

**Layout: bento-style composition** for `UserProfileModal` Trust section (larger cell for
rating+summary, smaller cells for mutuals/endorsements, full-width cell for vouches) and
the admin analytics dashboard (funnel as wide hero cell, retention as medium cell, region
heatmap as large cell, skill-gap as narrow cell). 2 columns max, ≤3 row heights at mobile.

**Typography:** keep Syne + DM Sans — already satisfies the 2025/26 winning formula
(distinctive geometric display + neutral highly-legible body). Extend the existing
uppercase section-label device into bento cells; add `tabular-nums` on stat numbers
(near-zero cost, measurably increases "real product" perception). Do not add a third
family or reach for serif.

**Motion:** 200-500ms is the accepted micro-interaction window (200-280ms for gating
taps, 300-400ms for sheet-open). Only animate `transform`/`opacity`. Physics-based easing
over duration-only easing is the real 2025/26 shift — a light spring/overshoot bezier
(`cubic-bezier(0.34, 1.56, 0.64, 1)`) on a small set of rewarding moments (endorsement tap,
achievement unlock, booking confirmed, follow toggle, "For You" mode switch). Everywhere
else stays fast/flat. Ship a reduced-motion fallback (springs collapse to opacity fades).

**Applying to the two flagship screens:** `UserProfileModal` gets a glass-hero header
(gradient border, static mesh blob behind avatar) as the one in-app "expensive" moment;
action row collapses to one solid violet primary CTA + icon-only secondary row. `/u/{id}`
is the one surface allowed more render budget — full mesh-gradient hero, animated
gradient-text name treatment (reuse the landing page's proven sweep), heavier glass.

**Summary — keep as-is vs. evolve:**

| Keep as-is | Evolve (bounded) |
|---|---|
| Violet as sole action color | Gradient-border on 3-4 hero/glass surfaces only |
| Syne + DM Sans pairing | Tabular-nums on stat numbers; section-label into bento cells |
| Subtle-border elevation over shadows | One intermediate surface step for hover/press |
| 0.2-0.35s motion range | Split: flat/fast gating taps vs. spring-overshoot on ~5 reward moments |
| Mint/amber/coral as semantic color | Never a second "action" color competing with violet |
| Flat/skeleton-first loading | No change |
| — | Bento-grid for Trust block + Analytics dashboard |
| — | Static mesh blobs reserved for Discover header, Profile hero, Public profile, Auth |

</details>

### E. Adaptive architecture (desktop + Mini App)

<details>
<summary>Full report</summary>

**TL;DR:** every successful product (Slack, Discord, Notion, WhatsApp, Superhuman) treats
"same backend, deliberately different frontends per surface" as the default — the split is
almost never a pure CSS-breakpoint responsive layout once a product has both a compact
"embedded/companion" surface and a spacious "primary work surface." The one thing they DO
share aggressively is the design token layer and component vocabulary (color, type scale,
spacing, iconography, motion feel), not the component implementations or screen layouts.

**How the reference products actually do it:**
- **Slack:** native apps per platform + web client, shared design system (SDS = tokens +
  component spec, not shared implementation). Desktop: persistent left rail + wider
  sidebar + three-pane master-detail (threads open as a 4th pane on wide screens).
  Mobile: bottom tabs, full-screen pushes.
- **Discord:** desktop/browser share the same React codebase; mobile (React Native) is
  separate — cleanest real-world precedent for "two frontends, one shared backend."
  Desktop: fixed three-column layout, never collapses to phone width. Mobile: bottom tabs
  + swipe-out server drawer.
- **Notion:** closest to genuine single responsive codebase, but branches hard at the
  navigation layer — persistent resizable sidebar (desktop) vs. collapsible drawer +
  bottom quick-actions (mobile). Below ~768px it's effectively a different app shell
  wrapping the same block-editor core. Validates: responsive-single-codebase works for ONE
  deep canvas surface, much less well with 5+ distinct top-level sections (BFU's
  situation).
- **Linear:** single web codebase, needed a custom `ResponsiveSlot`/resize-observer
  system (not CSS breakpoints) because fixed breakpoints kept breaking the dense
  sidebar+list+detail layout. Did NOT make the three-pane tracker work on a 375px phone —
  "Linear Mobile" is a separate, deliberately reduced app.
- **WhatsApp Web:** the purest "compact primary + expansive companion" precedent and most
  structurally similar to BFU. Genuinely separate codebase from mobile; permanent
  two-pane layout, no bottom tabs at all, mirrors only a subset of what the phone can do.
  Shared: account/identity, data sync, visual language at the token level. Desktop layout
  is a from-scratch master-detail design.
- **Superhuman:** UI metaphor changes entirely per platform — desktop is dense,
  keyboard-first list+reading-pane; mobile is swipe-gesture, one-email-at-a-time.
  Deliberately did not unify interaction models across platforms.

**Patterns that generalize:** design tokens and backend are shared near-100%; screens,
navigation components, and interaction models are shared near-0% once a product has more
than ~3 top-level sections plus a companion desktop surface.

**Three approaches evaluated for BFU** — see the "Architecture" section above for the
full A/B/C writeup (this report is the source of that analysis).

**Recommended sequencing:**
1. Now: extract `@bfu/tokens` (CSS variables + `TAG_COLORS` + font imports) and
   `@bfu/i18n` out of the Mini App into shared packages.
2. Next: scaffold `bfu-desktop` (React 19 + Vite, or Next.js if `/u/{id}` needs SSR for
   OG-image/share-link SEO). Build Telegram Login Widget auth handoff. Ship `/u/{id}`
   first.
3. Then: desktop shell (sidebar nav) + Discover master-detail, reusing the same backend
   endpoints Discover already calls.
4. Then: admin analytics dashboards — the screen that most structurally wants desktop.
5. Ongoing: once 3+ desktop screens exist, harvest genuinely-identical atoms into
   `@bfu/ui` (Approach C), informed by evidence rather than upfront guessing.

**Sources:** Linear's own redesign writeups · NN/g mobile navigation patterns · UXPin
mobile nav patterns · Midrocket web navigation patterns · Material Design navigation
patterns · Telegram Mini Apps official docs · Habr Mini Apps overview · Nadcab Mini Apps
architecture guide · Daffodil Software (common vs. separate codebase) · BrowserStack
responsive breakpoints 2025 · direct product knowledge of Slack/Discord/Notion/WhatsApp
Web/Superhuman shipped clients.

</details>

### F. Trust, reputation & social proof UI patterns

<details>
<summary>Full report</summary>

**Core lesson: every platform that does trust well separates signals into two tiers.**
- **Tier 1 — instant-scan layer.** One glance answers "can I trust this person?" Usually
  1 badge + 1 number + 1 density indicator, directly under the name, above the fold,
  before any tap. GitHub's green squares, LinkedIn's headline + connection count, Steam's
  level badge, Bumble's blue check all occupy this exact position.
- **Tier 2 — evidence layer.** Below the fold, organized by type of proof, each with its
  own compact module, not a flat list.

BFU currently only has Tier 2, scattered, with no Tier 1 summary. **Inventing a Tier 1
"trust strip" is the single highest-leverage change.**

**Trust Strip composition** (Tier 1, header-adjacent): one horizontal line, small
icons+numbers, tap-through to the relevant Tier 2 section:
```
✓ Verified   ★ 4.8 (12)   👍 34 endorsed   💬 8 vouches   👥 6 mutual
```
Use existing tag colors (amber=rating, violet=endorsements, neutral `--text-2` for
vouches/mutuals). Cap at 4-5 items; omit zero-value signals rather than showing "0" (a
profile with no ratings shouldn't show "★ 0.0 (0)" — reads as a red flag, not neutral).
Forward-compatible with a future score: the score becomes the leading item in this same
strip (`92 · ✓ Verified · ★4.8 · ...`).

**"Trust" section composition** (Tier 2, in-body) — one card with internal sub-sections
(G2/Clutch pattern), not four separate cards:
1. **Rating summary** — big number + star row + count, left-aligned.
2. **Skill endorsements — upgrade from "tag with a number" to a ranked mini-leaderboard.**
   LinkedIn's actual pattern: skills ranked by endorsement count, top 3 given visual
   prominence, rest collapse under "+N more." Endorsement count drives chip fill intensity
   (0=outline, 1-4=light fill, 5+=solid+count badge). Endorser avatars on hover/tap —
   biggest "feels real, not gamed" upgrade available.
3. **Vouches — testimonial cards, not list rows.** Compact quote-card carousel: author
   avatar+name (tap→profile), 1-2 line quote (truncate+"read more"), small context tag
   ("Worked together on [Project]") — far more credible than unattributed testimonial. If
   3+, show 2 most recent + "See all N."
4. **Mutual connections** — overlapping-avatar-stack + "and N others," tappable. Most
   trust-building widget on LinkedIn/Facebook because it's social, not institutional,
   proof — weight visually close to vouches.
5. **Verified + earned badges** — belong in the header, next to name (verified) + small
   badge row underneath (earned) — not buried in the Trust card body. Discord/Steam
   precedent: tight horizontal row of 16-20px circular icons, tap for tooltip.

**Making endorsing/vouching feel rewarding, not just counter++:**
- **Endorse tap:** chip scale-bounces (1→1.15→1.0, ~200ms spring), 3-5 small particles in
  the skill's tag color radiating outward, count increments with a number roll-up (not
  instant swap) — the "digit odometer" pattern from TikTok/Instagram like-counters.
  Haptic: `impactLight` or `notificationSuccess`. Chip fill state visibly steps up if the
  tap crosses a fill threshold — rare, extra-satisfying "leveled up" moment. Un-endorse
  (toggle) should be visually quiet (simple fade, no particles) — celebrate positive
  action, don't punish negative.
- **Vouch flow** (higher-effort, deserves bigger payoff): brief full-width success state
  inside the sheet on submit, then auto-dismiss. Notify the recipient with a distinct
  celebratory inbox item ("🎉 [Name] vouched for you"), not the same gray row as a routine
  notification. Optional: after two people complete a project together, surface a
  one-tap "Vouch for [teammate]?" prompt.
- **Rating flow** (`RateSheet`): stars fill left-to-right with a spring bounce per star as
  the user drags/taps, amber glow. "Thanks for rating" confirmation showing the resulting
  aggregate immediately.
- **General rule:** reserve biggest flourishes (particles, full-screen confirmations) for
  low-frequency, high-meaning actions; keep high-frequency actions (endorse tap) snappy
  and cheap so power users don't feel throttled by their own reward system.

**Achievements — same reward psychology, separate surface:**
- On profile (teaser): 2-3 most prestigious badges only, small icon row near header.
- On own Settings screen (full collection): Earned = full-color, solid fill, subtle
  glow/shine on first view. Locked-in-progress = dimmed silhouette + a real progress
  ring (not flat bar) — reads as "closer to unlocked" far better. Locked-not-started =
  fully silhouetted/grayscale, optionally a "?" — mystery is itself motivating (Steam/
  PlayStation trophy "fog of achievements" pattern).
- "Latest unlocked" hero moment: one-time celebratory card/toast (confetti-lite burst,
  haptic success), then settles into the grid.

**Public web profile `/u/{id}` — trust as the hero, not a footnote:** promoted from "a
section" to the visual centerpiece (G2/Clutch vendor page pattern — lead with aggregate
score before service description). Hero → trust strip (sized up) → bio → portfolio grid
with cover art → full vouch quote-cards with author photos linking to their own public
profiles (credibility network effect) → CTA only after trust content.

**Concrete build notes:**
- Reuse one `AvatarStack` component for both mutuals and endorser-avatars.
- Color discipline: amber=ratings, violet=endorsements exactly per existing tag-color
  map — the composition is new, not the palette.
- Score-ready layout: reserved leading slot in the trust strip/Trust card header.
- Trilingual safety: labels ("34 endorsed," "8 vouches") run long in Russian — icon-first,
  number-second, drop the word on the compact strip (available via tap/tooltip).
- 360px stress test: a 5-item trust strip is the kind of row that breaks first on cheap
  Android — budget for graceful 2-line wrap or truncate to 3 items + "..."

</details>

### G. Mobile-friendly data visualization (admin analytics)

<details>
<summary>Full report</summary>

**Scope:** four from-scratch dashboards for `AdminScreen` — founder conversion funnel,
cohort retention, region heatmap, skill-gap bars. All must render inside a 430px-max,
dark-only shell and survive down to ~360px width.

**Grounding:** current dark-mode/mobile practice at Mixpanel, Amplitude, PostHog, Vercel
Analytics, Plausible converges on: **kill anything that needs a legend, an axis, or
hover-to-decode; replace with self-labeled horizontal shapes, single-series sparklines,
and color-coded tiles that read at a glance.**

**1. Founder funnel — horizontal bar-funnel, not a tapered funnel shape or Sankey.** A
true tapered funnel needs width to read its taper and doesn't label well at ~390px.
Horizontal bars of decreasing width, top-aligned, each showing stage name + absolute
count + conversion% inline:
```
VIEWS                                    2,840
█████████████████████████████████████████  100%
APPLIED                                    412
███████████████                             14.5%
                                    ↓ -85.5% drop
ACCEPTED                                    89
████                                        21.6%
```
Bar fill: `--accent` stage 1 → `--accent-2` stage 2 → `--mint` stage 3 (terminal success
state). Label the drop-off between stages as its own coral-tinted line — the number
founders actually want, invisible in a plain tapered funnel. Tap a stage → bottom sheet
with underlying list (reuses existing sheet idiom).

**2. Cohort retention — compact heat-tinted grid (PostHog-style), not a multi-line
curve.** A classic multi-cohort line chart is the single worst chart type for 360px dark —
needs a legend, distinguishable colors (hard in violet-monochrome), unreadable below
tablet width. PostHog leans on a table/grid colored by retention%, cells tappable to
drill in:
```
COHORT        SIZE   W0    W1    W2    W3
Jun 23–29      34   100%   62%   41%   38%
Jun 16–22      28   100%   58%   35%   29%
```
Cell tint: single-hue opacity ramp on `--accent` (not red-green — stays on-brand, avoids
colorblind issues). Reserve coral only for a genuinely alarming drop (<15%) as an outlier
flag. Only 3-4 week-columns on phone, horizontal-scroll for older weeks, sticky first
column. Alternate compact mode: one summary sparkline per cohort row + current W-latest %
as a bold number. Headline stat card above the grid: "Week-1 retention: 61% avg" + trend
sparkline.

**3. Region heatmap — reuse the existing `MapModal` SVG directly.** This is the one
visualization BFU is already doing correctly — an actual geographic choropleth beats any
abstract chart for "where are our people." Keep opacity-ramped regions on `--accent`. Add
a compact horizontal legend strip (4-5 swatches, `--surface-2`→full `--accent`, numeric
range labels) — replaces hover tooltip need. On region tap: existing stat-card pattern,
extended with founder-specific numbers in admin context. Add a ranked top-8 horizontal bar
list as an alternate/companion view (map for spatial intuition, list for exact ranking —
standard combo in Amplitude/Mixpanel geo reports).

**4. Skill-gap — horizontal paired/diverging bars, one row per skill.** Two-series
comparison (demand vs supply) is exactly where horizontal bars dominate — full skill name
renders left-aligned with no rotation/truncation risk (Russian/Uzbek labels run ~1.4x
longer). Paired horizontal bars (recommended default):
```
React                    ▓▓▓▓▓▓▓▓▓▓▓▓  demand 24
                         █████         supply 9        GAP
```
Demand bar: `--accent` (or `--coral` where gap is large/urgent). Supply bar: `--surface-3`
outline, or `--mint` when supply≥demand (surplus=good news). Sort by gap size descending.
Small delta chip at row's right edge (`+15` gap in coral, `✓ covered` in mint). Alternate
more-compact layout: single diverging bar per skill split at center zero-line — use for a
"top 10 gaps" summary card, paired-bar view for full drill-down. Cap default view at
top 8-10 by gap, "See all" expansion.

**Shared rules across all four:**
1. No chart needs a hover state to be understood — every value printed as text on/beside
   the shape.
2. One hue family for "heat"/intensity (opacity ramp on `--accent`), reserved separately
   from semantic colors (mint=good, coral=alarming, amber=attention) — don't let
   intensity-encoding and status-encoding fight over the same colors.
3. Horizontal, not vertical, wherever there's a label per item — Uzbek/Russian labels are
   long, phone width is the binding constraint.
4. Every dashboard module is a card (bento-style tile), section-label header, one-line
   "what this means" caption under the title.
5. Skeletons required — shaped to each chart's final layout (bar-shaped, grid-shaped) so
   loading doesn't jump/reflow.
6. Numbers first, decoration second — the actual number should be legible even with the
   chart rendering disabled.

</details>

---

**Companion document:** `docs/superpowers/REDESIGN-BRIEF.md` (brand tokens, current IA,
screen-by-screen redesign direction for the Mini App itself).
