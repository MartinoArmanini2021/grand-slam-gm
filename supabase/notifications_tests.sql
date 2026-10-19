-- Tests for 2026-10-20_notifications.sql. Self-contained synthetic tournament 'tt'; run against a
-- scratch database (PGlite harness) or inside begin … rollback. Every check raises on failure.
--
-- The draw: R32 (4 slots, all decided), R16 (2 slots, not played, first ball T0).
-- Managers:
--   A  squad has a knocked-out player (p2) and transfers left          → market emails
--   B  squad all alive, full                                          → nothing
--   C  knocked-out player but all 5 transfers used                     → nothing
--   D  emails turned off                                               → nothing
--   E  an account with no squad                                        → draft emails only

insert into auth.users values
 ('00000000-0000-0000-0000-00000000000a', 'a@example.test', now()),
 ('00000000-0000-0000-0000-00000000000b', 'b@example.test', now()),
 ('00000000-0000-0000-0000-00000000000c', 'c@example.test', now()),
 ('00000000-0000-0000-0000-00000000000d', 'd@example.test', now()),
 ('00000000-0000-0000-0000-00000000000e', 'e@example.test', now());
insert into public.app_config (key, value) values ('active_tournament_id', 'tt')
  on conflict (key) do update set value = excluded.value;
insert into public.tournament_fields values ('tt', '[{"id":"p2","name":"Player Two"}]');

-- ten-player squads (ids p1..p8 are in the draw; the rest are padding)
create temp table _sq as select array['p1','p3','p5','p7','x1','x2','x3','x4','x5','x6'] alive,
                               array['p2','p3','p5','p7','x1','x2','x3','x4','x5','x6'] withloser;
insert into public.entries (user_id, tournament_id, squad, state)
select '00000000-0000-0000-0000-00000000000a'::uuid, 'tt', withloser, jsonb_build_object('initialSquad', to_jsonb(withloser), 'transfers', '[]'::jsonb) from _sq
union all select '00000000-0000-0000-0000-00000000000b'::uuid, 'tt', alive, jsonb_build_object('initialSquad', to_jsonb(alive), 'transfers', '[]'::jsonb) from _sq
union all select '00000000-0000-0000-0000-00000000000c'::uuid, 'tt', withloser, jsonb_build_object('initialSquad', to_jsonb(withloser),
   'transfers', '[{"in":"q","out":"p1"},{"in":"q","out":"p3"},{"in":"q","out":"p5"},{"in":"q","out":"p7"},{"in":"q","out":"p8"}]'::jsonb) from _sq
union all select '00000000-0000-0000-0000-00000000000d'::uuid, 'tt', withloser, jsonb_build_object('initialSquad', to_jsonb(withloser), 'transfers', '[]'::jsonb) from _sq;
insert into public.notification_prefs (user_id, email_reminders, locale) values
 ('00000000-0000-0000-0000-00000000000d', false, 'en'),
 ('00000000-0000-0000-0000-00000000000a', true, 'it');

create temp table _t0 as select date_trunc('hour', now()) + interval '10 hours' as t0;

-- ── 1. OFF by default: nothing at all ──────────────────────────────────────────────────────────
insert into public.matches
select 'tt', 'R32', s, 'p' || (2*s+1), 'p' || (2*s+2), 'p' || (2*s+1), null, (select t0 from _t0) - interval '2 days'
  from generate_series(0, 3) s;
insert into public.matches
select 'tt', 'R16', s, 'tbd', 'tbd', null, null, (select t0 from _t0) from generate_series(0, 1) s;
do $$ begin
  if (select count(*) from public.notification_candidates((select t0 from _t0) - interval '5 hours')) <> 0 then
    raise exception 'FAIL 1: notify_mode off must return nothing';
  end if;
end $$;

update public.app_config set value = 'dry_run' where key = 'notify_mode';

-- ── 2. market_state agrees with the save path ──────────────────────────────────────────────────
do $$ declare s record; t0 timestamptz := (select t0 from _t0); begin
  select * into s from public.market_state('tt', t0 - interval '5 hours');
  if s.phase <> 'open' or s.window_round <> 'R16' or s.locks_at <> t0 then
    raise exception 'FAIL 2a: expected open R16 locking at T0, got % % %', s.phase, s.window_round, s.locks_at;
  end if;
  select * into s from public.market_state('tt', t0 + interval '1 minute');
  if s.phase <> 'closed' then raise exception 'FAIL 2b: after the first ball expected closed, got %', s.phase; end if;
end $$;

-- ── 3. market_open, 5 hours before the lock: only A, in Italian, naming the loser ──────────────
do $$ declare n int; r record; t0 timestamptz := (select t0 from _t0); begin
  select count(*) into n from public.notification_candidates(t0 - interval '5 hours');
  if n <> 1 then raise exception 'FAIL 3a: expected 1 candidate, got %', n; end if;
  select * into r from public.notification_candidates(t0 - interval '5 hours');
  if r.email <> 'a@example.test' or r.kind <> 'market_open' or r.round <> 'R16' or r.locale <> 'it'
     or r.players_out <> array['Player Two'] or r.transfers_left <> 5 then
    raise exception 'FAIL 3b: wrong row %', row_to_json(r);
  end if;
end $$;

-- ── 4. the quiet half hour: between 2.5 h and 2 h before the lock, no email ────────────────────
do $$ begin
  if (select count(*) from public.notification_candidates((select t0 from _t0) - interval '135 minutes')) <> 0 then
    raise exception 'FAIL 4: the 2–2.5 h gap must be quiet';
  end if;
end $$;

-- ── 5. claim once: a claimed email is never due again ──────────────────────────────────────────
do $$ declare t0 timestamptz := (select t0 from _t0); begin
  if not public.claim_notification('00000000-0000-0000-0000-00000000000a', 'tt', 'market_open', 'R16', true) then
    raise exception 'FAIL 5a: first claim must win';
  end if;
  if public.claim_notification('00000000-0000-0000-0000-00000000000a', 'tt', 'market_open', 'R16', true) then
    raise exception 'FAIL 5b: second claim must lose';
  end if;
  if (select count(*) from public.notification_candidates(t0 - interval '5 hours')) <> 0 then
    raise exception 'FAIL 5c: claimed market_open must not be due again';
  end if;
end $$;

-- ── 6. market_lock, 1 hour before: A again (a different email), still nobody else ─────────────
do $$ declare r record; n int; begin
  select count(*) into n from public.notification_candidates((select t0 from _t0) - interval '1 hour');
  select * into r from public.notification_candidates((select t0 from _t0) - interval '1 hour');
  if n <> 1 or r.kind <> 'market_lock' then raise exception 'FAIL 6: expected one market_lock, got % %', n, r.kind; end if;
end $$;

-- ── 7. frozen tournament: nothing ──────────────────────────────────────────────────────────────
insert into public.tournament_status values ('tt');
do $$ begin
  if (select count(*) from public.notification_candidates((select t0 from _t0) - interval '1 hour')) <> 0 then
    raise exception 'FAIL 7: a frozen tournament sends nothing';
  end if;
end $$;
delete from public.tournament_status where tournament_id = 'tt';

-- ── 8. the draft: E (no squad) gets draft_open, then draft_lock; managers with squads get none ─
delete from public.matches where tournament_id = 'tt';
insert into public.matches
select 'tt', 'R32', s, 'p' || (2*s+1), 'p' || (2*s+2), null, null, (select t0 from _t0) from generate_series(0, 3) s;
do $$ declare r record; n int; t0 timestamptz := (select t0 from _t0); begin
  select * into r from public.market_state('tt', t0 - interval '1 day');
  if r.phase <> 'draft' or r.locks_at <> t0 then raise exception 'FAIL 8a: draft state wrong %', row_to_json(r); end if;
  select count(*) into n from public.notification_candidates(t0 - interval '1 day');
  select * into r from public.notification_candidates(t0 - interval '1 day');
  if n <> 1 or r.email <> 'e@example.test' or r.kind <> 'draft_open' then
    raise exception 'FAIL 8b: expected E draft_open, got % %', n, row_to_json(r);
  end if;
  select * into r from public.notification_candidates(t0 - interval '1 hour');
  if r.kind <> 'draft_lock' then raise exception 'FAIL 8c: expected draft_lock, got %', r.kind; end if;
end $$;

-- ── 9. unsubscribe and preferences ─────────────────────────────────────────────────────────────
do $$ begin
  perform public.unsubscribe_reminders('00000000-0000-0000-0000-00000000000e');
  if (select count(*) from public.notification_candidates((select t0 from _t0) - interval '1 day')) <> 0 then
    raise exception 'FAIL 9a: unsubscribed users get nothing';
  end if;
  perform set_config('test.uid', '00000000-0000-0000-0000-00000000000e', false);
  perform public.set_notification_prefs(true, 'it');
  if (select locale from public.notification_prefs where user_id = '00000000-0000-0000-0000-00000000000e') <> 'it' then
    raise exception 'FAIL 9b: set_notification_prefs did not store the language';
  end if;
  begin
    perform public.set_notification_prefs(true, 'fr');
    raise exception 'FAIL 9c: unknown language accepted';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
end $$;

select 'notifications_tests: all passed' as result;
