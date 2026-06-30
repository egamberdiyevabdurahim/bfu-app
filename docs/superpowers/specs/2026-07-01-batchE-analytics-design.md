# Batch E — Admin/founder analytics (design)

**Date:** 2026-07-01
**Status:** Approved, ready for implementation plan
**Part of:** the multi-batch Mini App professionalization program (A → G). This is
batch E: read-only analytics on top of everything A–D built. It turns the data the
platform already accumulates (project views, applications, signups, regions,
skills) into decision-useful views for the **founder of a project** (their own
funnel) and for **platform admins** (cohort retention, regional supply, skill
gaps). Nothing here writes data; every endpoint is a `COUNT`/`GROUP BY` aggregate.

## Goal

The app already stores rich signal but barely surfaces it analytically:

- A project founder sees a single-project dashboard (`GET /projects/{id}/stats` —
  applicant counts + views + avg decision time) but **no cross-project funnel**:
  how views convert to applications to accepted members, across all of their
  projects, side by side.
- An admin sees only flat totals (`GET /admin/stats`: users / projects / regions /
  schools / learning-centers). There is **no** retention view, **no** per-region
  supply view (the landing has a public region map, but admins have no data table),
  and **no** demand-vs-supply skill analysis.

Batch E adds four read-only analytics surfaces, all derived from existing data:

1. **Founder dashboard (per-founder):** for the caller's own projects, a
   views → applications → accepted funnel with a per-project breakdown. Founder-
   scoped (the caller sees only projects they created). Distinct from the global
   admin dashboard.
2. **Cohort retention (admin):** users grouped by signup month (`users.created_at`),
   showing how many of each month's cohort are still "active" (have a
   `last_seen_at` within N days of now). A month-by-status table.
3. **Region heatmap (admin):** members + projects + open-roles-proxy per region
   (`viloyat`), so an admin sees supply per region. The landing already renders a
   public region map; this is the **admin data view** (richer, auth-gated, not
   cached for the public).
4. **Skill-gap report (admin):** demand vs supply per skill — demand from project
   required-skills (`ProjectReqSkill`), supply from members' analysis skills
   (`user_analysis.skills`) — surfacing the most under-supplied skills
   ("N projects need Backend, only M members have it").

## Decisions (locked)

### Scope & shape

- **Read-only.** Every endpoint is a pure aggregation (`COUNT` / `AVG` /
  `GROUP BY`). No new tables, no new columns, no writes, no notifications.
- **No new model.** All four read from tables that already exist:
  `projects` (incl. `view_count`), `project_applications` (incl. `status`),
  `project_members`, `users` (incl. `created_at`, `last_seen_at`, `region_id`),
  `regions`, `project_req_skills`, `user_analyses` (`skills` JSON).
- **Indexes only if needed.** `users.created_at`, `users.region_id`,
  `projects.creator_id`, and `projects.is_approved/is_draft/is_deleted` are already
  indexed (see `app/main.py` migrations). Batch E adds **one** idempotent index —
  `project_req_skills.skill_name` — because the skill-gap report groups on it and
  it is currently unindexed. No other migration.
- **Charts stay dependency-free.** The frontend renders CSS bars + tables only (no
  chart library — none is a current dependency). Consistent with the rest of the
  app's hand-rolled UI.

### EXTEND, don't duplicate

PROGRAM history notes "founder analytics surfaced" earlier. Concretely, the only
existing founder analytics is **per single project**: `GET /projects/{id}/stats`
returns `{pending, accepted, declined, views, avg_decision_hours}` for one project
the caller owns. Batch E does **not** replace or duplicate that. It adds a new
**cross-project, per-founder** endpoint `GET /projects/mine/funnel` that aggregates
the same underlying signal across **all** of the caller's projects and returns the
funnel + a per-project row list. The per-project row reuses the exact same
counting rules as `/projects/{id}/stats` (views from `view_count`; applications
grouped by status; accepted = accepted applications) so the two never disagree.
Likewise the admin views extend `GET /admin/stats` conceptually but live at new
`/admin/analytics/*` paths and reuse the existing `get_admin_user` role-gate — no
change to the existing stats endpoint.

### Role-gating (reuse existing dependencies)

- **Founder dashboard** is **not** admin-gated. It is gated by ownership: it lives
  on the `projects` router, depends on `get_current_user`, and only ever reports on
  `Project.creator_id == current_user.id` rows. Any registered member who founded a
  project sees their own funnel; a member with no projects gets an empty funnel.
- **All three admin views** reuse `app.core.deps.get_admin_user` (role ∈
  {`admin`, `super_admin`}) — the same dependency the rest of `admin.py` uses.
  Non-admins get 403; this is asserted in tests.

### Founder funnel — definitions

For each project the caller created (`creator_id == me`, `is_deleted == False`;
**includes** drafts and inactive so the founder sees their whole portfolio — but
each row carries `is_active`/`is_draft`/`is_approved` flags so the UI can label
them):

- **views** = `project.view_count` (the same counter `/projects/{id}/stats` reads).
- **applications** = count of `project_applications` rows for the project (any
  status).
- **accepted** = count of `project_applications` with `status == "accepted"`.
- **pending** / **declined** = counts of the respective statuses (so the UI can
  show the full breakdown).

Aggregate (top-of-page) funnel = the sums of those across all the caller's
projects: `{views, applications, accepted, pending, declined, project_count}`.
Conversion rates are computed **client-side** from the raw counts (avoid
divide-by-zero ambiguity server-side); the API returns only integers.

The per-project breakdown is sorted by `views` descending (most-seen first), then
`id` descending, capped at 200 projects (a single founder will never approach
that; the cap is a safety bound).

### Cohort retention — definitions

- A **cohort** = all registered, non-deleted users who signed up in a given
  calendar month, keyed `"YYYY-MM"` from `users.created_at`.
- **active** within a cohort = those whose `last_seen_at` is within **N days** of
  "now" (default `N = 30`, overridable via `?active_days=` query, clamped 1..365).
  `last_seen_at IS NULL` counts as inactive.
- The endpoint returns, newest-month-first, a list of
  `{month, total, active, retention_pct}` where `retention_pct = round(active /
  total * 100)` (0 when `total == 0`, which can't happen for a present month but is
  guarded). Cap at 24 months (two years) — older cohorts are summarized into a
  single trailing `"older"` bucket so the table stays bounded.
- **Cross-DB month bucketing:** production is Postgres, tests are SQLite. We do
  **not** use a DB-specific `date_trunc`/`strftime` in the query; instead we
  `SELECT id, created_at, last_seen_at` for registered non-deleted users and bucket
  by month **in Python** (`created_at.strftime("%Y-%m")`). BFU's user scale makes a
  single indexed scan over `users` cheap, and it keeps the test suite (SQLite)
  identical to prod (Postgres) behaviour — the same reason Batch A–D derive in
  Python rather than lean on dialect SQL. `users.created_at` is already indexed.

### Region heatmap — definitions

Per region (`viloyat`), auth-gated and **not** publicly cached (unlike
`/public/regions`):

- **members** = registered, non-deleted users with `region_id == r.id`.
- **projects** = approved, non-draft, non-deleted projects whose **creator** is in
  that region (join `users.region_id` → project via `creator_id`, mirroring the
  existing `/public/regions` projects-per-creator-region logic so the two agree).
- **open_projects** = of those, the ones with `is_active == True AND is_hiring ==
  True` — a proxy for "open roles / capacity to absorb members" in this region.
  (Batch D's `project_roles` table is **not** assumed present; Batch E is
  independent of C/D. If/when `project_roles` ships, a future iteration can swap in
  a true open-role count — noted as a seam, not built.)

Returns a `regions` list with
`{id, name_en, name_uz, name_ru, members, projects, open_projects}` ordered by
`members` descending, plus a `totals` object summing the columns, so the UI can
size bars relative to the busiest region.

### Skill-gap report — definitions

- **demand[skill]** = number of **distinct live projects** (approved, non-draft,
  non-deleted) that list `skill` in `project_req_skills.skill_name`.
- **supply[skill]** = number of **distinct registered, non-deleted members** whose
  `user_analysis.skills` JSON contains `skill`.
- Skills are matched **case-insensitively**, normalized to a canonical display form
  = the most common original casing seen (ties broken alphabetically), so
  `"backend"` and `"Backend"` collapse to one row.
- The report returns every skill that appears in **either** demand or supply, as
  `{skill, demand, supply, gap}` where `gap = demand - supply`, sorted by `gap`
  descending (most under-supplied first), then `demand` descending. Capped at 100
  rows. The UI highlights positive-gap (under-supplied) skills.
- **Supply is computed in Python** over the `user_analyses.skills` JSON column
  (read all non-empty skills arrays for registered non-deleted users and tally),
  again because JSON-array membership/grouping is not portable across
  Postgres/SQLite. Demand is a normal `GROUP BY` on `project_req_skills.skill_name`
  joined to live projects, then folded into the case-insensitive canonical map in
  Python so it lines up with supply. At BFU scale both scans are cheap.

## Data model

**No schema changes.** One idempotent index migration (skill-gap grouping column):

```
CREATE INDEX IF NOT EXISTS ix_project_req_skills_skill_name
  ON project_req_skills (skill_name);
```

Everything else reads existing, already-indexed tables.

## API

All four endpoints return a plain `dict` (`response_model=dict`), matching the
existing analytics endpoints' style (`/projects/{id}/stats`, `/admin/audit`).

### 1. Founder funnel (ownership-gated; `projects` router)

```
GET /projects/mine/funnel
  auth: get_current_user (no admin needed)
  ->
  {
    "totals": { "project_count": 3, "views": 540, "applications": 42,
                "accepted": 11, "pending": 6, "declined": 25 },
    "projects": [
      { "id": 12, "name": "Solar Farm", "type": "startup",
        "is_active": true, "is_draft": false, "is_approved": true,
        "views": 320, "applications": 28, "accepted": 7,
        "pending": 4, "declined": 17 },
      ...
    ]
  }
```

`projects` is sorted by `views` desc then `id` desc; empty list + zeroed totals for
a caller who founded nothing. Reuses the same per-status counting as
`/projects/{id}/stats`.

### 2. Cohort retention (admin)

```
GET /admin/analytics/retention?active_days=30
  auth: get_admin_user
  ->
  {
    "active_days": 30,
    "cohorts": [
      { "month": "2026-07", "total": 120, "active": 96, "retention_pct": 80 },
      { "month": "2026-06", "total": 210, "active": 130, "retention_pct": 62 },
      ...
      { "month": "older", "total": 540, "active": 180, "retention_pct": 33 }
    ]
  }
```

Newest month first; up to 24 explicit months then an `"older"` rollup. `active_days`
echoed back, clamped to 1..365.

### 3. Region heatmap (admin)

```
GET /admin/analytics/regions
  auth: get_admin_user
  ->
  {
    "totals": { "members": 1450, "projects": 96, "open_projects": 61 },
    "regions": [
      { "id": 1, "name_en": "Tashkent", "name_uz": "Toshkent", "name_ru": "Ташкент",
        "members": 540, "projects": 40, "open_projects": 28 },
      ...
    ]
  }
```

Ordered by `members` desc. Region rows include all three localized names so the UI
labels in the active language.

### 4. Skill-gap report (admin)

```
GET /admin/analytics/skill-gap
  auth: get_admin_user
  ->
  {
    "skills": [
      { "skill": "Backend", "demand": 9, "supply": 2, "gap": 7 },
      { "skill": "UI/UX",   "demand": 5, "supply": 3, "gap": 2 },
      { "skill": "React",   "demand": 4, "supply": 12, "gap": -8 },
      ...
    ]
  }
```

Every skill present in demand or supply; sorted by `gap` desc then `demand` desc;
cap 100. `gap > 0` = under-supplied (the rows the founder cares about).

## UI

All strings via `src/i18n.jsx` (en/uz/ru). No chart library — CSS bars + tables.

- **AdminScreen** (`src/screens/AdminScreen.jsx`): add an **"Analytics"** tab
  (visible to all admins, between Dashboard and Users). It loads the three admin
  analytics endpoints and renders three stacked sections:
  - **Retention:** a table (month · total · active · a CSS bar showing
    `retention_pct`). An `active_days` selector (30 / 60 / 90) re-fetches.
  - **Regions:** a sortable-by-members table; each row a horizontal CSS bar whose
    width is `members / maxMembers`, with `projects` / `open_projects` as small
    captions.
  - **Skill gap:** a table of the top under-supplied skills; each row shows demand
    vs supply as two mini-bars and a colored `gap` badge (red when positive /
    under-supplied, muted when ≤ 0).
- **Founder funnel:** surfaced where founders already manage projects. A new
  lightweight **`FounderFunnel`** component (`src/components/FounderFunnel.jsx`)
  renders the aggregate funnel (three stacked CSS bars: views → applications →
  accepted, each labeled with its count and a client-computed conversion %) plus a
  per-project breakdown list. It is mounted on the founder's own projects area —
  the screen that already lists `projects.mine()` — behind a small "Analytics"
  toggle/header so it doesn't disturb the existing list. (The plan locates the
  exact mount point by reading the current "my projects" screen; if a dedicated
  surface isn't obvious, it mounts inside the existing project-management view.)
- New `src/api.js` methods: `projects.funnel()`, `admin.retention(activeDays)`,
  `admin.regionStats()`, `admin.skillGap()`.

## Out of scope (later / deferred)

- Time-series / trend charts (this batch is point-in-time snapshots).
- Per-project view *time series* (we only have a running `view_count`, not dated
  view events — a view-events table is a separate, larger change).
- True per-region open-**role** counts (depends on Batch D `project_roles`; a seam
  is noted, the proxy `open_projects` is shipped instead).
- CSV/export of analytics (the existing `/admin/export/*.json` covers raw data;
  analytics export is deferred).
- Reputation-weighted analytics (depends on the deferred Batch B reputation model).
- Any chart-library dependency.

## Testing

Backend pytest (TDD, against the in-memory SQLite suite; seed real rows and assert
the aggregates):

- **Founder funnel:** seed a founder with 2 projects (one with views +
  applications across pending/accepted/declined, one empty); assert per-project
  rows match the seeded counts, the aggregate totals are the sums, ordering is by
  views desc, drafts are included with their flags, another founder's projects are
  excluded, and a founder with no projects gets zeroed totals + empty list.
- **Retention:** seed users across two signup months (set `created_at`), some with
  recent `last_seen_at` and some stale / null; assert per-month `total`/`active`/
  `retention_pct`, newest-first ordering, `active_days` clamping, the `"older"`
  rollup past 24 months, and the `NULL last_seen_at` → inactive rule. Assert 403
  for a non-admin.
- **Region heatmap:** seed regions + users in them + projects by creators in them
  (approved/live vs draft/unapproved); assert members/projects/open_projects per
  region, the live/approved filtering on projects, `open_projects` requiring
  active+hiring, totals = column sums, ordering by members desc. Assert 403 for a
  non-admin.
- **Skill gap:** seed projects with `req_skills` (demand) and members with analysis
  `skills` (supply), including a case-mismatch (`"backend"` vs `"Backend"`) that
  must collapse to one row, a demand-only skill, and a supply-only skill; assert
  `demand`/`supply`/`gap`, canonical casing, sort by gap desc, and that only live
  projects / registered members count. Assert 403 for a non-admin.

Frontend: build-check (`npm run build`) green; the new tab + component import and
render without runtime errors (no automated browser test — verify-before-push on
the deployed Mini App, per program norms).
