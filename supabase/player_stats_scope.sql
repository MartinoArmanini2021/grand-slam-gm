-- ── Scope player_stats by tournament (fix 1.3) ───────────────────────────────────────────────────
-- Apply ONCE in the Supabase SQL editor. Idempotent — safe to re-run.
--
-- THE PROBLEM. public.player_stats was a single global table keyed on `id` alone, with no notion of
-- which tournament a row described. recompute-score reads `ranking` from it on EVERY run (every 3
-- minutes) to compute the ranking multiplier and upset bonus, and save_entry reads `price`/`tier`
-- for the salary cap and the 2/3/5 quota. So seeding a new tournament's field overwrote the shared
-- player ids, and the next scoring run silently recomputed EVERY tournament — including finished
-- ones — against the new event's rankings. Past results were not immutable; they drifted whenever
-- the next field was loaded. It also made the season-long meta-leaderboard impossible to build,
-- because there was nowhere to keep "what Jodar was ranked at Montréal".
--
-- THE FIX. Primary key becomes (tournament_id, id): every tournament keeps its own rankings and
-- prices, permanently. A finished event's numbers can no longer be touched by loading the next one.
--
-- EXISTING ROWS. The 109 rows currently in the table are the CINCINNATI field (they were re-seeded
-- on 2026-08-14 with a fresh ATP snapshot), so they are assigned to cincinnati_2026. Montréal is
-- deliberately NOT backfilled — its final numbers are archived in docs/archive/montreal_2026/ and
-- its stored scores in public.entries are already final. See the note at the bottom.
-- ─────────────────────────────────────────────────────────────────────────────────────────────────

begin;

-- 1) Add the column and give every existing row its owner.
alter table public.player_stats add column if not exists tournament_id text;
update public.player_stats set tournament_id = 'cincinnati_2026' where tournament_id is null;
alter table public.player_stats alter column tournament_id set not null;

-- 2) Swap the primary key from (id) to (tournament_id, id). Guarded on the CURRENT definition so a
--    second run is a no-op rather than an error.
do $$
begin
  if exists (
    select 1 from pg_constraint
     where conrelid = 'public.player_stats'::regclass
       and contype = 'p'
       and pg_get_constraintdef(oid) = 'PRIMARY KEY (id)'
  ) then
    alter table public.player_stats drop constraint player_stats_pkey;
    alter table public.player_stats add constraint player_stats_pkey primary key (tournament_id, id);
  end if;
end $$;

-- 3) Every lookup in save_entry and recompute-score now filters on tournament_id, so this index is
--    the one they actually use.
create index if not exists player_stats_tournament_idx on public.player_stats (tournament_id);

commit;

-- ── Verify ───────────────────────────────────────────────────────────────────────────────────────
-- Expect one row: cincinnati_2026 with 109 players.
select tournament_id, count(*) as players, min(ranking) as best_rank, max(ranking) as worst_rank
from public.player_stats
group by tournament_id
order by tournament_id;

-- And the key should now be composite:
--   select pg_get_constraintdef(oid) from pg_constraint
--    where conrelid = 'public.player_stats'::regclass and contype = 'p';
--   -> PRIMARY KEY (tournament_id, id)

-- ── A consequence worth knowing ──────────────────────────────────────────────────────────────────
-- With Montréal's rows absent, nothing can rescore Montréal — which is the point; its scores in
-- public.entries are now genuinely frozen. Two follow-ons:
--   • recompute-score only ever scores app_config.active_tournament_id, so it will not try.
--   • save_entry validates a squad against player_stats FOR THAT TOURNAMENT. A write against
--     montreal_2026 would now fail with 'Squad contains an unknown player'. That is correct — a
--     finished tournament must be read-only — but the client must not attempt such a save. This is
--     handled by the `completed` status work (Phase 2.1); until that ships, do not re-point
--     app_config at montreal_2026.
-- If you ever want Montréal's history restored, docs/archive/montreal_2026/player_stats.json holds
-- the exact rankings its scores were computed from.
