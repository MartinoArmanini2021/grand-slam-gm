# How to review this codebase — Grand Slam GM

*A guide for a consultant or AI tool reviewing the project. Written to get you productive in ~15 minutes.*

## What this is (in one line)

A live fantasy‑tennis web app: users draft 10 real ATP players under a salary cap, pick a captain, and earn points as those players win real matches, competing on live leaderboards. Full context: **`docs/PROJECT_STATUS_AND_ROADMAP.md`** — read that first.

## Run it in three commands

```
npm install
npm run dev      # http://localhost:5173
npm test         # 249 tests — the executable spec (runs fully offline)
```

- To **run the app** you need your own free Supabase project with the two env vars in `.env.example` (URL + anon key). The real service‑role key is never in the code.
- To **read and verify** the app you need nothing — `npm test` and `npm run typecheck` run without any backend.

## The one thing to understand first: the data flow

The whole system is a pipeline that turns real match results into leaderboard points, fully automated:

```
Wikipedia draw page
   → (cron, 5 min) ingest-draw Edge Function   [parses the draw, reconciles player names]
   → public.matches                            [who beat whom, per round/slot]
   → (cron, 3 min) recompute-score Edge Function [+ player_stats: ranks/price/tier]
   → public.entries.score                      [SERVER-authoritative — clients can't write it]
   → board_entries view (redacts pre-lock squads)
   → /api/leaderboard (edge-cached 20s)
   → the player's browser

Separately: a player drafts/edits → save_entry RPC (validated, atomic) → public.entries
```

## Reading order (start here)

1. **`docs/PROJECT_STATUS_AND_ROADMAP.md`** — architecture, what's built, honest health assessment, roadmap.
2. **`src/__tests__/`** — the spec. Most informative:
   - `serverScoring.test.ts` — the scoring engine + client↔server parity + the strict locks.
   - `gameStore.test.ts` — draft rules, budget economy, transfers, per‑round points.
   - `liveIngestParity.test.ts`, `usOpenDraw.test.ts` — the draw parser (Masters + Grand Slam).
   - `fuzz.test.ts` — 150 random full games asserting no invariant ever breaks.
3. **`src/data/tournament.ts`** + **`src/scoring/serverEngine.ts`** — the scoring engine (round points, ranking multiplier, upset bonus, captain/vice).
4. **`src/data/drawParser.ts`** — pure function: Wikipedia bracket text → matches + results. Shared verbatim by client and server.
5. **`supabase/save_entry_rpc.sql`** — the single validated write path and the strict result‑based locks.
6. **`supabase/functions/`** — `ingest-draw` and `recompute-score` (the two cron jobs).
7. **`src/store/gameStore.ts`** — client game state and the client‑side mirror of the locks.

## Repo map

```
src/data/        game rules, scoring engine, draw parser, cloud client, tournament config
src/store/       Zustand stores (game state, live results, profile, cloud sync)
src/scoring/     portable scoring engine (kept byte-for-byte in sync with the server via a parity test)
src/components/  court, bracket, cloud-sync, live-feed
src/pages/       Draft, Team, League, Home, Player, Tournament
src/__tests__/   249 tests + fixtures (real Wikipedia draws)
supabase/*.sql   schema, RLS, save_entry / apply_entry_scores RPCs, hardening migrations
supabase/functions/  ingest-draw & recompute-score (Deno Edge Functions)
functions/api/   the cached public-leaderboard Cloudflare Function
scripts/deploy.mjs   build → deploy → verify the live bundle hash
docs/            overview/roadmap, dev workflow, launch ops, this guide
```

## Key invariants (the "why" behind much of the code)

- **Scoring is server‑authoritative.** Clients can save a squad but cannot write their `score`; only the service‑role `recompute-score` job writes it. Direct client writes to `entries` are revoked.
- **One validated write path.** All squad writes go through the `save_entry` Postgres function, which checks squad legality (size, tier quota, budget), an optimistic‑concurrency revision guard, and the locks — atomically.
- **Strict, result‑based locks.** You cannot set a captain, a squad, or a transfer for a match whose result you can already see. Enforced in the database, mirrored in the UI, and a rejected save rolls back.
- **Results only move forward.** `ingest-draw` is idempotent and never regresses a recorded winner to null on a partial read.
- **Client and server scoring engines are identical**, pinned by a parity test — the number you see can't drift from the number the server writes.
- **Privacy:** a redacting SQL view hides other players' in‑progress draft squads until they lock.

## Where a critical review adds the most value

The **product logic and data integrity are heavily tested**; the softer areas (see §5 of the overview) are:

- **Operational maturity:** no CI, manual monitoring, unverified transactional email (SMTP), no bot protection, free‑tier database. What would you prioritise for a public launch?
- **Single data dependency:** the pipeline reads Wikipedia. How would you harden result accuracy/timeliness?
- **No DB migrations framework** — schema is hand‑run SQL. Worth formalising?
- **Game balance:** are the tiers/pricing/scoring (round points, upset bonus, captain ×2) well‑calibrated, or is some strategy dominant?

## Good questions to put to the reviewer

1. Any code path where a user's squad or score could be **lost, corrupted, or made wrong**?
2. Any way a client can **cheat** — write its own score, back‑date a captain pick, read a private draft squad?
3. Is the **pricing/scoring balanced**, or does one tier/strategy dominate in expectation?
4. What **breaks at scale** (1k / 10k concurrent users) and in what order?
5. Any **security** gaps in auth, RLS, or the anon‑readable surface?

## Stack

React + TypeScript + Vite + Zustand → Cloudflare Pages. Supabase (PostgreSQL + RLS + Deno Edge Functions + `pg_cron`). Live data from Wikipedia's MediaWiki API. ~11k lines of app code, 249 tests.

*A note on the one visible key: `functions/api/leaderboard/[tournament].ts` contains a Supabase **anon** key, which is public by design (it ships in every browser). The privileged service‑role key is not in the codebase.*
