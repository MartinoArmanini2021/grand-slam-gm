-- =====================================================================================================
-- revoke_public_definer_rpcs — tests. Run AFTER 2026-09-25_revoke_public_definer_rpcs.sql. Everything
-- happens inside one transaction that ends in ROLLBACK: nothing is kept.
-- There is no CI test user any more (every test account was deleted on 26 Aug), so two throwaway users
-- are created INSIDE the transaction and vanish with it; no real account is read or touched. They have
-- no email. handle_new_user gives each a profile and a public-league membership, rolled back too.
-- It poses as them (role authenticated + request.jwt.claims), as the app does, and as a signed-out
-- visitor (role anon).
-- Result: one line "L1=PASS … A5=PASS" — every entry must read PASS.
-- Before the migration, A1–A5 read FAIL(ran): the old ACLs let those callers in.
-- =====================================================================================================
begin;

insert into auth.users (id, aud, role, created_at, updated_at) values
  ('00000000-0000-4000-8000-00000000c101', 'authenticated', 'authenticated', now(), now()),   -- owner
  ('00000000-0000-4000-8000-00000000c102', 'authenticated', 'authenticated', now(), now());   -- member
select set_config('lg.r', '', true);

-- ── the owner creates a private league ───────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000c101","role":"authenticated"}', true);

do $$ declare r record; begin                                      -- L1: create_league
  select * into r from public.create_league('Hardening test league');
  perform set_config('lg.id', r.id::text, true);
  perform set_config('lg.code', r.code, true);
  perform set_config('lg.r', current_setting('lg.r') || 'L1=' ||
    case when r.id is not null and length(r.code) = 6 then 'PASS' else 'FAIL' end || ' ', true);
exception when others then perform set_config('lg.r', current_setting('lg.r') || 'L1=FAIL(' || sqlerrm || ') ', true);
end $$;

-- ── the member joins by code, then leaves ────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000c102","role":"authenticated"}', true);

do $$ declare r record; begin                                      -- L2: join_league
  select * into r from public.join_league(current_setting('lg.code'));
  perform set_config('lg.r', current_setting('lg.r') || 'L2=' ||
    case when r.id::text = current_setting('lg.id') then 'PASS' else 'FAIL' end || ' ', true);
exception when others then perform set_config('lg.r', current_setting('lg.r') || 'L2=FAIL(' || sqlerrm || ') ', true);
end $$;
reset role;
select set_config('lg.after_join', (select count(*) from public.league_members
  where league_id = current_setting('lg.id')::uuid)::text, true);                  -- expect 2

set local role authenticated;
do $$ begin                                                        -- L3: leave_league
  perform public.leave_league(current_setting('lg.id')::uuid);
  null;  -- L3 is judged by the row counts below
exception when others then perform set_config('lg.r', current_setting('lg.r') || 'L3=FAIL(' || sqlerrm || ') ', true);
end $$;
reset role;
select set_config('lg.after_leave', (select count(*) from public.league_members
  where league_id = current_setting('lg.id')::uuid)::text, true);                  -- expect 1

-- ── the member joins again; the owner removes them, then deletes the league ─────────────────────
set local role authenticated;
do $$ begin perform public.join_league(current_setting('lg.code')); end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000c101","role":"authenticated"}', true);

do $$ begin                                                        -- L4: remove_member
  perform public.remove_member(current_setting('lg.id')::uuid, '00000000-0000-4000-8000-00000000c102');
  null;  -- L4 is judged by the row counts below
exception when others then perform set_config('lg.r', current_setting('lg.r') || 'L4=FAIL(' || sqlerrm || ') ', true);
end $$;
reset role;
select set_config('lg.after_remove', (select count(*) from public.league_members
  where league_id = current_setting('lg.id')::uuid)::text, true);                  -- expect 1

set local role authenticated;
do $$ begin                                                        -- L5: delete_league
  perform public.delete_league(current_setting('lg.id')::uuid);
  null;  -- L5 is judged by the row counts below
exception when others then perform set_config('lg.r', current_setting('lg.r') || 'L5=FAIL(' || sqlerrm || ') ', true);
end $$;

-- ── A5: a signed-in manager can no longer run the watchdog ───────────────────────────────────────
do $$ begin
  perform public.pipeline_watchdog();
  perform set_config('lg.r', current_setting('lg.r') || 'A5=FAIL(ran) ', true);
exception
  when insufficient_privilege then perform set_config('lg.r', current_setting('lg.r') || 'A5=PASS ', true);
  when others then perform set_config('lg.r', current_setting('lg.r') || 'A5=FAIL(' || sqlerrm || ') ', true);
end $$;
reset role;
select set_config('lg.after_delete', (select count(*) from public.leagues
  where id = current_setting('lg.id')::uuid)::text, true);                         -- expect 0

-- ── A1–A4: a signed-out visitor is refused all four ──────────────────────────────────────────────
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$ begin
  perform public.pipeline_watchdog();
  perform set_config('lg.r', current_setting('lg.r') || 'A1=FAIL(ran) ', true);
exception
  when insufficient_privilege then perform set_config('lg.r', current_setting('lg.r') || 'A1=PASS ', true);
  when others then perform set_config('lg.r', current_setting('lg.r') || 'A1=FAIL(' || sqlerrm || ') ', true);
end $$;
do $$ begin
  perform public.leave_league('00000000-0000-0000-0000-000000000000');
  perform set_config('lg.r', current_setting('lg.r') || 'A2=FAIL(ran) ', true);
exception
  when insufficient_privilege then perform set_config('lg.r', current_setting('lg.r') || 'A2=PASS ', true);
  when others then perform set_config('lg.r', current_setting('lg.r') || 'A2=FAIL(' || sqlerrm || ') ', true);
end $$;
do $$ begin
  perform public.delete_league('00000000-0000-0000-0000-000000000000');
  perform set_config('lg.r', current_setting('lg.r') || 'A3=FAIL(ran) ', true);
exception
  when insufficient_privilege then perform set_config('lg.r', current_setting('lg.r') || 'A3=PASS ', true);
  when others then perform set_config('lg.r', current_setting('lg.r') || 'A3=FAIL(ran: ' || sqlerrm || ') ', true);
end $$;
do $$ begin
  perform public.remove_member('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000');
  perform set_config('lg.r', current_setting('lg.r') || 'A4=FAIL(ran) ', true);
exception
  when insufficient_privilege then perform set_config('lg.r', current_setting('lg.r') || 'A4=PASS ', true);
  when others then perform set_config('lg.r', current_setting('lg.r') || 'A4=FAIL(ran: ' || sqlerrm || ') ', true);
end $$;

reset role;
select current_setting('lg.r')
       || 'L3=' || case when current_setting('lg.after_join') = '2' and current_setting('lg.after_leave') = '1' then 'PASS' else 'FAIL' end
       || ' L4=' || case when current_setting('lg.after_remove') = '1' then 'PASS' else 'FAIL' end
       || ' L5=' || case when current_setting('lg.after_delete') = '0' then 'PASS' else 'FAIL' end
       || '  (members after join ' || current_setting('lg.after_join') || ', after leave ' || current_setting('lg.after_leave')
       || ', after remove ' || current_setting('lg.after_remove') || '; league rows after delete ' || current_setting('lg.after_delete') || ')'
       as results;
rollback;
