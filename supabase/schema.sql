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
  league_id           uuid references public.leagues on delete set null,
  tournament_id       text not null,                          -- e.g. 'wimbledon_2026'
  squad               text[] not null default '{}',           -- player ids
  captain_history     jsonb  not null default '[]',           -- [{round, playerId}]
  phase               text   not null default 'draft',
  current_round_index int    not null default 0,
  score               int    not null default 0,              -- SERVER-written only
  budget              numeric not null default 100,           -- derived, for display
  updated_at          timestamptz default now(),
  unique (user_id, league_id, tournament_id)
);

create index if not exists entries_league_tournament_idx
  on public.entries (league_id, tournament_id);

-- ── 4. Row-Level Security ─────────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.leagues  enable row level security;
alter table public.entries  enable row level security;

-- The leagues you belong to. SECURITY DEFINER so it reads entries WITHOUT invoking
-- RLS again — the entries/leagues read policies below use it, and referencing
-- entries directly inside their own policy would recurse infinitely (Postgres 42P17).
create or replace function public.my_league_ids()
returns setof uuid
language sql security definer stable
set search_path = public as $$
  select league_id from public.entries
  where user_id = auth.uid() and league_id is not null
$$;

-- Profiles: anyone signed in can READ (to show names/emblems on the board); a user
-- may only write their own row.
drop policy if exists "profiles readable" on public.profiles;
create policy "profiles readable" on public.profiles
  for select to authenticated using (true);
drop policy if exists "own profile upsert" on public.profiles;
create policy "own profile upsert" on public.profiles
  for insert to authenticated with check (auth.uid() = id);
drop policy if exists "own profile update" on public.profiles;
create policy "own profile update" on public.profiles
  for update to authenticated using (auth.uid() = id);

-- Entries: you can READ any entry that shares one of your leagues (so you see
-- rivals' squads), and WRITE only your own row.
drop policy if exists "league entries readable" on public.entries;
create policy "league entries readable" on public.entries
  for select to authenticated using (
    user_id = auth.uid()                          -- always your own entries
    or league_id in (select public.my_league_ids())
  );
drop policy if exists "own entry insert" on public.entries;
create policy "own entry insert" on public.entries
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "own entry update" on public.entries;
create policy "own entry update" on public.entries
  for update to authenticated using (auth.uid() = user_id);

-- Block client writes to score: revoke the column. The Edge Function uses the
-- service-role key, which bypasses RLS, so only the server can set it.
revoke update (score) on public.entries from authenticated;

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

-- ── 5. Auto-create a profile row on signup ────────────────────────────────────
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
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
