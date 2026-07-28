-- ─────────────────────────────────────────────────────────────────────────────
-- Grand Slam GM — Supabase schema, security, and seed
-- ─────────────────────────────────────────────────────────────────────────────
-- Paste this whole file into the Supabase SQL editor (one run). It is idempotent
-- where practical, and ordered so foreign keys resolve (profiles → leagues → entries).
--
-- Security model in one line: Row-Level Security is ON everywhere, so the public
-- anon key that ships in the browser can only ever touch rows the policies allow.
-- The sensitive number — score — is NOT client-writable (see the revoke below); an
-- Edge Function with the service-role key is the only thing that writes it.
--
-- Multi-tournament: an entry is keyed by (user, league, tournament), so one person
-- can field a separate squad for Wimbledon, the National Bank Open, the US Open, …
-- The tournament_id matches TOURNAMENT.id in src/data/tournamentConfig.ts.

-- ── 1. Profiles: identity + team branding, one per auth user ──────────────────
create table if not exists public.profiles (
  id          uuid primary key references auth.users on delete cascade,
  username    text unique,
  first_name  text,
  last_name   text,
  country     text,
  team_name   text default 'My Team',
  team_emblem text default '🎾',
  created_at  timestamptz default now()
);

-- ── 2. Leagues: the public global league + private invite-code leagues ────────
create table if not exists public.leagues (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  code       text unique,                       -- null for the public league
  is_public  boolean default false,
  owner_id   uuid references auth.users on delete set null,
  created_at timestamptz default now()
);

-- ── 3. Entries: a user's squad for one tournament (+ progress) ────────────────
-- squad + captain_history are the ONLY scoring inputs the client may write; score
-- is server-authoritative (revoked from clients below).
create table if not exists public.entries (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users on delete cascade,
  league_id           uuid not null references public.leagues on delete restrict,  -- NOT NULL: NULLs break the unique index → duplicate entries
  tournament_id       text not null,                          -- e.g. 'wimbledon_2026'
  squad               text[] not null default '{}',           -- player ids
  captain_history     jsonb  not null default '[]',           -- [{round, playerId}]
  phase               text   not null default 'draft',
  current_round_index int    not null default 0,
  score               int    not null default 0,              -- SERVER-written only
  budget              numeric not null default 100,           -- derived, for display
  state               jsonb  not null default '{}',           -- full client snapshot, for device restore
  updated_at          timestamptz default now(),
  unique (user_id, league_id, tournament_id)
);

create index if not exists entries_league_tournament_idx
  on public.entries (league_id, tournament_id);

-- ── 3b. League membership ─────────────────────────────────────────────────────
-- The source of truth for who belongs to which league. Written ONLY by the
-- create_league / join_league functions (§7), never directly by clients — so a
-- client can't self-join a private league by writing a league_id.
create table if not exists public.league_members (
  league_id uuid not null references public.leagues on delete cascade,
  user_id   uuid not null references auth.users on delete cascade,
  joined_at timestamptz default now(),
  primary key (league_id, user_id)
);

-- ── 4. Row-Level Security ─────────────────────────────────────────────────────
alter table public.profiles       enable row level security;
alter table public.leagues        enable row level security;
alter table public.entries        enable row level security;
alter table public.league_members enable row level security;

-- The leagues you belong to (verified membership). SECURITY DEFINER so it reads
-- league_members WITHOUT re-invoking RLS — the entries/leagues read policies use it,
-- and referencing a table inside its own policy would recurse (Postgres 42P17).
create or replace function public.my_league_ids()
returns setof uuid
language sql security definer stable
set search_path = public as $$
  select league_id from public.league_members where user_id = auth.uid()
$$;

-- You can read the membership of any league you belong to (for board rosters).
drop policy if exists "co-members readable" on public.league_members;
create policy "co-members readable" on public.league_members
  for select to authenticated using (league_id in (select public.my_league_ids()));

-- Profiles: a user reads only their OWN row (protects PII: first/last name, country).
-- Other players' safe fields (username, team name/emblem) are exposed to the board
-- via the public_profiles view below — never the base table.
drop policy if exists "own profile readable" on public.profiles;
create policy "own profile readable" on public.profiles
  for select to authenticated using (auth.uid() = id);
drop policy if exists "own profile upsert" on public.profiles;
create policy "own profile upsert" on public.profiles
  for insert to authenticated with check (auth.uid() = id);
drop policy if exists "own profile update" on public.profiles;
create policy "own profile update" on public.profiles
  for update to authenticated using (auth.uid() = id);

-- The leaderboard needs other players' names/emblems but must NOT see their PII.
-- This view (SECURITY DEFINER by default) exposes only the safe columns to everyone.
create or replace view public.public_profiles as
  select id, username, team_name, team_emblem from public.profiles;
grant select on public.public_profiles to authenticated;

-- Entries: readable if the owner shares one of your leagues (membership decides —
-- entries.league_id is irrelevant for reads). Everyone shares the public league, so
-- the public board sees all entries. Write only your own row.
drop policy if exists "league entries readable" on public.entries;
create policy "league entries readable" on public.entries
  for select to authenticated using (
    user_id = auth.uid()
    or entries.user_id in (
      select lm.user_id from public.league_members lm
      where lm.league_id in (select public.my_league_ids())
    )
  );
drop policy if exists "own entry insert" on public.entries;
create policy "own entry insert" on public.entries
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "own entry update" on public.entries;
create policy "own entry update" on public.entries
  for update to authenticated using (auth.uid() = user_id);

-- Block client writes to score: revoke the column on BOTH insert and update. The
-- Edge Function uses the service-role key, which bypasses RLS, so only the server
-- can set it. (Insert too, else a client could seed a high score on the first write.)
revoke insert (score), update (score) on public.entries from authenticated;

-- Leagues: public leagues readable by all signed-in users; private leagues readable
-- if you're a member; anyone signed in can create one (they must own it).
drop policy if exists "leagues readable" on public.leagues;
create policy "leagues readable" on public.leagues
  for select to authenticated using (
    is_public
    or id in (select public.my_league_ids())
  );
drop policy if exists "create league" on public.leagues;
create policy "create league" on public.leagues
  for insert to authenticated with check (auth.uid() = owner_id);

-- ── 5. Auto-create a profile row + public-league membership on signup ─────────
-- Everyone joins the public global league (the "play against everyone" board);
-- private leagues are joined explicitly by code and seen only by their members.
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── 6. Seed the public global league ──────────────────────────────────────────
insert into public.leagues (name, is_public)
select 'Grand Slam Open League', true
where not exists (select 1 from public.leagues where is_public = true);

-- ── 7. Private-league functions (join-by-code) ────────────────────────────────
-- Create a private league — random 6-char code, owner = caller, creator auto-joined.
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

-- Join a private league by its code.
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

-- Delete a private league you own (cascades memberships); leave a league; owner
-- removes a member.
create or replace function public.delete_league(p_league uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.leagues where id = p_league and owner_id = auth.uid() and is_public = false;
  if not found then raise exception 'Only the league owner can delete it'; end if;
end $$;

create or replace function public.leave_league(p_league uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.league_members where league_id = p_league and user_id = auth.uid();
end $$;

create or replace function public.remove_member(p_league uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.leagues where id = p_league and owner_id = auth.uid()) then
    raise exception 'Only the league owner can remove members';
  end if;
  delete from public.league_members where league_id = p_league and user_id = p_user and user_id <> auth.uid();
end $$;

grant execute on function public.delete_league(uuid) to authenticated;
grant execute on function public.leave_league(uuid) to authenticated;
grant execute on function public.remove_member(uuid, uuid) to authenticated;
