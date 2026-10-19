-- Tests for 2026-10-20_invites.sql (PGlite harness or begin … rollback). Every check raises on failure.
insert into auth.users values
 ('00000000-0000-0000-0000-0000000000a1', 'owner@example.test', now()),
 ('00000000-0000-0000-0000-0000000000b2', 'friend@example.test', now()),
 ('00000000-0000-0000-0000-0000000000c3', 'stranger@example.test', now());
insert into public.profiles (id, team_name) values
 ('00000000-0000-0000-0000-0000000000a1', 'Agass'),
 ('00000000-0000-0000-0000-0000000000c3', 'Outsiders');
insert into public.leagues (id, name, code, is_public, owner_id) values
 ('10000000-0000-0000-0000-000000000001', 'Global', 'PUBLIC', true, null),
 ('10000000-0000-0000-0000-000000000002', 'Circolo Tennis', 'ABC123', false, '00000000-0000-0000-0000-0000000000a1');
insert into public.league_members (league_id, user_id) values
 ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a1');

do $$ declare r record; begin
  -- 1. preview before signing in: name, members, inviter's team
  select * into r from public.league_preview('abc123', '00000000-0000-0000-0000-0000000000a1');
  if r.name <> 'Circolo Tennis' or r.members <> 1 or r.inviter_team <> 'Agass' then
    raise exception 'FAIL 1: preview %', row_to_json(r);
  end if;
  -- 2. an inviter who is not in the league is not shown
  select * into r from public.league_preview('ABC123', '00000000-0000-0000-0000-0000000000c3');
  if r.inviter_team is not null then raise exception 'FAIL 2: outsider shown as inviter'; end if;
  -- 3. the public league never previews
  if exists (select 1 from public.league_preview('PUBLIC', null)) then raise exception 'FAIL 3: public league previewed'; end if;

  -- 4. join with a ref records the inviter
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000b2', false);
  perform public.join_league('ABC123', '00000000-0000-0000-0000-0000000000a1');
  if (select invited_by from public.league_members where user_id = '00000000-0000-0000-0000-0000000000b2')
     is distinct from '00000000-0000-0000-0000-0000000000a1' then
    raise exception 'FAIL 4: inviter not recorded';
  end if;
  -- 5. rejoining with another ref never rewrites it
  perform public.join_league('ABC123', '00000000-0000-0000-0000-0000000000c3');
  if (select invited_by from public.league_members where user_id = '00000000-0000-0000-0000-0000000000b2')
     is distinct from '00000000-0000-0000-0000-0000000000a1' then
    raise exception 'FAIL 5: inviter rewritten';
  end if;
  -- 6. the old one-argument call still works; a self-ref or outsider-ref records nobody
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000c3', false);
  perform public.join_league('ABC123');
  if (select invited_by from public.league_members where user_id = '00000000-0000-0000-0000-0000000000c3') is not null then
    raise exception 'FAIL 6: plain join recorded an inviter';
  end if;
  -- 7. recruits
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000a1', false);
  if public.my_recruits() <> 1 then raise exception 'FAIL 7: expected 1 recruit, got %', public.my_recruits(); end if;
  -- 8. wrong code
  begin
    perform public.join_league('ZZZZZZ');
    raise exception 'FAIL 8: unknown code accepted';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
end $$;

select 'invites_tests: all passed' as result;
