-- TOURNAMENT STATUS / FREEZE — verification. Run AFTER UP-A of 2026-09-22_tournament_status_freeze.sql.
--
-- One DO block: builds a throwaway tournament (zz_freeze_test) from three REAL profiles (entries.user_id
-- references auth.users, so users cannot be minted) and the public league, exercises every guard of
-- freeze_tournament and the trap in tournament_is_finished, then ends with RAISE EXCEPTION so every row
-- it inserted is rolled back. The exception message IS the report: every line must start with PASS.
--
-- R7b's `[1,1,3]` is the SPECIFICATION (standard competition ranking, review R1). If that assertion ever
-- fails, fix the function, never the assertion — once frozen, the wrong convention is permanent history.
--
-- Executed against production 2026-09-21 23:09Z (22 Sep 01:09 CEST), after UP-A (migration 20260921230748): 24/24 PASS

do $$
declare
  T  constant text := 'zz_freeze_test';
  T0 constant timestamptz := now() - interval '1 day';   -- the (past) first ball of the fake final
  rep text := '';
  u   uuid[];                 -- three real users, ascending
  lg  uuid;                   -- the public league
  msg text;
  r   public.tournament_status;
  r2  public.tournament_status;
  x1  text; x2 text;
  n   int;
  nm  text;
  init constant jsonb := '["a","b","c","d","e","f","g","h","i","j"]';
begin
  select array_agg(id order by id) into u from (select id from public.profiles order by id limit 3) s;
  if coalesce(array_length(u, 1), 0) < 3 then raise exception 'need three profiles to run this test'; end if;
  select id into lg from public.leagues where is_public limit 1;
  if lg is null then raise exception 'no public league'; end if;

  -- a tier-legal ten so ONE entry can carry a drafted squad past guard_initial_squad
  insert into public.player_stats (tournament_id, id, price, tier, ranking) values
    (T,'a',50,'Platinum',1),(T,'b',40,'Platinum',2),(T,'c',20,'Gold',11),(T,'d',15,'Gold',12),(T,'e',5,'Gold',13),
    (T,'f',3,'Silver',30),(T,'g',3,'Silver',31),(T,'h',2,'Silver',32),(T,'i',1,'Silver',33),(T,'j',1,'Silver',34);
  insert into public.entries (user_id, league_id, tournament_id, state, score) values
    (u[1], lg, T, '{}'::jsonb, 10.5),
    (u[2], lg, T, '{}'::jsonb, 10.5),
    (u[3], lg, T, jsonb_build_object('initialSquad', init, 'myTeam', init), 3);
  -- the final: started in the past, NO winner yet
  insert into public.matches (tournament_id, round, slot, p1_id, p2_id, winner_id, started_at)
  values (T, 'F', 0, 'a', 'b', null, T0);

  -- T1 — THE TRAP: a final that has started but has no winner is NOT finished.
  rep := rep || (case when public.tournament_is_finished(T) = false then 'PASS ' else 'FAIL ' end)
             || 'T1 started_at in the past + winner_id null -> tournament_is_finished false' || E'\n';

  -- R1 — freeze refuses while not finished
  msg := null;
  begin perform public.freeze_tournament(T); exception when others then msg := sqlerrm; end;
  rep := rep || (case when msg ~ 'not finished' then 'PASS ' else 'FAIL ' end)
             || 'R1 refuse: not finished -> ' || coalesce(msg, '(no exception!)') || E'\n';

  -- T2 — a winner makes it finished, and the stamp is irrelevant
  update public.matches set winner_id = 'a' where tournament_id = T and round = 'F';
  rep := rep || (case when public.tournament_is_finished(T) then 'PASS ' else 'FAIL ' end)
             || 'T2a winner_id set -> finished' || E'\n';
  update public.matches set started_at = null where tournament_id = T and round = 'F';
  rep := rep || (case when public.tournament_is_finished(T) then 'PASS ' else 'FAIL ' end)
             || 'T2b winner_id set + started_at null -> still finished (the stamp is not the signal)' || E'\n';
  update public.matches set started_at = T0 where tournament_id = T and round = 'F';

  -- R2 — no scoring_health row, then ok = false
  msg := null;
  begin perform public.freeze_tournament(T); exception when others then msg := sqlerrm; end;
  rep := rep || (case when msg ~ 'no scoring_health row' then 'PASS ' else 'FAIL ' end)
             || 'R2a refuse: no scoring_health row -> ' || coalesce(msg, '(no exception!)') || E'\n';
  insert into public.scoring_health (tournament_id, last_run_at, ok, entries_scored, error)
  values (T, T0 + interval '1 hour', false, 3, 'boom');
  msg := null;
  begin perform public.freeze_tournament(T); exception when others then msg := sqlerrm; end;
  rep := rep || (case when msg ~ 'scoring_health.ok is false' then 'PASS ' else 'FAIL ' end)
             || 'R2b refuse: scoring_health.ok false -> ' || coalesce(msg, '(no exception!)') || E'\n';

  -- R3 — clean run, but BEFORE the final
  update public.scoring_health set ok = true, error = null, last_run_at = T0 - interval '1 hour' where tournament_id = T;
  msg := null;
  begin perform public.freeze_tournament(T); exception when others then msg := sqlerrm; end;
  rep := rep || (case when msg ~ 'not after the final' then 'PASS ' else 'FAIL ' end)
             || 'R3 refuse: last_run_at before the final -> ' || coalesce(msg, '(no exception!)') || E'\n';

  -- R4 — stamped final + a supplied date is refused (the record must stay unambiguous)
  update public.scoring_health set last_run_at = T0 + interval '1 hour' where tournament_id = T;
  msg := null;
  begin perform public.freeze_tournament(T, null, T0); exception when others then msg := sqlerrm; end;
  rep := rep || (case when msg ~ 'do not pass p_final_played_at' then 'PASS ' else 'FAIL ' end)
             || 'R4 refuse: date supplied for a stamped final -> ' || coalesce(msg, '(no exception!)') || E'\n';

  -- R5 — unstamped final, no date
  update public.matches set started_at = null where tournament_id = T and round = 'F';
  msg := null;
  begin perform public.freeze_tournament(T); exception when others then msg := sqlerrm; end;
  rep := rep || (case when msg ~ 'pass p_final_played_at' then 'PASS ' else 'FAIL ' end)
             || 'R5 refuse: unstamped final without a date -> ' || coalesce(msg, '(no exception!)') || E'\n';

  -- R6 — a future date, then a date after the last run
  msg := null;
  begin perform public.freeze_tournament(T, null, now() + interval '1 day'); exception when others then msg := sqlerrm; end;
  rep := rep || (case when msg ~ 'in the future' then 'PASS ' else 'FAIL ' end)
             || 'R6a refuse: future date -> ' || coalesce(msg, '(no exception!)') || E'\n';
  msg := null;
  begin perform public.freeze_tournament(T, null, T0 + interval '2 hours'); exception when others then msg := sqlerrm; end;
  rep := rep || (case when msg ~ 'not after the final' then 'PASS ' else 'FAIL ' end)
             || 'R6b refuse: date after the last clean run -> ' || coalesce(msg, '(no exception!)') || E'\n';

  -- R7 — success with a supplied date one hour before the last clean run
  r := public.freeze_tournament(T, 'test note', T0);
  rep := rep || (case when r.tournament_id = T and r.entries_count = 3 and r.drafted_count = 1 then 'PASS ' else 'FAIL ' end)
             || 'R7a frozen: entries_count 3, drafted_count 1 (got ' || r.entries_count || '/' || r.drafted_count || ')' || E'\n';
  rep := rep || (case when (r.final_standings->0->>'rank')::int = 1 and (r.final_standings->1->>'rank')::int = 1
                        and (r.final_standings->2->>'rank')::int = 3 then 'PASS ' else 'FAIL ' end)
             || 'R7b ranks are [1,1,3] — competition ranking, THE SPECIFICATION (got ['
             || (r.final_standings->0->>'rank') || ',' || (r.final_standings->1->>'rank') || ',' || (r.final_standings->2->>'rank') || '])' || E'\n';
  rep := rep || (case when r.final_standings->0->>'user_id' = u[1]::text and r.final_standings->1->>'user_id' = u[2]::text then 'PASS ' else 'FAIL ' end)
             || 'R7c the tie is ordered by user_id asc' || E'\n';
  rep := rep || (case when r.final_standings->0->>'score' = '10.5' and r.final_standings->2->>'score' = '3.0' then 'PASS ' else 'FAIL ' end)
             || 'R7d scores stored to one decimal (10.5, 3.0): got ' || (r.final_standings->0->>'score') || ', ' || (r.final_standings->2->>'score') || E'\n';
  rep := rep || (case when r.note ~ 'test note' and r.note ~ 'final_played_at supplied' and r.note ~ 'profiles.team_name' then 'PASS ' else 'FAIL ' end)
             || 'R7e note carries the caller''s text, the supplied date and the team-name caveat' || E'\n';
  rep := rep || (case when r.standings_hash = public.standings_hash(r.final_standings) then 'PASS ' else 'FAIL ' end)
             || 'R7f standings_hash re-derives from final_standings' || E'\n';
  select p.team_name into nm from public.profiles p where p.id = u[1];
  rep := rep || (case when r.final_standings->0->>'team_name' = coalesce(nm, '') then 'PASS ' else 'FAIL ' end)
             || 'R7g team_name comes from profiles' || E'\n';

  -- R8 — idempotence: a second call, with a different note and a nudged score, writes NOTHING
  select xmin::text into x1 from public.tournament_status where tournament_id = T;
  update public.entries set score = 99 where tournament_id = T and user_id = u[3];
  r2 := public.freeze_tournament(T, 'second note');
  select xmin::text into x2 from public.tournament_status where tournament_id = T;
  rep := rep || (case when r2.standings_hash = r.standings_hash and r2.note = r.note and r2.completed_at = r.completed_at
                        and x1 = x2 and r2.final_standings = r.final_standings then 'PASS ' else 'FAIL ' end)
             || 'R8 second freeze returns the same row (same hash, note, completed_at, xmin) — nothing written' || E'\n';
  update public.entries set score = 3 where tournament_id = T and user_id = u[3];

  -- P1 — privileges
  rep := rep || (case when not has_table_privilege('anon', 'public.tournament_status', 'insert')
                        and not has_table_privilege('authenticated', 'public.tournament_status', 'update')
                        and not has_table_privilege('service_role', 'public.tournament_status', 'delete')
                        and has_table_privilege('anon', 'public.tournament_status', 'select')
                        and has_table_privilege('authenticated', 'public.tournament_status', 'select') then 'PASS ' else 'FAIL ' end)
             || 'P1a table: SELECT only for anon/authenticated, no writes for any app role' || E'\n';
  rep := rep || (case when not has_function_privilege('anon', 'public.freeze_tournament(text,text,timestamptz)', 'execute')
                        and not has_function_privilege('authenticated', 'public.freeze_tournament(text,text,timestamptz)', 'execute')
                        and not has_function_privilege('service_role', 'public.freeze_tournament(text,text,timestamptz)', 'execute') then 'PASS ' else 'FAIL ' end)
             || 'P1b freeze_tournament is not executable by anon, authenticated or service_role' || E'\n';

  -- H1 — the hash ignores key order, array order and numeric scale; separators cannot be forged by a name
  rep := rep || (case when public.standings_hash('[{"user_id":"b","team_name":"x","score":160,"rank":2},{"user_id":"a","team_name":"y","score":180.5,"rank":1}]')
                         = public.standings_hash('[{"rank":1,"score":180.5,"team_name":"y","user_id":"a"},{"user_id":"b","team_name":"x","score":160.0,"rank":2}]') then 'PASS ' else 'FAIL ' end)
             || 'H1a same standings, different key/array order and scale -> same hash' || E'\n';
  rep := rep || (case when public.standings_hash('[{"user_id":"a","team_name":"p|q","score":1,"rank":1}]')
                        <> public.standings_hash('[{"user_id":"a","team_name":"p","score":1,"rank":1}]')
                       and public.standings_hash(jsonb_build_array(jsonb_build_object('user_id', 'a', 'team_name', 'p' || chr(10) || 'q', 'score', 1, 'rank', 1)))
                        <> public.standings_hash('[{"user_id":"a","team_name":"pq","score":1,"rank":1}]')
                       and public.standings_hash('[{"user_id":"a","team_name":"x","score":1,"rank":1}]')
                        <> public.standings_hash('[{"user_id":"a","team_name":"x","score":1.5,"rank":1}]') then 'PASS ' else 'FAIL ' end)
             || 'H1b a pipe or a newline in a team name, or a different score, changes the hash' || E'\n';

  select count(*) into n from public.tournament_status where tournament_id = T;
  rep := rep || (case when n = 1 then 'PASS ' else 'FAIL ' end) || 'Z exactly one status row for the test tournament (rolled back below)' || E'\n';

  raise exception E'ROLLBACK (expected) — report:\n%', rep;
end $$;
