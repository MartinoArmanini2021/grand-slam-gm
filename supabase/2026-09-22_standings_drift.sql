-- =====================================================================================================
-- Grand Slam GM — Job 2: drift detection for frozen standings.
--
-- File   : C:\Users\marti\gsgm-migrations\2026-09-22_standings_drift.sql
-- Target : Supabase project mrdmlfumdsxufifjulbt (production), SQL editor, as postgres.
-- APPLIED: UP 2026-09-22 21:18Z as migration 20260922211820 standings_drift_up; tests 8/8 PASS; VERIFY V1 (3x ok, hashes
--          intact) and V2 (19 NEW lines, no OLD) clean; grand-slam-gm bun test 175 pass.
-- Drafted: 2026-09-22 from the live pipeline_watchdog() body as left by Job 1
--          (2026-09-22_tournament_status_freeze.sql UP-A, md5 49a208e6ab4c8ffeec9a164f628e9042).
--          Brief + review: Martino, 2026-09-22 (review R6). Nothing runs without his word.
--
-- WHAT IT DOES: public.standings_drift(tid) compares the live entries.score of a frozen tournament with
-- its tournament_status.final_standings and returns {ok:true} or the rows that differ. The watchdog runs
-- it over every frozen tournament on every tick (15 min) and, in the same alert, also checks that each
-- stored table still matches its stored hash. Drift catches the scorer; the hash catches the editor.
-- Both live in their own `begin … exception when others then null; end;` block, like the walkover and
-- round-plan checks, so a fault here can never silence the checks above it.
--
-- HOW TO USE (in order, each block on its own, in the SQL editor):
--   1. PRE-CHECK (read-only).
--   2. UP (one transaction): rollback copy of the live watchdog into app_config under
--      rollback_pipeline_watchdog_pre_drift (a distinct key: the Job 1 capture is never overwritten),
--      standings_drift, the patched watchdog, assertions.
--   3. Run standings_drift_tests.sql: nudges one real score and edits one real archive row INSIDE a
--      block that ends in RAISE EXCEPTION, so both are rolled back; the report must be all PASS.
--   4. VERIFY (read-only).
--   5. ROLLBACK (bottom) restores the Job 1 watchdog body and drops standings_drift.
--
-- Guardrails: read-only with respect to entries (the only score write anywhere is the test's nudge,
-- inside a transaction that ends in an exception); no scoring, market or security change; no new cron.
-- =====================================================================================================


-- =====================================================================================================
-- PRE-CHECK — read-only
-- =====================================================================================================
select md5(pg_get_functiondef('public.pipeline_watchdog()'::regprocedure)) as watchdog_md5,
       length(pg_get_functiondef('public.pipeline_watchdog()'::regprocedure)) as watchdog_len,
       (select count(*) from public.tournament_status) as frozen_rows,
       to_regprocedure('public.standings_drift(text)') as drift_fn;
-- expected: 49a208e6ab4c8ffeec9a164f628e9042 / 8312 · 3 · NULL


-- =====================================================================================================
-- UP — one transaction
-- =====================================================================================================
begin;

-- 1. Rollback copy of the LIVE watchdog body, taken at run time, under its own key.
insert into public.app_config (key, value, updated_at)
select 'rollback_pipeline_watchdog_pre_drift',
       pg_get_functiondef('public.pipeline_watchdog()'::regprocedure), now()
on conflict (key) do update set value = excluded.value, updated_at = now();

-- 2. standings_drift — stable, reads only. Raises for a tournament that is not frozen (there is nothing
--    to compare against, and "ok" would be a lie). Compares round(live score, 1) with the stored score
--    per user_id through a FULL join, so an entry added or removed after the freeze also shows up.
create or replace function public.standings_drift(p_tournament text)
returns jsonb
language plpgsql
stable
set search_path = public
as $fn$
declare
  v_rows  jsonb;
  v_moved int;
begin
  if not exists (select 1 from public.tournament_status where tournament_id = p_tournament) then
    raise exception 'standings_drift(%): not frozen — no tournament_status row', p_tournament;
  end if;

  with frozen as (
    select (x->>'user_id')::uuid as user_id, x->>'team_name' as team_name, (x->>'score')::numeric as score
      from public.tournament_status ts
      cross join lateral jsonb_array_elements(ts.final_standings) x
     where ts.tournament_id = p_tournament),
  live as (
    select e.user_id, round(e.score::numeric, 1) as score
      from public.entries e where e.tournament_id = p_tournament),
  moved as (
    select coalesce(f.user_id, l.user_id) as user_id,
           coalesce(f.team_name, (select p.team_name from public.profiles p where p.id = l.user_id), '') as team_name,
           f.score as frozen_score, l.score as live_score
      from frozen f full join live l on l.user_id = f.user_id
     where f.score is distinct from l.score)
  select count(*),
         jsonb_agg(jsonb_build_object('user_id', user_id, 'team_name', team_name,
                                      'frozen_score', frozen_score, 'live_score', live_score)
                   order by user_id)
    into v_moved, v_rows
    from moved;

  if v_moved = 0 then return jsonb_build_object('ok', true); end if;
  return jsonb_build_object('ok', false, 'tournament_id', p_tournament, 'moved', v_moved, 'rows', v_rows);
end $fn$;
revoke all on function public.standings_drift(text) from public, anon, authenticated;
grant execute on function public.standings_drift(text) to service_role;

-- 3. The watchdog. Body = the live body as left by Job 1 (md5 49a208e6ab4c8ffeec9a164f628e9042), plus the
--    lines marked "DRIFT (Job 2, 2026-09-22)" / "FROZEN STANDINGS DRIFT". Nothing else changes.
CREATE OR REPLACE FUNCTION public.pipeline_watchdog()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_tid        text := public.active_tournament_id();
  v_webhook    text;
  v_ingest_age interval;
  v_ingest_ok  boolean;
  v_score_age  interval;
  v_score_ok   boolean;
  v_alerts     text[] := '{}';
  v_last_alert timestamptz;
  v_text       text;
  v_unexpected text[];
  v_plan       text;
  v_frozen_at  timestamptz;                       -- FREEZE (Job 1, 2026-09-22)
  v_offseason  boolean := false;                  -- FREEZE (Job 1, 2026-09-22)
  v_ts         record;                            -- DRIFT (Job 2, 2026-09-22)
  v_drift      jsonb;                             -- DRIFT (Job 2, 2026-09-22)
begin
  select decrypted_secret into v_webhook from vault.decrypted_secrets where name = 'gsgm_alert_webhook';
  if v_webhook is null or v_webhook = '' then return; end if;   -- no webhook configured -> nothing to do

  -- FROZEN / OFF-SEASON (Job 1, 2026-09-22) ------------------------------------------------------
  -- A finished tournament is archived in public.tournament_status by freeze_tournament(). Once that
  -- row exists, recompute-score and ingest-draw answer skipped:'completed' and write NO heartbeat, so
  -- every freshness check below would fire forever. But silence must not look like failure either:
  -- say so ONCE (marker in app_config, same pattern as <tid>_repair_notice_sent), then stay quiet
  -- until active_tournament_id moves on to an unfrozen event.
  select ts.completed_at into v_frozen_at from public.tournament_status ts where ts.tournament_id = v_tid;
  if v_frozen_at is not null then
    if now() - v_frozen_at > interval '24 hours'
       and not exists (select 1 from public.app_config a where a.key = 'offseason_notice_sent_' || v_tid) then
      v_offseason := true;
      v_alerts := array_append(v_alerts,
        '• OFF-SEASON — ' || v_tid || ' is frozen (tournament_status, since '
        || to_char(v_frozen_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI"Z"')
        || '); ingest and scoring are idle by design. Set active_tournament_id when the next event is ready.');
    end if;
  else
  -- The live checks below run only for an UNFROZEN active tournament. They are deliberately left at
  -- their original indentation so the VERIFY line-diff shows inserted lines only.

  -- FRESHNESS IS NOT ENOUGH: check `ok` TOO. ingest-draw upserts ingest_health with ok:false AND a
  -- fresh last_run_at on every failure, so a feed failing all 288 runs a day kept a perfectly fresh
  -- heartbeat and the alert never fired. A heartbeat that ticks while the thing it monitors is dead
  -- is worse than none, because it reads as proof of health.

  -- Ingest (cron every 5 min; >20 min stale = 4 missed runs = a real failure).
  select now() - last_run_at, ok into v_ingest_age, v_ingest_ok
    from public.ingest_health where tournament_id = v_tid;
  if v_ingest_age is null or v_ingest_age > interval '20 minutes' then
    v_alerts := array_append(v_alerts, '• INGEST stale — last ran ' || coalesce(v_ingest_age::text, 'never') || ' ago');
  elsif v_ingest_ok is not true then
    v_alerts := array_append(v_alerts, '• INGEST FAILING — running on time but reporting an error: '
      || coalesce((select left(error, 200) from public.ingest_health where tournament_id = v_tid), 'no message'));
  end if;

  -- Scoring (skip gracefully if the edge fn heartbeat hasn't populated the table yet).
  begin
    select now() - last_run_at, ok into v_score_age, v_score_ok
      from public.scoring_health where tournament_id = v_tid;
    if v_score_age is null or v_score_age > interval '20 minutes' then
      v_alerts := array_append(v_alerts, '• SCORING stale — last ran ' || coalesce(v_score_age::text, 'never') || ' ago');
    elsif v_score_ok is not true then
      v_alerts := array_append(v_alerts, '• SCORING FAILING — running on time but reporting an error: '
        || coalesce((select left(error, 200) from public.scoring_health where tournament_id = v_tid), 'no message'));
    end if;
  exception when undefined_table then null;
  end;

  -- WALKOVER GAP ------------------------------------------------------------------------------
  -- A drafted player with NO match row is treated by the app as a pre-tournament withdrawal:
  -- FULL refund and a FREE transfer. That is only correct for players struck out of the draw
  -- before play began (replaced by lucky losers). Once the event is under way every withdrawal
  -- produces a walkover ROW, so a NEW name appearing here does not mean someone withdrew — it
  -- means the parser failed to record a result, and the app is now handing back full price and a
  -- free transfer for a player who may actually have been beaten.
  -- Genuine pre-tournament withdrawals are listed in app_config key <tid>_known_withdrawals.
  begin
    if exists (select 1 from public.matches m
                where m.tournament_id = v_tid
                  and (m.winner_id is not null or m.started_at <= now())) then
      select array_agg(x.id) into v_unexpected
        from (select jsonb_array_elements_text(coalesce(ih.drafted_missing, '[]'::jsonb)) as id
                from public.ingest_health ih where ih.tournament_id = v_tid) x
       where x.id <> all (string_to_array(
               coalesce((select a.value from public.app_config a
                          where a.key = v_tid || '_known_withdrawals'), ''), ','));
      if v_unexpected is not null and array_length(v_unexpected, 1) > 0 then
        v_alerts := array_append(v_alerts,
          '• WALKOVER GAP — ' || array_to_string(v_unexpected, ', ')
          || ' have no match row but are not known pre-tournament withdrawals. Likely an unparsed'
          || ' walkover: the app is granting a FULL refund + free transfer for them. If the'
          || ' withdrawal is genuine, add them to app_config key ' || v_tid || '_known_withdrawals');
      end if;
    end if;
  exception when others then null;   -- a fault here must never silence the checks above
  end;

  -- ROUND PLAN --------------------------------------------------------------------------------
  -- Since 2026-09 the market-window controller reads its schedule from public.round_plan. An active
  -- tournament with no rows, or with no upcoming first ball, means the controller runs successfully
  -- every minute and does nothing — the market would neither open nor close. Silent between events.
  begin
    v_plan := public.round_plan_health(v_tid);
    if v_plan = 'no_rows' then
      v_alerts := array_append(v_alerts,
        '• ROUND PLAN MISSING — no round_plan rows for ' || v_tid
        || ': the market-window controller has nothing to open or close. Insert the rounds'
        || ' (slots, first ball, preceding round) into public.round_plan.');
    elsif v_plan = 'no_future_first_ball' then
      v_alerts := array_append(v_alerts,
        '• ROUND PLAN STALE — a round of ' || v_tid || ' has not begun and no unbegun round has a'
        || ' first ball in the future. Update public.round_plan.first_ball.');
    end if;
  exception when others then null;   -- a fault here must never silence the checks above
  end;

  end if;   -- FROZEN / OFF-SEASON (Job 1, 2026-09-22)

  -- FROZEN STANDINGS DRIFT (Job 2, 2026-09-22) ---------------------------------------------------
  -- Every archived tournament, active or not. standings_drift() catches the SCORER (a live score that
  -- no longer matches the frozen table); the hash catches the EDITOR (a final_standings that no longer
  -- matches the hash it was stored with). Either means something wrote to a frozen event: say which
  -- event and how many rows. Own exception block: a fault here must never silence the checks above.
  begin
    for v_ts in select ts.tournament_id, ts.standings_hash, ts.final_standings
                  from public.tournament_status ts order by ts.completed_at loop
      v_drift := public.standings_drift(v_ts.tournament_id);
      if coalesce((v_drift->>'ok')::boolean, false) is not true then
        v_alerts := array_append(v_alerts,
          '• FROZEN STANDINGS MOVED — ' || v_ts.tournament_id || ': ' || coalesce(v_drift->>'moved', '?')
          || ' row(s) of entries.score differ from tournament_status.final_standings. Nothing may write'
          || ' entries.score for a frozen event; find the writer, then compare with'
          || ' select public.standings_drift(''' || v_ts.tournament_id || ''').');
      end if;
      if public.standings_hash(v_ts.final_standings) is distinct from v_ts.standings_hash then
        v_alerts := array_append(v_alerts,
          '• FROZEN TABLE EDITED — ' || v_ts.tournament_id || ': standings_hash(final_standings) no longer'
          || ' matches the stored standings_hash. The archive itself was changed after the freeze.');
      end if;
    end loop;
  exception when others then null;   -- a fault here must never silence the checks above
  end;

  if array_length(v_alerts, 1) is null then return; end if;    -- everything healthy

  -- Throttle: at most one alert per hour while the stall persists.
  select last_alert_at into v_last_alert from public.watchdog_state where id = 1;
  if v_last_alert is not null and now() - v_last_alert < interval '55 minutes' then return; end if;

  v_text := '🔴 Grand Slam GM pipeline (' || v_tid || '):' || chr(10)
         || array_to_string(v_alerts, chr(10)) || chr(10)
         || 'Check the crons + the Vault key — see docs/PIPELINE_OPS.md.';

  -- Send both keys so it works for a Discord ("content") OR a Slack ("text") webhook.
  perform net.http_post(
    url     := v_webhook,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body    := jsonb_build_object('content', v_text, 'text', v_text)
  );
  update public.watchdog_state set last_alert_at = now() where id = 1;
  if v_offseason then   -- FREEZE (Job 1, 2026-09-22): the notice went out; never repeat it for this event
    insert into public.app_config (key, value, updated_at)
    values ('offseason_notice_sent_' || v_tid, now()::text, now())
    on conflict (key) do nothing;
  end if;
end $function$;

-- 4. Assertions — any failure aborts the whole of UP.
do $chk$
declare v_body text; t text;
begin
  foreach t in array array['usopen_2026', 'cincinnati_2026', 'montreal_2026'] loop
    if (public.standings_drift(t)->>'ok')::boolean is not true then
      raise exception 'standings_drift(%) is not ok at install time: %', t, public.standings_drift(t);
    end if;
  end loop;
  v_body := pg_get_functiondef('public.pipeline_watchdog()'::regprocedure);
  if v_body !~ 'standings_drift' or v_body !~ 'FROZEN TABLE EDITED' then
    raise exception 'pipeline_watchdog was not patched';
  end if;
  if has_function_privilege('anon', 'public.standings_drift(text)', 'execute')
     or has_function_privilege('authenticated', 'public.standings_drift(text)', 'execute') then
    raise exception 'standings_drift is executable by an app role';
  end if;
end $chk$;

commit;


-- =====================================================================================================
-- TESTS — run supabase/standings_drift_tests.sql now (one DO block, rolls itself back; the report
-- must be all PASS). Paste the report here:
-- Executed against production 2026-09-22 21:19Z: 8/8 PASS (see standings_drift_tests.sql)
-- =====================================================================================================


-- =====================================================================================================
-- VERIFY — read-only, after UP
-- =====================================================================================================
-- V1. All three frozen tournaments: {ok: true}, and every stored hash still re-derives.
select ts.tournament_id, public.standings_drift(ts.tournament_id) as drift,
       ts.standings_hash = public.standings_hash(ts.final_standings) as hash_ok
  from public.tournament_status ts order by ts.completed_at;

-- V2. Line diff old → new for the watchdog: every printed line must be one of the inserted lines marked
--     DRIFT / FROZEN STANDINGS DRIFT above, and there must be NO 'OLD' rows.
with old as (select value as body from public.app_config where key = 'rollback_pipeline_watchdog_pre_drift'),
new as (select pg_get_functiondef('public.pipeline_watchdog()'::regprocedure) as body)
select 'OLD' as side, l as line from old, unnest(string_to_array(old.body, E'\n')) l
 where l not in (select unnest(string_to_array(new.body, E'\n')) from new)
union all
select 'NEW', l from new, unnest(string_to_array(new.body, E'\n')) l
 where l not in (select unnest(string_to_array(old.body, E'\n')) from old)
 order by side desc, line;

-- V3. The watchdog still runs clean and quietly (no alert) with three frozen rows.
select last_alert_at from public.watchdog_state where id = 1;
select status, start_time from cron.job_run_details where jobid = 16 order by start_time desc limit 3;


-- =====================================================================================================
-- ROLLBACK — restores the Job 1 watchdog body captured by UP, drops standings_drift
-- =====================================================================================================
-- begin;
-- do $rb$
-- declare b text;
-- begin
--   select value into b from public.app_config where key = 'rollback_pipeline_watchdog_pre_drift';
--   execute b;
-- end $rb$;
-- drop function if exists public.standings_drift(text);
-- commit;
-- -- then the PRE-CHECK query must again show 49a208e6ab4c8ffeec9a164f628e9042 / 8312.
