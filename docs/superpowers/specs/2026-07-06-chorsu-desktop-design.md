# Chorsu — BFU Desktop Web Design Brief

> **What this is.** The locked art-direction + design system for BFU's new
> **desktop web app** — codename **Chorsu** ("the living bazaar"). This is the
> single document to feed **Claude Design** for visual execution, and the source
> of truth for engineering when we wire it up. It supersedes the earlier
> mobile-focused `REDESIGN-BRIEF.md` for the DESKTOP surface (that brief + the
> `REDESIGN-RESEARCH.md` remain valid background for the Mini App).
>
> **How we got here.** The founder rejected every conventional direction
> (violet dashboard, LinkedIn banner+cards, gold/black) as "very very ugly" and
> "cramped," and asked for a design "people stay on for hours without feeling
> time pass." Deep research (`REDESIGN-RESEARCH.md` + a second experiential pass)
> produced three bold "worlds": **Yulduz** (cosmic constellation), **Qog'oz**
> (warm editorial paper), and **Chorsu** (living bazaar). **The founder chose
> Chorsu.** Living mockups shown + approved: a city/discovery view and a
> `/u/{id}` profile ("lit window").

---

## 0. The core idea (never lose this)

**Design a place, not a page. A scene, not a database.**

Every rejected direction failed for one reason: they were *layouts wearing a
skin*, not *worlds you enter*. A dashboard says "here is data about a person."
Chorsu says **"you're walking through a warm, humming city of Uzbekistan's
builders at dusk — every person has a lit window, someone is always building
right now, and you wander from one glowing profile into the next until an hour's
gone."**

The three things that make people lose hours here, in priority order:
1. **Presence** — the space is *inhabited* and *alive before you touch it*
   (people "online now," an ambient ticker breathing real activity).
2. **Serendipity with no bottom** — the page never "finishes"; there's always
   one more worthwhile hop ("Threads from here").
3. **Warmth + tactility** — firelit, hand-made, physical (film grain, ember
   light, springy motion) — the opposite of a cold SaaS grid.

**Non-negotiable discipline (this is what keeps it from becoming "cramped"
again):** ~60% negative space, generous padding, ONE accent family, and *few
simultaneously-moving elements per viewport*. Chorsu is the direction closest to
the failure mode the founder rejected — busy ≠ alive. Airy-but-alive is the bar.

---

## 1. Brand & palette (exact)

Firelit high-desert dusk. Warm-black, never pure black. Central-Asian identity
comes through *warmth and light* (a firelit bazaar, ceramic/ember hues), **never
literal ornament or a flag**.

| Token | Hex | Role |
|---|---|---|
| `--bg` | `#0B0A08` | App background — warm-black, high-desert dusk |
| `--surface` | `#1A1815` | Card / cell background |
| `--surface-2` | `#232019` | Raised / inner tiles, pressed states |
| `--hair` | `#332E26` | Hairline borders |
| `--text` | `#F5F1E8` | Primary text — warm off-white |
| `--muted` | `#A8A093` | Secondary text |
| `--ember` | `#FF6A3D` | **"Online / live now" signal** — the pulse of the city |
| `--amber` | `#E8A15C` | Primary warm accent (CTAs, highlights, ring fills) |
| `--terra` | `#C0563B` | Terracotta — gradient partner to amber |
| `--teal` | `#12564F` | Deep teal — the cool counterweight in ember gradients |
| `--green` | `#7FB069` | Trust-positive (vouched, verified, "raising/looking") |

**Per-person ember gradient (signature detail).** Every builder is seeded a
gradient from a small ember set so each profile feels bespoke without new colors:
`amber→terra`, `green→teal`, `#F0B429→terra`, `#5EC5B6→teal`, etc. Avatars,
washes behind cells, and connection dots use the person's seed. Deterministic
from user id, so a person's color is stable everywhere.

**Film grain.** A fixed SVG fractal-noise overlay at **opacity 0.04–0.045**,
`mix-blend` over the whole app — this is the single cheapest "physical, warm, not
a webpage" cue. Keep it.

**Firelit glow.** Two large, soft radial gradients (ember from one corner, teal
from another, ~14–18% opacity, heavily feathered) fixed behind content so the
space glows like a fire is just off-screen. Static or extremely slow drift.

**Light mode:** none for now. Chorsu is dark/firelit by nature. (A warm "paper"
light theme was its own concept, Qog'oz — not chosen.)

---

## 2. Typography (exact, all free/web)

The type is where "designed by a real studio" lives. Three voices:

- **Display — `Bricolage Grotesque`** (variable, Google Fonts). Big, warm,
  characterful "award-site 2026" grotesque. Names, section heroes, big numbers.
  Weight 600–800, tight tracking (`-0.02em`) at large sizes.
- **Human accent — `Instrument Serif`** (Google Fonts), *italic*. Used ONLY for
  the emotional/human line — the "**is building** …" statement, the
  "Threads from here" heading, vouch quotes. This italic serif against the
  grotesque is the signature type contrast. Use sparingly — it's the spice.
- **Body / UI — `Satoshi`** (Fontshare) or fall back to `Bricolage Grotesque`
  at text sizes. Clean, neutral, legible.
- **Data / tickers / counts — `Space Mono`** (Google Fonts). Reputation numbers,
  metrics, "34 online," timestamps, eyebrow labels (uppercase, `0.16em` tracking).

**Type as statement.** A founder's NAME and what they're BUILDING are the loudest
things on their page — hero-scale, not form-field-scale. "Aziz Karimov *is
building* Solar Farm" reads like a headline, not a label:value pair.

---

## 3. Space, shape, motion

- **Radius:** cells/cards `20px`, inner tiles/buttons `11–14px`, pills `99px`.
- **Spacing:** page gutter 40px, cell padding 28px, inter-cell gap 20px, section
  rhythm 36–44px. **Err generous** — airiness is the anti-"cramped" insurance.
- **Elevation:** warm hairline borders + a soft ember-tinted shadow on hover
  (`0 24px 60px rgba(0,0,0,0.5), 0 0 40px rgba(255,106,61,0.12)`), never flat
  grey drop shadows.

**Motion system — "warm & springy, alive when idle."** Tooling: **Lenis**
(buttery inertial smooth-scroll — alone makes it feel 2× more expensive) +
**Framer Motion** / **GSAP** for springs and reveals.
- **Idle life:** "online" dots pulse; the ambient ticker cycles; the firelit glow
  drifts slowly. The space is never dead — but only a *few* things move per
  viewport.
- **Reward springs (the magic moments):** hover-bloom on a builder card; the
  reputation ring spring-filling (`cubic-bezier(0.2,1.3,0.4,1)`); metric
  count-ups; achievement "pops"; save-to-list. Reserve overshoot springs for
  these ~5 rewarding moments, keep everything else calm/fast.
- **Respect `prefers-reduced-motion`:** springs collapse to fades, ticker holds,
  glow goes static. Non-negotiable.
- **Performance:** transforms/opacity only; this is desktop web (can be richer
  than the low-end-Android Mini App) but must stay smooth — jank reads as
  "broken," which is worse than boring.

---

## 4. Signature mechanics (the "lose hours" engine)

These are what make Chorsu *Chorsu* — not decoration, the actual retention loop:

1. **Ambient live ticker.** A quiet, always-present line that breathes real
   activity: *"Aziza just added a project · 12 builders online in Tashkent ·
   Rustam is looking for a co-founder right now."* Cycles every ~2.5–3s. This is
   the heartbeat that says "something is always happening here."
2. **Presence.** "Online now" builders softly pulse (ember). A live count
   ("34 builders online now"). Recruiters/founders feel they've walked into a
   living room, not a directory.
3. **Hover-bloom.** Hovering ANY builder blooms them into a living card — photo,
   "building X," a top-vouch quote, and a **reputation ring that spring-fills** —
   with a magnetic "**+ Save**" affordance. Browsing itself is delightful.
4. **Threads from here (never bottoms out).** Every profile/screen ends with
   contextual next-hops: *"3 builders solving the same problem," "people who also
   volunteered in Fergana," "if you like Aziz, meet Malika."* The page has no
   bottom — always one more worthwhile click.
5. **Save to your list ("Constellations").** Anyone — even logged-out — can
   collect builders into a personal saved list, giving every visitor
   (recruiter, investor, founder) a growing stake and a reason to return.

---

## 5. Screens (desktop web)

**Build order:** `/u/{id}` public profile first (already scoped, zero mobile
equivalent to protect, the external-credibility surface), then the City /
Discovery view (where "hours" happen), then the rest.

### 5.1 `/u/{id}` — public profile ("one lit window") — FIRST BUILD
Approved mockup grammar:
- **Top bar:** BFU logo (the real gold mark) + "Save to your list" + "Open in
  Telegram" (amber gradient primary).
- **Identity strip:** ember-gradient avatar (with pulsing "online" dot), name in
  big Bricolage + verified ✓, "**is building …**" in Instrument Serif italic
  amber, one sub-line (city · roles · online).
- **Bento (airy, varied cell sizes — NOT a uniform card grid):**
  - **Hero "Currently building" cell** (2×2) — project cover, name, description,
    live metrics (open roles / co-founders / launching) with count-up.
  - **Reputation cell** — warm radial ring that spring-fills (4.8), "12 ratings ·
    34 endorsements." (Not a corporate star row.)
  - **"Looking for" cell** — what they need next (green).
  - **Achievements** — collectible row, earned vs locked, pops when earned.
  - **Vouches** — Instrument Serif pull-quote + voucher face + shared project.
  - **Connections** — ember-tinted avatar stack + "N mutual with you."
- **Threads from here** rail at the bottom.
- Public, shareable, SEO-indexable, with a strong OG share image (bake a
  credibility stat: "★4.8 · 8 vouches" into the card). Text stays real HTML for
  legibility + indexing; effects are atmosphere on top.

### 5.2 City / Discovery — "building tonight"
The approved city view: a grid of builder "windows," per-person ember washes,
"online" pulses, the ambient ticker up top, hover-bloom on every card, and the
"Threads from here" serendipity rail. This is the flagship "wander for an hour"
surface. Reuses the existing match-scoring backend as the serendipity engine,
regions as clustering, reputation as visual weight.

### 5.3 Everything else (later, same language)
Project pages, mentor booking, events, admin analytics — all inherit the Chorsu
system (firelit palette, Bricolage/Instrument/Mono, bento grammar, presence).
Admin analytics gets the from-scratch dashboards (funnel, retention, region
heatmap, skill-gap) in warm firelit chart styling. Scoped in a later brief.

---

## 6. Architecture (unchanged — Approach B)

- **Separate new desktop frontend** (Next.js, App Router — SSR for `/u/{id}` OG
  images + SEO), sharing the **same FastAPI backend** (endpoints already exist),
  a shared **design-tokens** module (this palette + type), and the **i18n**
  strings. NOT responsive breakpoints on the Mini App. The Mini App stays the
  primary mobile surface, untouched, for now.
- **Auth:** Telegram Login Widget / QR handoff for desktop (Mini App uses
  `initData`). `/u/{id}` is public/logged-out.
- **Hosting:** temp `.vercel.app` first, custom domain later. (Backend stays on
  Railway through the launch spike; DO droplet migration is post-spike.)
- **Motion libs:** Lenis + Framer Motion (and GSAP where scroll-choreography
  needs it). Fonts self-hosted / from Google + Fontshare.

---

## 7. The one real risk (design against it)

**Low density = an empty city, which is worse than an empty gallery.** Presence
and serendipity feel embarrassing with 12 people. Mitigations, all in-design:
- Seed ambient life: the ticker can surface *real* recent activity across the
  whole community (new projects, endorsements, online count) so even a small
  community feels in motion.
- Cluster by city/region so "Tashkent tonight" always looks populated.
- Graceful, beautiful low-count states (a small, warm, curated bazaar reads fine;
  a sparse cold grid does not).
- Never show a literal "0 online" — show recent activity instead.

Second risk: **creeping back to "busy/cramped."** Guard with ruthless negative
space, one accent family, and a hard cap on simultaneously-moving elements per
viewport. When in doubt, remove.

---

## 8. How to use this with Claude Design

1. Paste §1–§4 (palette, type, space, motion, mechanics) as the design-system
   foundation FIRST — every screen must use these exact tokens/fonts so it reads
   as one world.
2. Generate **`/u/{id}` profile first** (§5.1) — it's the first build and the
   credibility surface. Iterate to a hi-fi frame.
3. Then the **City/Discovery** view (§5.2) — the flagship "lose hours" surface;
   make sure presence + hover-bloom + threads are all present.
4. Keep the reference feel: **Cosmos.so** (buttery infinite canvas, curated
   calm), **Bento.me** (asymmetric live-embed "magazine of a person" grammar —
   pattern, not the product), **Read.cv/Posts** (a person as a beautiful page),
   **Spotify Wrapped** ("data as personal narrative" for the trust reveal),
   **Locomotive/Lenis** (inertial smooth-scroll baseline). The whole point is
   *airy-but-alive, warm, tactile* — never a dense grid.
5. Export frames → hand to engineering as the desktop build (Approach B).

---

### Appendix — reference files
- Concept research: `docs/superpowers/REDESIGN-RESEARCH.md` (IA/trust/desktop
  architecture) + the experiential-design research that produced Yulduz/Qog'oz/
  Chorsu.
- Mini App redesign (separate surface): `docs/superpowers/REDESIGN-BRIEF.md`.
- Real logo: `public/bfu-mark.png` (gold BFU mark — used in the top bar).
- Backend the desktop app consumes: existing FastAPI (`/public/u/{id}`,
  `/users/discover`, trust/profile endpoints) — no backend fork.
