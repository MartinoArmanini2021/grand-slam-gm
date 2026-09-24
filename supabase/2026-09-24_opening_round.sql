-- =====================================================================================================
-- public.opening_round — the unscored opening round of a 96-player draw (a Masters)
-- Written 2026-09-24 for the Shanghai setup. Shanghai (7–18 Oct 2026) is the first 96-player event the
-- current app has run: Montréal and Cincinnati were drafted in the old app, which read the opening round
-- itself in the browser.
--
-- THE GAP IT CLOSES. A Masters' 64 unseeded players play an opening round nobody scores, while the draft
-- is still open (opening round Wed 7 – Thu 8 Oct, squads lock at the second round's first ball, Fri 9 Oct).
-- That round never reaches public.matches (a result there would close the draft), so during those two
-- days the app had no way to know who had already lost: the market kept selling opening-round losers and
-- a manager holding one never learned he should swap him while swapping was still free.
--
-- WHAT WRITES IT. ingest-draw, on every run for an event whose scored rounds skip the section brackets'
-- first round (openingRound() in the parser), upserts one row per opening-round pairing, never regressing
-- a recorded winner. It also leaves opening-round losers out of ingest_health.drafted_missing, so they do
-- not raise WALKOVER GAP alerts once the draft locks.
--
-- WHAT READS IT. The app, read-only (anon + authenticated), to mark those players out during the draft.
-- After the lock nothing changes: the engine already treats a field player with no match row as out of
-- the draw (outOfDraw), which is exactly an opening-round loser. No server function reads this table;
-- scoring, the market check and save_entry are untouched.
--
-- Order: apply THIS before deploying the new ingest-draw (the function reads the table on every run for a
-- 96-player event; a missing table is caught and logged, but the rows would not be written).
-- Security mirrors public.matches: RLS on, one SELECT policy for everyone, SELECT-only grants for the
-- client roles (Supabase's default privileges would otherwise hand them INSERT/UPDATE/DELETE/TRUNCATE,
-- and RLS does not govern TRUNCATE).
-- =====================================================================================================

-- PRE-CHECK (read-only) ------------------------------------------------------------------------------
select to_regclass('public.opening_round') is null as table_absent,                 -- expect true
       (select value from public.app_config where key = 'active_tournament_id') as active;

-- =====================================================================================================
-- UP — one transaction
-- =====================================================================================================
begin;

create table public.opening_round (
  tournament_id text not null,
  slot          int  not null,
  p1_id         text not null,
  p2_id         text not null,
  winner_id     text,
  score_line    text,
  primary key (tournament_id, slot),
  constraint opening_round_winner_in_pair check (winner_id is null or winner_id in (p1_id, p2_id))
);

comment on table public.opening_round is
  'The unscored opening round of a 96-player draw, written by ingest-draw. Display only: lets the app show '
  'opening-round losers as out while the draft is still open. Never read by scoring or the market check.';

alter table public.opening_round enable row level security;
create policy "opening_round readable" on public.opening_round for select to anon, authenticated using (true);

revoke all on public.opening_round from anon, authenticated;
grant select on public.opening_round to anon, authenticated;

commit;

-- VERIFY (read-only) ---------------------------------------------------------------------------------
select c.relrowsecurity as rls_on,
       (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = 'opening_round') as policies,     -- expect 1
       has_table_privilege('anon', 'public.opening_round', 'SELECT')          as anon_select,       -- expect true
       has_table_privilege('anon', 'public.opening_round', 'INSERT')          as anon_insert,       -- expect false
       has_table_privilege('authenticated', 'public.opening_round', 'UPDATE') as auth_update,       -- expect false
       has_table_privilege('anon', 'public.opening_round', 'TRUNCATE')        as anon_truncate,     -- expect false
       has_table_privilege('service_role', 'public.opening_round', 'INSERT')  as service_insert     -- expect true
  from pg_class c where c.oid = 'public.opening_round'::regclass;

-- =====================================================================================================
-- ROLLBACK — the table holds display data only; dropping it loses nothing that cannot be re-ingested.
-- Deploy the previous ingest-draw first (or it logs one 'opening_round write failed' per run, harmlessly).
-- =====================================================================================================
-- drop table if exists public.opening_round;
