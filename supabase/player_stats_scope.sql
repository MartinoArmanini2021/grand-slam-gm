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
-- EXISTING ROWS — READ THIS, THE OBVIOUS ASSUMPTION IS WRONG. The table holds 109 rows, but the
-- Cincinnati field is only 96. The extra 13 are residue from earlier global seeds (Sinner at rank 1,
-- Wawrinka, Safiullin, Giron and others) — players in no current field, and SIX of them carry NULL
-- price/tier, the exact broken shape the seed generator exists to prevent. Blanket-stamping all 109
-- as cincinnati_2026 would relabel that residue as live Cincinnati data and enshrine it.
--
-- So: every existing row is parked under 'legacy_unscoped', and the Cincinnati seed (step 2 of the
-- runbook) then writes the 96 real entrants under cincinnati_2026. After that, cincinnati_2026
-- contains exactly the 96 seeded players and nothing else — provable, rather than assumed.
--
-- The residue is parked rather than deleted: nothing can reach it (a squad is filtered to the active
-- field before it is ever saved, and no scoring run reads that id), it is one UPDATE to recover, and
-- deleting rows on a live database to tidy up is not a trade worth making.
--
-- Montréal is deliberately not restored here. Its stored scores are already final and nothing
-- recomputes them; its true at-event rankings are archived in
-- docs/archive/montreal_2026/player_stats_montreal.json if you ever want its history back.
-- ─────────────────────────────────────────────────────────────────────────────────────────────────

begin;

-- 1) Add the column. Park every pre-existing row under 'legacy_unscoped' — we cannot tell from
--    inside the database which tournament they were meant for, and guessing is how the residue
--    described above would become "Cincinnati data". The seed decides what Cincinnati is.
alter table public.player_stats add column if not exists tournament_id text;
update public.player_stats set tournament_id = 'legacy_unscoped' where tournament_id is null;
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
-- After THIS file alone, expect a single row: legacy_unscoped, 109 players.
-- After the Cincinnati seed (runbook step 2) you should see TWO rows:
--     cincinnati_2026    96
--     legacy_unscoped   109
-- and the completeness check below must return 0. A NULL price or tier on a live row is the failure
-- that silently reads a legal 2/3/5 squad as 2/3/4, so it can never be locked.
select tournament_id, count(*) as players,
       count(*) filter (where price is null or tier is null) as incomplete_rows
from public.player_stats
group by tournament_id
order by tournament_id;

-- Assert the key actually swapped — this is the one thing the file exists to do, so check it rather
-- than assume it. Expect exactly: PRIMARY KEY (tournament_id, id)
select pg_get_constraintdef(oid) as primary_key
from pg_constraint
where conrelid = 'public.player_stats'::regclass and contype = 'p';

-- ── A consequence worth knowing ──────────────────────────────────────────────────────────────────
-- With Montréal's rows absent, nothing can rescore Montréal — which is the point; its scores in
-- public.entries are now genuinely frozen. Two follow-ons:
--   • recompute-score only ever scores app_config.active_tournament_id, so it will not try.
--   • save_entry validates a squad against player_stats FOR THAT TOURNAMENT. A write against
--     montreal_2026 would now fail with 'Squad contains an unknown player'. That is correct — a
--     finished tournament must be read-only — but the client must not attempt such a save. This is
--     handled by the `completed` status work (Phase 2.1); until that ships, do not re-point
--     app_config at montreal_2026.
-- Montréal's true at-event rankings are in docs/archive/montreal_2026/player_stats_montreal.json
-- (77 players, rebuilt from montreal2026Field.json, which the 2026-08-14 ranking refresh never
-- touched — Jodar is 25 there, as he was at Montréal, not the 11 he became afterwards).
-- NB docs/archive/montreal_2026/player_stats.json is a dump of the LIVE table as of 2026-08-18 —
-- i.e. post-refresh Cincinnati numbers. It is NOT what Montréal was scored under. Do not restore
-- from it believing otherwise.
