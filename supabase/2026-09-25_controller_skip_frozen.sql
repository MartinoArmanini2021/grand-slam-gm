-- =====================================================================================================
-- Pre-Shanghai hardening, migration 2 of 2: the market window controller leaves frozen events alone
-- Decided by Martino 2026-09-25 (the "Pre-Shanghai hardening" brief), from the 25 Sep system checkpoint
-- (§8 and §11: a round_plan edit re-stamps a round's rows while the round is "ready", and every round
-- of a finished event stays ready, so an edit to a FROZEN event's plan could still move its matches).
--
-- The change: right after the FREEZE block, market_window_controller() returns at once, with no ready,
-- stamp or plant, when the active tournament has a row in public.tournament_status. Events that are not
-- frozen (Shanghai) run exactly the code they ran before: the new block is the only difference.
-- Done on the LIVE body text after an md5 guard: the block is inserted before the READY comment, which
-- must occur exactly once, so nothing else in the function can move. Owner, ACL (postgres and
-- service_role only), security (invoker) and search_path are kept by CREATE OR REPLACE.
--
-- Rollback copy of the live body, taken at run time: app_config rollback_mwc_pre_skip_frozen.
-- APPLIED: 2026-09-25 via apply_migration "controller_skip_frozen" as version 20260925091556.
--          md5 6ac00259c7f34c7ed6fdd662df49590e → e49ded4e9c5a25413339e81b6269f9cd (length 4108 → 4612);
--          V1: 8 lines only in the new body (the FROZEN block + one blank line), 0 only in the old;
--          V2: dry run with usopen_2026 active 5 rows → 0; V3: shanghai_2026 not frozen, 6 plan rows, health ok.
--          Dry run first (whole UP + V1/V2 in one rolled-back transaction): identical results, production untouched.
-- =====================================================================================================

-- PRE-CHECK (read-only) ------------------------------------------------------------------------------
select md5(pg_get_functiondef('public.market_window_controller(boolean)'::regprocedure)) as mwc_md5,   -- expect 6ac00259c7f34c7ed6fdd662df49590e
       length(pg_get_functiondef('public.market_window_controller(boolean)'::regprocedure)) as len,    -- expect 4108
       (select count(*) from public.market_window_controller(true)) as dry_rows,                       -- 5 (ready F/QF/R16/R32/SF)
       (select value from public.app_config where key = 'active_tournament_id') as active;            -- usopen_2026 (frozen)

-- =====================================================================================================
-- UP (what apply_migration ran; one transaction)
-- =====================================================================================================
do $mig$
declare
  v_def    text := pg_get_functiondef('public.market_window_controller(boolean)'::regprocedure);
  v_anchor text := E'\n  -- READY: the preceding round is complete';
  v_block  text := $blk$
  -- FROZEN (pre-Shanghai hardening, 2026-09-25) -----------------------------------------------------
  -- A frozen event is finished for good: stop here, with no ready, stamp or plant, so a later edit of
  -- its round_plan can't re-stamp (or reopen) anything. It comes after FREEZE, so the minute that
  -- freezes an event stops here too. A dry run returns no rows for a frozen event.
  if exists (select 1 from public.tournament_status ts where ts.tournament_id = v_tid) then
    return;
  end if;
$blk$;
begin
  if md5(v_def) <> '6ac00259c7f34c7ed6fdd662df49590e' then
    raise exception 'market_window_controller changed since it was read on 25 Sep (md5 %); nothing changed', md5(v_def);
  end if;
  if (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception 'READY anchor not found exactly once; nothing changed';
  end if;

  -- 1. Rollback copy of the LIVE body, taken at run time.
  insert into public.app_config (key, value, updated_at)
  values ('rollback_mwc_pre_skip_frozen', v_def, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();

  -- 2. The new body: the live text with the FROZEN block inserted before READY; nothing else moves.
  execute replace(v_def, v_anchor, v_block || v_anchor);

  -- 3. Post-check inside the same transaction: any surprise rolls the whole migration back.
  if (select proacl::text from pg_proc where oid = 'public.market_window_controller(boolean)'::regprocedure)
       is distinct from '{postgres=X/postgres,service_role=X/postgres}'
  or (select count(*) from public.tournament_status
       where tournament_id = (select value from public.app_config where key = 'active_tournament_id')) = 1
     and (select count(*) from public.market_window_controller(true)) <> 0
  then
    raise exception 'post-check failed; migration rolled back';
  end if;
end
$mig$;
-- ===================================================================================== end of UP =====

-- VERIFY (read-only) ---------------------------------------------------------------------------------
-- V1 the only difference between the rollback copy and the live body is the FROZEN block (7 lines + 1 blank).
with a as (select regexp_split_to_table(value, E'\n') l from public.app_config where key = 'rollback_mwc_pre_skip_frozen'),
     b as (select regexp_split_to_table(pg_get_functiondef('public.market_window_controller(boolean)'::regprocedure), E'\n') l)
select 'only_in_old' side, l from a except all select 'only_in_old', l from b
union all
select 'only_in_new', l from b except all select 'only_in_new', l from a;
-- V2 a dry run for the frozen active event returns nothing (it returned 5 "ready" rows before).
select count(*) from public.market_window_controller(true);                                            -- expect 0
-- V3 Shanghai is not frozen, so it passes the new block and reaches the unchanged READY/STAMP/PLANT code.
select (select count(*) from public.tournament_status where tournament_id = 'shanghai_2026') as frozen,  -- expect 0
       (select count(*) from public.round_plan where tournament_id = 'shanghai_2026') as plan_rows,      -- expect 6
       public.round_plan_health('shanghai_2026') as plan_health;
-- The controller takes no tournament argument (it reads active_tournament_id()), so a dry run AS
-- shanghai_2026 needs a write to app_config; not done. Even then it would list nothing before 8 Oct
-- 21:00Z: it reports only rounds that are ready, and R64 (first ball 9 Oct 03:00Z) is the first.

-- ROLLBACK (only on an explicit decision) -------------------------------------------------------------
-- begin;
-- do $rb$ begin execute (select value from public.app_config where key = 'rollback_mwc_pre_skip_frozen'); end $rb$;
-- commit;
