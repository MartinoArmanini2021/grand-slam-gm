-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- Where each manager came from (growth scorecard), 2026-10-20. NOT APPLIED: apply on Martino's word.
--
-- The app sends the first-touch channel tag at sign-up as user metadata `src` (e.g. "club-parioli",
-- "invite-abc123"; src/lib/source.ts in the app). This copies it into profiles.signup_source when the
-- account is created, so the scorecard can count sign-ups per club, creator or post without
-- depending on the analytics banner. Older accounts stay null ("before tracking").
--
-- handle_new_user() is the live sign-up trigger: the new body below is the current one (read from the
-- live database 2026-10-19) plus the one source line, so nothing else about sign-up changes.
-- ROLLBACK at the bottom restores the current body exactly.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

begin;

alter table public.profiles add column if not exists signup_source text
  check (signup_source is null or signup_source ~ '^[a-z0-9][a-z0-9_-]{0,39}$');

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path to 'public' as $function$
declare pub_id uuid; v_src text;
begin
  -- the channel tag, only if it is a clean short tag; anything else is ignored, never an error
  v_src := lower(btrim(coalesce(new.raw_user_meta_data->>'src', '')));
  if v_src !~ '^[a-z0-9][a-z0-9_-]{0,39}$' then v_src := null; end if;
  insert into public.profiles (id, signup_source) values (new.id, v_src) on conflict do nothing;
  select id into pub_id from public.leagues where is_public limit 1;
  if pub_id is not null then
    insert into public.league_members (league_id, user_id) values (pub_id, new.id) on conflict do nothing;
  end if;
  return new;
end $function$;

-- The scorecard's count: sign-ups and drafted squads per source (service role / SQL editor only).
create or replace view public.growth_by_source with (security_invoker = true) as
select coalesce(p.signup_source, '(before tracking)') as source,
       count(*) as signups,
       count(*) filter (where exists (select 1 from public.entries e where e.user_id = p.id
                          and jsonb_array_length(coalesce(e.state->'initialSquad', '[]'::jsonb)) = 10)) as drafted,
       min(p.created_at) as first_signup,
       max(p.created_at) as last_signup
  from public.profiles p
 group by 1;
revoke all on public.growth_by_source from anon, authenticated;

commit;

-- VERIFY (read-only)
-- select * from public.growth_by_source order by signups desc;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (the handle_new_user body as it is live today)
-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- begin;
--   drop view if exists public.growth_by_source;
--   create or replace function public.handle_new_user()
--   returns trigger language plpgsql security definer set search_path to 'public' as $function$
--   declare pub_id uuid;
--   begin
--     insert into public.profiles (id) values (new.id) on conflict do nothing;
--     select id into pub_id from public.leagues where is_public limit 1;
--     if pub_id is not null then
--       insert into public.league_members (league_id, user_id) values (pub_id, new.id) on conflict do nothing;
--     end if;
--     return new;
--   end $function$;
--   alter table public.profiles drop column if exists signup_source;
-- commit;
