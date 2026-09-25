-- =====================================================================================================
-- Pre-Shanghai hardening, migration 1 of 2: four SECURITY DEFINER functions closed to signed-out callers
-- Decided by Martino 2026-09-25 (the "Pre-Shanghai hardening" brief), from the 25 Sep system checkpoint
-- (§1.3 and §11: pipeline_watchdog() could be run by anyone, anon included, through PUBLIC).
--
-- Grants only; no function body, table, policy or cron job changes:
--   pipeline_watchdog()   EXECUTE revoked from PUBLIC, anon and authenticated. Cron job 16 runs it as
--                         postgres, which owns it; service_role keeps its own grant.
--   leave_league(uuid), delete_league(uuid), remove_member(uuid,uuid)
--                         EXECUTE revoked from PUBLIC and anon. authenticated keeps its own explicit grant,
--                         so the app's Leagues screen is unaffected; service_role keeps its own.
-- create_league / join_league already had no anon grant (migration revoke_anon_league_rpcs, 3 Sep).
--
-- Rollback copy of the four ACLs, taken at run time: app_config rollback_acl_pre_revoke_0925 (JSON).
-- Tests: supabase/revoke_public_definer_rpcs_tests.sql (ends in ROLLBACK; throwaway users only).
-- APPLIED: 2026-09-25 via apply_migration "revoke_public_definer_rpcs" as version 20260925091358.
--          Control run of the tests before (old ACLs): L1–L5 PASS, A1–A5 FAIL(ran), as expected.
--          Dry run first (UP + tests in one rolled-back transaction): 10/10 PASS, production untouched.
--          After apply: tests 10/10 PASS; anon false on all four, authenticated false on pipeline_watchdog
--          only, service_role true on all four; cron job 16 at 09:15:00Z succeeded.
-- =====================================================================================================

-- PRE-CHECK (read-only) ------------------------------------------------------------------------------
select p.oid::regprocedure as fn, p.proacl::text as acl,
       has_function_privilege('anon', p.oid, 'execute') as anon,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated
  from pg_proc p
 where p.oid in ('public.pipeline_watchdog()'::regprocedure, 'public.leave_league(uuid)'::regprocedure,
                 'public.delete_league(uuid)'::regprocedure, 'public.remove_member(uuid,uuid)'::regprocedure);
-- expect pipeline_watchdog {=X/postgres,postgres=X/postgres,service_role=X/postgres}, anon and authenticated true;
-- the three league functions {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}

-- =====================================================================================================
-- UP (what apply_migration ran; one transaction)
-- =====================================================================================================
-- 0. Guard: the ACLs must still be exactly what was read on 25 Sep, or nothing happens.
do $$
begin
  if (select proacl::text from pg_proc where oid = 'public.pipeline_watchdog()'::regprocedure)
       is distinct from '{=X/postgres,postgres=X/postgres,service_role=X/postgres}'
  or (select proacl::text from pg_proc where oid = 'public.leave_league(uuid)'::regprocedure)
       is distinct from '{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}'
  or (select proacl::text from pg_proc where oid = 'public.delete_league(uuid)'::regprocedure)
       is distinct from '{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}'
  or (select proacl::text from pg_proc where oid = 'public.remove_member(uuid,uuid)'::regprocedure)
       is distinct from '{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}'
  then
    raise exception 'ACLs differ from the 25 Sep reading; nothing changed';
  end if;
end $$;

-- 1. Rollback copy of the four ACLs, taken at run time.
insert into public.app_config (key, value, updated_at)
select 'rollback_acl_pre_revoke_0925',
       jsonb_build_object(
         'public.pipeline_watchdog()',       (select proacl::text from pg_proc where oid = 'public.pipeline_watchdog()'::regprocedure),
         'public.leave_league(uuid)',        (select proacl::text from pg_proc where oid = 'public.leave_league(uuid)'::regprocedure),
         'public.delete_league(uuid)',       (select proacl::text from pg_proc where oid = 'public.delete_league(uuid)'::regprocedure),
         'public.remove_member(uuid,uuid)',  (select proacl::text from pg_proc where oid = 'public.remove_member(uuid,uuid)'::regprocedure)
       )::text,
       now()
on conflict (key) do update set value = excluded.value, updated_at = now();

-- 2. The revokes.
revoke execute on function public.pipeline_watchdog() from public, anon, authenticated;
revoke execute on function public.leave_league(uuid), public.delete_league(uuid), public.remove_member(uuid, uuid)
  from public, anon;

-- 3. Post-check inside the same transaction: any surprise rolls the whole migration back.
do $$
begin
  if has_function_privilege('anon', 'public.pipeline_watchdog()', 'execute')
  or has_function_privilege('authenticated', 'public.pipeline_watchdog()', 'execute')
  or not has_function_privilege('service_role', 'public.pipeline_watchdog()', 'execute')
  or has_function_privilege('anon', 'public.leave_league(uuid)', 'execute')
  or has_function_privilege('anon', 'public.delete_league(uuid)', 'execute')
  or has_function_privilege('anon', 'public.remove_member(uuid,uuid)', 'execute')
  or not has_function_privilege('authenticated', 'public.leave_league(uuid)', 'execute')
  or not has_function_privilege('authenticated', 'public.delete_league(uuid)', 'execute')
  or not has_function_privilege('authenticated', 'public.remove_member(uuid,uuid)', 'execute')
  then
    raise exception 'post-check failed; migration rolled back';
  end if;
end $$;
-- ===================================================================================== end of UP =====

-- VERIFY (read-only) ---------------------------------------------------------------------------------
select p.oid::regprocedure as fn, p.proacl::text as acl,
       has_function_privilege('anon', p.oid, 'execute') as anon,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
       has_function_privilege('service_role', p.oid, 'execute') as service_role
  from pg_proc p
 where p.oid in ('public.pipeline_watchdog()'::regprocedure, 'public.leave_league(uuid)'::regprocedure,
                 'public.delete_league(uuid)'::regprocedure, 'public.remove_member(uuid,uuid)'::regprocedure);
-- expect anon false on all four, authenticated false on pipeline_watchdog only, service_role true on all.
-- Then: the next cron job 16 run succeeds (cron.job_run_details), and the tests file reads all PASS.

-- ROLLBACK (only on an explicit decision) -------------------------------------------------------------
-- The saved ACLs are in app_config rollback_acl_pre_revoke_0925. Restoring them means:
-- begin;
-- grant execute on function public.pipeline_watchdog() to public;
-- grant execute on function public.leave_league(uuid), public.delete_league(uuid), public.remove_member(uuid, uuid)
--   to public, anon;
-- commit;
