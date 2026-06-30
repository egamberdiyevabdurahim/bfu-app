# Batch A — Profile rich data (foundation)

**Date:** 2026-07-01
**Status:** Approved, ready for implementation plan
**Part of:** the multi-batch Mini App professionalization program (A → G). This is
batch A: the profile data foundation that later batches (trust layer, connection
features, discovery, analytics, full redesign) build on.

## Goal

Today a BFU profile shows only: name/avatar/age/gender, badges, intentions
(open-to-work / open-to-volunteering), free-text "about", and AI analysis tags.
There is **no project history, no statistics, no portfolio, no "what am I
building now"** — so a profile can't communicate what a person has actually done.

This batch makes a profile communicate real activity: the projects a member
founded and joined, lightweight stats, a "currently building" line, and free-form
portfolio links.

## Decisions (locked)

- **Visibility:** all of this is **public** — every user sees every other user's
  project history and stats. No privacy toggle this batch (deferred to a later
  batch).
- **Portfolio links:** **free-form list** — user adds any number (capped at 5) of
  `{label, url}` entries (e.g. "GitHub", "Behance", "Portfolio sayt"). Not a fixed
  set of platforms.
- **Currently building:** **auto + manual**. If the user wrote a manual line, show
  it. Otherwise auto-derive from their most recent **active founded** project
  ("Building: <project name>"). Empty for users with neither.
- **Projects list:** show **all** founded + joined projects (active and
  closed/inactive), with a status marker (`Faol` / `Yopilgan`). **Drafts are
  excluded** (unpublished = private).

## Data model

Two new columns on `users` (no new tables — reuse the existing JSON-in-Text
pattern already used by `denied_fields`):

- `currently_building: Text | null` — manual status line (free text, ~140 char cap
  enforced in the API).
- `portfolio_links: Text | null` — JSON array of `{"label": str, "url": str}`,
  max 5 entries. Validated + sanitized on write (URL must start with http/https;
  label ≤ 40 chars; strip on save).

Everything else is **derived live** from existing tables — no denormalized
counters:

- Founded projects → `Project WHERE creator_id = uid AND is_draft = false AND is_deleted = false`
- Joined projects → `ProjectMember JOIN Project` (exclude drafts / deleted; exclude
  projects the user founded to avoid double-listing)
- Stats → live `COUNT`s (see below)

**Why live counts, not stored counters:** at BFU's current scale an indexed
`COUNT` is cheap, and stored counters would require correct increment/decrement at
every project create/delete/application-decision site — easy to drift. Revisit if
scale demands it.

## API

Extend the existing profile responses (`GET /users/{id}` / the public-profile
endpoint and `/users/me`) with:

```jsonc
{
  // ...existing fields...
  "currently_building": "AI yordamida til o'rganish ilovasi",   // resolved value
  "currently_building_source": "manual" | "auto" | null,
  "portfolio_links": [ { "label": "GitHub", "url": "https://..." } ],
  "founded_projects": [
    { "id": 12, "name": "Solar Farm", "type": "startup", "is_active": true,  "created_at": "..." }
  ],
  "member_projects": [
    { "id": 8,  "name": "AI Tutor UZ", "type": "volunteering", "is_active": false, "joined_at": "..." }
  ],
  "stats": {
    "projects_founded": 3,
    "projects_joined": 2,
    "applications_accepted": 5   // times this user's application to others' projects was accepted
  }
}
```

- `currently_building` resolution happens server-side: manual value if present,
  else auto from latest active founded project, else null. `*_source` tells the
  frontend which it was (so the UI can show an "auto" hint).
- Slim project entries only (id/name/type/status/date) — no nested members/skills,
  to keep the payload light. Tapping one opens the existing `ProjectDetail`.

**Write path:** `PATCH /users/me` (the existing update endpoint) accepts
`currently_building` and `portfolio_links`. Server validates/caps both.

## UI

Reuse one project-history component across the three surfaces.

- **UserProfileModal** (viewing someone else): after About + tags, add —
  - "Currently building" line (with a subtle ✦/hammer icon; show source hint only
    on own profile, not others')
  - **Stats row**: 3 compact tiles (Founded · Joined · Accepted)
  - **Projects** section: "Founder" group then "Member" group; each row = name +
    type icon + status pill (Faol/Yopilgan); tap → `ProjectDetail`
  - **Portfolio** links: small chips/icons opening in a new tab
- **EditProfileScreen** (editing own): "Currently building" text field (placeholder
  shows the auto value when empty) + portfolio links editor (label + URL rows,
  add/remove, max 5, inline validation)
- **SettingsScreen** (own profile view): same display blocks via the shared
  component.

All new strings go through the existing `i18n` layer (en/uz/ru).

## Out of scope (later batches)

Privacy toggle, mutual connections, skill endorsement, post-project rating,
reputation score, public web profile URL (`/u/username`), resume/CV export,
activity timeline beyond the project dates. Excluded entirely per founder: anonymous
project feedback, verified-skills quiz, voice intro.

## Testing

- Backend pytest: new columns migrate; profile response includes the new fields;
  founded/joined/stats counts are correct (incl. draft exclusion, deleted
  exclusion, no double-list of founded-as-member); `currently_building`
  manual/auto/null resolution; portfolio_links validation (cap, URL scheme, label
  length).
- Frontend: profile renders with/without each block; edit round-trips
  currently_building + links.
