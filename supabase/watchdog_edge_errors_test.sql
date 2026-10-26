-- Rolled-back test of 2026-10-26_watchdog_edge_errors.sql. ONE statement that ends in RAISE EXCEPTION,
-- so the new body, the planted rows and any queued webhook request are all rolled back. pg_net only sends
-- committed queue rows (proven 26 Oct: request 67808, queued inside a rolled-back block, never answered,
-- while 67809 was).
do $t$
declare v_before bigint; v_quiet text; v_loud text;
begin
  execute $wrap$do $up$
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
end $up$$wrap$;

  -- A. control: nothing planted
  update public.watchdog_state set last_alert_at = null where id = 1;
  select coalesce(max(id), 0) into v_before from net.http_request_queue;
  perform public.pipeline_watchdog();
  select string_agg(convert_from(body, 'UTF8'), ' || ') into v_quiet from net.http_request_queue where id > v_before;

  -- B. planted: a fresh heartbeat on the frozen US Open, two failed edge answers
  update public.scoring_health set last_run_at = now() where tournament_id = 'usopen_2026';
  insert into net._http_response (id, status_code, timed_out, created) values (-1, 500, false, now()), (-2, null, true, now());
  update public.watchdog_state set last_alert_at = null where id = 1;
  select coalesce(max(id), 0) into v_before from net.http_request_queue;
  perform public.pipeline_watchdog();
  select string_agg(convert_from(body, 'UTF8'), ' || ') into v_loud from net.http_request_queue where id > v_before;

  raise exception 'ROLLED BACK. A (control): frozen line %, edge line %. B (planted): frozen line %, edge line %. B message: %',
    coalesce(v_quiet like '%HEARTBEAT ON A FROZEN EVENT%', false), coalesce(v_quiet like '%EDGE ERRORS%', false),
    coalesce(v_loud like '%HEARTBEAT ON A FROZEN EVENT%', false), coalesce(v_loud like '%EDGE ERRORS%', false),
    coalesce(v_loud, '<<nothing queued>>');
end $t$;
