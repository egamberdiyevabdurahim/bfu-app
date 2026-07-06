# Chorsu City / Discovery — "Building tonight" (design spec)

> Second desktop screen in the **Chorsu** system. Inherits everything from the
> master brief `2026-07-06-chorsu-desktop-design.md` (palette, 4 type voices,
> film grain, firelit glow, motion rules, `prefers-reduced-motion`). This doc
> covers only what's specific to the City / Discovery screen and its new
> backend endpoint. Approved via live mockup 2026-07-06.

## 0. What it is
The public, logged-out **explore** surface — a warm firelit "city at dusk"
where every builder is a lit window. The flagship "wander for an hour" screen.
Route: `/` (home) and/or `/city` on the desktop app. Public (no auth), same as
`/u/{id}`.

## 1. Sections (top → bottom), as approved in the mockup
1. **TopBar** — reused from the profile screen (BFU mark + wordmark + Explore /
   Your list / Open-in-Telegram).
2. **Ambient Live ticker** — cycles *real* recent community activity (new
   projects, endorsements, online count, new members). Reused component.
3. **Header** — overline (`TOSHKENT · <weekday> night`), big Bricolage headline
   `<N> builders lit tonight` (N counts up), Instrument-Serif sub *"Someone is
   always building right now."*, and three count-up stats: **Online now**,
   **Cities lit**, **New this week**.
4. **Filter chips** — `All`, `Online now` (ember dot), region chips, `Looking
   for co-founder` (green dot), `Mentors`, top skill chips. v1: visual +
   client-side filter over the loaded set; server-filtered pagination later.
5. **Region clusters** — `Toshkent tonight · N lit`, then other lit regions.
   Clustering keeps the city looking populated even at low total density.
6. **Builder "windows" grid** — each card = a person (see §3).
7. **"Threads from here" serendipity rail** — horizontal, viewer-agnostic
   public threads (see §4) so the page never bottoms out.
8. **Footer** — hairline + Instrument-Serif tagline.
9. **Presence toasts** — "*<name> just came online*" drifts up periodically,
   driven by the real online set (not fabricated).

## 2. New backend endpoint — `GET /public/city`
Public, no auth (viewer=None), same 404/registered/not-deleted semantics as the
other `/public/*` routes. **Must be batched** — no per-user N+1. Query params:
`region_id?` (focus a region), `limit?` (default 48), `offset?`.

Returns:
```jsonc
{
  "stats": {
    "online_now": 12,          // COUNT(last_seen_at >= now-15min, registered, not deleted)
    "cities_lit": 4,           // COUNT(DISTINCT region_id) among the online set
    "new_this_week": 18,       // COUNT(created_at >= now-7d, registered)
    "total_builders": 145
  },
  "weekday": "Friday",          // server-side, from utcnow (avoids client Date drift)
  "regions": [                  // clusters, most-lit first; each has its people
    {
      "id": 13, "name_en": "Tashkent City", "name_uz": "Toshkent shahri",
      "name_ru": "Город Ташкент", "lit": 21,
      "people": [ /* Builder[] */ ]
    }
  ],
  "threads": [ /* Thread[] */ ]  // §4
}
```

**Builder** (one grid card) — every field batch-computed, no N+1:
```jsonc
{
  "id": 42, "name": "Aziza Karimova", "display_name": "Aziza Karimova",
  "checked": true, "photo_url": "/public/avatar?...|null",
  "online": true,                       // last_seen_at >= now-15min
  "currently_building": "SolarBazaar",  // user.currently_building OR latest active founded project name
  "skills": ["Hardware","Fundraising"], // user.analysis.skills[:3]
  "looking_for": "work|volunteering|both|null",  // from open_to_work/open_to_volunteering
  "rating": 4.9,                        // ProjectRating avg where ratee_id=user (null if none)
  "vouch_count": 8,                     // COUNT(Vouch where target_id=user)
  "weight": "high|normal|new",          // visual weight (see §3) — server-derived
  "region_id": 13
}
```

**Batching plan (avoid N+1):**
- One `select(User).options(selectinload(User.analysis)).where(registered, not deleted).order_by(...)` for the pool (cap 300, then window).
- One `GROUP BY ratee_id` for rating averages, one `GROUP BY target_id` for
  vouch counts, over the pool's ids (`ProjectRating`, `Vouch`).
- One batched "latest active founded project name per creator" query for
  `currently_building` fallback (over pool ids), only for users whose manual
  `currently_building` is empty.
- One `select(Region).where(id in pool_region_ids)` for region names.
- Presence, looking_for, skills, checked, photo_url are all already on the User
  row / analysis — no extra queries.

**Ordering within a region:** online first, then reputation weight (rating +
vouch + checked), then most-recent `created_at`. So a lit region always leads
with its most alive, most credible builders.

## 3. Builder "window" card
- Seeded ember-gradient wash + avatar (same per-person gradient logic as the
  profile). Higher `weight` → richer/wider window.
- `weight`: **high** = rating ≥ 4.5 AND (vouch_count ≥ 3 OR checked); **new** =
  no rating and created within 14 days; else **normal**. High-weight cards may
  span 2 columns ("bigger lit window"). Purely visual; server-derived so the
  client stays dumb.
- Online → ember presence pulse on the avatar.
- `looking_for` → green badge ("Co-founder" / "Volunteer" / "Mentor" — mentor
  derived from `is_mentor`).
- Rating shown as `★ 4.9`, or `✶ new` when no rating yet.
- Hover-bloom (lift + ember glow + wash brighten). `prefers-reduced-motion`
  disables the motion, keeps the hover color shift.
- Whole card links to `/u/{id}`.

## 4. "Threads from here" (public, viewer-agnostic)
Logged-out, so NO "you" threads (mutual connections / "they need what you have"
come with auth later). v1 public threads, all computed from existing data:
```jsonc
{ "kind": "rising|new_in_city|skill_cluster|open_roles",
  "title": "...", "subtitle": "...", "faces": [{"id","initials","gradient_seed"}],
  "href": "/city?..." }
```
- **rising** — builders whose vouch_count grew most recently / crossed a
  threshold. ("Reputation climbing tonight.")
- **new_in_city** — most recent registrations in the focused region.
- **skill_cluster** — N builders sharing a hot skill/interest tag ("4 builders
  also working on climate"), from analysis tags.
- **open_roles** — projects with open roles right now (reuses Batch D open-roles
  data) → "3 founders looking for a designer."
v1 may ship a subset (rising + new_in_city + skill_cluster); open_roles if cheap.

## 5. Frontend (desktop/ Next.js, plain JS)
- New page `app/city/page.js` (and make `app/page.js` render it, or redirect
  `/` → `/city`). **Server component** — `fetch` `/public/city` via a
  `cache()`-wrapped `getCity()` in `lib/bfu-api.js` (ISR `revalidate: 60`, tag
  `city`). Presence is fresh-ish; 60s is fine.
- Reuse: `TopBar`, `AmbientTicker`, grain/glow, seeded-gradient + initials
  helpers, the pill/chip styles, count-up hook. Extract shared bits into
  `components/` + `lib/` so the profile and city share them (DRY).
- New components: `CityHeader` (count-ups), `FilterBar` (client, client-side
  filter over loaded set for v1), `RegionCluster`, `BuilderCard` (client for
  hover, but hover is CSS so it can stay server + CSS `:hover`), `ThreadsRail`,
  `PresenceToast` (client — cycles the real online set).
- Metadata/OG: `/city` gets a static-ish OG ("Bright Futures Uzbekistan — a
  city of builders") — can reuse a generic OG image (not per-user). No new PIL
  work required for v1.
- All animations respect `prefers-reduced-motion` (mandatory).

## 6. The empty-city reality (build against it — see master brief §7)
Current density is low; the real city will read *quiet* until BFU grows. Design
for grace, not fake life:
- Region clustering so a focused region ("Toshkent tonight") concentrates
  whatever density exists.
- Ticker/threads pull from **real** whole-community activity so even a small
  city feels in motion — but never fabricate people who don't exist.
- Beautiful low-count states: if a region has < 6 lit, show a warm "the bazaar
  is small tonight — be one of the first" state rather than an empty grid.
- `online_now` can legitimately be 0 at 4am; the copy adapts ("quiet hours —
  the city is resting") instead of showing a dead "0 online."
- **No fabricated presence.** Everything shown is real rows. The mockup's
  sample names are placeholders for the *layout*, not seeded into production.

## 7. Out of scope for this screen (later)
- Personalized/auth threads ("mutual connections", "they need what you have").
- Server-side filtered pagination + infinite scroll (v1 loads a windowed set +
  client-filters). Add when density warrants.
- Live websocket presence (v1 is ISR + periodic refetch; good enough).
- Map view (the Mini App already has one; a Chorsu city-map is a later idea).
