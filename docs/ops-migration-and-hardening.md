# BFU — Ops plan: Railway → DigitalOcean migration + security/scale hardening

> Author: overnight session 2026-07-09. **Plan only — no cutover performed.** The
> actual migration + secret rotations are yours to run (they need your DO account,
> DNS, and provider dashboards). I can drive each step with you when you're ready.

---

## 0. Current topology (as-is)
- **Frontend (Mini App + landing):** Vite React → **Vercel** project `bfu-app` (alias `bfu-app.vercel.app` + `brightfuturesuzbekistan.uz`). `vercel.json` rewrites proxy every backend prefix (`/auth /users /projects /conversations /messages …`) to Railway. Deploy: `vercel deploy --prod --yes --scope abdurahims-projects` from repo root.
- **Backend (FastAPI) + bot:** **Railway** (`bfu-backend-production.up.railway.app`). Deploy: `git push origin main`. Schema managed by `Base.metadata.create_all` + an idempotent raw-DDL list in `main.py` (ALTER … ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS).
- **DB:** Postgres on Railway.
- **Bot:** same repo; runs as a Railway service (RUN_BOT_INLINE / separate service per memory).

## 1. Why move (and why NOT rush it)
- Railway is fine now but gets pricey at spike and gives less control. DO droplet + managed Postgres is cheaper at scale and closer to the iProAcademy/Marstiff pattern you already run.
- **Do NOT cutover during a viral spike or unsupervised.** A wrong DB cutover = data split-brain. Migrate in a maintenance window with both of us watching.

## 2. Target topology (recommended)
- **1× DO Droplet** (Ubuntu, 2 vCPU / 4 GB to start, $24/mo; scale to 4 vCPU/8 GB $48/mo under load) running **docker-compose**: `web` (uvicorn/gunicorn FastAPI), `bot` (separate container), `caddy` (reverse proxy + auto-TLS). Add swap (like the iPro droplet).
- **DO Managed Postgres** ($15/mo basic → $30+/mo with standby) — managed backups + PITR beat self-hosting the DB.
- **Frontend stays on Vercel** (it's free/cheap and great at static + edge). Only the `vercel.json` backend targets change from the Railway URL to the new API domain.
- **DO Spaces** ($5/mo) for any user media (avatars/cards) if you move off Telegram file ids.

## 3. Migration runbook (maintenance window, ~30–45 min)
1. Provision droplet + managed Postgres + a subdomain `api.brightfuturesuzbekistan.uz` (DNS A → droplet).
2. Bring up docker-compose on the droplet (web+bot+caddy), env vars copied from Railway (BOT_TOKEN, DB URL, secrets). Caddy issues TLS for `api.…`.
3. **DB copy:** `pg_dump` from Railway → `pg_restore` into DO managed PG. Verify row counts on `users`, `projects`, `messages`, `conversations`.
4. **Freeze writes briefly:** put bot in maintenance, stop the Railway web service. Re-dump the delta (or accept the short freeze) → restore.
5. Point the backend containers at DO PG; smoke-test `/health`, login, discover, send a DM.
6. **Flip the frontend:** update `vercel.json` backend host `bfu-backend-production.up.railway.app` → `api.brightfuturesuzbekistan.uz`, redeploy Vercel. Update the bot's `setWebhook`/Mini-App URL if any point at Railway.
7. Watch logs 24h. Keep Railway warm as instant rollback for 48h, then decommission.

## 4. Cost model (monthly, USD, rough)
| Item | Now (Railway) | Target (DO) |
|---|---|---|
| Backend compute | ~$10–20 (usage) | Droplet $24 (→$48 at load) |
| Postgres | bundled/usage | Managed $15 (→$30 HA) |
| Object storage | — | Spaces $5 |
| Frontend | Vercel (free/hobby) | Vercel (unchanged) |
| **Total** | **~$20–40** | **~$44–83** |
DO is a bit more at low scale but far more predictable + controllable at spike; managed PG backups are worth it alone.

---

## 5. Security audit — checklist + actions (YOU run the rotations)
- [ ] **Secrets in repo:** run `git log -p | grep -iE "TOKEN|SECRET|KEY|PASSWORD"` and scan `.env*`. If BOT_TOKEN / JWT secret / any API key was ever committed, **rotate it** (Telegram @BotFather /revoke + reissue; regenerate JWT secret → invalidates sessions, acceptable). *(Memory flags a possibly-exposed ANTHROPIC key from a sibling project — verify BFU isn't affected.)*
- [ ] **Env-only secrets:** confirm BOT_TOKEN, JWT secret, DB URL live only in Railway/DO env, never in code.
- [ ] **JWT:** short access-token TTL + refresh rotation (already in place) — confirm refresh tokens are revocable on signout.
- [ ] **Rate limits beyond messaging:** messaging has a 20/60s limit. Add the same pattern to `applications`, `follow`, `reports`, `interest`, `endorse/vouch` (DB-count window) to stop abuse at 1k+ users.
- [ ] **Auth on every mutating route:** spot-check that admin routes are `super_admin`-gated (Module-D pattern) and message/project mutations are owner-gated (they are).
- [ ] **Input caps:** message body 4000 (ok); add length caps + basic scam/link heuristics on profile `about`, project descriptions, vouches.
- [ ] **CORS for the future WebSocket / direct API:** when the Mini App talks to the API cross-origin (WS or post-migration), lock `Access-Control-Allow-Origin` to `brightfuturesuzbekistan.uz` + `bfu-app.vercel.app` + `web.telegram.org`, not `*`.

## 6. Monitoring / reliability
- [ ] **Sentry** (backend + frontend) — memory says it's wired for Marstiff; confirm a BFU DSN exists and errors flow. If not, add `sentry-sdk[fastapi]` + the frontend SDK (DSN-gated).
- [ ] **Uptime:** a GitHub-Action or DO monitor hitting `/health` every 5 min → alert.
- [ ] **DB pool:** confirm SQLAlchemy async pool size is set for the droplet (e.g. pool_size=10, max_overflow=20) — the viral-spike risk is connection exhaustion.
- [ ] **Structured logs** on the droplet (docker logs → a file/rotation, or DO's log forwarding).

## 7. Scale / viral-spike readiness (a blogger pushes 10k at once)
- **Polling is the #1 load risk.** City polls unread ~60s; the open message thread polls 6s. At 10k concurrent that's a lot of QPS. Two mitigations, in order:
  1. **WebSocket** for the open thread + typing (planned; needs you awake — it changes how the Mini App connects: a direct WSS to the API, since Vercel rewrites don't tunnel WS). Cuts thread polling to zero.
  2. Until then: back off intervals when hidden (already do) + add a tiny server-side cache on `/users/stats` and `/conversations/unread-count` (30s) so bursts hit cache, not the DB.
- **DB indexes:** the hot ones for discover/messages are now added (this session). Re-check with `EXPLAIN ANALYZE` on `/users/discover` under load.
- **Load test before a big push:** `k6`/`locust` against a staging copy (never hammer prod) simulating 5k users hitting City + a DM — watch DB connections + p95 latency; scale the droplet/pool from the numbers.

---

**Bottom line:** migration is a clean, well-understood ~40-min maintenance-window job — we do it together, keep Railway as instant rollback. Security + monitoring items are mostly checklist verifications + a few rate-limit additions I can code. WebSocket is the one big scale lever and the one thing worth doing with you watching.
