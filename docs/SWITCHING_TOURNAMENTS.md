# Switching the live tournament (safely)

Moving the live pipeline from one event to the next (Montréal → Cincinnati → US Open) used to mean editing the tournament id in **four** places — the two crons and the two edge functions — and getting one wrong meant the ingest wrote one tournament's results while the scorer scored another, silently breaking every leaderboard.

Now there is **one source of truth**: `public.app_config.active_tournament_id`. Both crons read it every run, so they can never disagree. The scorer follows it too. And the ingest function **refuses** to run against a tournament it wasn't built for, so a half-done switch fails *loudly* (a visible `ingest_health` error) instead of corrupting data.

## The model

```
                    ┌──────────────────────────────┐
                    │  public.app_config           │   ← the ONE switch
                    │  active_tournament_id = …     │
                    └──────────────────────────────┘
                       │ read every run          │ read every run
                       ▼                          ▼
   ingest cron  →  ingest-draw edge fn      scoring cron  →  recompute-score edge fn
   (5 min)          • built for ONE event      (3 min)         • scores ANY event id
                    • field + Wikipedia page                   • just reads matches by id
                    • REFUSES a mismatch                       • no field/page coupling
```

- **Single-sourced (change once, no code):** which tournament the crons target, and which the scorer scores.
- **Still a per-tournament code deploy:** `ingest-draw`'s player **field** and **Wikipedia page** are baked into its code (a standalone Deno function can't read the app's config at build time), so a new event needs `ingest-draw` rebuilt + redeployed. That's unavoidable — but it's now *guarded*, not silent.

## One-time setup (do this once, now)
Applies the single-source config. Order matters only in that `app_config.sql` comes first.
1. **[USER]** Run `supabase/app_config.sql` in the Supabase SQL editor. (Seeds `active_tournament_id = montreal_2026`; safe to re-run — it won't overwrite a later switch.)
2. **[USER]** Re-run `supabase/setup_scoring_cron.sql` and `supabase/setup_ingest_cron.sql` (their bodies now call `active_tournament_id()`). Same as before — paste, put in your service-role key, run.
3. *(Optional, ships on next redeploy)* redeploy `recompute-score` and `ingest-draw` so their manual-invoke defaults + the mismatch guard are active. Not required for the crons to work.

Verify: `select jobname, schedule, active from cron.job;` (both active) and `select * from public.app_config;` (shows `montreal_2026`).

## Switching to the next tournament (e.g. Cincinnati)
Do the code/data first, flip the switch last.
1. **[CODE]** Build the new event: its field JSON + `FIELDS` map entry + `player_stats` seed + schedule + the Montréal-pinned test updates (see `docs/ACTION_PLAN_2026-08.md` → Bucket B recipe). Deploy the client.
2. **[USER]** Redeploy `ingest-draw` built for the new event (its field + `WIKI_PAGE` + `TOURNAMENT_ID`):
   ```bash
   npx supabase functions deploy ingest-draw --project-ref mrdmlfumdsxufifjulbt
   ```
3. **[USER]** Apply the new event's `player_stats` seed (⚠️ this overwrites the previous event's ranks — do it at cutover, once Montréal is done).
4. **[USER] — THE SWITCH (one line):**
   ```sql
   update public.app_config set value = 'cincinnati_2026', updated_at = now() where key = 'active_tournament_id';
   ```
   Within a few minutes both crons pick it up: ingest starts fetching the new draw, the scorer starts scoring the new event.

> **Why the order?** If you flip `app_config` (step 4) *before* redeploying `ingest-draw` (step 2), the ingest cron will ask the old `ingest-draw` to ingest the new tournament — and it now **refuses with a clear error** (visible in `ingest_health.error`) instead of writing the old event's draw under the new id. So a wrong order fails safe. Fix by completing step 2, then it self-heals on the next run.

## Rolling back a switch
Set `app_config` back to the previous id and (if you'd redeployed) redeploy the previous `ingest-draw`. See `docs/ROLLBACK.md` for the coupled-release rules.
