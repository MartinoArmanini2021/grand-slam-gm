-- Tests for 2026-10-20_signup_source.sql (PGlite harness or begin … rollback). Raises on failure.
create trigger on_auth_user_created_test after insert on auth.users
  for each row execute function public.handle_new_user();
insert into public.leagues (id, name, code, is_public) values ('20000000-0000-0000-0000-000000000001', 'Global', 'PUB001', true);

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
 ('00000000-0000-0000-0000-0000000000d1', 'a@example.test', now(), '{"src":"Club-Parioli"}'),
 ('00000000-0000-0000-0000-0000000000d2', 'b@example.test', now(), '{"src":"<script>"}'),
 ('00000000-0000-0000-0000-0000000000d3', 'c@example.test', now(), '{}');

do $$ begin
  if (select signup_source from public.profiles where id = '00000000-0000-0000-0000-0000000000d1') is distinct from 'club-parioli' then
    raise exception 'FAIL 1: clean tag not stored';
  end if;
  if (select signup_source from public.profiles where id = '00000000-0000-0000-0000-0000000000d2') is not null then
    raise exception 'FAIL 2: a bad tag must be ignored';
  end if;
  if (select count(*) from public.profiles where id = '00000000-0000-0000-0000-0000000000d3') <> 1 then
    raise exception 'FAIL 3: sign-up without a tag must still create the profile';
  end if;
  if (select count(*) from public.league_members where league_id = '20000000-0000-0000-0000-000000000001') <> 3 then
    raise exception 'FAIL 4: every new account still joins the public league';
  end if;
  if (select signups from public.growth_by_source where source = 'club-parioli') <> 1 then
    raise exception 'FAIL 5: the view must count the source';
  end if;
end $$;

select 'signup_source_tests: all passed' as result;
