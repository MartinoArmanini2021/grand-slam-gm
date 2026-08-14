# Cincinnati Open 2026 — build status & cutover

**Status: BUILT AND STAGED.** Everything is wired and verified; nothing is exposed to players yet.
The cutover is deliberately held until Montréal's final has ingested and scored.

## What's already done

| Piece | State |
|---|---|
| Draftable field (83 players) | `src/data/cincinnati2026Field.json` — built from the published draw, **reconciles exactly** (0 missing, 0 phantom) |
| Field wired into the app | `src/data/players.ts` → `FIELDS.cincinnati_2026` |
| Schedule / lock times | `src/data/tournamentConfig.ts` — R64 (draft close) Sat 15 Aug 15:00 UTC → F Sun 23 Aug |
| Theme | Teal surround + deep-blue court (already in config) |
| Ingest function | `supabase/functions/ingest-draw/index.ts` now carries a **registry** of both Montréal *and* Cincinnati |
| Server ranks | `supabase/seed_cincinnati_player_stats.sql` (83 players) |
| Tests | 303 passing, incl. new parity guards; typecheck clean |
| Exposed to players? | **No** — `live: false` |

Two real main-draw wildcards (Gaël Monfils, Thanasi Kokkinakis) sit outside the top-300 stats pool, so
they're hand-entered in `scripts/lib/events.mjs` (`EVENTS.cincinnati_2026.manual`) with real bio data and neutral
2026 form. They're only included if they're actually in the draw, so a withdrawal drops them automatically.

## Why the ingest registry matters

Previously `ingest-draw` was built for exactly ONE event, so switching meant *redeploy the function* and
*flip `app_config`* in the right order — a coupled release with a window where a mismatch could occur.
It now carries both events, so:

- **Montréal keeps ingesting its final uninterrupted** — deploying this changes nothing for it.
- **The cutover becomes a single SQL line.** No redeploy, no ordering hazard.
- An id the registry doesn't carry still fails **loudly** into `ingest_health` (and the watchdog alerts).

## Previewing it safely (nothing touches production)

```bash
npm run dev:cincinnati
```
Runs on **port 5175** as the Cincinnati Open while production stays on Montréal. (Uses `.env.cincinnati`,
which sets `VITE_ACTIVE_TOURNAMENT=cincinnati_2026`. That file is gitignored — recreate it with that one
line if you clone fresh.)

## Rebuilding the field if the draw changes

Withdrawals happen right up to first ball. Re-run both, in order:

```bash
npm run field:build cincinnati_2026
node scripts/reconcile-field.mjs "2026 Cincinnati Open – Men's singles" src/data/cincinnati2026Field.json
```

The second command **must** end with `✓ field reconciles exactly with the published draw.` If it reports
MISSING or PHANTOM players, fix before shipping — a phantom is a player someone can draft who can never score.

## The cutover (do this once Montréal's final is scored)

Order matters only in that the client deploy and the seed should land before the switch.

1. **[CODE]** Flip `live: false` → `live: true` on `cincinnati_2026` in `src/data/tournamentConfig.ts`.
2. **[CODE]** Re-run the field rebuild + reconcile above (catches any late withdrawal).
3. **[USER]** Deploy the client:
   ```bash
   npm run deploy
   ```
4. **[USER]** Deploy the ingest function (carries both events — safe at any point):
   ```bash
   npx supabase functions deploy ingest-draw --project-ref mrdmlfumdsxufifjulbt
   ```
5. **[USER]** Apply the ranks in the Supabase SQL editor: `supabase/seed_cincinnati_player_stats.sql`
   (purely additive — verified not to change any Montréal score).
6. **[USER] — THE SWITCH (one line):**
   ```sql
   update public.app_config set value = 'cincinnati_2026', updated_at = now() where key = 'active_tournament_id';
   ```

Within ~5 minutes both crons pick it up: ingest starts fetching the Cincinnati draw, the scorer starts
scoring Cincinnati. Confirm with the health query in `docs/PIPELINE_OPS.md`.

**Rolling back:** set `app_config` back to `montreal_2026` (the ingest function still carries it, so no
redeploy is needed). See `docs/ROLLBACK.md`.

## Timing note

The men's second round — where every drafted player enters, and therefore the **draft deadline** — begins
**Sat 15 Aug, 15:00 UTC**. Squads must be lockable before then, so the cutover needs to happen with enough
runway for managers to draft.
