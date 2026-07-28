-- Private leagues (join-by-code), done securely. Replaces the old "membership is
-- implied by entries.league_id" model — which let any client self-join any league by
-- writing a league_id — with an explicit league_members table that is only ever
-- written by the create_league / join_league functions. Safe + idempotent to re-run.

-- 1. Membership: the source of truth for who belongs to which league.
create table if not exists public.league_members (
  league_id uuid not null references public.leagues on delete cascade,
  user_id   uuid not null references auth.users on delete cascade,
  joined_at timestamptz default now(),
  primary key (league_id, user_id)
);
alter table public.league_members enable row level security;

-- 2. Membership now drives my_league_ids (was derived from entries.league_id).
create or replace function public.my_league_ids()
returns setof uuid language sql security definer stable set search_path = public as $$
  select league_id from public.league_members where user_id = auth.uid()
$$;

-- 3. You can read the membership rows of any league you belong to (for board rosters).
drop policy if exists "co-members readable" on public.league_members;
create policy "co-members readable" on public.league_members
  for select to authenticated using (league_id in (select public.my_league_ids()));

-- 4. An entry is readable if its owner shares one of your leagues (entries.league_id
--    is now irrelevant for reads — membership decides). Everyone shares the public
--    league, so the public board still sees all entries.
drop policy if exists "league entries readable" on public.entries;
create policy "league entries readable" on public.entries
  for select to authenticated using (
    user_id = auth.uid()
    or entries.user_id in (
      select lm.user_id from public.league_members lm
      where lm.league_id in (select public.my_league_ids())
    )
  );

-- 5. Everyone is auto-enrolled in the public global league so the public board works.
--    Backfill existing users + extend the signup trigger.
insert into public.league_members (league_id, user_id)
  select l.id, u.id from public.leagues l cross join auth.users u
  where l.is_public
  on conflict do nothing;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare pub_id uuid;
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  select id into pub_id from public.leagues where is_public limit 1;
  if pub_id is not null then
    insert into public.league_members (league_id, user_id) values (pub_id, new.id) on conflict do nothing;
  end if;
  return new;
end $$;

-- 6. Create a private league — random 6-char code, owner = caller, creator auto-joined.
create or replace function public.create_league(p_name text)
returns table (id uuid, code text)
language plpgsql security definer set search_path = public as $$
declare new_id uuid; new_code text;
begin
  new_code := upper(substr(md5(gen_random_uuid()::text), 1, 6));
  insert into public.leagues (name, code, is_public, owner_id)
    values (coalesce(nullif(btrim(p_name), ''), 'My League'), new_code, false, auth.uid())
    returning leagues.id into new_id;
  insert into public.league_members (league_id, user_id) values (new_id, auth.uid()) on conflict do nothing;
  return query select new_id, new_code;
end $$;

-- 7. Join a private league by its code.
create or replace function public.join_league(p_code text)
returns table (id uuid, name text)
language plpgsql security definer set search_path = public as $$
declare lg record;
begin
  select l.id, l.name into lg from public.leagues l
    where l.code = upper(btrim(p_code)) and l.is_public = false limit 1;
  if lg.id is null then raise exception 'No league found with that code'; end if;
  insert into public.league_members (league_id, user_id) values (lg.id, auth.uid()) on conflict do nothing;
  return query select lg.id, lg.name;
end $$;

grant execute on function public.create_league(text) to authenticated;
grant execute on function public.join_league(text) to authenticated;
