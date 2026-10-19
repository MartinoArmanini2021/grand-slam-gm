-- Tests for 2026-10-20_app_state.sql (needs 2026-10-20_notifications.sql applied first). PGlite harness
-- or begin … rollback. Every check raises on failure.
insert into public.app_config (key, value) values ('active_tournament_id', 'st')
  on conflict (key) do update set value = excluded.value;
delete from public.app_state;   -- the backfill ran against whatever was active

create temp table _t as select date_trunc('hour', now()) + interval '1 day' as t0;
-- R32 (4 slots) decided two days before T0; R16 (2 slots) first ball at T0
insert into public.matches
select 'st', 'R32', s, 'p' || (2*s+1), 'p' || (2*s+2), 'p' || (2*s+1), null, (select t0 from _t) - interval '2 days'
  from generate_series(0, 3) s;
insert into public.matches
select 'st', 'R16', s, 'tbd', 'tbd', null, null, (select t0 from _t) from generate_series(0, 1) s;

do $$ declare r public.app_state; n int; t0 timestamptz := (select t0 from _t); begin
  -- 1. open for R16, locking at T0; R32 frozen
  r := public.sync_app_state(t0 - interval '3 hours');
  if r.market <> 'open' or r.window_round <> 'R16' or r.locks_at <> t0 or r.frozen_rounds <> array['R32'] then
    raise exception 'FAIL 1: %', row_to_json(r);
  end if;
  -- 2. a second sync with nothing changed logs nothing new
  perform public.sync_app_state(t0 - interval '2 hours');
  select count(*) into n from public.app_state_log where tournament_id = 'st';
  if n <> 1 then raise exception 'FAIL 2: expected 1 log row, got %', n; end if;
  -- 3. after the first ball: closed, R16 frozen too, one more log row
  r := public.sync_app_state(t0 + interval '1 minute');
  if r.market <> 'closed' or r.frozen_rounds <> array['R32','R16'] then raise exception 'FAIL 3: %', row_to_json(r); end if;
  select count(*) into n from public.app_state_log where tournament_id = 'st';
  if n <> 2 then raise exception 'FAIL 3b: expected 2 log rows, got %', n; end if;
  -- 4. it agrees with market_state() (the save path's derivation) at every probe
  for i in 0..8 loop
    r := public.sync_app_state(t0 - interval '8 hours' + i * interval '1 hour');
    if (r.market, r.window_round) is distinct from
       (select (s.phase, s.window_round) from public.market_state('st', t0 - interval '8 hours' + i * interval '1 hour') s) then
      raise exception 'FAIL 4: disagreement at probe %', i;
    end if;
  end loop;
end $$;

select 'app_state_tests: all passed' as result;
