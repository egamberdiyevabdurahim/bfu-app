# Mini App professionalization program — locked decisions

Founder kicked off a full data+feature buildout (the "37 ideas") on 2026-07-01,
to run autonomously overnight. This file is the source of truth for cross-batch
decisions so every spec/plan/subagent stays consistent.

## Global decisions

- **Deploy cadence:** ship each batch to production as its tests pass (push →
  Vercel/Railway auto-deploy, as the whole session has worked). Each batch is an
  independent, git-revertable unit.
- **Excluded entirely** (founder ruling): anonymous project feedback; verified-
  skills AI quiz; voice intro.
- **Redesign (Batch G):** NOT built autonomously — founder does it via Claude
  Design. Deliverable here is a detailed redesign brief/handoff, not code.
- **Telegram bots cannot create groups** (API limit): "auto group chat per
  project" becomes a deep-link / "add the bot to your group" flow, not literal
  auto-creation.
- All user-facing strings go through `src/i18n.jsx` (en/uz/ru).
- TDD on backend (pytest), build-check on frontend, verify before each push.

## Batch order & scope

- **A — Profile foundation** (SPECCED + PLANNED): founded/joined projects, live
  stats, currently_building (auto+manual), free-form portfolio links. Public. Two
  text columns on users; everything else derived live.
- **B — Trust layer:** mutual connections, skill endorsement, vouching,
  post-project rating (both sides after a project closes), **public web profile
  URL `/u/{id}`**. **Reputation score: DEFERRED** — founder wants to discuss the
  model in the morning. Build the rest of B now.
- **C — Connection features:** follow (users + projects), **project updates feed**
  (founder posts → followers/members see), role-specific apply, mentor mode +
  **in-app mentor booking/calendar** (full build), .
- **D — Discovery & org:** central "open roles" list (search by role), **Teams =
  lightweight "frequent collaborators"** (derived from shared projects, no new
  entity), project group-chat deep-link flow, **achievements/quests** (full).
- **E — Admin/founder analytics:** founder dashboard (views→apply→accept funnel),
  cohort retention, region heatmap, skill-gap report.
- **F — Extras:** resume/CV export (PDF from profile), bot inline mode (share a
  project into any chat), sticker pack (assets + pack).
- **G — Full redesign:** Claude Design handoff brief only.

## Heavy features confirmed FULL (not simplified)
Public web profile (`/u/{id}`), project updates feed, achievements/quests,
in-app mentor booking/calendar.

## Open for morning
Reputation score model (labels vs numeric vs tiers) — Batch B leaves a clean
seam to drop it in.
