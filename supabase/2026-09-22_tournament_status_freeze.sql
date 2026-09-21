-- =====================================================================================================
-- Grand Slam GM — "tournament completed": freeze a finished tournament's standings, stop rescoring it.
--
-- File   : C:\Users\marti\gsgm-migrations\2026-09-22_tournament_status_freeze.sql
-- Target : Supabase project mrdmlfumdsxufifjulbt (production), SQL editor, as postgres.
-- APPLIED: UP-A 2026-09-21 23:07Z as migration 20260921230748 tournament_status_freeze_up_a (table empty; nothing frozen yet).
-- Drafted: 2026-09-22 from the live function bodies (pg_get_functiondef, md5-verified against
--          grand-slam-gm/supabase/migrations/2026-09-14_round_plan.sql A3/A5), nine days after the
--          US Open final. Brief + review: Martino, 2026-09-22. Nothing runs without his word.
--
-- WHAT IT DOES, in one breath: there was no way for a tournament to be "finished". The scorer (cron 14,
-- every 3 min) rewrote the US Open standings for nine days after the final because nothing told it to
-- stop; Montréal and Cincinnati only stopped when active_tournament_id moved on. This adds a stored,
-- hash-pinned final table per tournament (public.tournament_status), written by ONE definer function
-- (freeze_tournament) behind three guards — final decided, scorer healthy, scorer ran AFTER the final.
-- recompute-score and ingest-draw skip a frozen tournament without writing a heartbeat; the watchdog
-- says once that the off-season has begun, then stays quiet; the market-window controller (cron 17,
-- every minute) freezes automatically on the first minute after the final is both won and scored.
--
-- THE TRAP THIS AVOIDS: round_plan_health() says 'complete' when the final has merely STARTED. Freezing
-- on that would lock the table before the final's points were scored. tournament_is_finished() is a
-- separate predicate that requires a winner, and nothing here calls round_plan_health().
--
-- HOW TO USE (in order, each block on its own, in the SQL editor):
--   1. PRE-CHECK (read-only): expected values are written under each query.
--   2. UP-A (one transaction): rollback copies of the two live bodies into app_config, the table, the
--      hash helper, tournament_is_finished, freeze_tournament, the patched watchdog. The table is
--      EMPTY after UP-A: nothing skips, nothing freezes yet.
--   3. Run tournament_status_tests.sql: the exception message must read all PASS (rolls itself back).
--   4. SIGN-OFF GATE: on Martino's word deploy recompute-score, then ingest-draw (both read the empty
--      table and behave as before). Confirm the next cron ticks still score.
--   5. CHECKPOINT: show Martino the US Open top three (expected below). Wait for his word.
--   6. BACKFILL: freeze usopen_2026, then cincinnati_2026, then montreal_2026 (the last two with the
--      final date supplied: their F rows were never stamped). Print each table.
--   7. UP-B (one transaction): the patched controller — applied LAST on purpose: the moment it is
--      live it would freeze the active event by itself, before anyone checked the top three.
--   8. VERIFY (read-only): three rows, counts, tops, hash re-derivation, idempotence, line-diffs.
--   9. If anything looks wrong: ROLLBACK (bottom) restores the exact live bodies in seconds — but only
--      after the OLD edge functions are redeployed; never drop the table under the new edge code.
--
-- Guardrails: no scoring change (the scoring math in recompute-score is untouched; it only gains an
-- early return); no historical data change (no row in entries is written, ever); no security change
-- beyond the new table's RLS (SELECT-only for anon/authenticated) and the new functions' own execute
-- grants; no cron added; round_plan_health() and active_tournament_id untouched.
--
-- Ranking rule (review R1): rank() — standard competition ranking, ties share, the next is skipped
-- (the brief said "dense rank"; the review overrides it: two tied for first means the next is third).
-- =====================================================================================================


-- =====================================================================================================
-- PRE-CHECK — read-only
-- =====================================================================================================
-- P1. The active tournament, its final, and whether the scorer has run since the final.
select (select value from public.app_config where key = 'active_tournament_id') as active,
       m.tournament_id, m.round, m.p1_id, m.p2_id, m.winner_id, m.started_at,
       h.ok as scoring_ok, h.last_run_at as scoring_last_run, h.last_run_at > m.started_at as scored_after_final
  from public.matches m left join public.scoring_health h on h.tournament_id = m.tournament_id
 where m.round = 'F' order by m.tournament_id;
-- expected 2026-09-22: active = usopen_2026; usopen F zverev, started_at 2026-09-13 18:00Z, ok, scored_after_final true;
--   cincinnati F fils and montreal F shelton with started_at NULL (never stamped) and ok = true.

-- P2. Entries per tournament: registered vs drafted (initialSquad non-empty).
select tournament_id, count(*) as entries,
       count(*) filter (where jsonb_typeof(state->'initialSquad') = 'array' and jsonb_array_length(state->'initialSquad') > 0) as drafted,
       max(updated_at) as last_score_write
  from public.entries group by 1 order by 1;
-- expected: cincinnati 8/4 · montreal 8/8 · usopen 22/22

-- P3. The two bodies this file replaces must be exactly the ones it was drafted from.
select p.proname, md5(pg_get_functiondef(p.oid)) as md5, length(pg_get_functiondef(p.oid)) as len
  from pg_proc p where p.pronamespace = 'public'::regnamespace
   and p.proname in ('pipeline_watchdog', 'market_window_controller') order by 1;
-- expected: market_window_controller d12a26c8b3181fc1b6832aa596ee07fd / 3064 · pipeline_watchdog cd8053946a2851c4aa93015c30da8dfb / 6414
-- Different = production moved on since 2026-09-22: re-capture (rollback_freeze_2026-09-22.sql header), do not run UP.

-- P4. Nothing exists yet; the crons are the four known ones; the watchdog has not alerted since 11 Sep.
select to_regclass('public.tournament_status') as status_table,
       (select last_alert_at from public.watchdog_state where id = 1) as last_alert_at,
       (select string_agg(jobid || ':' || jobname, ', ' order by jobid) from cron.job) as crons;
-- expected: status_table NULL · last_alert_at 2026-09-11 19:00Z · 13:ingest-draw, 14:recompute-scores, 16:pipeline-watchdog, 17:market-window-controller


-- =====================================================================================================
-- UP-A — one transaction: rollback copies, table, helpers, freeze_tournament, watchdog
-- =====================================================================================================
begin;

-- 1. Rollback copies of the LIVE bodies, taken at run time (not from this file).
insert into public.app_config (key, value, updated_at)
select 'rollback_pipeline_watchdog_pre_freeze',
       pg_get_functiondef('public.pipeline_watchdog()'::regprocedure), now()
on conflict (key) do update set value = excluded.value, updated_at = now();
insert into public.app_config (key, value, updated_at)
select 'rollback_market_window_controller_pre_freeze',
       pg_get_functiondef('public.market_window_controller(boolean)'::regprocedure), now()
on conflict (key) do update set value = excluded.value, updated_at = now();

-- 2. The archive. One row = the tournament is finished and its standings are canonical.
create table public.tournament_status (
  tournament_id   text        primary key,
  completed_at    timestamptz not null default now(),   -- when the freeze ran
  final_standings jsonb       not null,                 -- [{user_id, team_name, score, rank}] ordered score desc, user_id asc
  standings_hash  text        not null,                 -- public.standings_hash(final_standings)
  entries_count   int         not null,                 -- registrations (rows in entries)
  drafted_count   int         not null,                 -- of which fielded a squad (initialSquad non-empty) — review R7
  note            text,
  constraint tournament_status_standings_is_array check (jsonb_typeof(final_standings) = 'array'),
  constraint tournament_status_count_matches      check (entries_count = jsonb_array_length(final_standings)),
  constraint tournament_status_drafted_in_range   check (drafted_count between 0 and entries_count)
);
comment on table public.tournament_status is
  'Frozen final standings. A row here means the tournament is finished and archived: recompute-score and ingest-draw skip it, pipeline_watchdog goes quiet for it. Written ONLY by freeze_tournament().';

-- Same posture as scoring_health (fix_scoring_health_read.sql): RLS on, world-readable, no client writes.
-- Supabase default privileges hand everything to anon/authenticated/service_role on a new table: strip first.
alter table public.tournament_status enable row level security;
revoke all on table public.tournament_status from public, anon, authenticated, service_role;
grant select on table public.tournament_status to anon, authenticated, service_role;
create policy "tournament_status is publicly readable"
  on public.tournament_status for select using (true);
-- No insert/update/delete grant or policy for any role: postgres (owner) writes through freeze_tournament().

-- 3. Canonical serialisation → sha256. One record per entry: user_id, team_name, score (fixed to one
--    decimal), rank — fields joined with chr(31) (unit separator), records with chr(30) (record
--    separator), so a '|' or a newline in a team name cannot shift a field boundary (review R8).
--    Records ordered score desc, user_id asc. Independent of jsonb key order, of numeric scale (160 vs
--    160.0) and of the array's stored order, so it can be re-derived from final_standings at any time.
--    STABLE, not immutable: to_char and convert_to are stable (review R2). Never indexed.
create or replace function public.standings_hash(p_standings jsonb)
returns text
language sql
stable
set search_path = public
as $fn$
  select encode(sha256(convert_to(coalesce(string_agg(
           (x->>'user_id') || chr(31) || coalesce(x->>'team_name', '') || chr(31)
           || to_char((x->>'score')::numeric, 'FM9999990.0') || chr(31) || coalesce(x->>'rank', ''),
           chr(30) order by (x->>'score')::numeric desc, (x->>'user_id') asc), ''), 'UTF8')), 'hex')
    from jsonb_array_elements(p_standings) x;
$fn$;
revoke all on function public.standings_hash(jsonb) from public, anon, authenticated;
grant execute on function public.standings_hash(jsonb) to service_role;

-- 4. Finished = the final has a recorded winner. Deliberately NOT started_at (a stamped-but-unplayed
--    final, or the NULL stamp on the 2026 Masters rows, must not decide this) and NOT round_plan_health()
--    (which reports 'complete' the moment the final has BEGUN, before its points exist).
create or replace function public.tournament_is_finished(p_tournament text)
returns boolean
language sql
stable
set search_path = public
as $fn$
  select exists (select 1 from public.matches m
                  where m.tournament_id = p_tournament and m.round = 'F' and m.winner_id is not null);
$fn$;
revoke all on function public.tournament_is_finished(text) from public, anon, authenticated;
grant execute on function public.tournament_is_finished(text) to service_role;

-- 5. The only writer of tournament_status. Idempotent: a frozen tournament is returned as is, never
--    re-evaluated, never overwritten. Refuses unless the final is decided, the scorer's last run was
--    clean, and that run happened AFTER the final. When the F row was never stamped (Montréal and
--    Cincinnati 2026) the caller supplies p_final_played_at; it is recorded in the note, and passing it
--    for a stamped final is refused so the record stays unambiguous.
create or replace function public.freeze_tournament(
  p_tournament      text,
  p_note            text        default null,
  p_final_played_at timestamptz default null)
returns public.tournament_status
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_row       public.tournament_status;
  v_health    public.scoring_health;
  v_stamp     timestamptz;
  v_final_at  timestamptz;
  v_standings jsonb;
  v_count     int;
  v_distinct  int;
  v_drafted   int;
  v_note      text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if p_tournament is null or btrim(p_tournament) = '' then
    raise exception 'freeze_tournament: p_tournament is required';
  end if;

  -- IDEMPOTENT: an archived tournament is returned as is. No guard is re-evaluated, nothing is written.
  select * into v_row from public.tournament_status where tournament_id = p_tournament;
  if found then return v_row; end if;

  -- One freezer per tournament at a time (cron 17 runs every minute; a manual call may overlap it).
  perform pg_advisory_xact_lock(hashtext('freeze_tournament:' || p_tournament)::bigint);
  select * into v_row from public.tournament_status where tournament_id = p_tournament;
  if found then return v_row; end if;

  -- GUARD 1: the final is decided.
  if not public.tournament_is_finished(p_tournament) then
    raise exception 'freeze_tournament(%): refused — not finished (no F row with a winner_id)', p_tournament;
  end if;

  -- GUARD 2: the scorer's last word on this tournament was a clean run.
  select * into v_health from public.scoring_health where tournament_id = p_tournament;
  if not found then
    raise exception 'freeze_tournament(%): refused — no scoring_health row', p_tournament;
  end if;
  if v_health.ok is not true then
    raise exception 'freeze_tournament(%): refused — scoring_health.ok is % (error: %)',
      p_tournament, coalesce(v_health.ok::text, 'null'), coalesce(v_health.error, 'none');
  end if;

  -- GUARD 3: that clean run happened AFTER the final. Reference = the F row's started_at; when the row
  -- was never stamped the caller supplies the date (a record, not a proof — say so in the note).
  select m.started_at into v_stamp from public.matches m
   where m.tournament_id = p_tournament and m.round = 'F' and m.winner_id is not null
   order by m.slot limit 1;
  if v_stamp is not null then
    if p_final_played_at is not null then
      raise exception 'freeze_tournament(%): refused — the F row is stamped %; do not pass p_final_played_at',
        p_tournament, v_stamp;
    end if;
    v_final_at := v_stamp;
  else
    if p_final_played_at is null then
      raise exception 'freeze_tournament(%): refused — the F row has no started_at; pass p_final_played_at', p_tournament;
    end if;
    if p_final_played_at > now() then
      raise exception 'freeze_tournament(%): refused — p_final_played_at % is in the future', p_tournament, p_final_played_at;
    end if;
    v_final_at := p_final_played_at;
    v_note := concat_ws(' · ', v_note,
      'final_played_at supplied: ' || to_char(p_final_played_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      || ' (F row started_at was null)');
  end if;
  if v_health.last_run_at is null or v_health.last_run_at <= v_final_at then
    raise exception 'freeze_tournament(%): refused — scoring_health.last_run_at (%) is not after the final (%)',
      p_tournament, coalesce(v_health.last_run_at::text, 'null'), v_final_at;
  end if;

  -- ENTRIES: one row per user, at least one.
  select count(*), count(distinct e.user_id),
         count(*) filter (where jsonb_typeof(e.state->'initialSquad') = 'array'
                            and jsonb_array_length(e.state->'initialSquad') > 0)
    into v_count, v_distinct, v_drafted
    from public.entries e where e.tournament_id = p_tournament;
  if v_count = 0 then
    raise exception 'freeze_tournament(%): refused — no entries', p_tournament;
  end if;
  if v_count <> v_distinct then
    raise exception 'freeze_tournament(%): refused — % entries but % distinct users', p_tournament, v_count, v_distinct;
  end if;

  -- STANDINGS: entries ⋈ profiles, ordered score desc then user_id asc; rank() = competition ranking.
  select jsonb_agg(jsonb_build_object(
           'user_id',   s.user_id,
           'team_name', s.team_name,
           'score',     s.score,
           'rank',      s.rank)
         order by s.score desc, s.user_id asc)
    into v_standings
    from (select e.user_id,
                 coalesce(p.team_name, '') as team_name,
                 round(e.score::numeric, 1) as score,
                 rank() over (order by e.score desc) as rank
            from public.entries e
            left join public.profiles p on p.id = e.user_id
           where e.tournament_id = p_tournament) s;

  -- Team names are whatever profiles.team_name says NOW (one value per user, mutable) — review R9.
  v_note := concat_ws(' · ', v_note, 'team names are profiles.team_name as of the freeze, not as of the event');

  insert into public.tournament_status
         (tournament_id, completed_at, final_standings, standings_hash, entries_count, drafted_count, note)
  values (p_tournament, now(), v_standings, public.standings_hash(v_standings), v_count, v_drafted, v_note)
  on conflict (tournament_id) do nothing
  returning * into v_row;
  if v_row.tournament_id is null then   -- cannot happen under the advisory lock; re-read rather than guess
    select * into v_row from public.tournament_status where tournament_id = p_tournament;
  end if;
  return v_row;
end $fn$;
-- Only postgres (the SQL editor, and cron 17 through market_window_controller) may call it. Not the
-- service role: no edge function needs to freeze, and a writer must not be reachable through PostgREST.
revoke all on function public.freeze_tournament(text, text, timestamptz) from public, anon, authenticated, service_role;

-- 6. The watchdog. Body = the live body captured 2026-09-22 (md5 cd8053946a2851c4aa93015c30da8dfb),
--    plus the lines marked "FREEZE (Job 1, 2026-09-22)" / "FROZEN / OFF-SEASON". Nothing else changes.
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

-- 7. Assertions — any failure aborts the whole of UP-A.
do $chk$
declare v_body text;
begin
  if not public.tournament_is_finished('usopen_2026') or not public.tournament_is_finished('cincinnati_2026')
     or not public.tournament_is_finished('montreal_2026') then
    raise exception 'tournament_is_finished is false for a finished event';
  end if;
  if public.tournament_is_finished('no_such_event_2026') then
    raise exception 'tournament_is_finished is true for a tournament that does not exist';
  end if;
  if exists (select 1 from public.tournament_status) then
    raise exception 'tournament_status must be empty before the backfill';
  end if;
  if has_table_privilege('anon', 'public.tournament_status', 'insert')
     or has_table_privilege('authenticated', 'public.tournament_status', 'update')
     or has_table_privilege('service_role', 'public.tournament_status', 'delete')
     or has_table_privilege('authenticated', 'public.tournament_status', 'insert') then
    raise exception 'a write privilege on tournament_status leaked to an app role';
  end if;
  if not has_table_privilege('anon', 'public.tournament_status', 'select') then
    raise exception 'anon cannot read tournament_status';
  end if;
  if has_function_privilege('anon', 'public.freeze_tournament(text,text,timestamptz)', 'execute')
     or has_function_privilege('authenticated', 'public.freeze_tournament(text,text,timestamptz)', 'execute')
     or has_function_privilege('service_role', 'public.freeze_tournament(text,text,timestamptz)', 'execute') then
    raise exception 'freeze_tournament is executable by an app role';
  end if;
  v_body := pg_get_functiondef('public.pipeline_watchdog()'::regprocedure);
  if v_body !~ 'tournament_status' or v_body !~ 'offseason_notice_sent_' then
    raise exception 'pipeline_watchdog was not patched';
  end if;
  if pg_get_functiondef('public.market_window_controller(boolean)'::regprocedure) ~ 'freeze_tournament' then
    raise exception 'the controller is already patched — UP-B ran before UP-A?';
  end if;
  -- the hash is what it says it is
  if public.standings_hash('[{"user_id":"b","team_name":"x","score":160,"rank":2},{"user_id":"a","team_name":"y","score":180.5,"rank":1}]')
     <> public.standings_hash('[{"user_id":"a","team_name":"y","score":180.5,"rank":1},{"user_id":"b","team_name":"x","score":160.0,"rank":2}]') then
    raise exception 'standings_hash depends on array order or numeric scale';
  end if;
end $chk$;

commit;


-- =====================================================================================================
-- TESTS — run supabase/tournament_status_tests.sql now (one DO block, rolls itself back, ends in an
-- exception whose message is the report: every line must start with PASS). Paste the report here:
-- Executed against production 2026-09-21 23:09Z (22 Sep 01:09 CEST), after UP-A (migration 20260921230748): 24/24 PASS
-- =====================================================================================================


-- =====================================================================================================
-- SIGN-OFF GATE — deploy the edge functions BEFORE any tournament is frozen (review R3)
-- =====================================================================================================
-- With the table present and empty, the new guard in both functions is a no-op; deploying now means
-- there is never a moment where a frozen tournament is being rewritten by a scorer that cannot see the
-- freeze. Only on Martino's word:
--   npx supabase functions deploy recompute-score --project-ref mrdmlfumdsxufifjulbt
--   npx supabase functions deploy ingest-draw     --project-ref mrdmlfumdsxufifjulbt
-- Then confirm the next ticks still score (entriesScored 22, scoring_health.last_run_at advancing):
select tournament_id, last_run_at, ok, entries_scored from public.scoring_health order by 1;


-- =====================================================================================================
-- CHECKPOINT — show Martino the US Open top three before tonight's numbers become canonical
-- =====================================================================================================
select p.team_name, e.score, rank() over (order by e.score desc) as rank
  from public.entries e join public.profiles p on p.id = e.user_id
 where e.tournament_id = 'usopen_2026' order by e.score desc, e.user_id limit 3;
-- expected: Bakers & Brewers 180.5 · Fabio Fogna 168.5 · Agass 160.0 (the 13 Sep performance document;
-- the 2026-09-15 snapshot in tennis-fantasy/snapshots/usopen_2026.json agrees on all 22 rows).
-- WAIT FOR MARTINO'S WORD.


-- =====================================================================================================
-- BACKFILL — in this order; each call prints the row it wrote
-- =====================================================================================================
select * from public.freeze_tournament('usopen_2026',
  'US Open 2026, final Sun 13 Sep 2026 (Zverev d. Shelton). Evidence: F row started_at 2026-09-13 18:00Z and scoring_health ok after it; snapshot 2026-09-15 identical on all 22 rows; top three checked against the 13 Sep performance document. Frozen 9 days after the final on Martino''s word');
select * from public.freeze_tournament('cincinnati_2026',
  'Cincinnati 2026, final Sun 23 Aug 2026 (Fils d. Tiafoe). F row never stamped: the date is supplied from the public record, so guard 3 is a record here, not a proof. Evidence: snapshot 2026-08-26 identical to live on every scored row',
  '2026-08-23 23:59:00+00');
select * from public.freeze_tournament('montreal_2026',
  'Montréal 2026, final Thu 13 Aug 2026 evening (Shelton d. Nakashima). F row never stamped: the date is supplied from the public record (7.9 h before the last clean run), so guard 3 is a record here, not a proof. Evidence: snapshot 2026-08-26 identical to live on all 8 rows',
  '2026-08-14 03:00:00+00');

-- The three tables, readable.
select ts.tournament_id, x->>'rank' as rank, x->>'team_name' as team, x->>'score' as score
  from public.tournament_status ts cross join lateral jsonb_array_elements(ts.final_standings) x
 order by ts.tournament_id, (x->>'rank')::int, x->>'user_id';
-- STOP AND TELL if cincinnati's top is not 212.0 or montreal's top is not 199.5: a rescore already moved them.

-- DoD 4 — the new scorer skips the frozen event and writes nothing (only provable after the deploy above):
select max(updated_at) as before_invoke from public.entries where tournament_id = 'usopen_2026';
--   invoke recompute-score with {"tournamentId":"usopen_2026"} → {"ok":true,"tournamentId":"usopen_2026","skipped":"completed"}
select max(updated_at) as after_invoke from public.entries where tournament_id = 'usopen_2026';
-- expected: identical timestamps.


-- =====================================================================================================
-- UP-B — one transaction: the controller freezes automatically from now on
-- =====================================================================================================
begin;

-- Body = the live body captured 2026-09-22 (md5 d12a26c8b3181fc1b6832aa596ee07fd), plus the block
-- marked "FREEZE (Job 1, 2026-09-22)". Nothing else changes.
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
  -- FREEZE (Job 1, 2026-09-22) -------------------------------------------------------------------
  -- Once the final is decided, archive the standings (public.tournament_status). freeze_tournament()
  -- raises until scoring_health proves a clean run AFTER the final; swallow that and retry next minute
  -- (this runs every minute). The exists() runs first so a frozen event costs one index probe per
  -- minute. A dry run writes nothing, so it never freezes. A permission failure is NOT "not ready
  -- yet": it re-raises, so a caller without the right to freeze is seen, not deferred forever.
  if not dry_run and v_tid is not null
     and not exists (select 1 from public.tournament_status ts where ts.tournament_id = v_tid)
     and public.tournament_is_finished(v_tid) then
    begin
      perform public.freeze_tournament(v_tid, 'auto: market_window_controller');
    exception
      when insufficient_privilege then raise;
      when others then raise notice 'freeze_tournament(%) deferred: %', v_tid, sqlerrm;
    end;
  end if;

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

do $chk$
declare v_body text;
begin
  v_body := pg_get_functiondef('public.market_window_controller(boolean)'::regprocedure);
  if v_body !~ 'freeze_tournament' then raise exception 'the controller was not patched'; end if;
  -- the cheap gate must precede the READY select
  if position('freeze_tournament' in v_body) > position('into v_ready' in v_body) then
    raise exception 'the freeze call is not before the READY computation';
  end if;
  if (select count(*) from public.tournament_status) <> 3 then
    raise exception 'expected the three backfilled rows before UP-B (found %)', (select count(*) from public.tournament_status);
  end if;
end $chk$;

commit;


-- =====================================================================================================
-- VERIFY — read-only, after UP-B
-- =====================================================================================================
-- V1. Three rows, the right counts, the right tops, hashes that re-derive.
select tournament_id, completed_at, entries_count, drafted_count,
       final_standings->0->>'team_name' as top_team, final_standings->0->>'score' as top_score,
       standings_hash = public.standings_hash(final_standings) as hash_ok, left(note, 60) as note
  from public.tournament_status order by completed_at;
-- expected: usopen 22/22 Bakers & Brewers 180.5 · cincinnati 8/4 Buzzo 212.0 · montreal 8/8 The Boncias 199.5 · hash_ok true ×3

-- V2. Idempotence on production: a second call writes nothing (same xmin, same hash, same note).
select tournament_id, xmin as row_version, standings_hash from public.tournament_status where tournament_id = 'usopen_2026';
select (r).standings_hash, (r).note from public.freeze_tournament('usopen_2026', 'second call — must be ignored') r;
select tournament_id, xmin as row_version, standings_hash from public.tournament_status where tournament_id = 'usopen_2026';
-- expected: identical row_version and hash before and after; the note does not contain 'second call'.

-- V3. Line diff old → new for both patched functions: every printed line must be one of the inserted
--     lines marked FREEZE / FROZEN / OFF-SEASON above, and there must be NO 'OLD' rows.
with old as (
  select replace(key, 'rollback_', '') as k, value as body from public.app_config
   where key in ('rollback_pipeline_watchdog_pre_freeze', 'rollback_market_window_controller_pre_freeze')),
new as (
  select p.proname || '_pre_freeze' as k, pg_get_functiondef(p.oid) as body
    from pg_proc p where p.pronamespace = 'public'::regnamespace
     and p.proname in ('pipeline_watchdog', 'market_window_controller'))
select k, 'OLD' as side, l as line
  from old, unnest(string_to_array(old.body, E'\n')) l
 where l not in (select unnest(string_to_array(new.body, E'\n')) from new where new.k = old.k)
union all
select k, 'NEW', l
  from new, unnest(string_to_array(new.body, E'\n')) l
 where l not in (select unnest(string_to_array(old.body, E'\n')) from old where old.k = new.k)
 order by k, side desc, line;

-- V4. A dry run of the controller still reports and writes nothing; a real run freezes nothing new.
select * from public.market_window_controller(true);
select count(*) as frozen_rows from public.tournament_status;   -- 3, before and after

-- V5. The pipeline is idle for the frozen active event, on purpose: the heartbeat stops advancing, the
--     crons keep succeeding, and the watchdog stays quiet (the one OFF-SEASON line is due 24 h after
--     the freeze, once).
select tournament_id, last_run_at from public.scoring_health where tournament_id = 'usopen_2026';
select jobid, status, start_time from cron.job_run_details where jobid in (13, 14, 16, 17) order by start_time desc limit 12;
select last_alert_at from public.watchdog_state where id = 1;   -- expected unchanged: 2026-09-11 19:00Z

-- V6. Snapshot cross-check (tennis-fantasy/snapshots/<tid>.json): every scored user_id and score in the
--     snapshot's standings must appear with the same score in final_standings.


-- =====================================================================================================
-- ROLLBACK — restores the exact live bodies captured by UP-A, then removes everything this file added.
-- Order matters: redeploy the OLD edge functions first (master), or the new code's status read fails
-- loudly once the table is gone (loud, not wrong — but avoidable).
-- =====================================================================================================
-- begin;
-- do $rb$
-- declare b text;
-- begin
--   for b in select value from public.app_config
--             where key in ('rollback_pipeline_watchdog_pre_freeze', 'rollback_market_window_controller_pre_freeze')
--   loop execute b; end loop;
-- end $rb$;
-- drop function if exists public.freeze_tournament(text, text, timestamptz);
-- drop function if exists public.tournament_is_finished(text);
-- drop function if exists public.standings_hash(jsonb);
-- drop table if exists public.tournament_status;
-- delete from public.app_config where key like 'offseason_notice_sent_%';
-- commit;
-- -- then P3 must again show the two md5s from the header of rollback_freeze_2026-09-22.sql.
