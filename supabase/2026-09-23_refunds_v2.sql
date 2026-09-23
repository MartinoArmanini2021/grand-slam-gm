-- =====================================================================================================
-- Refunds 60·55·45·30·15 from Shanghai on — server half
-- Decided by Martino 2026-09-23 ("refunds 60·55·45·30·15 go"), from the 22 Sep rebalancing study
-- (reports/grand-slam-gm-rebalance-study-2026-09-22.md, table T1): same diminishing shape, a notch lower,
-- so the $200M economy feels like money again mid-tournament (bank after the R32 break $47M → $32M,
-- unspent at the end $61M → $37M, skill gap unchanged).
--
-- Per tournament, like budget_for / max_transfers_for: montreal_2026, cincinnati_2026 and usopen_2026 keep
-- 75·70·55·40·25 FOREVER. A player with no match row (withdrawn / unscored opening round) still refunds
-- 100%; a semi-final or final loser still refunds nothing.
--
-- The app half is grand-slam-gm engine.ts REFUND_FRACTION_V2 / refundTableFor, whose rounding was made
-- exact to match round(price * fraction, 1) here (checked against Postgres: 0 mismatches in 9,600 cases).
--
-- What changes on the server: ONE expression inside market_check (the bank's refund line) now calls
-- refund_fraction_for(p_tournament, <exit round>) instead of a hardcoded CASE. The swap is done on the
-- LIVE body text with a regex that must match exactly once, after an md5 guard on that body, so nothing
-- else in the function can move. save_entry calls market_check and needs no change.
--
-- Order: server first (this file), then the app. No live event uses the new table until Shanghai, so the
-- order is safe either way; it is kept for the rule "the server moves first".
--
-- Files: this migration · supabase/refunds_v2_tests.sql (run after UP; ends in an expected ROLLBACK).
-- APPLIED: 2026-09-23 via apply_migration "refunds_v2" on Martino's word ("refunds 60·55·45·30·15 go").
--          market_check md5 1fc927743aeefa00ed9d1d9d4aa0df02 → f6dc2e3963c5f9e008da8cf421451152 (V1: only the refund
--          lines differ); rollback copy in app_config rollback_market_check_pre_refunds_v2 = the old md5.
--          Dry run first (whole migration + tests in one rolled-back transaction): 10/10 PASS, production untouched.
--          refunds_v2_tests.sql after apply: 8/8 PASS (T1a–T3), seed rows rolled back.
-- =====================================================================================================

-- PRE-CHECK (read-only) ------------------------------------------------------------------------------
select md5(pg_get_functiondef('public.market_check(text,jsonb,jsonb,timestamptz)'::regprocedure)) as market_check_md5,  -- expect 1fc927743aeefa00ed9d1d9d4aa0df02
       length(pg_get_functiondef('public.market_check(text,jsonb,jsonb,timestamptz)'::regprocedure)) as len,           -- expect 11100
       to_regprocedure('public.refund_fraction_for(text,text)') is null as refund_fn_absent,                             -- expect true
       (select value from public.app_config where key = 'active_tournament_id') as active;

-- =====================================================================================================
-- UP — one transaction
-- =====================================================================================================
begin;

-- 0. Guard: the body this migration was written against.
do $pre$
begin
  if md5(pg_get_functiondef('public.market_check(text,jsonb,jsonb,timestamptz)'::regprocedure))
     <> '1fc927743aeefa00ed9d1d9d4aa0df02' then
    raise exception 'market_check changed since 2026-09-23 — re-read it before applying this migration';
  end if;
end $pre$;

-- 1. Rollback copy of the LIVE body, taken at run time.
insert into public.app_config (key, value, updated_at)
select 'rollback_market_check_pre_refunds_v2',
       pg_get_functiondef('public.market_check(text,jsonb,jsonb,timestamptz)'::regprocedure), now()
on conflict (key) do update set value = excluded.value, updated_at = now();

-- 2. The rule function. A null round (a player still alive) returns 0, as the old CASE's else did.
create or replace function public.refund_fraction_for(p_tournament text, p_round text)
returns numeric language sql immutable parallel safe as $$
  select (case
    when p_tournament in ('montreal_2026', 'cincinnati_2026', 'usopen_2026') then
      case p_round when 'R128' then 0.75 when 'R64' then 0.70 when 'R32' then 0.55
                   when 'R16' then 0.40 when 'QF' then 0.25 else 0 end
    else
      case p_round when 'R128' then 0.60 when 'R64' then 0.55 when 'R32' then 0.45
                   when 'R16' then 0.30 when 'QF' then 0.15 else 0 end
  end)::numeric;
$$;
comment on function public.refund_fraction_for(text, text) is
  'Refund fraction for a player eliminated in p_round. Finished 2026 events keep 75/70/55/40/25; every later event 60/55/45/30/15. SF/F and null → 0. A player with no match row refunds 100% (handled by the caller). Mirrors engine.ts refundTableFor.';
revoke execute on function public.refund_fraction_for(text, text) from public, anon, authenticated;

-- 3. Swap the one hardcoded CASE in market_check for the rule function, on the live text.
do $swap$
declare
  v_def text := pg_get_functiondef('public.market_check(text,jsonb,jsonb,timestamptz)'::regprocedure);
  v_pat text := $re$else case (\(select m\.round from public\.matches m\s+where m\.tournament_id = p_tournament and \(m\.p1_id = r\.pid or m\.p2_id = r\.pid\)\s+and m\.winner_id is not null and m\.winner_id <> r\.pid\s+order by array_position\(v_order, m\.round\) desc limit 1\))\s+when 'R128' then 0\.75 when 'R64' then 0\.70 when 'R32' then 0\.55\s+when 'R16' then 0\.40 when 'QF' then 0\.25 else 0 end$re$;
  v_new text;
begin
  if regexp_count(v_def, v_pat) <> 1 then
    raise exception 'market_check: the refund CASE was found % time(s), expected exactly 1', regexp_count(v_def, v_pat);
  end if;
  v_new := regexp_replace(v_def, v_pat,
             'else public.refund_fraction_for(p_tournament, \1)   -- >> was the fixed 75·70·55·40·25 table (refunds_v2)');
  execute v_new;
end $swap$;

-- 4. Assertions — any failure aborts the whole transaction.
do $chk$
declare v_def text := pg_get_functiondef('public.market_check(text,jsonb,jsonb,timestamptz)'::regprocedure);
begin
  if public.refund_fraction_for('usopen_2026', 'R128') <> 0.75 or public.refund_fraction_for('montreal_2026', 'QF') <> 0.25
     or public.refund_fraction_for('cincinnati_2026', 'R64') <> 0.70 then
    raise exception 'legacy table moved';
  end if;
  if public.refund_fraction_for('shanghai_2026', 'R128') <> 0.60 or public.refund_fraction_for('shanghai_2026', 'R64') <> 0.55
     or public.refund_fraction_for('shanghai_2026', 'R32') <> 0.45 or public.refund_fraction_for('shanghai_2026', 'R16') <> 0.30
     or public.refund_fraction_for('shanghai_2026', 'QF') <> 0.15 or public.refund_fraction_for('shanghai_2026', 'SF') <> 0
     or public.refund_fraction_for('shanghai_2026', 'F') <> 0 or public.refund_fraction_for('shanghai_2026', null) <> 0 then
    raise exception 'new table wrong';
  end if;
  if position('refund_fraction_for(p_tournament' in v_def) = 0 or v_def ~ 'then 0\.75 when' then
    raise exception 'market_check still carries the hardcoded table';
  end if;
  if has_function_privilege('anon', 'public.refund_fraction_for(text,text)', 'execute')
     or has_function_privilege('authenticated', 'public.refund_fraction_for(text,text)', 'execute') then
    raise exception 'refund_fraction_for is callable by clients';
  end if;
end $chk$;

commit;

-- =====================================================================================================
-- TESTS: run supabase/refunds_v2_tests.sql — expect "ROLLBACK (expected)" with every line PASS.
-- =====================================================================================================

-- VERIFY (read-only) ---------------------------------------------------------------------------------
-- V1 the only difference between the rollback copy and the live body is the refund line.
with a as (select regexp_split_to_table(value, E'\n') l from public.app_config where key = 'rollback_market_check_pre_refunds_v2'),
     b as (select regexp_split_to_table(pg_get_functiondef('public.market_check(text,jsonb,jsonb,timestamptz)'::regprocedure), E'\n') l)
select 'only_in_old' side, l from a except all select 'only_in_old', l from b
union all
select 'only_in_new', l from b except all select 'only_in_new', l from a;
-- V2 the tables, side by side.
select r, public.refund_fraction_for('usopen_2026', r) as finished_2026, public.refund_fraction_for('shanghai_2026', r) as from_shanghai
from unnest(array['R128','R64','R32','R16','QF','SF','F']) r;
-- V3 the new fingerprint (record it in the header).
select md5(pg_get_functiondef('public.market_check(text,jsonb,jsonb,timestamptz)'::regprocedure)) as new_md5;

-- =====================================================================================================
-- ROLLBACK (commented; only on Martino's word)
-- =====================================================================================================
-- begin;
-- do $rb$ begin execute (select value from public.app_config where key = 'rollback_market_check_pre_refunds_v2'); end $rb$;
-- drop function if exists public.refund_fraction_for(text, text);
-- commit;
-- Then redeploy the app build from before the refunds change, or its bank would disagree with the server's.
