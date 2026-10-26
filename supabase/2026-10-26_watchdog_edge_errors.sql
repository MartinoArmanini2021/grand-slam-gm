-- =====================================================================================================
-- Watchdog: HEARTBEAT ON A FROZEN EVENT + EDGE ERRORS (26 Oct 2026, pre-Paris fixes, brief B2)
-- NOT APPLIED. Apply only on Martino's "go" (Phase C), through the Supabase MCP, before draw night.
-- =====================================================================================================
-- Two alert lines added to public.pipeline_watchdog(). Both run whether or not the active tournament is
-- frozen (they sit after the FROZEN / OFF-SEASON branch, next to FROZEN STANDINGS DRIFT):
--
--   • HEARTBEAT ON A FROZEN EVENT: an ingest_health or scoring_health row for a frozen tournament whose
--     last_run_at is after tournament_status.completed_at AND within the last hour. Both edge functions
--     write no heartbeat for a frozen event, so a fresh one means something ran against an archive (the
--     27 Sep and 26 Oct "JWT issued at future" rows). The 1-hour window keeps those two old ok:false
--     rows from alerting forever; they are not edited.
--   • EDGE ERRORS: at least 2 answers in net._http_response in the last 15 minutes that are not 2xx,
--     or timed out, or have no status. (2xx rather than exactly 200: Discord answers a webhook post with
--     204 No Content, so the watchdog's own alert would otherwise count toward the next one. Every cron
--     call to an edge function that succeeds answers 200.)
--
-- Everything else in the body, the 55-minute throttle and the ACL (postgres, service_role) stay as
-- they are. The UP block does not retype the body: it reads the live one, checks it is exactly the
-- body reviewed on 26 Oct (md5 02d262a49ea210bf4a8ec3a6183f13c5), inserts the new lines at two
-- anchors that must each occur once, and stores the old body in app_config under
-- rollback_watchdog_pre_edge_errors (never overwritten if it already exists).
--
-- HOW TO USE: 1. PRE-CHECK (read-only). 2. UP (one statement). 3. VERIFY (read-only). ROLLBACK at the
-- bottom restores the stored body.
-- =====================================================================================================


-- 1. PRE-CHECK (read-only) ----------------------------------------------------------------------------
select md5(pg_get_functiondef('public.pipeline_watchdog()'::regprocedure)) = '02d262a49ea210bf4a8ec3a6183f13c5' as body_as_reviewed,
       (select proacl::text from pg_proc where oid = 'public.pipeline_watchdog()'::regprocedure) as acl,
       exists (select 1 from public.app_config where key = 'rollback_watchdog_pre_edge_errors') as rollback_key_exists;
-- expect: true | {postgres=X/postgres,service_role=X/postgres} | false


-- 2. UP -----------------------------------------------------------------------------------------------
do $up$
declare
  v_old  text := pg_get_functiondef('public.pipeline_watchdog()'::regprocedure);
  v_new  text;
  v_acl  text;
  -- anchor 1: the last declaration line; anchor 2: the "everything healthy" early return.
  a_decl text := E'  v_drift      jsonb;                             -- DRIFT (Job 2, 2026-09-22)\n';
  a_body text := E'\n  if array_length(v_alerts, 1) is null then return; end if;    -- everything healthy\n';
  n_decl text := $decl$  v_frozen_beats text[];                          -- FROZEN HEARTBEAT (2026-10-26)
  v_edge_errors int;                              -- EDGE ERRORS (2026-10-26)
  v_edge_codes  text;                             -- EDGE ERRORS (2026-10-26)
$decl$;
  n_body text := $blk$

  -- HEARTBEAT ON A FROZEN EVENT (2026-10-26) ------------------------------------------------------
  -- Both edge functions write no heartbeat for a frozen event, so a heartbeat newer than the freeze
  -- means something ran against an archive. Only the last hour counts: the two old ok:false rows
  -- (27 Sep, 26 Oct) must not alert forever. Own exception block, like the checks around it.
  begin
    select array_agg(h.src || ' ' || h.tournament_id || ' at '
             || to_char(h.last_run_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI"Z"')
             || case when h.ok then '' else ' (ok:false: ' || coalesce(left(h.error, 120), 'no message') || ')' end
             order by h.last_run_at)
      into v_frozen_beats
      from (select 'ingest' as src, i.tournament_id, i.last_run_at, i.ok, i.error from public.ingest_health i
            union all
            select 'scoring', s.tournament_id, s.last_run_at, s.ok, s.error from public.scoring_health s) h
      join public.tournament_status ts on ts.tournament_id = h.tournament_id
     where h.last_run_at > ts.completed_at
       and h.last_run_at > now() - interval '1 hour';
    if v_frozen_beats is not null then
      v_alerts := array_append(v_alerts,
        '• HEARTBEAT ON A FROZEN EVENT — ' || array_to_string(v_frozen_beats, '; ')
        || '. Nothing should run for an archived event: check the edge functions and the crons.');
    end if;
  exception when others then null;   -- a fault here must never silence the checks above
  end;

  -- EDGE ERRORS (2026-10-26) ----------------------------------------------------------------------
  -- Two or more answers in the last 15 minutes that are not 2xx, timed out, or have no status at all.
  -- A single blip (one cold-start 500) stays quiet; a run of them says the feed or the scorer is down.
  begin
    select count(*), string_agg(distinct coalesce(r.status_code::text, 'no status')
                                || case when r.timed_out then ' (timeout)' else '' end, ', ')
      into v_edge_errors, v_edge_codes
      from net._http_response r
     where r.created > now() - interval '15 minutes'
       and (r.status_code is null or r.status_code not between 200 and 299 or r.timed_out is true);
    if v_edge_errors >= 2 then
      v_alerts := array_append(v_alerts,
        '• EDGE ERRORS — ' || v_edge_errors || ' failed answers in the last 15 minutes (' || v_edge_codes
        || '). See net._http_response and the edge function logs.');
    end if;
  exception when others then null;   -- a fault here must never silence the checks above
  end;
$blk$;
begin
  if md5(v_old) <> '02d262a49ea210bf4a8ec3a6183f13c5' then
    raise exception 'pipeline_watchdog changed since it was reviewed on 26 Oct (md5 %). Stop and re-review.', md5(v_old);
  end if;
  if (length(v_old) - length(replace(v_old, a_decl, ''))) / length(a_decl) <> 1
     or (length(v_old) - length(replace(v_old, a_body, ''))) / length(a_body) <> 1 then
    raise exception 'an anchor is missing or not unique; nothing changed';
  end if;

  insert into public.app_config (key, value, updated_at)
  values ('rollback_watchdog_pre_edge_errors', v_old, now())
  on conflict (key) do nothing;

  v_new := replace(replace(v_old, a_decl, a_decl || n_decl), a_body, n_body || a_body);
  execute v_new;

  select proacl::text into v_acl from pg_proc where oid = 'public.pipeline_watchdog()'::regprocedure;
  if v_acl <> '{postgres=X/postgres,service_role=X/postgres}' then
    raise exception 'ACL changed to %; rolling back', v_acl;
  end if;
end $up$;


-- 3. VERIFY (read-only) -------------------------------------------------------------------------------
-- V1. ACL unchanged, rollback key stored, both lines present.
select (select proacl::text from pg_proc where oid = 'public.pipeline_watchdog()'::regprocedure) as acl,
       (select md5(value) from public.app_config where key = 'rollback_watchdog_pre_edge_errors') = '02d262a49ea210bf4a8ec3a6183f13c5' as rollback_is_old_body,
       pg_get_functiondef('public.pipeline_watchdog()'::regprocedure) like '%HEARTBEAT ON A FROZEN EVENT —%' as frozen_line,
       pg_get_functiondef('public.pipeline_watchdog()'::regprocedure) like '%EDGE ERRORS —%' as edge_line;
-- V2. Line diff old → new: only NEW rows, every one of them from the two inserted blocks.
with old as (select value as body from public.app_config where key = 'rollback_watchdog_pre_edge_errors'),
new as (select pg_get_functiondef('public.pipeline_watchdog()'::regprocedure) as body)
select 'OLD' as side, l as line from old, unnest(string_to_array(old.body, E'\n')) l
 where l not in (select unnest(string_to_array(new.body, E'\n')) from new)
union all
select 'NEW', l from new, unnest(string_to_array(new.body, E'\n')) l
 where l not in (select unnest(string_to_array(old.body, E'\n')) from old);
-- V3. Job 16 (the watchdog cron) after its next run: status 'succeeded'.
select status, start_time, return_message from cron.job_run_details where jobid = 16 order by start_time desc limit 3;


-- ROLLBACK (only if needed) ---------------------------------------------------------------------------
-- do $rb$ begin
--   execute (select value from public.app_config where key = 'rollback_watchdog_pre_edge_errors');
-- end $rb$;
-- then check the ACL is still {postgres=X/postgres,service_role=X/postgres}.
