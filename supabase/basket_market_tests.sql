-- ============================================================================
-- BASKET MARKET — verification. Run AFTER basket_market_migration.sql.
-- (DB has this as migrations basket_market_server + basket_market_check_fix_ambiguous_t.)
-- Part 1 is read-only. Part 2 builds a throwaway tournament inside one DO block
-- and ends with RAISE EXCEPTION so every row it inserted is rolled back; the
-- exception message IS the report (every line should start with PASS).
-- Executed against production 2026-09-03: Part 1 all 22 squads ok/diff 0.0,
-- Part 2 16/16 PASS.
-- ============================================================================

-- Part 1: every live squad, unchanged, must validate and reproduce its stored
-- bank. Expect ok = true and diff = 0.0 for all rows.
-- Picking p_now: winners are DATA, not time — backdating p_now does not reopen
-- a finished window. Use a moment a window is genuinely open: mid-event that
-- means inside the 6-hour valve before the next round's stamped first ball
-- (needs the placeholder rows). 2026-09-04T10:00:00Z sat inside the R32 valve.
select p.team_name,
       (c.j->>'ok')::boolean as ok, c.j->>'error' as error,
       e.budget as stored, (c.j->>'bank')::numeric as bank,
       round(coalesce((c.j->>'bank')::numeric, 0) - e.budget, 1) as diff,
       c.j->>'window' as window, c.j->>'used' as used, c.j->>'committed' as committed, c.j->>'window_transfers' as win_tr
  from public.entries e
  join public.profiles p on p.id = e.user_id
  cross join lateral (select public.market_check('usopen_2026', e.state, e.state, '2026-09-04T10:00:00Z'::timestamptz) as j) c
 where e.tournament_id = 'usopen_2026'
 order by ok, p.team_name;

-- Part 2: synthetic rules check (rolled back by the final RAISE).
do $$
declare
  T constant text := 'zz_basket_test';
  T0 constant timestamptz := '2030-01-10T12:00:00Z';
  rep text := '';
  init jsonb := '["a","b","c","d","e","f","g","h","i","j"]';
  r jsonb; st jsonb; stored jsonb;
begin
  insert into public.player_stats (tournament_id, id, price, tier, ranking) values
    (T,'a',50,'Platinum',1),(T,'b',40,'Platinum',2),(T,'c',20,'Gold',11),(T,'d',15,'Gold',12),(T,'e',5,'Gold',13),
    (T,'f',3,'Silver',30),(T,'g',3,'Silver',31),(T,'h',2,'Silver',32),(T,'i',1,'Silver',33),(T,'j',1,'Silver',34),
    (T,'x',20,'Gold',14),(T,'y',3,'Silver',35),(T,'z',40,'Platinum',3),(T,'w',3,'Silver',36),(T,'v',3,'Silver',37),(T,'u',3,'Silver',38),
    (T,'s',30,'Silver',40);  -- expensive silver, alive: the tier-legal budget-buster for S8
  insert into public.matches (tournament_id, round, slot, p1_id, p2_id, winner_id, started_at) values
    (T,'R128',0,'a','o1','a',T0 - interval '1 day'),(T,'R128',1,'b','o2','b',T0 - interval '1 day'),
    (T,'R128',2,'c','o3','o3',T0 - interval '1 day'),(T,'R128',3,'d','o4','d',T0 - interval '1 day'),
    (T,'R128',4,'e','o5','e',T0 - interval '1 day'),(T,'R128',5,'f','o6','o6',T0 - interval '1 day'),
    (T,'R128',6,'g','o7','g',T0 - interval '1 day'),(T,'R128',7,'h','o8','h',T0 - interval '1 day'),
    (T,'R128',8,'i','o9','i',T0 - interval '1 day'),(T,'R128',9,'j','o10','j',T0 - interval '1 day'),
    (T,'R128',10,'x','o11','x',T0 - interval '1 day'),(T,'R128',11,'y','o12','y',T0 - interval '1 day'),
    (T,'R128',12,'z','o13','z',T0 - interval '1 day'),(T,'R128',13,'v','o14','v',T0 - interval '1 day'),
    (T,'R128',14,'u','o15','u',T0 - interval '1 day'),(T,'R128',15,'s','o18','s',T0 - interval '1 day');
  insert into public.matches (tournament_id, round, slot, p1_id, p2_id, winner_id, started_at) values
    (T,'R64',0,'a','b',null,T0 + interval '3 hours'),(T,'R64',1,'d','e',null,T0 + interval '3 hours'),
    (T,'R64',2,'g','h',null,T0 + interval '3 hours'),(T,'R64',3,'i','j',null,T0 + interval '3 hours'),
    (T,'R64',4,'x','y',null,T0 + interval '3 hours'),(T,'R64',5,'z','v',null,T0 + interval '3 hours'),
    (T,'R64',6,'u','o16',null,T0 + interval '3 hours');

  stored := jsonb_build_object('initialSquad', init, 'myTeam', init, 'transfers', '[]'::jsonb, 'cashedIn', '[]'::jsonb);

  st := stored || jsonb_build_object('myTeam', '["a","b","c","d","e","g","h","i","j","y"]'::jsonb,
                                     'transfers', '[{"out":"f","in":"y","round":"R128"}]'::jsonb);
  r := public.market_check(T, st, stored, T0);
  rep := rep || (case when (r->>'ok')::boolean and (r->>'bank')::numeric = 9.3 and (r->>'used')::int = 1 and r->>'window' = 'R64' then 'PASS ' else 'FAIL ' end)
             || 'S1 sign y for f (bank 9.3, used 1, window R64): got ' || coalesce(r->>'bank','?') || '/' || coalesce(r->>'used','?') || '/' || coalesce(r->>'window', r->>'error') || E'\n';

  st := stored || jsonb_build_object('myTeam', '["a","b","c","d","e","g","h","i","j"]'::jsonb);
  r := public.market_check(T, st, stored, T0);
  rep := rep || (case when (r->>'ok')::boolean and (r->>'bank')::numeric = 12.3 and (r->>'used')::int = 0 then 'PASS ' else 'FAIL ' end)
             || 'S2 undo gives the full price back (bank 12.3, used 0): got ' || coalesce(r->>'bank','?') || '/' || coalesce(r->>'used', r->>'error') || E'\n';

  st := stored || jsonb_build_object('myTeam', '["b","c","d","e","f","g","h","i","j"]'::jsonb);
  r := public.market_check(T, st, stored, T0);
  rep := rep || (case when not (r->>'ok')::boolean and r->>'error' like '%a is still in the draw%' then 'PASS ' else 'FAIL ' end)
             || 'S4 selling alive a refused: ' || coalesce(r->>'error','(ok?)') || E'\n';

  st := stored || jsonb_build_object('myTeam', '["a","b","c","d","e","g","h","i","j","y"]'::jsonb);
  r := public.market_check(T, st, stored, T0);
  rep := rep || (case when not (r->>'ok')::boolean and r->>'error' like '%without a transfer%' then 'PASS ' else 'FAIL ' end)
             || 'S5 squad member without transfer refused: ' || coalesce(r->>'error','(ok?)') || E'\n';

  st := stored || jsonb_build_object('myTeam', '["a","b","c","d","e","g","h","i","j","y"]'::jsonb,
                                     'transfers', '[{"out":"f","in":"y","round":"R64"}]'::jsonb);
  r := public.market_check(T, st, stored, T0);
  rep := rep || (case when not (r->>'ok')::boolean and r->>'error' like '%must be filed as R128%' then 'PASS ' else 'FAIL ' end)
             || 'S6 wrong tag refused: ' || coalesce(r->>'error','(ok?)') || E'\n';

  st := stored || jsonb_build_object('myTeam', '["a","b","c","d","e","g","h","i","j","z"]'::jsonb,
                                     'transfers', '[{"out":"f","in":"z","round":"R128"}]'::jsonb);
  r := public.market_check(T, st, stored, T0);
  rep := rep || (case when not (r->>'ok')::boolean and r->>'error' like 'Too many in a tier%' then 'PASS ' else 'FAIL ' end)
             || 'S7 tier ceiling refused: ' || coalesce(r->>'error','(ok?)') || E'\n';

  -- S8 must be tier-legal or the tier check (which runs first) masks the money
  -- check: sell f (silver, refund 2.3 -> bank 12.3), sign s (silver, 30).
  st := stored || jsonb_build_object('myTeam', '["a","b","c","d","e","g","h","i","j","s"]'::jsonb,
                                     'transfers', '[{"out":"f","in":"s","round":"R128"}]'::jsonb);
  r := public.market_check(T, st, stored, T0);
  rep := rep || (case when not (r->>'ok')::boolean and r->>'error' like 'Over budget by $17.7M%' then 'PASS ' else 'FAIL ' end)
             || 'S8 over budget refused: ' || coalesce(r->>'error','(ok?)') || E'\n';

  st := stored || jsonb_build_object('myTeam', '["a","b","c","d","e","g","h","i","j","w"]'::jsonb,
                                     'transfers', '[{"out":"f","in":"w","round":"R128"}]'::jsonb);
  r := public.market_check(T, st, stored, T0);
  rep := rep || (case when not (r->>'ok')::boolean and r->>'error' like '%w is out%' then 'PASS ' else 'FAIL ' end)
             || 'S9 signing a no-row player refused: ' || coalesce(r->>'error','(ok?)') || E'\n';

  update public.matches set winner_id = null where tournament_id = T and round = 'R128' and slot = 14;
  r := public.market_check(T, stored, stored, T0 - interval '4 hours');
  rep := rep || (case when not (r->>'ok')::boolean and r->>'error' like 'The market opens when the Round of 128 is complete%' then 'PASS ' else 'FAIL ' end)
             || 'S10a straggler, 7h before first ball -> closed: ' || coalesce(r->>'error','(ok?)') || E'\n';
  r := public.market_check(T, stored, stored, T0 - interval '2 hours');
  rep := rep || (case when (r->>'ok')::boolean and r->>'window' = 'R64' then 'PASS ' else 'FAIL ' end)
             || 'S10b straggler, 5h before first ball -> open by the valve' || E'\n';
  update public.matches set winner_id = 'u' where tournament_id = T and round = 'R128' and slot = 14;

  r := public.market_check(T, stored, stored, T0 + interval '4 hours');
  rep := rep || (case when not (r->>'ok')::boolean and r->>'error' like 'The market is closed%' then 'PASS ' else 'FAIL ' end)
             || 'S11 R64 begun, no R32 rows -> closed: ' || coalesce(r->>'error','(ok?)') || E'\n';

  update public.matches set winner_id = case slot when 0 then 'a' when 1 then 'd' when 2 then 'h' when 3 then 'i' when 4 then 'x' when 5 then 'z' when 6 then 'u' end
   where tournament_id = T and round = 'R64';
  insert into public.matches (tournament_id, round, slot, p1_id, p2_id, winner_id, started_at) values
    (T,'R32',0,'a','d',null,T0 + interval '2 days'),(T,'R32',1,'h','i',null,T0 + interval '2 days'),
    (T,'R32',2,'x','z',null,T0 + interval '2 days'),(T,'R32',3,'u','o17',null,T0 + interval '2 days');
  stored := jsonb_build_object('initialSquad', init, 'myTeam', '["a","b","c","d","e","g","h","i","j","y"]'::jsonb,
                               'transfers', '[{"out":"f","in":"y","round":"R128"}]'::jsonb, 'cashedIn', '["f"]'::jsonb);

  st := stored || jsonb_build_object('transfers', '[]'::jsonb);
  r := public.market_check(T, st, stored, T0 + interval '1 day');
  rep := rep || (case when not (r->>'ok')::boolean and r->>'error' like 'Transfers from earlier rounds%' then 'PASS ' else 'FAIL ' end)
             || 'S12a committed transfer cannot be removed: ' || coalesce(r->>'error','(ok?)') || E'\n';

  st := stored || jsonb_build_object('myTeam', '["a","b","d","e","h","i","j","x"]'::jsonb,
                                     'transfers', '[{"out":"f","in":"y","round":"R128"},{"out":"c","in":"x","round":"R64"}]'::jsonb);
  r := public.market_check(T, st, stored, T0 + interval '1 day');
  rep := rep || (case when (r->>'ok')::boolean and (r->>'bank')::numeric = 8.5 and (r->>'used')::int = 2 and r->>'window' = 'R32' and (r->>'committed')::int = 1 then 'PASS ' else 'FAIL ' end)
             || 'S12b next window (bank 8.5, used 2, window R32, 1 committed): got ' || coalesce(r->>'bank','?') || '/' || coalesce(r->>'used','?') || '/' || coalesce(r->>'window', r->>'error') || '/' || coalesce(r->>'committed','?') || E'\n';

  st := stored || jsonb_build_object('myTeam', '["a","b","d","e","g","h","i","j","y","v"]'::jsonb,
                                     'transfers', '[{"out":"f","in":"y","round":"R128"},{"out":"c","in":"v","round":"R64"}]'::jsonb);
  r := public.market_check(T, st, stored, T0 + interval '1 day');
  rep := rep || (case when not (r->>'ok')::boolean and r->>'error' like '%v is out%' then 'PASS ' else 'FAIL ' end)
             || 'S12c signing an eliminated player refused: ' || coalesce(r->>'error','(ok?)') || E'\n';

  stored := jsonb_build_object('initialSquad', init, 'myTeam', '["a","b","c","d","e","y","x","h","i","v"]'::jsonb,
                               'transfers', '[{"out":"f","in":"y","round":"R128"},{"out":"g","in":"x","round":"R128"},{"out":"j","in":"v","round":"R128"}]'::jsonb,
                               'cashedIn', '["f","g","j"]'::jsonb);
  st := stored || jsonb_build_object('myTeam', '["a","b","d","e","y","x","h","i","v","u"]'::jsonb,
                                     'transfers', '[{"out":"f","in":"y","round":"R128"},{"out":"g","in":"x","round":"R128"},{"out":"j","in":"v","round":"R128"},{"out":"c","in":"u","round":"R64"}]'::jsonb);
  r := public.market_check(T, st, stored, T0 + interval '1 day');
  rep := rep || (case when not (r->>'ok')::boolean and r->>'error' like 'You have used all 3 transfers%' then 'PASS ' else 'FAIL ' end)
             || 'S12d fourth chargeable transfer refused: ' || coalesce(r->>'error','(ok?)') || E'\n';

  insert into public.matches (tournament_id, round, slot, p1_id, p2_id, winner_id, started_at) values (T,'F',0,'a','x','a',T0 + interval '10 days');
  r := public.market_check(T, stored, stored, T0 + interval '11 days');
  rep := rep || (case when not (r->>'ok')::boolean then 'PASS ' else 'FAIL ' end)
             || 'S13 decided final -> closed: ' || coalesce(r->>'error','(ok?)') || E'\n';

  raise exception E'ROLLBACK (expected) — report:\n%', rep;
end $$;
