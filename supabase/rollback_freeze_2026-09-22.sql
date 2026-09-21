-- ── ROLLBACK — production pipeline_watchdog and market_window_controller exactly as live on 2026-09-22 ──
--
-- Captured READ-ONLY with pg_get_functiondef on 2026-09-22 (tournament-freeze job) from project
-- mrdmlfumdsxufifjulbt, BEFORE 2026-09-22_tournament_status_freeze.sql. These are the bodies applied by
-- migration 2026-09-14_round_plan.sql (Phase −1, 15 Sep 2026): the watchdog with its WALKOVER GAP and
-- ROUND PLAN blocks, and the market-window controller that reads public.round_plan.
--
-- Fingerprints, as the database computes them (md5 of the exact text of each definition below):
--   pipeline_watchdog         cd8053946a2851c4aa93015c30da8dfb   (6,414 characters)
--   market_window_controller  d12a26c8b3181fc1b6832aa596ee07fd   (3,064 characters)
-- Before relying on this file, compare against what is live:
--   select p.proname, md5(pg_get_functiondef(p.oid)), length(pg_get_functiondef(p.oid))
--     from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('pipeline_watchdog', 'market_window_controller');
-- Different fingerprints mean production has moved on since this capture: capture again, do not run this.
-- The same two bodies are also held in app_config under rollback_pipeline_watchdog_pre_freeze and
-- rollback_market_window_controller_pre_freeze (written by UP-A of the freeze migration at run time).
--
-- What running this does: restores BOTH functions to exactly these bodies, nothing else. It does not
-- drop tournament_status, freeze_tournament, tournament_is_finished or standings_hash (see the ROLLBACK
-- block at the bottom of 2026-09-22_tournament_status_freeze.sql for the full undo, and its ordering
-- rule: redeploy the old edge functions first).
-- NOTE: supabase/pipeline_watchdog.sql is an OLDER, stale copy (no WALKOVER GAP / ROUND PLAN blocks);
-- never re-run it.
--
-- Apply in the Supabase SQL editor as one script, only on Martino's word.

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
begin
  select decrypted_secret into v_webhook from vault.decrypted_secrets where name = 'gsgm_alert_webhook';
  if v_webhook is null or v_webhook = '' then return; end if;   -- no webhook configured -> nothing to do

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
end $function$;

CREATE OR REPLACE FUNCTION public.market_window_controller(dry_run boolean DEFAULT false)
 RETURNS TABLE(action text, round text, slot integer, first_ball timestamp with time zone)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
declare
  v_tid   text := public.active_tournament_id();
  v_ready text[];
begin
  -- READY: the preceding round is complete, or at the latest 6 hours before the round's scheduled
  -- first ball (rain valve). Rounds without a first ball are never ready.
  select coalesce(array_agg(p.round), '{}'::text[]) into v_ready
    from public.round_plan p
   where p.tournament_id = v_tid
     and p.first_ball is not null
     and (
          (p.prev_round is not null
           and (select count(*) from public.matches m
                 where m.tournament_id = v_tid and m.round = p.prev_round and m.winner_id is not null) = p.prev_slots)
       or now() >= p.first_ball - interval '6 hours'
     );

  drop table if exists pg_temp._mwc_work;
  create temp table _mwc_work (action text, round text, slot integer, first_ball timestamptz) on commit drop;

  -- for the report: which rounds are ready right now
  insert into pg_temp._mwc_work
  select 'ready', p.round, null, p.first_ball
    from public.round_plan p
   where p.tournament_id = v_tid and p.round = any(v_ready);

  -- STAMP: every row of a ready round whose started_at is not already the plan's first ball
  insert into pg_temp._mwc_work
  select 'stamp', m.round, m.slot, p.first_ball
    from public.matches m
    join public.round_plan p on p.tournament_id = m.tournament_id and p.round = m.round
   where m.tournament_id = v_tid
     and p.round = any(v_ready)
     and m.started_at is distinct from p.first_ball;

  -- PLANT: for every round whose preceding round is ready, the placeholder slots that do not exist
  --        yet, UNSTAMPED (started_at null = "not scheduled yet"), so the bracket gets its Tbd boxes
  insert into pg_temp._mwc_work
  select 'plant', n.round, s, null
    from public.round_plan n
    cross join lateral generate_series(0, n.slots - 1) as s
   where n.tournament_id = v_tid
     and n.prev_round = any(v_ready)
     and not exists (select 1 from public.matches m
                      where m.tournament_id = v_tid and m.round = n.round and m.slot = s);

  if not dry_run then
    update public.matches m
       set started_at = w.first_ball
      from pg_temp._mwc_work w
     where w.action = 'stamp'
       and m.tournament_id = v_tid and m.round = w.round and m.slot = w.slot;

    insert into public.matches (tournament_id, round, slot, p1_id, p2_id, winner_id, score_line, started_at)
    select v_tid, w.round, w.slot, 'tbd', 'tbd', null, null, null
      from pg_temp._mwc_work w
     where w.action = 'plant'
    on conflict (tournament_id, round, slot) do nothing;
  end if;

  return query
    select w.action, w.round, w.slot, w.first_ball
      from pg_temp._mwc_work w
     order by case w.action when 'ready' then 0 when 'stamp' then 1 else 2 end, w.round, w.slot;
end
$function$;
