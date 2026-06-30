# Batch C — Connection features (design)

**Date:** 2026-07-01
**Status:** Approved, ready for implementation plan
**Part of:** the multi-batch Mini App professionalization program (A → G). This is
batch C: connection features on top of Batch A's profile foundation and Batch B's
trust layer. Where A said "what I've done" and B said "what others say about me",
C is about *ongoing relationships*: following people and projects, project founders
broadcasting updates, applicants stating the role they want, and a full in-app
mentor-booking flow.

## Goal

Today a member can apply to a project, ping interest, endorse/vouch — but there is
no way to *stay connected* over time. Batch C adds four connection features (all
FULL per PROGRAM.md — the heavy ones are confirmed not simplified):

1. **Follow** — follow another user OR a project. Follower counts + a "following"
   state on profiles/projects. The followed user gets a `new_follower` inbox item.
2. **Project updates feed** — a founder posts short text updates to their project;
   followers + members get a `project_update` inbox item and can read the updates
   in an "Updates" section on the project detail.
3. **Role-specific apply** — an applicant may state the role they want
   ("Backend dev", "Designer", …). The founder sees it in the review UI. Optional
   and fully backward-compatible.
4. **Mentor mode + in-app booking/calendar (FULL)** — a member toggles mentor
   mode (+ optional bio/topics), publishes 15-minute open slots, mentees browse
   mentors and book a slot. Both sides get inbox items; the mentor can decline.

## Decisions (locked)

### Scope / cross-cutting

- All four features are public-by-default and reuse the existing patterns:
  the `_profile_extras` / `_trust_extras` "derive-and-attach a dict on the
  validated schema" pattern (Batch A/B), the `Notification` inbox (one new row
  per recipient via `add_notification`), and the per-key `STRINGS` i18n shape.
- **No new push channel beyond Telegram + the existing inbox.** New notification
  types (`new_follower`, `project_update`, `booking_request`, `booking_confirmed`,
  `booking_declined`) flow through the *same* `Notification` table + inbox UI.
- **No external calendar.** The mentor calendar is a list of explicit slot rows
  the mentor owns — Mini-App-native, no Google/ICS integration.

### 1. Follow (polymorphic)

- A single `follows` table is polymorphic over the target:
  `(follower_id, target_type ∈ {"user","project"}, target_id)`, unique per triple.
  One table covers both "follow a user" and "follow a project" — mirrors the
  existing `reports` table's `target_type`/`target_id` shape.
- **Follow ≠ mutual interest.** Follow is one-directional and needs no
  reciprocation (unlike `Interest`). It does not create a connection for Batch B
  mutual-connections (kept independent — B's connection set is unchanged).
- Following a user notifies the target once (inbox `new_following`→ actually
  `new_follower`, recipient = the followed user, `actor_id` = follower). Following
  a **project** does NOT notify (would spam the founder); the founder sees the
  follower count instead.
- Self-follow rejected (400). Following a deleted/unregistered user or a
  deleted/draft project → 404. Following the same target twice is idempotent
  (the unique index makes the second call a no-op 200, returns the live state).
- Unfollow removes the row (idempotent: 204 even if not following).
- **Counts + state surfacing:**
  - `GET /users/{id}` and `/users/me` gain `follower_count`, `following_count`,
    and `is_following` (viewer-relative; always `false`/absent on self).
  - `GET /projects/{id}` gains `follower_count` + `is_following` (viewer-relative).
  - A new `GET /users/me/following` lists who/what the caller follows (for a
    "Following" view; mini previews of users + projects).

### 2. Project updates feed

- A founder-only short post: `project_updates(id, project_id, author_id, text,
  created_at)`, `text` ≤ 500 chars, trimmed, empty rejected. `author_id` is the
  founder (only the project creator may post; 403 otherwise).
- On post, fan out **one inbox item per recipient** to the union of
  **(project followers) ∪ (project members)** minus the author. Type
  `project_update`, `project_id` set, `actor_id` = author. Bounded fan-out (BFU
  scale; recipients are de-duplicated into a set first).
- Read path: `GET /projects/{id}/updates` returns the most recent updates
  (cap 50, newest first) with the author preview. Public (any authenticated
  member can read a non-draft/non-deleted project's updates).
- Delete: the author (founder) may delete their own update (`DELETE
  /projects/{id}/updates/{update_id}` → 204; 404 if missing, 403 if not author).
- UI: an **"Updates"** section in `ProjectDetail` listing updates; for the
  founder, an inline composer (textarea + Post) at the top of that section.

### 3. Role-specific apply

- Add a nullable `role` column to `project_applications` (VARCHAR(80)). The apply
  endpoint accepts an optional `{role}` body; trimmed, capped 80, empty/omitted →
  `NULL` (fully backward-compatible — existing callers send no body and still
  work).
- The founder's review surfaces (`GET /projects/my-requests`, the member's
  `my_application_status` path) expose `role` on the application output so the
  founder sees "wants: Backend dev". No validation against a fixed list (free
  text — keeps it flexible; the founder reads it).
- UI: the Apply button in `ProjectDetail` opens a tiny role prompt (one optional
  text field + "Apply") before submitting; the founder's request rows show the
  requested role.

### 4. Mentor mode + in-app booking/calendar (FULL) — CHOSEN AVAILABILITY MODEL

**Chosen model: an explicit list of open slots (concrete datetime rows the mentor
publishes), NOT recurring weekly rules.** One sentence: a `mentor_slots` table of
concrete `start_at` timestamps is simpler and more robust than materializing
recurring rules — there is no recurrence expansion, no "generate the next N weeks"
job, no DST/timezone-rule math, and every bookable slot is already a real row a
mentee books directly, which matches this codebase's "concrete rows over derived
rules" style (cf. events carry a concrete `deadline`, not a recurrence).

Justification vs. the alternative (recurring weekly availability):

- Recurring rules need an expansion layer (rule → concrete instances for a date
  window), a story for cancelling one instance of a recurrence, and a background
  materializer — all of which add code and edge cases for a feature whose whole
  point is "pick a free 15 minutes." Explicit slots get the same UX with a plain
  `INSERT` per slot and no expansion.
- Explicit slots make the booking state machine trivial: state lives on the slot
  (open → booked) and the booking row (requested → confirmed/declined). No
  per-occurrence override table.

**Mentor profile** (columns on `users`, not a separate table — same call the
profile already makes; cheaper than a join, matches `currently_building`):

- `is_mentor BOOLEAN` (default false), `mentor_bio TEXT` (≤ 400), `mentor_topics
  TEXT` (JSON array of short strings, ≤ 6, each ≤ 40, sanitized like
  `portfolio_links`). Surfaced on the profile payload as
  `mentor: {is_mentor, bio, topics}`.
- Toggled via the existing `PATCH /users/me` (new optional fields
  `is_mentor`, `mentor_bio`, `mentor_topics`).

**Slots** — `mentor_slots(id, mentor_id, start_at, duration_min=15, status ∈
{open, booked, cancelled}, created_at)`:

- A mentor creates slots in the future (`start_at > now`, 422 otherwise),
  fixed 15-minute duration (v1). Listing/creating is mentor-self only.
- A mentor may cancel an **open** slot (delete/mark cancelled). Cancelling a
  **booked** slot is not allowed via the slot path — the mentor declines the
  booking instead (which frees the slot).
- Unique on `(mentor_id, start_at)` so a mentor can't double-publish the same
  time.

**Bookings** — `bookings(id, slot_id, mentor_id, mentee_id, status ∈ {requested,
confirmed, declined, cancelled}, note, created_at, decided_at)`:

- A mentee books an **open** slot → creates a `requested` booking and flips the
  slot to `booked` (atomic; a second concurrent booker hits the slot-already-
  booked guard / unique constraint → 409). Optional `note` (≤ 200) = why they
  want the session.
- The mentor **confirms** (`booking_confirmed` to mentee) or **declines**
  (`booking_declined` to mentee; the slot returns to `open` so someone else can
  book it). On request, the mentor gets `booking_request`.
- The mentee may **cancel** their own `requested`/`confirmed` booking (slot
  returns to `open`).
- Self-booking rejected (400: a mentor can't book their own slot). Booking a
  non-open slot → 409. Booking when the mentor isn't `is_mentor` → 404 (the slot
  list won't show them anyway).

**State summary**

```
slot:    open ──(mentee books)──▶ booked ──(mentor declines / mentee cancels)──▶ open
         open ──(mentor cancels)─▶ cancelled
booking: requested ──(mentor confirms)──▶ confirmed ──(mentee cancels)──▶ cancelled
         requested ──(mentor declines)──▶ declined        (slot → open)
         confirmed ──(mentee cancels)───▶ cancelled       (slot → open)
```

(There is no automatic "done" transition in v1 — a confirmed past session is
simply a confirmed booking whose `start_at` is in the past; the UI labels it
"completed" client-side. We keep the enum value `confirmed` rather than adding a
cron to flip to `done`, to avoid a background job this batch. A `done` value is
left as a clean future addition — see "Out of scope".)

## Data model

Four new tables (created by `Base.metadata.create_all`; indexes added as
idempotent migrations) + three new columns on `users` + one new column on
`project_applications`.

```
follows
  id            BIGINT PK
  follower_id   BIGINT  -> users.id          (who follows)
  target_type   VARCHAR(16)                  ("user" | "project")
  target_id     BIGINT                       (users.id or projects.id, by type)
  created_at    TIMESTAMP
  UNIQUE(follower_id, target_type, target_id)

project_updates
  id            BIGINT PK
  project_id    BIGINT  -> projects.id
  author_id     BIGINT  -> users.id
  text          VARCHAR(500)
  created_at    TIMESTAMP

mentor_slots
  id            BIGINT PK
  mentor_id     BIGINT  -> users.id
  start_at      TIMESTAMP                     (UTC; must be in the future at write)
  duration_min  INTEGER  default 15
  status        VARCHAR(12)  default 'open'   (open | booked | cancelled)
  created_at    TIMESTAMP
  UNIQUE(mentor_id, start_at)

bookings
  id            BIGINT PK
  slot_id       BIGINT  -> mentor_slots.id
  mentor_id     BIGINT  -> users.id
  mentee_id     BIGINT  -> users.id
  status        VARCHAR(12)  default 'requested'  (requested | confirmed | declined | cancelled)
  note          VARCHAR(200) NULL
  created_at    TIMESTAMP
  decided_at    TIMESTAMP NULL

users  (+ columns)
  is_mentor      BOOLEAN  default false
  mentor_bio     TEXT     NULL
  mentor_topics  TEXT     NULL              (JSON array, sanitized)

project_applications  (+ column)
  role           VARCHAR(80) NULL
```

**Why columns-on-users for the mentor profile** (vs a `mentor_profiles` table):
the profile endpoints already load the `User` row; three nullable columns avoid an
extra join and match how Batch A added `currently_building`/`portfolio_links`.
The booking machinery genuinely needs its own rows (slots + bookings), so those
are tables.

**Why live counts for follows:** consistent with A/B "derive live, don't
denormalize" — `follower_count` is an indexed `COUNT(*)` over `follows`; cheap at
BFU scale, no drift.

## API

### Profile / project extension (reuse the extras pattern)

A new `_connection_extras(db, user, viewer)` helper computes the follow/mentor
payload and is attached to the **same** responses A/B extend:

- `GET /users/{id}` (`UserPublic`) — `viewer = current_user`
- `GET /users/me` (`UserResponse`) — `viewer = self`

New fields on `UserPublic` **and** `UserResponse`:

```jsonc
{
  // ...A + B extras...
  "follower_count": 12,
  "following_count": 8,
  "is_following": true,                 // viewer follows this user (false on self)
  "mentor": { "is_mentor": true, "bio": "10 yrs in fintech", "topics": ["Startups","Fundraising"] }
}
```

`ProjectResponse` gains (computed in the project router, not via from_attributes):

```jsonc
{ "follower_count": 5, "is_following": false }
```

### Write / read paths (new endpoints, all auth'd)

```
# Follow
POST   /follow            body {target_type, target_id}  -> {ok, following, follower_count}
   create-or-noop; 400 self-follow(user); 404 missing target; notifies on user-follow
DELETE /follow            body {target_type, target_id}  -> 204   (idempotent)
GET    /users/me/following                                -> {users:[UserMini], projects:[ProjectMini]}

# Project updates
POST   /projects/{id}/updates    body {text}             -> {ok, id}   (founder only; fans out)
GET    /projects/{id}/updates                            -> {updates:[{id,text,author:UserMini,created_at}]}
DELETE /projects/{id}/updates/{update_id}                -> 204        (author only)

# Role-specific apply (extends existing apply)
POST   /projects/{id}/apply      body {role?}            -> {id, status, role}

# Mentor mode (mentor profile via PATCH /users/me: is_mentor, mentor_bio, mentor_topics)
GET    /mentors                                          -> [ {id, display_name, photo_url, bio, topics, open_slots} ]
GET    /mentors/{id}/slots                               -> {slots:[{id,start_at,status}]}   (open + caller's own bookings)
POST   /mentors/me/slots         body {start_at}         -> {ok, id}   (self; future-only; 15-min)
DELETE /mentors/me/slots/{slot_id}                       -> 204        (self; open slots only)

# Bookings
POST   /bookings                 body {slot_id, note?}   -> {ok, id, status}   (mentee books an open slot)
PATCH  /bookings/{id}            body {action}           -> {status}   (mentor: confirm|decline; or mentee: cancel)
GET    /bookings/me                                      -> {as_mentee:[...], as_mentor:[...]}  (with slot + other-party preview)
```

- Booking a slot is the slot→`booked` + booking→`requested` transition, guarded so
  a concurrent double-book yields 409 (the loser sees "slot just got taken").
- `PATCH /bookings/{id}` is action-routed by role: the **mentor** of the booking
  may `confirm` or `decline`; the **mentee** may `cancel`. Any other actor → 403.
  Declining/cancelling returns the slot to `open`.

### Notifications (reuse `Notification` + the inbox)

New `type` values added to the inbox renderer (`InboxModal.notifText` + emoji
map): `new_follower`, `project_update`, `booking_request`, `booking_confirmed`,
`booking_declined`. All carry `actor_id` (and `project_id` for `project_update`).
`booking_*` carry `actor_id` = the other party; tapping opens that user's profile
(consistent with how the inbox already deep-links actor → `UserProfileModal`). A
`project_update` tap opens the project detail (existing deep-link path).

## UI

All strings via `src/i18n.jsx` (en/uz/ru).

- **UserProfileModal** (viewing someone else):
  - A **Follow / Following** toggle button in the Connect-actions row + a small
    "N followers" count near the header.
  - If `mentor.is_mentor`: a **mentor card** (bio + topic chips) + a "Book a
    session" button that opens the `BookSlotSheet` for that mentor.
- **ProjectDetail:**
  - A **Follow / Following** toggle + follower count near the header.
  - An **"Updates"** section: the founder gets an inline composer; everyone sees
    the list of updates (author + text + date).
  - The Apply flow gains an optional **role** field before submit.
- **Founder review** (the requests list): each request row shows the applicant's
  requested **role** when present.
- **SettingsScreen / EditProfile** (own profile):
  - A **"Become a mentor"** toggle; when on, fields for mentor bio + topics
    (reuses the EditProfile form pattern).
  - A **"My mentor slots"** entry (opens `MentorSlotsSheet` to add/remove slots)
    and a **"My bookings"** entry (opens `BookingsSheet`) — both shown only when
    `is_mentor` (bookings-as-mentee shown to everyone).
- **MentorsScreen** (new, reachable from Settings or Discover): a list of mentors
  (avatar, name, topics, #open slots) → tap → profile/book.
- **BookSlotSheet** (new): lists a mentor's open slots; tap a slot + optional note
  → book.
- **BookingsSheet** (new): the caller's bookings as mentee (cancel) and as mentor
  (confirm/decline).
- **InboxModal:** render the five new notification types (localized text + emoji +
  the right tap target).

## Out of scope (later / deferred)

- Recurring weekly availability (explicit slots chosen; a recurrence layer can be
  added later that simply *generates* `mentor_slots` rows).
- A `done` booking state via a cron that flips confirmed-past → done (UI labels it
  client-side for now).
- Following → Batch B mutual-connection graph (kept independent this batch).
- Per-update reactions/comments on the project feed (text-only updates).
- Mentor ratings/reviews (Batch B's project rating is the rating surface; mentor
  rating is a future addition).
- Notifying project followers of *every* project edit (only explicit founder
  updates fan out).

## Testing

Backend pytest (TDD, against the in-memory SQLite suite):

- **Follow:** create + idempotent re-follow (one row); unfollow idempotent; 400
  self-follow; 404 missing target; counts (`follower_count`/`following_count`) +
  `is_following` on profile; user-follow enqueues `new_follower`, project-follow
  does NOT notify; `/users/me/following` lists both kinds.
- **Project updates:** founder posts (one row); 403 non-founder; empty/too-long
  rejected/clamped; fan-out enqueues `project_update` to followers ∪ members minus
  author; `GET .../updates` newest-first + author preview; author delete (204),
  non-author delete 403.
- **Role apply:** apply with `{role}` stores it; apply with no body → role null
  (backward-compat); role surfaces in `my-requests` output; over-long clamped.
- **Mentor profile:** `PATCH /users/me` sets `is_mentor`/bio/topics; topics
  sanitized (cap 6, trims, drops blanks); profile payload exposes `mentor`.
- **Slots:** mentor creates a future slot (one row); past slot → 422; duplicate
  `(mentor,start_at)` → 409; non-mentor self can still create only own; delete own
  open slot (204); deleting a booked slot → 409; `/mentors` lists mentors with
  open-slot counts; `/mentors/{id}/slots` shows open slots.
- **Bookings:** mentee books an open slot → booking `requested`, slot `booked`;
  double-book (slot not open) → 409; self-book → 400; mentor confirm →
  `confirmed` + `booking_confirmed`; mentor decline → `declined` + slot back to
  `open` + `booking_declined`; mentee cancel → `cancelled` + slot back to `open`;
  wrong-actor action → 403; `booking_request` to mentor on book; `/bookings/me`
  splits as_mentee / as_mentor.
- **Profile/project endpoints** include all new fields (viewer-relative
  `is_following`).

Frontend: build-check (`npm run build`) green; the new components import + render
without runtime errors (no automated browser test — verify-before-push on the
deployed Mini App, per program norms).
