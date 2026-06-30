# Batch B — Trust layer (design)

**Date:** 2026-07-01
**Status:** Approved, ready for implementation plan
**Part of:** the multi-batch Mini App professionalization program (A → G). This is
batch B: the trust layer on top of Batch A's profile foundation. It makes a BFU
profile *credible* — not just "what I've done" (Batch A) but "what others say
about me": shared connections, endorsed skills, written vouches, post-project
ratings, and a browser-shareable public profile for employers.

## Goal

A profile today (post-Batch-A) shows identity, AI tags, project history, stats,
and portfolio links. None of it is *corroborated by other members*. This batch
adds peer signals:

1. **Mutual connections** — "You have N mutual connections" + the overlapping
   people, so a viewer sees social proof / a warm path.
2. **Skill endorsement** — one tap to back a specific skill on someone's profile;
   skill tags then show endorsement counts.
3. **Vouching** — a short written testimonial ("I worked with X on…") attached to
   a profile.
4. **Post-project rating** — after a project closes, its members and founder can
   rate each other 1–5 stars + an optional note; the aggregate shows on a profile.
5. **Public web profile `/u/{id}`** — a crawlable, login-free page an employer can
   open in a normal browser, reusing the same profile data.

## Decisions (locked)

### Scope

- **Reputation score is DEFERRED** (PROGRAM.md). We build everything else and
  leave a single, clearly-marked seam (see "Reputation seam" below). No score is
  computed, stored, or shown.
- **Visibility:** like Batch A, all of this is **public** — every signal is shown
  to every viewer. No privacy toggle this batch.

### Mutual connections

- A "connection" of user U = the set of members U has a **mutual interest** with
  (the existing `Interest` reciprocal relationship — same definition as
  `GET /users/me/connections`) **UNION** members who **share a project** with U
  (co-members, or member↔founder, of any non-draft/non-deleted project).
  Rationale: reuse what already encodes a real relationship; no new "follow"
  entity (follow lands in Batch C).
- On a profile of user T viewed by viewer V, "mutual connections" =
  `connections(V) ∩ connections(T)`, excluding V and T themselves.
- Shown as a count + up to 8 overlapping member previews (id, display_name,
  photo_url). Tapping a preview opens that user's profile.
- Self-view shows nothing (no "mutual with yourself").

### Skill endorsement

- The endorsable skills are exactly the strings in the target's
  `user_analysis.skills` list (Batch A surfaces them as tags). Endorsing a skill
  that isn't in their current `skills` list is rejected (422) — keeps counts
  honest and avoids free-text spam.
- One endorser may endorse a given (target, skill) **once**; tapping again
  **removes** the endorsement (toggle). Enforced by a unique constraint.
- Self-endorsement is rejected (400).
- The profile API returns, per endorsed skill, `{skill, count, endorsed_by_me}`
  so the frontend can render a count badge on the tag and a filled/empty state on
  the endorse button.

### Vouching

- A vouch = `{author_id, target_id, text}` — short free text (≤ 280 chars,
  trimmed; empty rejected 400).
- One author may have **one** vouch per target (re-posting **updates** the text).
  Enforced by a unique constraint; author can delete their own vouch.
- Self-vouch rejected (400).
- Profile returns the most recent vouches (cap 20) with author preview
  (id, display_name, photo_url) + text + created_at, plus `vouch_count`.

### Post-project rating

- **Who can rate whom:** only after a project is **closed** (`is_active` flips
  `true → false`, the existing founder-controlled toggle). The eligible cohort of
  a project = its founder + all accepted members (the `ProjectMember` rows). Any
  member of the cohort may rate any **other** member of the same cohort. This is
  the "both sides" rule from PROGRAM.md (founder↔member and member↔member).
- A rating = `{project_id, rater_id, ratee_id, stars (1..5), note (≤200, optional)}`.
- One rating per (project, rater, ratee); re-submitting **updates** it. Enforced
  by a unique constraint.
- Self-rating rejected (400). Rating someone outside the project cohort → 403.
  Rating while the project is still active → 409. Rating a draft/deleted project
  → 404.
- **Trigger / surfacing:** when a founder closes a project (PATCH sets
  `is_active=false`), we enqueue a `rate_prompt` inbox notification to every other
  cohort member (and the founder gets one too), `project_id` set, so the existing
  notifications inbox can deep-link them into the rate sheet. No new push channel.
- **Aggregate on profile:** `rating = {average: float|null, count: int}` where
  average is over all ratings where `ratee_id = profile user` (rounded to 1
  decimal server-side), null when count is 0. Individual notes are **not** shown
  on the profile in this batch (only the aggregate) to avoid a review-moderation
  surface; notes are stored for a later "reviews" view + the reputation model.

### Public web profile `/u/{id}` — CHOSEN APPROACH

**Approach: a server-rendered HTML page from the FastAPI backend at
`GET /public/u/{id}`, with Vercel rewriting `/u/:id` to it.** One sentence: it is
the cleanest because it is crawlable with zero JS, reuses the existing
`/public/*` unauthenticated pattern + `_profile_extras`, needs no SPA-routing or
redirect changes, and degrades gracefully (the SPA never tries to boot outside
Telegram).

Justification vs. the alternatives:

- *A route inside the existing SPA that skips the redirect* — would require the
  React bundle to render an unauthenticated view, and `main.jsx` only redirects
  `path === '/'`, so `/u/12` already loads the SPA which then fails to boot
  without Telegram initData. Making the SPA dual-mode (authed Mini App + public
  read-only) is more code and **not crawlable** (content is JS-rendered; search
  engines / link unfurlers / many ATS scrapers see an empty shell).
- *A separate prebuilt static page like the landing* — the landing is a static
  marketing page; a profile is per-id dynamic data, so it must be rendered with
  the data at request time. SSR from the backend (which already owns the data and
  `_profile_extras`) is the natural home.

Mechanics:

- New `GET /public/u/{user_id}` in `app/routers/public.py` returns
  `text/html` (a self-contained, inline-styled page — no JS required). It includes
  real `<title>`, `<meta name="description">`, and Open Graph tags (so the link
  unfurls in Telegram/LinkedIn) and a `<link rel="canonical">`.
- Content: avatar (the existing signed `/public/avatar` URL), name, verified tick,
  region, age, currently_building, intentions (open-to-work/volunteering), the
  AI skill tags **with endorsement counts**, stats (founded / joined / accepted),
  the rating aggregate (stars + count), vouches, founded + member project lists
  (name + status), and portfolio links. All reused from `_profile_extras` + the
  new trust aggregates (a shared `_trust_extras` builder).
- A prominent "Open in Telegram" CTA linking to
  `https://t.me/<BOT_USERNAME>?startapp=user_<id>` so a browser visitor can jump
  into the Mini App.
- 404 → a small friendly HTML page (still 404 status) for unknown/deleted/
  unregistered users.
- Unregistered / deleted / banned users are not rendered (404), matching
  `get_user_profile`.
- `Cache-Control: public, max-age=300` (the data is public and changes slowly).
- A `JSON-LD` `Person` block is embedded for richer crawling.
- **Vercel rewrite:** add `{ "source": "/u/:id", "destination": "<API>/public/u/:id" }`
  ahead of the SPA catch-all, OR (preferred, since the repo's catch-all already
  excludes `landing`) widen the catch-all negative-lookahead to also exclude `u/`
  and add an explicit rewrite to the backend. Exact rewrite is in the plan; it
  mirrors how same-origin `/public/*`, `/users/*` etc. already proxy to the API
  in production.
- Frontend: a tiny "Share public profile" affordance on the **own** profile
  (Settings) copying `https://<host>/u/<id>` — so members actually use it.

### Reputation seam (DEFERRED — do not build)

All trust aggregates are produced by **one** server helper `_trust_extras(db,
user, viewer)` returning a dict. Reputation, when designed, is a pure function of
the already-stored rows (endorsement counts, vouch count, rating avg/count,
connection count). The seam: add a single `reputation: None` placeholder key in
`_trust_extras`'s return dict **only if** the morning decision lands; for now the
helper simply does **not** include a reputation key and the schema has **no**
reputation field. A `# REPUTATION SEAM:` comment marks the one spot where the
computed value would be attached. No score logic, no column, no UI.

## Data model

Four new tables (created by `Base.metadata.create_all`; indexes added as
idempotent migrations). No new columns on existing tables.

```
endorsements
  id            BIGINT PK
  endorser_id   BIGINT  -> users.id  (the person giving the endorsement)
  target_id     BIGINT  -> users.id  (whose skill is endorsed)
  skill         VARCHAR(255)         (must match a target user_analysis.skills entry at write time)
  created_at    TIMESTAMP
  UNIQUE(endorser_id, target_id, skill)

vouches
  id            BIGINT PK
  author_id     BIGINT  -> users.id
  target_id     BIGINT  -> users.id
  text          VARCHAR(280)
  created_at    TIMESTAMP
  updated_at    TIMESTAMP
  UNIQUE(author_id, target_id)

project_ratings
  id            BIGINT PK
  project_id    BIGINT  -> projects.id
  rater_id      BIGINT  -> users.id
  ratee_id      BIGINT  -> users.id
  stars         INTEGER             (1..5, app-validated)
  note          VARCHAR(200) NULL
  created_at    TIMESTAMP
  updated_at    TIMESTAMP
  UNIQUE(project_id, rater_id, ratee_id)
```

Mutual connections need **no** table — derived live from `Interest` + project
membership, exactly like the existing `/me/connections` endpoint.

**Why live derivation for connections + counts:** consistent with Batch A's
"derive live, don't denormalize" decision; BFU's scale makes indexed counts cheap
and avoids drift.

## API

### Profile extension (reuse Batch A's `_profile_extras` pattern)

A new `_trust_extras(db, user, viewer)` helper computes the trust payload and is
attached to the **same** responses Batch A extends:

- `GET /users/{id}` (`UserPublic`) — `viewer = current_user`
- `GET /users/me` (`UserResponse`) — `viewer = current_user` (self; mutuals empty)

New fields on `UserPublic` **and** `UserResponse`:

```jsonc
{
  // ...Batch A extras...
  "endorsements": [ { "skill": "React", "count": 4, "endorsed_by_me": true } ],
  "vouches": [
    { "id": 9, "text": "Shipped our MVP in 3 weeks. Reliable.",
      "author": { "id": 7, "display_name": "Aziz. K", "photo_url": "..." },
      "created_at": "..." }
  ],
  "vouch_count": 3,
  "rating": { "average": 4.6, "count": 5 },        // average null when count 0
  "mutual_connections": {
    "count": 2,
    "preview": [ { "id": 7, "display_name": "Aziz. K", "photo_url": "..." } ]
  }
}
```

- `endorsements`: every distinct skill that has ≥1 endorsement, with count and
  whether the viewer endorsed it. Skills with 0 endorsements are simply absent
  (the frontend already renders the raw skill tags from `analysis`; it overlays a
  count when present).
- `mutual_connections` is empty (`count:0, preview:[]`) on self-view and when
  there's no viewer overlap.

### Write paths (new endpoints, all auth'd)

```
POST   /users/{id}/endorse        body {skill}           -> {ok, endorsed, count}
   toggle on/off; 422 if skill not in target's analysis.skills; 400 self
POST   /users/{id}/vouch          body {text}            -> {ok, id}
   create-or-update author's vouch; 400 self/empty; trims; caps 280
DELETE /users/{id}/vouch                                  -> 204
   removes the caller's vouch for {id} (404 if none)
POST   /projects/{id}/ratings     body {ratee_id,stars,note?} -> {ok, id}
   create-or-update; 409 if project active; 403 if rater or ratee not in cohort;
   400 self; 404 draft/deleted; stars clamped to 1..5 (422 if out of range)
GET    /projects/{id}/rateable    -> { closed: bool, cohort:[{id,display_name,photo_url, rated_by_me:bool}] }
   the list the rate-sheet renders; only cohort members may call (403 otherwise)
```

- Closing a project (existing `PATCH /projects/{id}` with `is_active:false`,
  transitioning from true) enqueues `rate_prompt` notifications to the whole
  cohort. Idempotent-ish: only fires on the true→false transition.

## UI

All strings via `src/i18n.jsx` (en/uz/ru).

- **UserProfileModal** (viewing someone else), after Batch A's `ProfileExtras`:
  - **Mutual connections** strip: "N mutual connections" + small avatar row
    (tap → open that profile) when count > 0.
  - **Rating** badge near the header: ★ 4.6 (5) when count > 0.
  - **Skill tags**: each `skills` tag gets a small "👍 N" count when endorsed,
    and an **Endorse / Endorsed** toggle button per skill (compact).
  - **Vouches** section: list of `{author, text, date}`; a "Vouch" button opens a
    small inline composer (textarea + post) — posting calls `POST .../vouch`.
- **SettingsScreen** (own profile): show own `rating`, `vouches`, and endorsement
  counts read-only (no self-endorse/vouch controls), plus a **"Share public
  profile"** button copying `/u/{id}`.
- **Rate sheet** (new lightweight component): reachable from a `rate_prompt`
  notification and from a closed project's detail. Lists the cohort; each row has
  a 1–5 star picker + optional note; submitting calls `POST /projects/{id}/ratings`.
- **Notifications inbox**: render the new `rate_prompt` type (localized text +
  deep-link into the rate sheet for that project).
- **Public page `/u/{id}`** is server-rendered HTML (no React) — styled to match
  BFU's dark theme inline.

## Out of scope (later / deferred)

- **Reputation score** (deferred — seam only).
- Showing individual rating **notes** on the profile (stored, not surfaced).
- Follow / project updates feed / mentor booking (Batch C).
- Moderation UI for vouches/ratings beyond the existing `/reports` flow (a vouch
  or rating can be reported via the existing report path against the author user).
- Privacy toggle.

## Testing

Backend pytest (TDD, against the in-memory SQLite suite):

- Endorse: toggle on/off; count; `endorsed_by_me`; 422 non-skill; 400 self;
  endorsement appears in target's profile `endorsements`.
- Vouch: create; update-on-repost (one row); delete; 400 self/empty; 280 cap;
  appears in `vouches` + `vouch_count`.
- Rating: 409 while active; 403 outside cohort; 400 self; create + update one
  row; aggregate `average`/`count` on ratee profile; star range 422.
- Close-project trigger: PATCH is_active true→false enqueues `rate_prompt` to all
  other cohort members; no fire when already inactive; `/rateable` cohort + flags.
- Mutual connections: interest-mutual ∪ shared-project overlap between viewer and
  target; excludes self; preview cap 8; self-view empty.
- Profile endpoints include all new fields (viewer-relative `endorsed_by_me` +
  `mutual_connections`).
- Public page: `GET /public/u/{id}` 200 text/html contains name + a stat + an OG
  tag; 404 for unknown/unregistered.

Frontend: build-check (`npm run build`) green; the new components import + render
without runtime errors (no automated browser test — verify-before-push on the
deployed Mini App, per program norms).
