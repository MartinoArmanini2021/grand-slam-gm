-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- Market state, part 1 (sprint Session 12 = export plan Phase 5 steps a and b), 2026-10-20.
-- NOT APPLIED. Apply only on Martino's word. Requires 2026-10-20_notifications.sql (market_state()).
--
-- Why: the market's open/closed state is today DERIVED every time from placeholder rows and stamped
-- start times (market_window_controller + market_check). Nearly every past scare traced to that
-- derivation. The plan replaces it with one explicit row. Part 1 only WRITES the row, in shadow:
--   · public.app_state — one row per tournament: market 'draft' | 'open' | 'waiting' | 'closed' | 'no_draw',
--     the window round, when it locks, and frozen_rounds (the rounds that have begun = the save path's
--     "rounds begun" set). Readable by everyone, written only by sync_app_state().
--   · sync_app_state() — recomputes the active tournament's row from market_state(), the same three
--     steps the save path uses, and records each change in app_state_log.
--   · NOTHING READS IT on the server. market_check, save_entry and the controller are untouched (the
--     sprint rule for part 1). The app reads it only for a console cross-check against its own
--     derivation; the screens do not change.
-- Part 2 (Session 13) needs one full event with zero disagreements in that cross-check first.
--
-- The schedule line at the bottom is COMMENTED OUT. ROLLBACK at the bottom.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

create table if not exists public.app_state (
  tournament_id text primary key,
  market        text not null check (market in ('no_draw', 'draft', 'open', 'waiting', 'closed')),
  window_round  text,
  locks_at      timestamptz,
  frozen_rounds text[] not null default '{}',
  updated_at    timestamptz not null default now()
);
alter table public.app_state enable row level security;
drop policy if exists app_state_read on public.app_state;
create policy app_state_read on public.app_state for select to anon, authenticated using (true);
revoke all on public.app_state from anon, authenticated;
grant select on public.app_state to anon, authenticated;

create table if not exists public.app_state_log (
  id            bigint generated always as identity primary key,
  tournament_id text not null,
  market        text not null,
  window_round  text,
  locks_at      timestamptz,
  frozen_rounds text[] not null,
  at            timestamptz not null default now()
);
alter table public.app_state_log enable row level security;   -- service only
revoke all on public.app_state_log from anon, authenticated;

create or replace function public.sync_app_state(p_now timestamptz default now())
returns public.app_state
language plpgsql security definer set search_path = public as $$
declare
  v_tid text := public.active_tournament_id();
  s record; v_frozen text[]; r public.app_state; old public.app_state;
begin
  if v_tid is null then return null; end if;
  select * into s from public.market_state(v_tid, p_now);
  v_frozen := array(
    select o.r from unnest(array['R128','R64','R32','R16','QF','SF','F']) with ordinality as o(r, pos)
     where exists (select 1 from public.matches m where m.tournament_id = v_tid and m.round = o.r
                     and (m.winner_id is not null or (m.started_at is not null and m.started_at <= p_now)))
     order by o.pos);
  select * into old from public.app_state where tournament_id = v_tid;
  insert into public.app_state as a (tournament_id, market, window_round, locks_at, frozen_rounds, updated_at)
  values (v_tid, s.phase, s.window_round, s.locks_at, v_frozen, p_now)
  on conflict (tournament_id) do update
     set market = excluded.market, window_round = excluded.window_round, locks_at = excluded.locks_at,
         frozen_rounds = excluded.frozen_rounds,
         updated_at = case when (a.market, a.window_round, a.locks_at, a.frozen_rounds)
                                is distinct from (excluded.market, excluded.window_round, excluded.locks_at, excluded.frozen_rounds)
                           then excluded.updated_at else a.updated_at end
  returning * into r;
  if old.tournament_id is null
     or (old.market, old.window_round, old.locks_at, old.frozen_rounds)
        is distinct from (r.market, r.window_round, r.locks_at, r.frozen_rounds) then
    insert into public.app_state_log (tournament_id, market, window_round, locks_at, frozen_rounds, at)
    values (r.tournament_id, r.market, r.window_round, r.locks_at, r.frozen_rounds, p_now);
  end if;
  return r;
end $$;
revoke all on function public.sync_app_state(timestamptz) from public, anon, authenticated;
grant execute on function public.sync_app_state(timestamptz) to service_role;

-- the backfilled row (step a): today's state of the active tournament
select public.sync_app_state();

commit;

-- ── schedule (NOT run by applying this file) ──────────────────────────────────────────────────
-- Every minute, alongside the controller (job 17), as postgres:
--   select cron.schedule('sync-app-state', '* * * * *', $$ select public.sync_app_state(); $$);

-- VERIFY (read-only)
-- select * from public.app_state;
-- select * from public.app_state_log order by id desc limit 10;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- begin;
--   select cron.unschedule('sync-app-state');   -- only if it was scheduled
--   drop function if exists public.sync_app_state(timestamptz);
--   drop table if exists public.app_state_log;
--   drop table if exists public.app_state;
-- commit;
