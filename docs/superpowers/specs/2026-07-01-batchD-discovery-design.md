# Batch D — Discovery & org (design)

**Date:** 2026-07-01
**Status:** Approved, ready for implementation plan
**Part of:** the multi-batch Mini App professionalization program (A → G). This is
batch D: discovery + lightweight organization on top of Batch A (profile), Batch B
(trust) and Batch C (connections). Where C let members *stay connected*, D is about
*finding the work and the people* — a central searchable list of open roles across
all live projects, a derived "frequent collaborators" view, a project group-chat
deep-link flow (Telegram can't auto-create groups), and a full achievements/quests
system computed from data the earlier batches already produce.

## Goal

After C, a member can follow, get updates, apply for a stated role, and book
mentors — but there is still no way to **browse every open role in one place**, to
see **who someone keeps building with**, to **join a project's group chat**, or to
get any **recognition** for what they've done. Batch D adds four discovery/org
features (achievements is FULL per PROGRAM.md):

1. **Central "open roles" list** — every open role across all approved, hiring,
   non-draft projects aggregated into one screen, searchable/filterable by role
   name. A founder declares a project's open roles; each role row carries the
   parent project so a tap deep-links to the project.
2. **Teams = "frequent collaborators"** — on a profile, the people this user has
   shared **2+ projects** with (co-member or co-founder), derived **live** from
   `ProjectMember` + project creators. No new entity (PROGRAM.md locked this).
3. **Project group-chat deep-link flow** — the founder attaches a Telegram group
   link to the project (`projects.group_link`); members get a "Join project chat"
   button + "add the bot to your group" instructions. NO auto group creation
   (Telegram bots can't create groups).
4. **Achievements / quests (FULL)** — a fixed set of achievements computed from
   existing data (`first_project`, `first_application`, `five_invites`,
   `verified`, `first_endorsement`, `mentor`, `first_vouch_received`), with
   progress for count-based ones (e.g. invites x/5). A new
   `GET /me/achievements` returns earned + in-progress; an "Achievements" UI
   section lives on the own-profile / Settings surface.

## Decisions (locked)

### Scope / cross-cutting

- Reuse the existing patterns end-to-end: the `_profile_extras` / `_trust_extras`
  / `_connection_extras` "derive-and-attach a dict on the validated schema" pattern
  (A/B/C), the `Notification` inbox (`add_notification`), the per-key `STRINGS`
  i18n shape, and idempotent `app/main.py` migrations (`ADD COLUMN IF NOT EXISTS`
  / `CREATE INDEX IF NOT EXISTS`; new tables via `Base.metadata.create_all`).
- **Depends on Batch C**: `project_applications.role` and the `_connection_extras`
  wiring on the profile endpoints are assumed present. The two pieces D adds to the
  profile payload (`collaborators`, and — read-only — `group_link` on the project
  response) follow the same attach-after-validate convention.
- **Only one new table** (`project_roles`) and **one new column** (`projects.
  group_link`). Everything else (collaborators, achievements) is derived live.

### 1. Central "open roles" list — CHOSEN SOURCE

**Chosen source: an explicit `project_roles` table the founder declares, NOT
derived from applications or `ProjectReqSkill`.** One sentence: open roles are a
small founder-declared `project_roles(project_id, name, is_filled)` table because
deriving from `project_applications.role` only surfaces roles *someone already
applied for* (an open role nobody has applied to yet would be invisible — the exact
thing this list exists to advertise), and `ProjectReqSkill` stores **skills**
("Python"), not **roles** ("Backend dev").

Justification vs. the two derive-from-existing alternatives:

- **Derive from `project_applications.role`** (Batch C's free-text apply role):
  these are roles *applicants asked for*, not roles the project *offers*. A brand
  new project with zero applications would show no open roles, defeating the
  feature; and the same role spelled three ways by three applicants would fan out
  into three "open roles". Wrong grain, wrong source.
- **Derive from `ProjectReqSkill`:** that table holds required *skills* used for
  fit-matching, not positions to fill. "React" is not a role; "Frontend dev" is.
  Overloading it would corrupt the existing fit logic.

A declared-roles table is tiny, founder-owned, and matches how the rest of the app
treats project sub-collections (req_skills / req_regions are all explicit child
rows). Each role has an `is_filled` flag so a founder can mark a role taken without
deleting it (it then drops out of the open list). The aggregate list joins
`project_roles` to `projects` and keeps only roles whose parent project is
**approved, hiring, active, non-draft, non-deleted** and whose role is
`is_filled == False`.

- `project_roles(id, project_id, name VARCHAR(80), is_filled BOOL default false,
  created_at)`, unique on `(project_id, lower(name))` enforced in the writer
  (case-insensitive dedupe) — a project can't list the same role twice.
- **Write path (founder-only):** `POST /projects/{id}/roles {name}` adds a role;
  `DELETE /projects/{id}/roles/{role_id}` removes it; `PATCH /projects/{id}/roles/
  {role_id} {is_filled}` toggles filled. All founder-gated (403 otherwise).
  `GET /projects/{id}/roles` lists a single project's roles (filled + open, for the
  project detail UI).
- **Aggregate read path:** `GET /roles?q=<search>` returns every **open** role
  across all live projects, newest-first, each row
  `{id, name, project: {id, name, type}, created_at}`. `q` filters by role name
  (case-insensitive substring, like the existing `/search`). Capped (200) — BFU
  scale; pagination is a clean later addition but not needed now.
- No notification on role create (it's not a per-user event). Applying to a role is
  just the existing Batch-C `POST /projects/{id}/apply {role}` flow — tapping an
  open-roles row deep-links to the project where the member applies; we prefill the
  role name into the apply field (frontend convenience, no new endpoint).

### 2. Teams = "frequent collaborators" (derived, no new entity)

- Added to the profile-extras pattern as a `collaborators` piece. Implemented as a
  new helper `_collaborators(db, user)` returning
  `{count, preview: [UserMini-with-shared-count]}` and attached to `GET /users/{id}`
  and `/users/me` next to the A/B/C extras.
- **Definition:** person X is a frequent collaborator of user U iff X and U are
  **both members of (or the founder of) ≥ 2 of the same** non-draft / non-deleted
  projects. "Member of a project" includes the founder (the founder is a
  collaborator on their own project even if not in `project_members`).
- **Live derivation, query-light:** collect U's project ids (member rows ∪ founded
  rows, excluding draft/deleted). For each such project, the participant set is its
  members ∪ its creator. Count, per other-user, how many of U's projects they share
  participation in; keep those with `shared_count >= 2`, drop U. Preview the top 8
  by shared_count then id, each carrying their `shared` number. All in a handful of
  `IN (...)` queries over `project_members` + `projects` — no new table, no
  denormalized counter (matches A/B/C "derive live, don't denormalize").
- Self-view shows the same set (it's about the profile owner's collaborators, not
  viewer-relative — unlike `is_following` / mutual_connections). Cheap and stable.

### 3. Project group-chat deep-link flow (NO auto group creation)

- **Telegram bots cannot create groups** (PROGRAM.md / API limit). The flow is:
  the founder creates a group themselves, adds the BFU bot, and pastes the group's
  invite link into the project. Members then tap "Join project chat".
- **Storage:** a new nullable `projects.group_link VARCHAR(512)` column — identical
  to the existing `schools.group_link` / `learning_centers.group_link` columns
  (same type, same idempotent-migration shape). Surfaced read-only on
  `ProjectResponse` as `group_link`.
- **Write:** the existing `PATCH /projects/{id}` (founder-only, already enforced)
  gains an optional `group_link` field on `ProjectUpdate`; validated to be a
  Telegram-ish URL (`https://t.me/...` or `https://telegram.me/...`) or cleared
  with `""`/null. Anything else → 422. Length-capped 512.
- **Deep-link helper (frontend):** a tiny `projectChatLink(project)` helper returns
  the stored `group_link` (the canonical t.me invite). The "Join project chat"
  button opens it via the existing `openTelegramLink` / `openLink` path in `tg.js`.
  When `group_link` is empty: members see "The founder hasn't linked a group yet";
  the founder sees a "Link your group chat" affordance (opens a small input +
  pasted instructions: "Create a group, add @<bot>, paste its invite link here").
- **No bot-side group creation, no membership verification this batch** (the
  existing `getChatMember`-based verification in `users.py` is for the global/
  school/LC groups; project group membership is not gated — the link is an open
  invite). A future batch could verify project-group membership; out of scope here.

### 4. Achievements / quests (FULL) — CHOSEN COMPUTATION MODEL

**Chosen model: purely derived (recomputed on read), NOT stored.** One sentence:
achievements are recomputed on each `GET /me/achievements` from the same counts the
profile already derives, because the codebase's rule is "derive, don't denormalize"
(cf. live `follower_count`, live stats, live rating) and every achievement here is a
cheap `COUNT(*)`/`EXISTS` over already-indexed columns — storing earned state would
add a table, a write path on seven scattered events, and a drift risk for zero read
benefit at BFU scale.

Justification vs. stored:

- Stored earned-state buys a reliable "just unlocked" transition (for a one-time
  notification) at the cost of a new table + writing to it from seven different
  actions (project create, apply, invite, verify, endorse, mentor-toggle, vouch).
  We don't need the transition (see notification decision) and the counts are
  trivial, so stored is pure overhead.
- Derived stays correct automatically when underlying data changes (e.g. a project
  soft-deleted drops `first_project` if it was the only one) — no reconciliation
  job.

**The achievement set (v1, all derived):**

| key | type | earned when | progress (count-based) |
| --- | --- | --- | --- |
| `first_project` | milestone | user founded ≥ 1 non-draft/non-deleted project | — |
| `first_application` | milestone | user has ≥ 1 application row (any status) | — |
| `five_invites` | count | user has invited ≥ 5 registered users (`users.referred_by == me`) | `min(n,5)/5` |
| `verified` | milestone | `user.checked == True` | — |
| `first_endorsement` | milestone | ≥ 1 `Endorsement` where `target_id == me` | — |
| `mentor` | milestone | `user.is_mentor == True` (Batch C column) | — |
| `first_vouch_received` | milestone | ≥ 1 `Vouch` where `target_id == me` | — |

- **`GET /me/achievements`** returns `{achievements: [{key, earned, progress:
  {current, target} | null, ...}]}`. Every key is always present (earned or not) so
  the UI can show locked + unlocked together; count-based keys carry a
  `progress` object, milestones carry `progress: null`. The endpoint computes all
  seven from ≤ 7 scalar queries (each a `COUNT`/`EXISTS`), reusing the exact filters
  `_profile_extras` already uses for founded projects / applications.
- Title/description/emoji are **client-side** (i18n + an emoji map), keyed by
  `key` — the backend returns only structured facts (key/earned/progress), never
  display text, matching how the inbox renders notification text client-side.

**Award notification — SKIPPED (tradeoff noted).** A reliable
`achievement_unlocked` inbox item needs to detect the *earned ⇒ just-now* edge,
which is impossible without stored prior state. Since we chose derived (no stored
state), we **do not** emit `achievement_unlocked`; the UI simply shows earned vs
locked when the user opens the Achievements section. This is the explicit tradeoff
called out in the batch scope: full earned/in-progress display, no transition
notification. (A future batch that adds a stored `achievements_unlocked` table — or
piggybacks on an existing per-event write — can add the notification cleanly; the
read endpoint's shape won't change.)

## Data model

One new table (`project_roles`, via `create_all`) + one new column
(`projects.group_link`). Collaborators and achievements are fully derived.

```
project_roles
  id          BIGINT PK
  project_id  BIGINT  -> projects.id   (CASCADE)
  name        VARCHAR(80)              (role title, e.g. "Backend dev")
  is_filled   BOOLEAN  default false   (filled roles drop out of the open list)
  created_at  TIMESTAMP
  UNIQUE(project_id, name)             (case-insensitive dedupe enforced in writer)

projects  (+ column)
  group_link  VARCHAR(512) NULL        (Telegram invite link; same as schools/LCs)
```

**Why a table for roles** (vs derived): see §1 — declared open positions can't be
derived from applications or skills without changing their meaning.

**Why a column for group_link** (vs a table): one optional link per project,
exactly mirroring `schools.group_link` / `learning_centers.group_link`. No reason
to differ.

**Why derived for collaborators + achievements:** consistent with A/B/C — both are
cheap aggregates over already-indexed columns (`project_members`,
`users.referred_by`, `endorsements`, `vouches`), recomputed on read with no drift.

## API

### Profile / project extension (reuse the extras pattern)

A new `_collaborators(db, user)` helper computes the frequent-collaborators payload
and is attached to the **same** responses A/B/C extend:

- `GET /users/{id}` (`UserPublic`)
- `GET /users/me` (`UserResponse`)

New field on `UserPublic` **and** `UserResponse`:

```jsonc
{
  // ...A + B + C extras...
  "collaborators": {
    "count": 3,
    "preview": [
      { "id": 42, "display_name": "Aziz. K", "photo_url": "…", "shared": 4 },
      { "id": 88, "display_name": "Laylo. T", "photo_url": null, "shared": 2 }
    ]
  }
}
```

`ProjectResponse` gains (a plain ORM column, read via `from_attributes`):

```jsonc
{ "group_link": "https://t.me/+abc123" }   // null when unset
```

### New endpoints (all auth'd)

```
# Open roles — per-project (founder-managed) + global aggregate
GET    /roles?q=<search>                 -> {roles: [{id, name, project:{id,name,type}, created_at}]}
   every OPEN role across approved+hiring+active+non-draft projects; q filters by name
GET    /projects/{id}/roles              -> {roles: [{id, name, is_filled, created_at}]}
POST   /projects/{id}/roles  {name}      -> {ok, id}        (founder only; dedupe case-insensitive → 409)
PATCH  /projects/{id}/roles/{role_id}  {is_filled}  -> {ok, is_filled}   (founder only)
DELETE /projects/{id}/roles/{role_id}    -> 204             (founder only)

# Group chat: founder sets group_link via the EXISTING PATCH /projects/{id}
PATCH  /projects/{id}  {group_link?}     -> ProjectResponse (existing endpoint; validates t.me URL)

# Achievements (derived; no write path, no notification)
GET    /me/achievements                  -> {achievements: [{key, earned, progress:{current,target}|null}]}
```

- `/roles` is a new top-level router (`app/routers/roles.py`) mounted at the app
  root, so the path is `/roles` (not `/projects/.../roles`); the per-project role
  CRUD lives on the existing `projects` router under `/projects/{id}/roles`.
- `GET /me/achievements` lives on the existing `users` router (it's a "me"
  resource, like `/users/me/following`).

### Notifications

**No new notification types in Batch D.** Open-role creation is not a per-user
event; achievements are display-only (transition can't be detected without stored
state — see §4). The `Notification` table and `InboxModal` are unchanged this
batch. (This is intentional and is the one tradeoff the batch scope flagged.)

## UI

All strings via `src/i18n.jsx` (en/uz/ru).

- **OpenRolesScreen** (new, reachable from Discover): a searchable list of every
  open role (role name + project name/type chip). A search box filters by `q`
  (debounced, hits `GET /roles?q=`). Tapping a row opens the parent project's
  detail (existing `ProjectDetail`), with the role name prefilled into the apply
  field so the member applies for exactly that role.
- **ProjectDetail:**
  - An **"Open roles"** section: everyone sees the project's open roles as chips;
    the founder gets an inline composer (text input + Add) and an x / "mark filled"
    affordance per role.
  - A **"Project chat"** row: when `group_link` is set, a "Join project chat"
    button (opens the link); when unset, members see a muted "no group yet" line and
    the founder sees a "Link your group chat" input + the add-the-bot instructions.
    The founder edits `group_link` inline (PATCH).
- **Profile (own + others) — Collaborators:** a "Frequent collaborators" block in
  `ProfileExtras` showing avatar chips of the preview people with their shared-count
  ("4 projects together"); tapping a chip opens that user's profile. Hidden when
  `count == 0`.
- **Achievements section** (own profile / Settings): a grid of achievement tiles
  (emoji + title; locked tiles dimmed; count-based tiles show "x / 5" + a thin
  progress bar). Loaded from `GET /me/achievements`. Read-only, no actions.

## Out of scope (later / deferred)

- Pagination on `GET /roles` (capped at 200 this batch; cursor pagination later).
- `achievement_unlocked` notification (needs stored earned-state; deferred with the
  derive-don't-store decision — see §4).
- Verifying project group-chat membership via `getChatMember` (the link is an open
  invite this batch; gating membership is a future batch).
- Role-level applicant routing (an application still attaches a free-text `role`
  string from Batch C; we prefill it from the tapped open role but don't hard-link
  application ↔ `project_roles.id`).
- A team/collaborator *entity* (PROGRAM.md locked teams as a derived view — no
  table, no membership management).
- Leaderboards/points for achievements (display-only badges this batch).

## Testing

Backend pytest (TDD, against the in-memory SQLite suite):

- **Open roles (per-project):** founder adds a role (one row); non-founder add →
  403; duplicate name (case-insensitive) → 409; list a project's roles (open +
  filled); toggle `is_filled`; delete (204) + delete-again → 404.
- **Open roles (aggregate `/roles`):** lists open roles only (filled excluded);
  excludes roles whose project is draft / deleted / unapproved / not-hiring /
  inactive; `q` filters by name (case-insensitive substring); each row carries the
  project preview; newest-first; cap respected.
- **Group link:** founder sets `group_link` via `PATCH /projects/{id}`; valid t.me
  URL stored + surfaced on `ProjectResponse`; non-t.me URL → 422; `""`/null clears
  it; non-founder patch still 403 (existing guard); length cap.
- **Collaborators:** a user sharing 2+ projects with U appears in
  `collaborators.preview` with the right `shared`; sharing only 1 project does NOT
  appear; founder-without-member-row still counts as a participant; drafts/deleted
  excluded; self excluded; `count` matches; preview cap 8; surfaced on
  `GET /users/{id}` and `/users/me`.
- **Achievements:** each of the seven keys present in the response; `first_project`
  earned after founding (not on draft); `first_application` earned after applying;
  `five_invites` progress `{current, target:5}` ramps and earns at 5; `verified`
  tracks `checked`; `first_endorsement` / `first_vouch_received` track the trust
  tables; `mentor` tracks `is_mentor`; a fresh user has all `earned == False` with
  correct progress objects.

Frontend: build-check (`npm run build`) green; new components import + render
without runtime errors (no automated browser test — verify-before-push on the
deployed Mini App, per program norms).
