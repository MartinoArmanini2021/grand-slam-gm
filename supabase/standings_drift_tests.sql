-- STANDINGS DRIFT — verification. Run AFTER UP of 2026-09-22_standings_drift.sql.
--
-- One DO block against the REAL frozen tournaments. It nudges one real score, deletes one real entry and
-- edits one real archive row — all inside this block, which ends in RAISE EXCEPTION, so every change is
-- rolled back and nothing is ever committed. It also calls pipeline_watchdog() while the nudge is in
-- place: the alert it queues (net.http_request_queue) is rolled back with everything else — pg_net's
-- worker only ever sees committed rows — so no Discord message is sent. Never run these statements
-- outside this block. The exception message IS the report: every line must start with PASS.
--
-- Executed against production 2026-09-22 21:19Z, after UP (migration 20260922211820): 8/8 PASS — D3 proved the
-- watchdog queues the drift line; the alert stamp and the queue were verified back to their prior state afterwards.

do $$
declare
  rep    text := '';
  d      jsonb;
  msg    text;
  u_top  uuid;                 -- usopen's frozen #1 (Bakers & Brewers)
  u_last uuid;                 -- usopen's frozen last row
  t      text;
  n_ok   int := 0;
  q_body text;
  alert_before timestamptz;
  alert_after  timestamptz;
begin
  -- D1 — all three frozen tournaments agree with the live table
  foreach t in array array['usopen_2026', 'cincinnati_2026', 'montreal_2026'] loop
    if (public.standings_drift(t)->>'ok')::boolean then n_ok := n_ok + 1; end if;
  end loop;
  rep := rep || (case when n_ok = 3 then 'PASS ' else 'FAIL ' end) || 'D1 standings_drift ok for usopen, cincinnati, montreal (' || n_ok || '/3)' || E'\n';

  -- D2 — nudge ONE real score (rolled back below): the payload names exactly that team. The US Open, not
  -- Montréal: guard_initial_squad validates a row's initialSquad against player_stats on every UPDATE, and
  -- Montréal's player_stats rows are gone, so no Montréal entry can be updated at all any more (found 2026-09-22).
  select (final_standings->0->>'user_id')::uuid, (final_standings->-1->>'user_id')::uuid into u_top, u_last
    from public.tournament_status where tournament_id = 'usopen_2026';
  update public.entries set score = score + 1 where tournament_id = 'usopen_2026' and user_id = u_top;
  d := public.standings_drift('usopen_2026');
  rep := rep || (case when (d->>'ok')::boolean = false and (d->>'moved')::int = 1
                        and d->'rows'->0->>'team_name' = 'Bakers & Brewers'
                        and (d->'rows'->0->>'frozen_score')::numeric = 180.5
                        and (d->'rows'->0->>'live_score')::numeric = 181.5 then 'PASS ' else 'FAIL ' end)
             || 'D2 one nudged score -> ok false, moved 1, names Bakers & Brewers 180.5 -> 181.5: got ' || d::text || E'\n';

  -- D3 — the watchdog turns that into an alert line (queued in this transaction, rolled back with it)
  select last_alert_at into alert_before from public.watchdog_state where id = 1;
  perform public.pipeline_watchdog();
  select last_alert_at into alert_after from public.watchdog_state where id = 1;
  select convert_from(q.body, 'UTF8') into q_body from net.http_request_queue q order by q.id desc limit 1;
  rep := rep || (case when alert_after > alert_before
                        and q_body like '%FROZEN STANDINGS MOVED — usopen_2026: 1 row(s)%'
                        and q_body not like '%montreal_2026: %row(s)%' and q_body not like '%cincinnati_2026: %row(s)%'
                        and q_body not like '%FROZEN TABLE EDITED%' then 'PASS ' else 'FAIL ' end)
             || 'D3 pipeline_watchdog() queued exactly one drift line for usopen (alert stamp moved ' || alert_before || ' -> ' || alert_after || ')' || E'\n';
  update public.entries set score = score - 1 where tournament_id = 'usopen_2026' and user_id = u_top;
  rep := rep || (case when (public.standings_drift('usopen_2026')->>'ok')::boolean then 'PASS ' else 'FAIL ' end)
             || 'D4 restored -> ok again' || E'\n';

  -- D5 — an entry that disappears after the freeze is reported too (full join), rolled back below
  delete from public.entries where tournament_id = 'usopen_2026' and user_id = u_last;
  d := public.standings_drift('usopen_2026');
  rep := rep || (case when (d->>'ok')::boolean = false and (d->>'moved')::int = 1
                        and d->'rows'->0->>'user_id' = u_last::text and d->'rows'->0->>'live_score' is null then 'PASS ' else 'FAIL ' end)
             || 'D5 a deleted entry -> moved 1 with live_score null' || E'\n';

  -- D6 — an EDITED archive row trips the hash check, not the drift check
  update public.tournament_status
     set final_standings = jsonb_set(final_standings, '{0,team_name}', '"Edited"')
   where tournament_id = 'cincinnati_2026';
  rep := rep || (case when (select public.standings_hash(final_standings) <> standings_hash
                              from public.tournament_status where tournament_id = 'cincinnati_2026')
                       and (public.standings_drift('cincinnati_2026')->>'ok')::boolean then 'PASS ' else 'FAIL ' end)
             || 'D6 edited final_standings -> hash no longer matches while drift stays ok (the editor, not the scorer)' || E'\n';

  -- D7 — not frozen -> raises
  msg := null;
  begin perform public.standings_drift('never_frozen_2026'); exception when others then msg := sqlerrm; end;
  rep := rep || (case when msg ~ 'not frozen' then 'PASS ' else 'FAIL ' end) || 'D7 not frozen -> ' || coalesce(msg, '(no exception!)') || E'\n';

  -- P1 — privileges
  rep := rep || (case when not has_function_privilege('anon', 'public.standings_drift(text)', 'execute')
                        and not has_function_privilege('authenticated', 'public.standings_drift(text)', 'execute')
                        and has_function_privilege('service_role', 'public.standings_drift(text)', 'execute') then 'PASS ' else 'FAIL ' end)
             || 'P1 standings_drift executable by service_role only' || E'\n';

  raise exception E'ROLLBACK (expected) — report:\n%', rep;
end $$;
