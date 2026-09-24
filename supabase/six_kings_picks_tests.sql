-- =====================================================================================================
-- Six Kings picks — tests. Run AFTER 2026-09-24_six_kings_picks.sql. Everything happens inside one
-- transaction that ends in ROLLBACK, on a throwaway event 'sk_test': nothing is kept.
-- It poses as two managers (request.jwt.claims) and as a signed-out visitor (role anon).
-- Result: one line "T1=PASS T2=PASS …" — every entry must read PASS.
-- =====================================================================================================
begin;

insert into public.pick_players (event_id, id, name, atp_rank) values
  ('sk_test', 'a', 'A', 1), ('sk_test', 'b', 'B', 10), ('sk_test', 'c', 'C', 3), ('sk_test', 'd', 'D', 5);
insert into public.pick_matches (event_id, match_no, round, p1_id, p2_id, starts_at) values
  ('sk_test', 1, 'QF', 'a', 'b',   now() + interval '1 day'),    -- open
  ('sk_test', 2, 'QF', 'c', 'd',   now() - interval '1 hour'),   -- started
  ('sk_test', 3, 'SF', 'a', 'tbd', now() + interval '2 days'),   -- opponent not known yet
  ('sk_test', 4, 'SF', 'c', 'd',   now() + interval '2 days');   -- decided below (winner set)
update public.pick_matches set winner_id = 'c' where event_id = 'sk_test' and match_no = 4;
select set_config('sk.r', '', true);

-- ── manager 1 ─────────────────────────────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

do $$ begin                                                      -- T1: pick, then change your mind
  perform public.save_pick('sk_test', 1, 'b');
  perform public.save_pick('sk_test', 1, 'a');
  perform set_config('sk.r', current_setting('sk.r') || 'T1=' || case when
    (select player_id from public.picks where event_id = 'sk_test' and match_no = 1 and user_id = auth.uid()) = 'a'
    and (select count(*) from public.picks where event_id = 'sk_test' and user_id = auth.uid()) = 1
    then 'PASS' else 'FAIL' end || ' ', true);
exception when others then perform set_config('sk.r', current_setting('sk.r') || 'T1=FAIL(' || sqlerrm || ') ', true);
end $$;

do $$ begin                                                      -- T2: not one of the two players
  perform public.save_pick('sk_test', 1, 'c');
  perform set_config('sk.r', current_setting('sk.r') || 'T2=FAIL(accepted) ', true);
exception when others then perform set_config('sk.r', current_setting('sk.r') || 'T2=' ||
  case when sqlerrm like 'Pick one of the two players%' then 'PASS' else 'FAIL(' || sqlerrm || ')' end || ' ', true);
end $$;

do $$ begin                                                      -- T3: the match has started
  perform public.save_pick('sk_test', 2, 'c');
  perform set_config('sk.r', current_setting('sk.r') || 'T3=FAIL(accepted) ', true);
exception when others then perform set_config('sk.r', current_setting('sk.r') || 'T3=' ||
  case when sqlerrm like 'Picks for this match are closed%' then 'PASS' else 'FAIL(' || sqlerrm || ')' end || ' ', true);
end $$;

do $$ begin                                                      -- T4: an opponent still 'tbd'
  perform public.save_pick('sk_test', 3, 'a');
  perform set_config('sk.r', current_setting('sk.r') || 'T4=FAIL(accepted) ', true);
exception when others then perform set_config('sk.r', current_setting('sk.r') || 'T4=' ||
  case when sqlerrm like 'The players for this match are not known yet%' then 'PASS' else 'FAIL(' || sqlerrm || ')' end || ' ', true);
end $$;

do $$ begin                                                      -- T5: already decided
  perform public.save_pick('sk_test', 4, 'd');
  perform set_config('sk.r', current_setting('sk.r') || 'T5=FAIL(accepted) ', true);
exception when others then perform set_config('sk.r', current_setting('sk.r') || 'T5=' ||
  case when sqlerrm like 'This match is already decided%' then 'PASS' else 'FAIL(' || sqlerrm || ')' end || ' ', true);
end $$;

do $$ begin                                                      -- T6: no writing around save_pick
  insert into public.picks (event_id, user_id, match_no, player_id) values ('sk_test', auth.uid(), 1, 'b');
  perform set_config('sk.r', current_setting('sk.r') || 'T6=FAIL(direct insert accepted) ', true);
exception when others then perform set_config('sk.r', current_setting('sk.r') || 'T6=' ||
  case when sqlstate = '42501' then 'PASS' else 'FAIL(' || sqlerrm || ')' end || ' ', true);
end $$;

-- ── a pick on the started match, written as the owner (the only way: it has started) ─────────────
reset role;
insert into public.picks (event_id, user_id, match_no, player_id)
values ('sk_test', '00000000-0000-4000-8000-000000000001', 2, 'd');

-- ── manager 2 ─────────────────────────────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

do $$ begin                                                      -- T7: another manager's pick stays private before the start …
  perform set_config('sk.r', current_setting('sk.r') || 'T7=' || case when
    (select count(*) from public.picks where event_id = 'sk_test' and match_no = 1) = 0 then 'PASS' else 'FAIL' end || ' ', true);
end $$;

do $$ begin                                                      -- T8: … and is visible once that match has started
  perform set_config('sk.r', current_setting('sk.r') || 'T8=' || case when
    (select count(*) from public.picks where event_id = 'sk_test' and match_no = 2) = 1 then 'PASS' else 'FAIL' end || ' ', true);
end $$;

-- ── a signed-out visitor ─────────────────────────────────────────────────────────────────────────
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

do $$ begin                                                      -- T9: cannot pick
  perform public.save_pick('sk_test', 1, 'a');
  perform set_config('sk.r', current_setting('sk.r') || 'T9=FAIL(accepted) ', true);
exception when others then perform set_config('sk.r', current_setting('sk.r') || 'T9=' ||
  case when sqlstate = '42501' then 'PASS' else 'FAIL(' || sqlerrm || ')' end || ' ', true);
end $$;

do $$ begin                                                      -- T10: sees started picks only, and the matches
  perform set_config('sk.r', current_setting('sk.r') || 'T10=' || case when
    (select count(*) from public.picks where event_id = 'sk_test') = 1
    and (select count(*) from public.pick_matches where event_id = 'sk_test') = 4 then 'PASS' else 'FAIL' end || ' ', true);
end $$;

reset role;
select current_setting('sk.r') as results;
rollback;
